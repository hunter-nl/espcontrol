#!/usr/bin/env python3
"""Guard firmware Home Assistant access behind button_grid_ha.h helpers."""

from __future__ import annotations

import argparse
import re
from pathlib import Path
from tempfile import TemporaryDirectory


ROOT = Path(__file__).resolve().parents[1]
FIRMWARE_DIR = ROOT / "components" / "espcontrol"
CORE_INFRA_PATH = ROOT / "common" / "device" / "core_infra.yaml"
HA_BOUNDARY_ALLOWLIST = {
    "button_grid_ha.h",
}
DIRECT_HA_PATTERNS = (
    (re.compile(r"\bglobal_api_server\b"), "access Home Assistant API through button_grid_ha.h helpers"),
    (re.compile(r"->send_homeassistant_action\s*\("), "send Home Assistant actions through button_grid_ha.h helpers"),
    (re.compile(r"->subscribe_home_assistant_state\s*\("), "subscribe to Home Assistant state through button_grid_ha.h helpers"),
    (re.compile(r"->register_action_response_callback\s*\("), "register action callbacks through button_grid_ha.h helpers"),
)
STATE_HELPER_PATTERN = re.compile(
    r"inline\s+bool\s+ha_subscribe_state\s*\([^)]*\)\s*\{(?P<body>.*?)\n\}",
    re.DOTALL,
)
ATTRIBUTE_HELPER_PATTERN = re.compile(
    r"inline\s+bool\s+ha_subscribe_attribute\s*\([^)]*\)\s*\{(?P<body>.*?)\n\}",
    re.DOTALL,
)
TODO_GET_ITEMS_HELPER_PATTERN = re.compile(
    r"inline\s+bool\s+todo_begin_get_items_request\s*\([^)]*\)\s*\{(?P<body>.*?)\n\}",
    re.DOTALL,
)


def firmware_ha_binding_errors(firmware_dir: Path, root: Path) -> list[str]:
    errors: list[str] = []
    for path in sorted(firmware_dir.glob("button_grid*.h")):
        if path.name in HA_BOUNDARY_ALLOWLIST:
            continue
        for line_no, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
            for pattern, message in DIRECT_HA_PATTERNS:
                if pattern.search(line):
                    rel = path.relative_to(root)
                    errors.append(f"{rel}:{line_no}: {message}")
                    break
    return errors


def firmware_ha_boundary_errors(firmware_dir: Path, root: Path) -> list[str]:
    path = firmware_dir / "button_grid_ha.h"
    if not path.exists():
        return []
    rel = path.relative_to(root)
    text = path.read_text(encoding="utf-8")
    errors: list[str] = []

    state_helper = STATE_HELPER_PATTERN.search(text)
    if not state_helper:
        errors.append(f"{rel}: missing ha_subscribe_state helper")
    elif "heap_available" in state_helper.group("body"):
        errors.append(f"{rel}: keep core HA state subscriptions off the low-heap guard")

    attribute_helper = ATTRIBUTE_HELPER_PATTERN.search(text)
    if not attribute_helper:
        errors.append(f"{rel}: missing ha_subscribe_attribute helper")
    elif "heap_available" in attribute_helper.group("body"):
        errors.append(f"{rel}: keep HA metadata attribute subscriptions off the low-heap guard")

    if "ha_cancel_action_response_callback" not in text or "handle_action_response" not in text:
        errors.append(f"{rel}: expose a helper to cancel stale HA action response callbacks")

    return errors


