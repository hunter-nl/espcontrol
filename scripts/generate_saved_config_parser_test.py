#!/usr/bin/env python3
"""Generate the host C++ saved-configuration parser fixture test."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CONFIG_DIR = ROOT / "common" / "config"
FIELDS = ("entity", "label", "icon", "icon_on", "sensor", "unit", "type", "precision", "options")


def cpp_string(value: str) -> str:
    return json.dumps(value)


def fixture_groups() -> list[tuple[str, list[dict]]]:
    shared = json.loads((CONFIG_DIR / "card_normalization_fixtures.json").read_text(encoding="utf-8"))
    groups = [(label, fixtures) for label, fixtures in sorted(shared.items())]
    for path in sorted(CONFIG_DIR.glob("*_card_normalization_fixtures.json")):
        label = path.name.removesuffix("_card_normalization_fixtures.json").replace("_", " ")
        groups.append((label, json.loads(path.read_text(encoding="utf-8"))))
    return groups


def identifier(value: str) -> str:
    return "".join(char if char.isalnum() else "_" for char in value.lower())


def generate() -> str:
    lines = [
        "// Generated from common/config/*_card_normalization_fixtures.json.",
        "#include <cassert>",
        "#include <cstdint>",
        "#include <cstring>",
        "#include <string>",
        "#include <vector>",
        "",
        "namespace esphome {",
        "class StringRef {",
        " public:",
        '  StringRef(const char *value) : value_(value ? value : "") {}',
        "  const char *c_str() const { return value_; }",
        "  size_t size() const { return std::strlen(value_); }",
        " private:",
        "  const char *value_;",
        "};",
        "}",
        "struct lv_obj_t {};",
        "inline void lv_label_set_text(lv_obj_t *, const char *) {}",
        "inline const char *espcontrol_i18n(const char *text) { return text ? text : \"\"; }",
        "inline std::string espcontrol_i18n(const std::string &text) { return text; }",
        '#include "button_grid_config_parser.h"',
        "",
        "int main() {",
    ]
    for group, fixtures in fixture_groups():
        lines.append(f"  // {group}")
        for fixture in fixtures:
            base = f"fixture_{identifier(group)}_{identifier(fixture['name'])}"
            cases = [("input", fixture["input"])]
            if "canonical" in fixture:
                cases.append(("canonical", fixture["canonical"]))
            for case_name, encoded in cases:
                variable = base if case_name == "input" else f"{base}_{case_name}"
                lines.append(f"  const auto {variable} = parse_cfg({cpp_string(encoded)});")
                for field in FIELDS:
                    lines.append(
                        f"  assert({variable}.{field} == {cpp_string(fixture['expected'][field])});"
                    )
    lines.extend(("  return 0;", "}", ""))
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(generate(), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
