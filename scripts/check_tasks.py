#!/usr/bin/env python3
"""Plan EspControl validation tasks without changing existing check execution."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from check_tasks_data import DOMAINS, PROFILES, TASKS, Task


ROOT = Path(__file__).resolve().parents[1]
FIXTURE = ROOT / "scripts" / "fixtures" / "check_tasks_legacy_coverage.json"


class ConfigurationError(ValueError):
    pass


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
    }


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

    first = Task("first", (("true",),), dependencies=("second",), inputs=("x",))
    second = Task("second", (("true",),), dependencies=("first",), inputs=("x",))
    expect_invalid((first, second), "dependency cycle")

    ordered = (
        Task("consumer", (("true",),), dependencies=("shared",), profiles=("fast",), inputs=("x",)),
        Task("independent", (("true",),), profiles=("fast",), inputs=("x",)),
        Task("shared", (("true",),), inputs=("x",)),
    )
    if [item.id for item in plan("fast", tasks=ordered)] != ["shared", "consumer", "independent"]:
        raise AssertionError("dependency ordering or de-duplication is not stable")

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
        print("choose 'list' or 'plan', or use --self-test", file=sys.stderr)
        return 2
    except ConfigurationError as error:
        print(f"check task configuration error: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
