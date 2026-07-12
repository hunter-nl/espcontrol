#!/usr/bin/env python3
"""Plan and run the EspControl validation task graph."""

from __future__ import annotations

import argparse
from concurrent.futures import FIRST_COMPLETED, Future, ThreadPoolExecutor, wait
from contextlib import contextmanager, redirect_stdout
from datetime import datetime, timezone
from fnmatch import fnmatchcase
from io import StringIO
import json
import os
import signal
import subprocess
import sys
import threading
import time
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import TextIO

from check_tasks_data import DOMAINS, PROFILES, TASKS, Task


ROOT = Path(__file__).resolve().parents[1]
FIXTURE = ROOT / "scripts" / "fixtures" / "check_tasks_legacy_coverage.json"


class ConfigurationError(ValueError):
    pass


SUMMARY_SCHEMA_VERSION = 1
TASK_STATUSES = ("passed", "failed", "blocked", "not_run", "cached")


def validate_registry(tasks: tuple[Task, ...] = TASKS) -> dict[str, Task]:
    registry: dict[str, Task] = {}
    for item in tasks:
        if item.id in registry:
            raise ConfigurationError(f"duplicate task ID: {item.id}")
        registry[item.id] = item
        if not item.commands or any(not command for command in item.commands):
            raise ConfigurationError(f"task {item.id} has an empty command")
        invalid_profiles = set(item.profiles) - set(PROFILES)
        invalid_domains = set(item.domains) - set(DOMAINS)
        if invalid_profiles:
            raise ConfigurationError(f"task {item.id} has invalid profiles: {sorted(invalid_profiles)}")
        if invalid_domains:
            raise ConfigurationError(f"task {item.id} has invalid domains: {sorted(invalid_domains)}")
        if item.cache != "never" and not item.inputs:
            raise ConfigurationError(f"cacheable task {item.id} has no inputs")
        if not isinstance(item.parallel_safe, bool):
            raise ConfigurationError(f"task {item.id} has invalid parallel safety")
    for item in tasks:
        missing = set(item.dependencies) - set(registry)
        if missing:
            raise ConfigurationError(f"task {item.id} has missing dependencies: {sorted(missing)}")

    visiting: set[str] = set()
    visited: set[str] = set()

    def visit(task_id: str) -> None:
        if task_id in visiting:
            raise ConfigurationError(f"dependency cycle includes task {task_id}")
        if task_id in visited:
            return
        visiting.add(task_id)
        for dependency in registry[task_id].dependencies:
            visit(dependency)
        visiting.remove(task_id)
        visited.add(task_id)

    for item in tasks:
        visit(item.id)
    return registry


def plan(profile: str, domain: str | None = None, tasks: tuple[Task, ...] = TASKS) -> list[Task]:
    registry = validate_registry(tasks)
    selected = {item.id for item in tasks if profile in item.profiles and (domain is None or domain in item.domains)}

    def add_dependencies(task_id: str) -> None:
        for dependency in registry[task_id].dependencies:
            if dependency not in selected:
                selected.add(dependency)
                add_dependencies(dependency)

    for task_id in tuple(selected):
        add_dependencies(task_id)

    ordered: list[Task] = []
    emitted: set[str] = set()

    def emit(task_id: str) -> None:
        if task_id in emitted:
            return
        for dependency in registry[task_id].dependencies:
            emit(dependency)
        emitted.add(task_id)
        ordered.append(registry[task_id])

    for item in tasks:
        if item.id in selected:
            emit(item.id)
    return ordered


def plan_task(task_id: str, tasks: tuple[Task, ...] = TASKS) -> list[Task]:
    registry = validate_registry(tasks)
    if task_id not in registry:
        raise ConfigurationError(f"unknown task ID: {task_id}")
    ordered: list[Task] = []
    emitted: set[str] = set()

    def emit(selected_id: str) -> None:
        if selected_id in emitted:
            return
        for dependency in registry[selected_id].dependencies:
            emit(dependency)
        emitted.add(selected_id)
        ordered.append(registry[selected_id])

    emit(task_id)
    return ordered


def plan_task_ids(task_ids: set[str], tasks: tuple[Task, ...] = TASKS) -> list[Task]:
    registry = validate_registry(tasks)
    unknown = task_ids - set(registry)
    if unknown:
        raise ConfigurationError(f"unknown task IDs: {sorted(unknown)}")
    selected = set(task_ids)

    def add_dependencies(task_id: str) -> None:
        for dependency in registry[task_id].dependencies:
            if dependency not in selected:
                selected.add(dependency)
                add_dependencies(dependency)

    for task_id in tuple(selected):
        add_dependencies(task_id)

    ordered: list[Task] = []
    emitted: set[str] = set()

    def emit(task_id: str) -> None:
        if task_id in emitted:
            return
        for dependency in registry[task_id].dependencies:
            emit(dependency)
        emitted.add(task_id)
        ordered.append(registry[task_id])

    for item in tasks:
        if item.id in selected:
            emit(item.id)
    return ordered


def git_output(root: Path, *args: str) -> str:
    try:
        result = subprocess.run(
            ["git", *args],
            cwd=root,
            check=True,
            capture_output=True,
            text=True,
        )
    except FileNotFoundError as error:
        raise ConfigurationError("git executable not found") from error
    except subprocess.CalledProcessError as error:
        message = error.stderr.strip() or error.stdout.strip() or "git command failed"
        raise ConfigurationError(message) from error
    return result.stdout


def resolve_changed_base(root: Path, requested: str | None = None) -> tuple[str, str]:
    candidates = (requested,) if requested else ("origin/main", "main")
    for candidate in candidates:
        if candidate is None:
            continue
        exists = subprocess.run(
            ["git", "rev-parse", "--verify", "--quiet", f"{candidate}^{{commit}}"],
            cwd=root,
            capture_output=True,
        )
        if exists.returncode == 0:
            merge_base = subprocess.run(
                ["git", "merge-base", "HEAD", candidate],
                cwd=root,
                capture_output=True,
                text=True,
            )
            if merge_base.returncode == 0 and merge_base.stdout.strip():
                return candidate, merge_base.stdout.strip()
            if requested:
                raise ConfigurationError(f"could not find merge base with {candidate}")
    if requested:
        raise ConfigurationError(f"changed-file base ref does not exist: {requested}")
    raise ConfigurationError("changed-file routing requires origin/main or local main")