def firmware_todo_request_errors(firmware_dir: Path, root: Path) -> list[str]:
    path = firmware_dir / "button_grid_todo.h"
    if not path.exists():
        return []
    rel = path.relative_to(root)
    text = path.read_text(encoding="utf-8")
    errors: list[str] = []

    helper = TODO_GET_ITEMS_HELPER_PATTERN.search(text)
    if not helper:
        errors.append(f"{rel}: missing todo_begin_get_items_request helper")
        return errors

    body = helper.group("body")
    if '"todo.get_items"' not in body:
        errors.append(f"{rel}: todo_begin_get_items_request must call todo.get_items")
    if "wants_response" not in body or "response_template" not in body:
        errors.append(f"{rel}: todo.get_items requests must capture a compact response template")
    if "std::string response_template" in body:
        errors.append(f"{rel}: keep the todo response template alive until after the request is sent")
    if "TODO_RESPONSE_KEY_MAX_LEN" not in text or "TODO_RESPONSE_SUMMARY_MAX_LEN" not in text:
        errors.append(f"{rel}: bound todo response text before Home Assistant sends it")
    if "std::to_string(TODO_RESPONSE_TEXT_MAX_LEN)" not in text or "|length" not in text:
        errors.append(f"{rel}: cap rendered todo responses before Home Assistant sends them")
    if 'ha_action_add_data(req, "status"' in body:
        errors.append(f"{rel}: filter todo items in the response template, not in action data")
    if "TODO_REQUEST_TIMEOUT_MS" not in text or text.count("todo_cancel_stale_request()") < 2:
        errors.append(f"{rel}: bound pending todo item requests with a timeout")
    if text.count("todo_clear_request_state(call_id)") < 2:
        errors.append(f"{rel}: clear pending todo request state when responses arrive")
    if "ha_api_state_connected()" not in text:
        errors.append(f"{rel}: wait for Home Assistant state subscription before todo actions")
    if text.count("ha_register_action_response_callback(") > 1:
        errors.append(f"{rel}: only todo list loading should register a response callback")
    return errors


def firmware_todo_disconnect_errors(firmware_dir: Path, core_infra_path: Path, root: Path) -> list[str]:
    todo_path = firmware_dir / "button_grid_todo.h"
    if not todo_path.exists() or not core_infra_path.exists():
        return []
    todo_rel = todo_path.relative_to(root)
    core_rel = core_infra_path.relative_to(root)
    todo_text = todo_path.read_text(encoding="utf-8")
    core_text = core_infra_path.read_text(encoding="utf-8")
    errors: list[str] = []

    if "todo_cancel_pending_request" not in todo_text:
        errors.append(f"{todo_rel}: expose a helper to cancel pending todo requests")
    if "on_client_disconnected:" not in core_text or "todo_cancel_pending_request" not in core_text:
        errors.append(f"{core_rel}: cancel pending todo requests when the HA API disconnects")
    return errors


def run_scan() -> int:
    errors = firmware_ha_binding_errors(FIRMWARE_DIR, ROOT)
    errors.extend(firmware_ha_boundary_errors(FIRMWARE_DIR, ROOT))
    errors.extend(firmware_todo_request_errors(FIRMWARE_DIR, ROOT))
    errors.extend(firmware_todo_disconnect_errors(FIRMWARE_DIR, CORE_INFRA_PATH, ROOT))
    if errors:
        print("Firmware Home Assistant binding check failed:")
        for error in errors:
            print(f"  {error}")
        return 1
    print("Firmware Home Assistant binding checks passed.")
    return 0


def expect_errors(name: str, files: dict[str, str], expected: tuple[str, ...]) -> None:
    with TemporaryDirectory() as tmp:
        root = Path(tmp)
        firmware_dir = root / "components" / "espcontrol"
        firmware_dir.mkdir(parents=True)
        for filename, text in files.items():
            (firmware_dir / filename).write_text(text, encoding="utf-8")

        errors = firmware_ha_binding_errors(firmware_dir, root)
        for item in expected:
            assert any(item in error for error in errors), f"{name}: missing {item!r} in {errors!r}"
        if not expected:
            assert not errors, f"{name}: expected no errors, got {errors!r}"


def expect_ha_boundary_errors(name: str, files: dict[str, str], expected: tuple[str, ...]) -> None:
    with TemporaryDirectory() as tmp:
        root = Path(tmp)
        firmware_dir = root / "components" / "espcontrol"
        firmware_dir.mkdir(parents=True)
        for filename, text in files.items():
            (firmware_dir / filename).write_text(text, encoding="utf-8")

        errors = firmware_ha_boundary_errors(firmware_dir, root)
        for item in expected:
            assert any(item in error for error in errors), f"{name}: missing {item!r} in {errors!r}"
        if not expected:
            assert not errors, f"{name}: expected no errors, got {errors!r}"


def expect_todo_request_errors(name: str, text: str, expected: tuple[str, ...]) -> None:
    with TemporaryDirectory() as tmp:
        root = Path(tmp)
        firmware_dir = root / "components" / "espcontrol"
        firmware_dir.mkdir(parents=True)
        (firmware_dir / "button_grid_todo.h").write_text(text, encoding="utf-8")

        errors = firmware_todo_request_errors(firmware_dir, root)
        for item in expected:
            assert any(item in error for error in errors), f"{name}: missing {item!r} in {errors!r}"
        if not expected:
            assert not errors, f"{name}: expected no errors, got {errors!r}"