def parse_name_status(output: str) -> set[str]:
    fields = output.split("\0")
    if fields and fields[-1] == "":
        fields.pop()
    paths: set[str] = set()
    index = 0
    while index < len(fields):
        status = fields[index]
        index += 1
        path_count = 2 if status.startswith(("R", "C")) else 1
        if index + path_count > len(fields):
            raise ConfigurationError("git returned malformed changed-path data")
        paths.update(fields[index:index + path_count])
        index += path_count
    return {path for path in paths if path}


def changed_paths(root: Path, merge_base: str) -> list[str]:
    committed = git_output(root, "diff", "--name-status", "-z", "-M", f"{merge_base}..HEAD")
    tracked = git_output(root, "diff", "--name-status", "-z", "-M", merge_base)
    staged = git_output(root, "diff", "--cached", "--name-status", "-z", "-M", merge_base)
    untracked = git_output(root, "ls-files", "--others", "--exclude-standard", "-z")
    paths = parse_name_status(committed)
    paths.update(parse_name_status(tracked))
    paths.update(parse_name_status(staged))
    paths.update(path for path in untracked.split("\0") if path)
    return sorted(paths)


def matches_input(path: str, pattern: str) -> bool:
    patterns = {pattern}
    if "/**/" in pattern:
        patterns.add(pattern.replace("/**/", "/"))
    return any(fnmatchcase(path, candidate) for candidate in patterns)


def changed_plan(
    paths: list[str], tasks: tuple[Task, ...] = TASKS
) -> tuple[list[Task], dict[str, list[str]], str | None]:
    validate_registry(tasks)
    matched: dict[str, list[str]] = {}
    unmatched: list[str] = []
    force_fast: list[str] = []
    sensitive = (
        "scripts/check_tasks.py",
        "scripts/check_tasks_data.py",
        "package-lock.json",
    )
    sensitive_patterns = (
        "scripts/check_*",
        "scripts/generate_*",
    )
    catch_all_task_ids = {"public-firmware-script"}

    for path in paths:
        path_matches = []
        for item in tasks:
            patterns = item.inputs + item.generated_inputs
            if any(matches_input(path, pattern) for pattern in patterns):
                matched.setdefault(item.id, []).append(path)
                path_matches.append(item.id)
        if (
            path in sensitive
            or path == "scripts/build.py"
            or any(matches_input(path, pattern) for pattern in sensitive_patterns)
            or matches_input(path, ".github/workflows/**")
        ):
            force_fast.append(path)
        elif not (set(path_matches) - catch_all_task_ids):
            unmatched.append(path)

    fallback_paths = sorted(set(force_fast + unmatched))
    if fallback_paths:
        fast_ids = {item.id for item in plan("fast", tasks=tasks)}
        direct_ids = set(matched)
        selected = plan_task_ids(fast_ids | direct_ids, tasks)
        reason = "full fast profile required by " + ", ".join(fallback_paths)
        reasons: dict[str, list[str]] = {}
        for item in selected:
            item_reasons = []
            if item.id in fast_ids:
                item_reasons.append(reason)
            if item.id in matched:
                item_reasons.extend(
                    f"input matched {path}" for path in sorted(matched[item.id])
                )
            if not item_reasons:
                consumers = sorted(
                    task_id for task_id in direct_ids
                    if item.id in {dependency.id for dependency in plan_task(task_id, tasks)[:-1]}
                )
                item_reasons.extend(
                    f"dependency of {task_id} selected by {', '.join(sorted(matched[task_id]))}"
                    for task_id in consumers
                )
            reasons[item.id] = item_reasons
        return selected, reasons, reason

    direct_ids = set(matched)
    selected = plan_task_ids(direct_ids, tasks)
    reasons: dict[str, list[str]] = {}
    for item in selected:
        if item.id in matched:
            reasons[item.id] = [f"input matched {path}" for path in sorted(matched[item.id])]
            continue
        consumers = sorted(
            task_id for task_id in direct_ids
            if item.id in {dependency.id for dependency in plan_task(task_id, tasks)[:-1]}
        )
        reasons[item.id] = [
            f"dependency of {task_id} selected by {', '.join(sorted(matched[task_id]))}"
            for task_id in consumers
        ]
    return selected, reasons, None


def task_json(item: Task) -> dict[str, object]:
    return {
        "id": item.id,
        "commands": [list(command) for command in item.commands],
        "dependencies": list(item.dependencies),
        "profiles": list(item.profiles),
        "domains": list(item.domains),
        "inputs": list(item.inputs),
        "generated_inputs": list(item.generated_inputs),
        "cache": item.cache,
        "parallel_safe": item.parallel_safe,
    }


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def git_revision(root: Path) -> str | None:
    try:
        result = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=root,
            check=True,
            capture_output=True,
            text=True,
        )
    except (FileNotFoundError, subprocess.CalledProcessError):
        return None
    return result.stdout.strip() or None


def depends_on(task_id: str, failed_id: str, registry: dict[str, Task]) -> bool:
    return failed_id in registry[task_id].dependencies or any(
        depends_on(dependency, failed_id, registry)
        for dependency in registry[task_id].dependencies
    )


class ProcessController:
    """Track active child process groups so the main thread can interrupt all of them."""

    def __init__(self) -> None:
        self.interrupted = False
        self._lock = threading.Lock()
        self._processes: set[subprocess.Popen[str]] = set()

    def add(self, process: subprocess.Popen[str]) -> None:
        with self._lock:
            self._processes.add(process)

    def remove(self, process: subprocess.Popen[str]) -> None:
        with self._lock:
            self._processes.discard(process)

    def forward(self, signum: int, _frame: object) -> None:
        self.interrupted = True
        with self._lock:
            processes = tuple(self._processes)
        for process in processes:
            if process.poll() is not None:
                continue
            try:
                os.killpg(process.pid, signum)
            except (ProcessLookupError, PermissionError):
                try:
                    process.send_signal(signum)
                except ProcessLookupError:
                    pass


@contextmanager
def forward_interrupts(controller: ProcessController):
    previous_handlers: dict[int, object] = {}
    if threading.current_thread() is threading.main_thread():
        for signum in (signal.SIGINT, signal.SIGTERM):
            previous_handlers[signum] = signal.getsignal(signum)
            signal.signal(signum, controller.forward)
    try:
        yield
    finally:
        for signum, handler in previous_handlers.items():
            signal.signal(signum, handler)


def run_process(
    command: tuple[str, ...],
    root: Path,
    controller: ProcessController,
    *,
    capture: bool,
) -> tuple[int, str]:
    try:
        process = subprocess.Popen(
            command,
            cwd=root,
            start_new_session=True,
            stdout=subprocess.PIPE if capture else None,
            stderr=subprocess.STDOUT if capture else None,
            text=True,
        )
    except FileNotFoundError:
        message = f"error: executable not found: {command[0]}\n"
        if not capture:
            print(message, end="", file=sys.stderr)
        return 1, message if capture else ""
    except OSError as error:
        message = f"error: could not run {command[0]}: {error}\n"
        if not capture:
            print(message, end="", file=sys.stderr)
        return 1, message if capture else ""

    controller.add(process)
    try:
        output, _ = process.communicate()
    finally:
        controller.remove(process)
    return_code = process.returncode
    code = 130 if controller.interrupted or return_code < 0 else return_code
    return code, output or ""


def run_command(command: tuple[str, ...], root: Path) -> int:
    controller = ProcessController()
    with forward_interrupts(controller):
        code, _ = run_process(command, root, controller, capture=False)
    return code


def execute_task(
    item: Task,
    root: Path,
    controller: ProcessController,
    *,
    capture: bool,
) -> tuple[dict[str, object], str]:
    output: list[str] = []

    def emit(line: str) -> None:
        if capture:
            output.append(line + "\n")
        else:
            print(line, flush=True)

    emit(f"\n==> {item.id}")
    task_started = time.monotonic()
    task_exit = 0
    for command in item.commands:
        emit(f"$ {' '.join(command)}")
        task_exit, command_output = run_process(
            command,
            root,
            controller,
            capture=capture,
        )
        if capture and command_output:
            output.append(command_output)
            if not command_output.endswith("\n"):
                output.append("\n")
        if task_exit != 0:
            break
    duration = round(time.monotonic() - task_started, 3)
    result = {
        "id": item.id,
        "status": "passed" if task_exit == 0 else "failed",
        "duration_seconds": duration,
        "exit_code": task_exit,
        "commands": [list(command) for command in item.commands],
    }
    return result, "".join(output)


def skipped_result(item: Task, status: str) -> dict[str, object]:
    return {
        "id": item.id,
        "status": status,
        "duration_seconds": 0.0,
        "exit_code": None,
        "commands": [list(command) for command in item.commands],
    }


def execute_tasks(
    selected: list[Task],
    root: Path,
    *,
    profile: str | None,
    domain: str | None,
    requested_task: str | None,
    jobs: int = 1,
) -> tuple[int, dict[str, object]]:
    if jobs < 1:
        raise ConfigurationError("--jobs must be at least 1")
    started_at = utc_now()
    run_started = time.monotonic()
    requested_jobs = jobs
    jobs = 1 if profile == "release" else jobs
    result_by_id: dict[str, dict[str, object]] = {}
    exit_code = 0
    registry = validate_registry(tuple(selected))
    controller = ProcessController()

    with forward_interrupts(controller):
        if jobs == 1:
            failed_id: str | None = None
            for item in selected:
                if controller.interrupted and failed_id is None:
                    result_by_id[item.id] = skipped_result(item, "not_run")
                    exit_code = 130
                    continue
                if failed_id is not None:
                    status = "blocked" if depends_on(item.id, failed_id, registry) else "not_run"
                    result_by_id[item.id] = skipped_result(item, status)
                    continue
                result, _ = execute_task(item, root, controller, capture=False)
                result_by_id[item.id] = result
                task_exit = int(result["exit_code"])
                if task_exit != 0:
                    failed_id = item.id
                    exit_code = 130 if task_exit == 130 else 1
        else:
            pending = list(selected)
            failed_ids: set[str] = set()
            captured_outputs: dict[str, str] = {}
            replayed: set[str] = set()

            def replay_completed() -> None:
                for planned in selected:
                    if planned.id in captured_outputs and planned.id not in replayed:
                        print(captured_outputs[planned.id], end="", flush=True)
                        replayed.add(planned.id)

            with ThreadPoolExecutor(max_workers=jobs) as executor:
                active: dict[Future[tuple[dict[str, object], str]], Task] = {}
                while (pending or active) and not failed_ids and not controller.interrupted:
                    passed_ids = {
                        task_id
                        for task_id, result in result_by_id.items()
                        if result["status"] == "passed"
                    }
                    ready_parallel = [
                        item
                        for item in pending
                        if item.parallel_safe and set(item.dependencies) <= passed_ids
                    ]
                    while ready_parallel and len(active) < jobs:
                        item = ready_parallel.pop(0)
                        pending.remove(item)
                        future = executor.submit(
                            execute_task,
                            item,
                            root,
                            controller,
                            capture=True,
                        )
                        active[future] = item

                    if active:
                        done, _ = wait(active, return_when=FIRST_COMPLETED)
                        for future in sorted(done, key=lambda value: selected.index(active[value])):
                            item = active.pop(future)
                            result, task_output = future.result()
                            result_by_id[item.id] = result
                            captured_outputs[item.id] = task_output
                            if result["status"] == "failed":
                                failed_ids.add(item.id)
                        continue

                    ready_serial = [
                        item
                        for item in pending
                        if not item.parallel_safe and set(item.dependencies) <= passed_ids
                    ]
                    if ready_serial:
                        replay_completed()
                        item = ready_serial[0]
                        pending.remove(item)
                        result, _ = execute_task(item, root, controller, capture=False)
                        result_by_id[item.id] = result
                        if result["status"] == "failed":
                            failed_ids.add(item.id)
                        continue
                    if pending:
                        raise ConfigurationError("parallel scheduler could not find a runnable task")

                if (failed_ids or controller.interrupted) and active:
                    done, _ = wait(active)
                    for future in sorted(done, key=lambda value: selected.index(active[value])):
                        item = active[future]
                        result, task_output = future.result()
                        result_by_id[item.id] = result
                        captured_outputs[item.id] = task_output
                        if result["status"] == "failed":
                            failed_ids.add(item.id)
                replay_completed()

            if failed_ids or controller.interrupted:
                exit_code = 130 if controller.interrupted or any(
                    result_by_id[task_id]["exit_code"] == 130 for task_id in failed_ids
                ) else 1
                for item in pending:
                    status = "blocked" if any(
                        depends_on(item.id, failed_id, registry) for failed_id in failed_ids
                    ) else "not_run"
                    result_by_id[item.id] = skipped_result(item, status)

    results = [result_by_id[item.id] for item in selected]

    duration = round(time.monotonic() - run_started, 3)
    summary: dict[str, object] = {
        "schema_version": SUMMARY_SCHEMA_VERSION,
        "profile": profile,
        "domain": domain,
        "requested_task": requested_task,
        "git_revision": git_revision(root),
        "started_at": started_at,
        "finished_at": utc_now(),
        "duration_seconds": duration,
        "jobs": {"requested": requested_jobs, "used": jobs},
        "cache": {"enabled": False, "reason": "result caching is not implemented in this stage"},
        "status": "passed" if exit_code == 0 else "interrupted" if exit_code == 130 else "failed",
        "exit_code": exit_code,
        "tasks": results,
    }
    return exit_code, summary