def expect_todo_disconnect_errors(
    name: str,
    todo_text: str,
    core_text: str,
    expected: tuple[str, ...],
) -> None:
    with TemporaryDirectory() as tmp:
        root = Path(tmp)
        firmware_dir = root / "components" / "espcontrol"
        core_path = root / "common" / "device" / "core_infra.yaml"
        firmware_dir.mkdir(parents=True)
        core_path.parent.mkdir(parents=True)
        (firmware_dir / "button_grid_todo.h").write_text(todo_text, encoding="utf-8")
        core_path.write_text(core_text, encoding="utf-8")

        errors = firmware_todo_disconnect_errors(firmware_dir, core_path, root)
        for item in expected:
            assert any(item in error for error in errors), f"{name}: missing {item!r} in {errors!r}"
        if not expected:
            assert not errors, f"{name}: expected no errors, got {errors!r}"


def run_self_test() -> int:
    expect_errors(
        "direct action send",
        {"button_grid_actions.h": "esphome::api::global_api_server->send_homeassistant_action(req);\n"},
        ("access Home Assistant API through button_grid_ha.h helpers",),
    )
    expect_errors(
        "direct state subscription",
        {"button_grid_media.h": "api->subscribe_home_assistant_state(entity, {}, cb);\n"},
        ("subscribe to Home Assistant state through button_grid_ha.h helpers",),
    )
    expect_errors(
        "direct callback registration",
        {"button_grid_alarm.h": "api->register_action_response_callback(id, cb);\n"},
        ("register action callbacks through button_grid_ha.h helpers",),
    )
    expect_errors(
        "helper boundary",
        {"button_grid_ha.h": "esphome::api::global_api_server->send_homeassistant_action(req);\n"},
        (),
    )
    expect_errors(
        "helper use",
        {"button_grid_media.h": "ha_subscribe_state(entity, cb);\n"},
        (),
    )
    expect_ha_boundary_errors(
        "missing callback cancel helper",
        {
            "button_grid_ha.h": (
                "inline bool ha_subscribe_state() {\n  return true;\n}\n"
                "inline bool ha_subscribe_attribute() {\n  return true;\n}\n"
            )
        },
        ("expose a helper to cancel stale HA action response callbacks",),
    )
    with TemporaryDirectory() as tmp:
        root = Path(tmp)
        firmware_dir = root / "components" / "espcontrol"
        firmware_dir.mkdir(parents=True)
        (firmware_dir / "button_grid_todo.h").write_text(
            'inline bool todo_begin_get_items_request() {\n'
            '  ha_action_begin(req, "todo.get_items", false, 1, call_id);\n'
            '  ha_action_add_entity(req, ctx->entity_id);\n'
            '  return true;\n'
            '}\n',
            encoding="utf-8",
        )
        errors = firmware_todo_request_errors(firmware_dir, root)
        assert any("must capture a compact response template" in error for error in errors), errors
    with TemporaryDirectory() as tmp:
        root = Path(tmp)
        firmware_dir = root / "components" / "espcontrol"
        firmware_dir.mkdir(parents=True)
        (firmware_dir / "button_grid_todo.h").write_text(
            'inline bool todo_begin_get_items_request() {\n'
            '  ha_action_begin(req, "todo.get_items", false, 2, call_id);\n'
            '  req.wants_response = true;\n'
            '  req.response_template = response_template;\n'
            '  ha_action_add_entity(req, ctx->entity_id);\n'
            '  ha_action_add_data(req, "status", "needs_action");\n'
            '  return true;\n'
            '}\n',
            encoding="utf-8",
        )
        errors = firmware_todo_request_errors(firmware_dir, root)
        assert any("filter todo items in the response template" in error for error in errors), errors
    with TemporaryDirectory() as tmp:
        root = Path(tmp)
        firmware_dir = root / "components" / "espcontrol"
        firmware_dir.mkdir(parents=True)
        (firmware_dir / "button_grid_todo.h").write_text(
            'inline bool todo_begin_get_items_request() {\n'
            '  ha_action_begin(req, "todo.get_items", false, 1, call_id);\n'
            '  req.wants_response = true;\n'
            '  std::string response_template = todo_items_response_template(ctx->entity_id);\n'
            '  req.response_template = response_template;\n'
            '  ha_action_add_entity(req, ctx->entity_id);\n'
            '  return true;\n'
            '}\n',
            encoding="utf-8",
        )
        errors = firmware_todo_request_errors(firmware_dir, root)
        assert any("keep the todo response template alive" in error for error in errors), errors
    with TemporaryDirectory() as tmp:
        root = Path(tmp)
        firmware_dir = root / "components" / "espcontrol"
        firmware_dir.mkdir(parents=True)
        (firmware_dir / "button_grid_todo.h").write_text(
            'constexpr int TODO_RESPONSE_KEY_MAX_LEN = 96;\n'
            'inline bool todo_begin_get_items_request() {\n'
            '  ha_action_begin(req, "todo.get_items", false, 1, call_id);\n'
            '  req.wants_response = true;\n'
            '  req.response_template = response_template;\n'
            '  ha_action_add_entity(req, ctx->entity_id);\n'
            '  return true;\n'
            '}\n',
            encoding="utf-8",
        )
        errors = firmware_todo_request_errors(firmware_dir, root)
        assert any("bound todo response text" in error for error in errors), errors
    expect_todo_request_errors(
        "unbounded rendered todo response",
        'constexpr int TODO_RESPONSE_KEY_MAX_LEN = 96;\n'
        'constexpr int TODO_RESPONSE_SUMMARY_MAX_LEN = 80;\n'
        'constexpr int TODO_RESPONSE_TEXT_MAX_LEN = 1536;\n'
        'inline bool todo_begin_get_items_request() {\n'
        '  ha_action_begin(req, "todo.get_items", false, 1, call_id);\n'
        '  req.wants_response = true;\n'
        '  req.response_template = response_template;\n'
        '  ha_action_add_entity(req, ctx->entity_id);\n'
        '  return true;\n'
        '}\n',
        ("cap rendered todo responses",),
    )
    expect_todo_request_errors(
        "unbounded pending todo request",
        'constexpr int TODO_RESPONSE_KEY_MAX_LEN = 96;\n'
        'constexpr int TODO_RESPONSE_SUMMARY_MAX_LEN = 80;\n'
        'inline bool todo_begin_get_items_request() {\n'
        '  ha_action_begin(req, "todo.get_items", false, 1, call_id);\n'
        '  req.wants_response = true;\n'
        '  req.response_template = response_template;\n'
        '  ha_action_add_entity(req, ctx->entity_id);\n'
        '  return true;\n'
        '}\n'
        'inline void request_todo_items() {\n'
        '  if (!ha_register_action_response_callback(req.call_id, cb)) return;\n'
        '}\n',
        ("bound pending todo item requests with a timeout",),
    )
    expect_todo_request_errors(
        "extra todo response callback",
        'constexpr int TODO_RESPONSE_KEY_MAX_LEN = 96;\n'
        'constexpr int TODO_RESPONSE_SUMMARY_MAX_LEN = 80;\n'
        'constexpr int TODO_REQUEST_TIMEOUT_MS = 15000;\n'
        'inline void todo_cancel_stale_request() {}\n'
        'inline bool todo_begin_get_items_request() {\n'
        '  ha_action_begin(req, "todo.get_items", false, 1, call_id);\n'
        '  req.wants_response = true;\n'
        '  req.response_template = response_template;\n'
        '  ha_action_add_entity(req, ctx->entity_id);\n'
        '  return true;\n'
        '}\n'
        'inline void request_todo_items() {\n'
        '  todo_cancel_stale_request();\n'
        '  if (!ha_api_state_connected()) return;\n'
        '  todo_clear_request_state(call_id);\n'
        '  todo_clear_request_state(call_id);\n'
        '  ha_register_action_response_callback(req.call_id, cb);\n'
        '  ha_register_action_response_callback(other_call_id, cb);\n'
        '}\n',
        ("only todo list loading should register a response callback",),
    )
    expect_todo_disconnect_errors(
        "missing disconnect cleanup",
        "inline void todo_cancel_pending_request(const char *reason) {}\n",
        "api:\n  on_client_connected:\n    - lambda: refresh_weather_forecast_cards();\n",
        ("cancel pending todo requests when the HA API disconnects",),
    )
    print("Firmware Home Assistant binding self-tests passed.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--self-test", action="store_true", help="run guardrail self-tests")
    args = parser.parse_args()
    return run_self_test() if args.self_test else run_scan()


if __name__ == "__main__":
    raise SystemExit(main())