def summary_markdown(summary: dict[str, object]) -> str:
    lines = [
        "## Check task graph",
        "",
        f"Overall: **{summary['status']}** in {summary['duration_seconds']:.3f}s",
        f"Workers: **{summary['jobs']['used']}**",
        "",
        "| Task | Status | Duration |",
        "| --- | --- | ---: |",
    ]
    for result in summary["tasks"]:
        lines.append(f"| `{result['id']}` | {result['status']} | {result['duration_seconds']:.3f}s |")
    return "\n".join(lines) + "\n"


def print_summary(summary: dict[str, object], output: TextIO = sys.stdout) -> None:
    print("\nCheck task summary", file=output)
    print(
        f"Workers: {summary['jobs']['used']}"
        + (
            f" (requested {summary['jobs']['requested']})"
            if summary["jobs"]["requested"] != summary["jobs"]["used"]
            else ""
        ),
        file=output,
    )
    print(f"{'TASK':28} {'STATUS':10} {'SECONDS':>8}", file=output)
    for result in summary["tasks"]:
        print(f"{result['id']:28} {result['status']:10} {result['duration_seconds']:8.3f}", file=output)
    print(f"Overall: {summary['status']} ({summary['duration_seconds']:.3f}s)", file=output)


def write_summary(summary: dict[str, object], path: Path | None) -> None:
    if path is not None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    github_summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if github_summary:
        with Path(github_summary).open("a", encoding="utf-8") as handle:
            handle.write(summary_markdown(summary))


def self_test() -> None:
    validate_registry()
    expected = json.loads(FIXTURE.read_text())
    actual = {profile: sorted(item.id for item in plan(profile)) for profile in PROFILES}
    for profile in PROFILES:
        wanted = sorted(expected[profile])
        if actual[profile] != wanted:
            raise ConfigurationError(f"legacy coverage differs for {profile}: expected {wanted}, got {actual[profile]}")

    product_order = [item.id for item in plan("product")]
    if product_order.index("device-slots") > product_order.index("device-profiles"):
        raise AssertionError("device slot outputs are not checked before device profiles consume them")

    web_order = [item.id for item in plan("ci", "web")]
    for consumer in ("web-smoke", "web-browser-smoke"):
        if web_order.index("device-manifest-output") > web_order.index(consumer):
            raise AssertionError(f"device manifest output is not checked before {consumer} consumes it")

    firmware_order = [item.id for item in plan("fast", "firmware")]
    for consumer in ("firmware-parser", "firmware-ha-bindings", "device-profiles"):
        if firmware_order.index("device-slots") > firmware_order.index(consumer):
            raise AssertionError(f"device slot outputs are not checked before {consumer} consumes them")

    registry = validate_registry()
    package_scripts = json.loads((ROOT / "package.json").read_text())["scripts"]
    profile_aliases = {
        "check:product": "product",
        "check:fast": "fast",
        "check:ci": "ci",
        "check:all": "all",
        "check:release-preflight": "release",
    }
    for alias, profile in profile_aliases.items():
        expected_command = f"python3 scripts/check_tasks.py run {profile}"
        if package_scripts.get(alias) != expected_command:
            raise AssertionError(f"{alias} does not route through the {profile} graph")
    if package_scripts.get("check:parallel") != "python3 scripts/check_tasks.py run fast --jobs 4":
        raise AssertionError("check:parallel does not use the fast graph with four workers")

    public_aliases = {
        name: command for name, command in package_scripts.items()
        if name.startswith("check:") and not name.endswith(":legacy")
    }
    for alias, command in public_aliases.items():
        if alias in profile_aliases or alias == "check:parallel":
            continue
        task_id = alias.removeprefix("check:")
        if task_id not in registry:
            raise AssertionError(f"{alias} has no matching registered task")
        expected_command = f"python3 scripts/check_tasks.py run-task {task_id}"
        if command != expected_command:
            raise AssertionError(f"{alias} does not route through run-task {task_id}")
    missing_legacy = sorted(
        alias
        for alias in public_aliases
        if alias != "check:parallel" and f"{alias}:legacy" not in package_scripts
    )
    if missing_legacy:
        raise AssertionError(f"public check aliases are missing temporary legacy commands: {missing_legacy}")

    never_parallel = {
        "local-artifacts",
        "local-esphome",
        "pr-process",
        "pr-testing-guidance",
        "firmware-release",
        "release-confidence",
        "release-changelog",
        "web-browser-smoke",
        "docs-build",
    }
    unsafe = sorted(task_id for task_id in never_parallel if registry[task_id].parallel_safe)
    if unsafe:
        raise AssertionError(f"unsafe tasks are marked parallel-safe: {unsafe}")

    if registry["types"].commands != (("npm", "exec", "--", "tsc", "--noEmit"),):
        raise AssertionError("TypeScript checks do not use the project-managed compiler")
    if "icon-groups" not in {item.id for item in plan("fast", "docs")}:
        raise AssertionError("docs plans do not validate icon gallery groups")
    if "docs/.vitepress/theme/components/IconGallery.vue" not in registry["icon-groups"].inputs:
        raise AssertionError("icon gallery changes do not invalidate icon-group checks")

    release_workflow_order = [item.id for item in plan("release", "workflow")]
    for prerequisite in ("generated", "device-manifest-output"):
        if release_workflow_order.index(prerequisite) > release_workflow_order.index("release-confidence"):
            raise AssertionError(f"{prerequisite} is not checked before release confidence consumes it")

    def expect_invalid(tasks: tuple[Task, ...], description: str) -> None:
        try:
            validate_registry(tasks)
        except ConfigurationError:
            return
        raise AssertionError(f"{description} was accepted")

    expect_invalid((TASKS[0], TASKS[0]), "duplicate IDs")
    expect_invalid((Task("missing", (("true",),), dependencies=("absent",), inputs=("x",)),), "missing dependency")
    expect_invalid((Task("profile", (("true",),), profiles=("unknown",), inputs=("x",)),), "invalid profile")
    expect_invalid((Task("domain", (("true",),), domains=("unknown",), inputs=("x",)),), "invalid domain")
    expect_invalid((Task("inputs", (("true",),), cache="deterministic"),), "cacheable task with empty inputs")
    expect_invalid(
        (Task("parallel", (("true",),), parallel_safe="yes"),),  # type: ignore[arg-type]
        "invalid parallel safety",
    )

    first = Task("first", (("true",),), dependencies=("second",), inputs=("x",))
    second = Task("second", (("true",),), dependencies=("first",), inputs=("x",))
    expect_invalid((first, second), "dependency cycle")

    try:
        execute_tasks([], ROOT, profile="fast", domain=None, requested_task=None, jobs=0)
    except ConfigurationError:
        pass
    else:
        raise AssertionError("zero parallel workers were accepted")

    ordered = (
        Task("consumer", (("true",),), dependencies=("shared",), profiles=("fast",), inputs=("x",)),
        Task("independent", (("true",),), profiles=("fast",), inputs=("x",)),
        Task("shared", (("true",),), inputs=("x",)),
    )
    if [item.id for item in plan("fast", tasks=ordered)] != ["shared", "consumer", "independent"]:
        raise AssertionError("dependency ordering or de-duplication is not stable")

    if [item.id for item in plan_task("consumer", ordered)] != ["shared", "consumer"]:
        raise AssertionError("run-task dependency closure is incorrect")

    with TemporaryDirectory() as tmp:
        root = Path(tmp)
        marker = root / "marker.txt"
        fake_tasks = [
            Task("pass", ((sys.executable, "-c", f"from pathlib import Path; Path({str(marker)!r}).write_text('pass')"),)),
            Task("fail", ((sys.executable, "-c", "raise SystemExit(7)"),), dependencies=("pass",)),
            Task("blocked", ((sys.executable, "-c", "raise SystemExit(0)"),), dependencies=("fail",)),
            Task("not-run", ((sys.executable, "-c", "raise SystemExit(0)"),)),
        ]
        code, summary = execute_tasks(fake_tasks, root, profile="fast", domain=None, requested_task=None)
        statuses = {item["id"]: item["status"] for item in summary["tasks"]}
        if code != 1 or statuses != {"pass": "passed", "fail": "failed", "blocked": "blocked", "not-run": "not_run"}:
            raise AssertionError(f"fail-fast execution is incorrect: {code}, {statuses}")
        if marker.read_text() != "pass":
            raise AssertionError("successful fake command did not execute")
        if summary["schema_version"] != SUMMARY_SCHEMA_VERSION or summary["exit_code"] != 1:
            raise AssertionError("JSON summary schema or exit code is incorrect")
        markdown = summary_markdown(summary)
        if "| `blocked` | blocked |" not in markdown:
            raise AssertionError("Markdown summary omits blocked tasks")

        missing_code, missing_summary = execute_tasks(
            [Task("missing", (("executable-that-does-not-exist",),))],
            root,
            profile=None,
            domain=None,
            requested_task="missing",
        )
        if missing_code != 1 or missing_summary["tasks"][0]["status"] != "failed":
            raise AssertionError("missing executables are not reported as task failures")

        marker_a = root / "parallel-a"
        marker_b = root / "parallel-b"
        sync_command = (
            "from pathlib import Path; import sys, time; "
            "own, other = Path(sys.argv[1]), Path(sys.argv[2]); "
            "own.write_text('started'); print(sys.argv[3], flush=True); "
            "deadline = time.monotonic() + 2; "
            "exec(\"while not other.exists() and time.monotonic() < deadline:\\n time.sleep(0.01)\"); "
            "assert other.exists(); "
            "print(sys.argv[4], flush=True)"
        )
        parallel_tasks = [
            Task(
                "parallel-a",
                ((sys.executable, "-c", sync_command, str(marker_a), str(marker_b), "A-BEGIN", "A-END"),),
                parallel_safe=True,
            ),
            Task(
                "parallel-b",
                ((sys.executable, "-c", sync_command, str(marker_b), str(marker_a), "B-BEGIN", "B-END"),),
                parallel_safe=True,
            ),
        ]
        parallel_output = StringIO()
        with redirect_stdout(parallel_output):
            parallel_code, parallel_summary = execute_tasks(
                parallel_tasks,
                root,
                profile="fast",
                domain=None,
                requested_task=None,
                jobs=2,
            )
        captured = parallel_output.getvalue()
        if parallel_code != 0 or parallel_summary["jobs"] != {"requested": 2, "used": 2}:
            raise AssertionError("parallel-safe independent tasks did not run with two workers")
        if not (
            captured.index("A-BEGIN")
            < captured.index("A-END")
            < captured.index("B-BEGIN")
            < captured.index("B-END")
        ):
            raise AssertionError("parallel task output was not replayed in stable grouped blocks")

        exclusive_flag = root / "parallel-safe-running"
        exclusive_tasks = [
            Task(
                "parallel-safe-long",
                ((
                    sys.executable,
                    "-c",
                    "import time; from pathlib import Path; "
                    f"p=Path({str(exclusive_flag)!r}); "
                    "p.write_text('running'); time.sleep(0.15); p.unlink()",
                ),),
                parallel_safe=True,
            ),
            Task(
                "parallel-unsafe",
                ((
                    sys.executable,
                    "-c",
                    "import sys; from pathlib import Path; "
                    f"sys.exit(1 if Path({str(exclusive_flag)!r}).exists() else 0)",
                ),),
            ),
        ]
        with redirect_stdout(StringIO()):
            exclusive_code, _ = execute_tasks(
                exclusive_tasks,
                root,
                profile="fast",
                domain=None,
                requested_task=None,
                jobs=2,
            )
        if exclusive_code != 0:
            raise AssertionError("a task without parallel safety ran beside an active task")

        active_marker = root / "active-finished"
        failure_tasks = [
            Task(
                "parallel-fail",
                ((sys.executable, "-c", "print('failure output'); raise SystemExit(7)"),),
                parallel_safe=True,
            ),
            Task(
                "parallel-active",
                ((
                    sys.executable,
                    "-c",
                    "import time; from pathlib import Path; time.sleep(0.1); "
                    f"Path({str(active_marker)!r}).write_text('done')",
                ),),
                parallel_safe=True,
            ),
            Task(
                "parallel-blocked",
                ((sys.executable, "-c", "raise SystemExit(0)"),),
                dependencies=("parallel-fail",),
                parallel_safe=True,
            ),
            Task(
                "parallel-not-run",
                ((sys.executable, "-c", "raise SystemExit(0)"),),
                parallel_safe=True,
            ),
        ]
        with redirect_stdout(StringIO()):
            failure_code, failure_summary = execute_tasks(
                failure_tasks,
                root,
                profile="fast",
                domain=None,
                requested_task=None,
                jobs=2,
            )
        failure_statuses = {item["id"]: item["status"] for item in failure_summary["tasks"]}
        if failure_code != 1 or failure_statuses != {
            "parallel-fail": "failed",
            "parallel-active": "passed",
            "parallel-blocked": "blocked",
            "parallel-not-run": "not_run",
        }:
            raise AssertionError(f"parallel fail-stop execution is incorrect: {failure_statuses}")
        if active_marker.read_text() != "done":
            raise AssertionError("an active parallel task was not allowed to finish after failure")

        release_flag = root / "release-running"
        release_tasks = [
            Task(
                "release-first",
                ((
                    sys.executable,
                    "-c",
                    "import time; from pathlib import Path; "
                    f"p=Path({str(release_flag)!r}); "
                    "p.write_text('running'); time.sleep(0.15); p.unlink()",
                ),),
                parallel_safe=True,
            ),
            Task(
                "release-second",
                ((
                    sys.executable,
                    "-c",
                    "import sys, time; from pathlib import Path; time.sleep(0.03); "
                    f"sys.exit(1 if Path({str(release_flag)!r}).exists() else 0)",
                ),),
                parallel_safe=True,
            ),
        ]
        with redirect_stdout(StringIO()):
            release_code, release_summary = execute_tasks(
                release_tasks,
                root,
                profile="release",
                domain=None,
                requested_task=None,
                jobs=2,
            )
        if release_code != 0 or release_summary["jobs"] != {"requested": 2, "used": 1}:
            raise AssertionError("release execution was not forced to one worker")

        summary_path = root / "summary.json"
        markdown_path = root / "github-summary.md"
        previous_github_summary = os.environ.get("GITHUB_STEP_SUMMARY")
        os.environ["GITHUB_STEP_SUMMARY"] = str(markdown_path)
        try:
            write_summary(summary, summary_path)
        finally:
            if previous_github_summary is None:
                os.environ.pop("GITHUB_STEP_SUMMARY", None)
            else:
                os.environ["GITHUB_STEP_SUMMARY"] = previous_github_summary
        if json.loads(summary_path.read_text())["schema_version"] != SUMMARY_SCHEMA_VERSION:
            raise AssertionError("JSON summary file has the wrong schema version")
        if "## Check task graph" not in markdown_path.read_text():
            raise AssertionError("GitHub Markdown summary was not written")

        interrupt_test = (
            "import os, signal, sys, threading; "
            "from pathlib import Path; "
            "from check_tasks import run_command; "
            "threading.Timer(0.1, lambda: os.kill(os.getpid(), signal.SIGINT)).start(); "
            "child = \"import os, signal, time; "
            "signal.signal(signal.SIGINT, lambda *_: os._exit(130)); time.sleep(30)\"; "
            "code = run_command((sys.executable, '-c', child), Path.cwd()); "
            "raise SystemExit(0 if code == 130 else 1)"
        )
        interrupted = subprocess.run(
            [sys.executable, "-c", interrupt_test],
            cwd=ROOT,
            env={**os.environ, "PYTHONPATH": str(ROOT / "scripts")},
            timeout=5,
        )
        if interrupted.returncode != 0:
            raise AssertionError("interrupts are not forwarded to the active child process")

        parallel_interrupt_test = (
            "import os, signal, sys, threading; "
            "from pathlib import Path; "
            "from check_tasks import Task, execute_tasks; "
            "child = \"import os, signal, time; "
            "signal.signal(signal.SIGINT, lambda *_: os._exit(130)); time.sleep(30)\"; "
            "tasks = [Task(f'sleep-{index}', ((sys.executable, '-c', child),), "
            "parallel_safe=True) for index in range(2)]; "
            "threading.Timer(0.2, lambda: os.kill(os.getpid(), signal.SIGINT)).start(); "
            "code, summary = execute_tasks(tasks, Path.cwd(), profile='fast', "
            "domain=None, requested_task=None, jobs=2); "
            "raise SystemExit(0 if code == 130 and summary['status'] == 'interrupted' else 1)"
        )
        parallel_interrupted = subprocess.run(
            [sys.executable, "-c", parallel_interrupt_test],
            cwd=ROOT,
            env={**os.environ, "PYTHONPATH": str(ROOT / "scripts")},
            capture_output=True,
            timeout=5,
        )
        if parallel_interrupted.returncode != 0:
            raise AssertionError("interrupts are not forwarded to all active parallel tasks")

    def task_ids(selected: list[Task]) -> set[str]:
        return {item.id for item in selected}

    docs_selected, _, docs_fallback = changed_plan(["dev-docs/README.md"])
    if docs_fallback is not None or not {"dev-docs", "docs-build"} <= task_ids(docs_selected):
        raise AssertionError("docs-only changes do not select documentation checks")

    for maintainer_doc in ("README.md", "DEVELOPERS.md", "product/README.md"):
        maintainer_selected, _, maintainer_fallback = changed_plan([maintainer_doc])
        if (
            maintainer_fallback is not None
            or not {"dev-docs", "docs-build"} <= task_ids(maintainer_selected)
        ):
            raise AssertionError(f"{maintainer_doc} does not select maintainer documentation checks")

    web_selected, _, web_fallback = changed_plan(["src/webserver/modules/example.js"])
    if web_fallback is not None or "web-smoke" not in task_ids(web_selected):
        raise AssertionError("web changes do not select web checks")

    firmware_selected, _, firmware_fallback = changed_plan(["components/espcontrol/example.h"])
    if firmware_fallback is not None or "firmware-parser" not in task_ids(firmware_selected):
        raise AssertionError("firmware changes do not select firmware checks")

    generated_selected, _, generated_fallback = changed_plan(["components/espcontrol/i18n_generated.h"])
    if generated_fallback is not None or "generated" not in task_ids(generated_selected):
        raise AssertionError("generated inputs do not select their validation task")

    unknown_selected, _, unknown_fallback = changed_plan(["unexpected-area/file.xyz"])
    if unknown_fallback is None or task_ids(unknown_selected) != task_ids(plan("fast")):
        raise AssertionError("unknown paths do not fall back to the full fast profile")

    workflow_selected, _, workflow_fallback = changed_plan([".github/workflows/example.yml"])
    if workflow_fallback is None or task_ids(workflow_selected) != task_ids(plan("fast")):
        raise AssertionError("workflow changes do not fall back to the full fast profile")

    for safety_script in (
        "scripts/build.py",
        "scripts/check_device_manifest.py",
        "scripts/check_web_smoke.js",
        "scripts/generate_device_manifest.py",
    ):
        script_selected, _, script_fallback = changed_plan([safety_script])
        if script_fallback is None or task_ids(script_selected) != task_ids(plan("fast")):
            raise AssertionError(
                f"generator or validator change {safety_script} does not select the full fast profile"
            )

    helper_selected, _, helper_fallback = changed_plan(["scripts/device_matrix.py"])
    if helper_fallback is None or task_ids(helper_selected) != task_ids(plan("fast")):
        raise AssertionError("shared script helpers matched only by a catch-all do not select fast")

    esphome_selected, _, esphome_fallback = changed_plan([".github/esphome.env"])
    if esphome_fallback is not None or "firmware-release" not in task_ids(esphome_selected):
        raise AssertionError("ESPHome version changes do not select firmware release checks")

    broadened_selected, _, broadened_fallback = changed_plan([
        "docs/reference/faq.md",
        "unexpected-area/file.xyz",
    ])
    broadened_ids = task_ids(broadened_selected)
    if (
        broadened_fallback is None
        or not task_ids(plan("fast")) <= broadened_ids
        or "docs-build" not in broadened_ids
    ):
        raise AssertionError("fallback discards directly matched tasks outside the fast profile")

    lock_selected, _, lock_fallback = changed_plan(["package-lock.json"])
    lock_ids = task_ids(lock_selected)
    if lock_fallback is None or not {"docs-build", "web-browser-smoke", "types"} <= lock_ids:
        raise AssertionError("package lock fallback discards declared consumers")

    clean_selected, clean_reasons, clean_fallback = changed_plan([])
    if clean_selected or clean_reasons or clean_fallback is not None:
        raise AssertionError("clean trees should not select changed-file checks")

    if not task_ids(plan("ci", "web")) < task_ids(plan("ci")):
        raise AssertionError("profile and domain combinations do not narrow direct selection")

    with TemporaryDirectory() as tmp:
        repo = Path(tmp)

        def run_git(*args: str) -> None:
            subprocess.run(["git", *args], cwd=repo, check=True, capture_output=True)

        run_git("init", "-b", "main")
        run_git("config", "user.name", "Check Graph Test")
        run_git("config", "user.email", "check-graph@example.invalid")
        initial = {
            "docs/guide.md": "initial\n",
            "docs/staged-then-reverted.md": "initial\n",
            "src/webserver/old.js": "initial\n",
            "components/espcontrol/example.h": "initial\n",
            "devices/catalog.json": "{}\n",
        }
        for relative, content in initial.items():
            destination = repo / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_text(content)
        run_git("add", ".")
        run_git("commit", "-m", "initial")
        run_git("update-ref", "refs/remotes/origin/main", "main")

        base_ref, merge_base = resolve_changed_base(repo)
        if base_ref != "origin/main" or changed_paths(repo, merge_base):
            raise AssertionError("clean repository base discovery is incorrect")
        run_git("update-ref", "-d", "refs/remotes/origin/main")
        fallback_ref, fallback_merge_base = resolve_changed_base(repo)
        if fallback_ref != "main" or fallback_merge_base != merge_base:
            raise AssertionError("local main is not used when origin/main is unavailable")
        run_git("update-ref", "refs/remotes/origin/main", "main")

        run_git("switch", "-c", "feature")
        (repo / "docs/guide.md").write_text("committed\n")
        run_git("add", "docs/guide.md")
        run_git("commit", "-m", "docs change")
        run_git("restore", "--source=main", "--staged", "--worktree", "docs/guide.md")
        run_git("mv", "src/webserver/old.js", "src/webserver/new.js")
        (repo / "components/espcontrol/example.h").unlink()
        (repo / "devices/catalog.json").write_text('{"changed": true}\n')
        run_git("add", "devices/catalog.json")
        staged_then_reverted = repo / "docs/staged-then-reverted.md"
        staged_then_reverted.write_text("staged\n")
        run_git("add", "docs/staged-then-reverted.md")
        staged_then_reverted.write_text("initial\n")
        (repo / "untracked.txt").write_text("untracked\n")

        _, merge_base = resolve_changed_base(repo)
        discovered = set(changed_paths(repo, merge_base))
        expected_paths = {
            "docs/guide.md",
            "docs/staged-then-reverted.md",
            "src/webserver/old.js",
            "src/webserver/new.js",
            "components/espcontrol/example.h",
            "devices/catalog.json",
            "untracked.txt",
        }
        if not expected_paths <= discovered:
            raise AssertionError(f"changed paths omit workspace states: {sorted(expected_paths - discovered)}")

    with TemporaryDirectory() as tmp:
        repo = Path(tmp)
        subprocess.run(["git", "init", "-b", "feature"], cwd=repo, check=True, capture_output=True)
        subprocess.run(["git", "config", "user.name", "Check Graph Test"], cwd=repo, check=True)
        subprocess.run(["git", "config", "user.email", "check-graph@example.invalid"], cwd=repo, check=True)
        (repo / "README.md").write_text("initial\n")
        subprocess.run(["git", "add", "README.md"], cwd=repo, check=True)
        subprocess.run(["git", "commit", "-m", "initial"], cwd=repo, check=True, capture_output=True)
        try:
            resolve_changed_base(repo)
        except ConfigurationError as error:
            if "origin/main or local main" not in str(error):
                raise
        else:
            raise AssertionError("missing default changed-file bases were accepted")

    print(f"check task registry self-test passed ({len(TASKS)} tasks, {len(PROFILES)} profiles)")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--self-test", action="store_true")
    subparsers = parser.add_subparsers(dest="command")
    list_parser = subparsers.add_parser("list", help="list registered tasks")
    list_parser.add_argument("--json", action="store_true")
    plan_parser = subparsers.add_parser("plan", help="show the tasks selected by a profile")
    plan_parser.add_argument("profile", choices=PROFILES)
    plan_parser.add_argument("--domain", choices=DOMAINS)
    plan_parser.add_argument("--json", action="store_true")
    plan_parser.add_argument("--explain", action="store_true")
    run_parser = subparsers.add_parser("run", help="run the tasks selected by a profile")
    run_parser.add_argument("profile", choices=PROFILES)
    run_parser.add_argument("--domain", choices=DOMAINS)
    run_parser.add_argument("--jobs", type=int, default=1)
    run_parser.add_argument("--no-cache", action="store_true")
    run_parser.add_argument("--summary-json", type=Path)
    task_parser = subparsers.add_parser("run-task", help="run one task and its dependencies")
    task_parser.add_argument("task_id")
    task_parser.add_argument("--summary-json", type=Path)
    changed_parser = subparsers.add_parser("changed", help="plan checks from branch and workspace changes")
    changed_parser.add_argument("--base")
    changed_parser.add_argument("--explain", action="store_true")
    changed_parser.add_argument("--json", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        if args.self_test:
            self_test()
            return 0
        validate_registry()
        if args.command == "list":
            if args.json:
                print(json.dumps([task_json(item) for item in TASKS], indent=2))
            else:
                for item in TASKS:
                    print(f"{item.id:28} {', '.join(item.domains)}")
            return 0
        if args.command == "plan":
            selected = plan(args.profile, args.domain)
            if args.json:
                print(json.dumps({"profile": args.profile, "domain": args.domain, "tasks": [task_json(item) for item in selected]}, indent=2))
            else:
                for index, item in enumerate(selected, 1):
                    reason = ""
                    if args.explain:
                        reason = f"  ({'dependency' if args.profile not in item.profiles else 'profile'})"
                    print(f"{index:2}. {item.id}{reason}")
            return 0
        if args.command == "run":
            selected = plan(args.profile, args.domain)
            exit_code, summary = execute_tasks(
                selected,
                ROOT,
                profile=args.profile,
                domain=args.domain,
                requested_task=None,
                jobs=args.jobs,
            )
            print_summary(summary)
            write_summary(summary, args.summary_json)
            return exit_code
        if args.command == "run-task":
            selected = plan_task(args.task_id)
            exit_code, summary = execute_tasks(
                selected, ROOT, profile=None, domain=None, requested_task=args.task_id
            )
            print_summary(summary)
            write_summary(summary, args.summary_json)
            return exit_code
        if args.command == "changed":
            base_ref, merge_base = resolve_changed_base(ROOT, args.base)
            paths = changed_paths(ROOT, merge_base)
            selected, reasons, fallback = changed_plan(paths)
            if args.json:
                print(json.dumps({
                    "base": base_ref,
                    "merge_base": merge_base,
                    "paths": paths,
                    "fallback": fallback,
                    "tasks": [
                        {**task_json(item), "reasons": reasons.get(item.id, [])}
                        for item in selected
                    ],
                }, indent=2))
            else:
                print(f"Base: {base_ref} ({merge_base[:12]})")
                if not paths:
                    print("No changed files; no tasks selected.")
                    return 0
                print("Changed files:")
                for path in paths:
                    print(f"  {path}")
                if fallback:
                    print(f"Fallback: {fallback}")
                print("Selected tasks:")
                for index, item in enumerate(selected, 1):
                    print(f"{index:2}. {item.id}")
                    if args.explain:
                        for reason in reasons.get(item.id, []):
                            print(f"    - {reason}")
            return 0
        print("choose 'list', 'plan', 'run', 'run-task', or 'changed', or use --self-test", file=sys.stderr)
        return 2
    except ConfigurationError as error:
        print(f"check task configuration error: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
