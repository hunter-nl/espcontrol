#!/usr/bin/env python3
"""Unified build script for espcontrol.

Combines icon synchronization and www.js generation into a single tool.

Usage:
    python scripts/build.py               # run all generators
    python scripts/build.py --check       # exit 1 if any output is stale
    python scripts/build.py icons         # sync icons only
    python scripts/build.py www           # build www.js only
    python scripts/build.py icons --check # check icons only
"""
import copy
import json
import re
import shutil
import subprocess
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MDI_VERSION = "7.4.47"
MDI_CSS_URL = f"https://cdn.jsdelivr.net/npm/@mdi/font@{MDI_VERSION}/css/materialdesignicons.css"

# ---------------------------------------------------------------------------
# Shared paths
# ---------------------------------------------------------------------------
DEVICE_MANIFEST = ROOT / "devices" / "manifest.json"
ICONS_JSON = ROOT / "common" / "assets" / "icons.json"
ENTITY_NAMES_JSON = ROOT / "common" / "config" / "entity_names.json"
ENTITY_NAMES_YAML = ROOT / "common" / "config" / "entity_names.yaml"
ENTITY_NAMES_JS = ROOT / "src" / "webserver" / "modules" / "entity_catalog.js"
CARD_CONTRACT_JSON = ROOT / "common" / "config" / "card_contract.json"
CARD_CONTRACT_JS = ROOT / "src" / "webserver" / "modules" / "card_contract_generated.js"
CARD_CONTRACT_H = ROOT / "components" / "espcontrol" / "button_grid_contract_generated.h"


class BuildError(RuntimeError):
    pass


def load_json(path):
    with open(path) as f:
        return json.load(f)


def load_device_manifest():
    return load_json(DEVICE_MANIFEST)["devices"]


def load_device_manifest_data():
    return load_json(DEVICE_MANIFEST)


def load_entity_names_data():
    return load_json(ENTITY_NAMES_JSON)


def load_card_contract_data():
    return load_json(CARD_CONTRACT_JSON)


def replace_between_markers(text, start_tag, end_tag, new_content):
    """Replace content between marker lines, preserving the markers themselves."""
    pattern = re.compile(
        r"(^[^\n]*" + re.escape(start_tag) + r"[^\n]*\n)"
        r"(.*?)"
        r"(^[^\n]*" + re.escape(end_tag) + r"[^\n]*$)",
        re.MULTILINE | re.DOTALL,
    )
    m = pattern.search(text)
    if not m:
        raise ValueError(f"Markers not found: {start_tag} / {end_tag}")
    return text[: m.start(2)] + new_content + text[m.start(3) :]


# ===========================================================================
# Entity name sync
# ===========================================================================

def entity_name_entries(data):
    entries = data.get("entities")
    if not isinstance(entries, list):
        raise BuildError(f"{ENTITY_NAMES_JSON.relative_to(ROOT)} must contain an entities list")
    return entries


def validate_entity_names(data):
    errors = []
    keys = set()
    names_by_domain = {}
    for index, entry in enumerate(entity_name_entries(data)):
        key = entry.get("key")
        domain = entry.get("domain")
        name = entry.get("name")
        template = entry.get("template")
        if not isinstance(key, str) or not key:
            errors.append(f"entry {index + 1} has a missing key")
            continue
        if key in keys:
            errors.append(f"duplicate key {key!r}")
        keys.add(key)
        if not isinstance(domain, str) or not domain:
            errors.append(f"{key}: missing domain")
        if bool(name) == bool(template):
            errors.append(f"{key}: define exactly one of name or template")
        if template and "{slot}" not in template:
            errors.append(f"{key}: template must contain {{slot}}")
        value = name or template
        if isinstance(value, str):
            names_by_domain.setdefault(domain, {}).setdefault(value, []).append(key)
        object_ids = entry.get("objectIds", [])
        if object_ids and (not isinstance(object_ids, list) or not all(isinstance(v, str) and v for v in object_ids)):
            errors.append(f"{key}: objectIds must be a list of strings")
        groups = entry.get("groups", [])
        if groups and (not isinstance(groups, list) or not all(isinstance(v, str) and v for v in groups)):
            errors.append(f"{key}: groups must be a list of strings")

    for domain, names in names_by_domain.items():
        for name, entry_keys in names.items():
            if len(entry_keys) > 1:
                errors.append(f"duplicate entity name for {domain} {name!r}: {', '.join(entry_keys)}")
    return errors


def assert_entity_names_valid(data):
    errors = validate_entity_names(data)
    if not errors:
        return
    print("Entity name registry is invalid:")
    for error in errors:
        print(f"  {error}")
    raise BuildError("Entity name validation failed.")


def yaml_quote(value):
    return json.dumps(value)


def split_slot_template(template):
    before, after = template.split("{slot}", 1)
    return before, after


def gen_entity_names_yaml(data):
    lines = [
        "# =============================================================================\n",
        "# GENERATED ENTITY NAMES - do not edit by hand\n",
        "# Generated by scripts/build.py from common/config/entity_names.json.\n",
        "# =============================================================================\n",
        "\n",
        "substitutions:\n",
    ]
    for entry in entity_name_entries(data):
        key = entry["key"]
        if "name" in entry:
            lines.append(f"  entity_{key}: {yaml_quote(entry['name'])}\n")
        else:
            before, after = split_slot_template(entry["template"])
            lines.append(f"  entity_{key}_prefix: {yaml_quote(before)}\n")
            lines.append(f"  entity_{key}_suffix: {yaml_quote(after)}\n")
    return "".join(lines)


def gen_entity_names_js(data):
    entities = {}
    groups = {}
    for entry in entity_name_entries(data):
        key = entry["key"]
        entity = {"domain": entry["domain"]}
        if "name" in entry:
            entity["name"] = entry["name"]
        else:
            entity["template"] = entry["template"]
        if entry.get("objectIds"):
            entity["objectIds"] = entry["objectIds"]
        entities[key] = entity
        for group in entry.get("groups", []):
            groups.setdefault(group, []).append(key)

    payload = {
        "entities": entities,
        "groups": groups,
    }
    json_text = json.dumps(payload, indent=2)
    return (
        "// =============================================================================\n"
        "// GENERATED ENTITY CATALOG - do not edit by hand\n"
        "// Generated by scripts/build.py from common/config/entity_names.json.\n"
        "// =============================================================================\n"
        f"var ENTITY_CATALOG = {json_text};\n"
    )


def sync_entity_names(check_only=False):
    data = load_entity_names_data()
    assert_entity_names_valid(data)
    outputs = [
        (ENTITY_NAMES_YAML, gen_entity_names_yaml(data)),
        (ENTITY_NAMES_JS, gen_entity_names_js(data)),
    ]
    dirty = []
    for path, content in outputs:
        if not path.exists() or path.read_text() != content:
            dirty.append(path.relative_to(ROOT))

    if check_only:
        if dirty:
            print("Entity name outputs are out of sync. Run 'python scripts/build.py entities' to fix:")
            for rel in dirty:
                print(f"  {rel}")
        return dirty

    for path, content in outputs:
        if path.exists() and path.read_text() == content:
            continue
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content)
        print(f"  updated {path.relative_to(ROOT)}")
    return dirty


# ===========================================================================
# Card config contract generation
# ===========================================================================

def validate_card_contract(data):
    errors = []
    fields = data.get("fields")
    expected_fields = ["entity", "label", "icon", "icon_on", "sensor", "unit", "type", "precision", "options"]
    if fields != expected_fields:
        errors.append("fields must match the saved button config field order")

    cards = data.get("cards")
    if not isinstance(cards, dict) or not cards:
        errors.append("cards must be a non-empty object")
    else:
        for card_type, card in cards.items():
            if not isinstance(card_type, str):
                errors.append("cards keys must be strings")
                continue
            if not isinstance(card, dict):
                errors.append(f"cards.{card_type or '<switch>'} must be an object")
                continue
            if not isinstance(card.get("label"), str) or not card.get("label"):
                errors.append(f"cards.{card_type or '<switch>'}.label must be a non-empty string")
            if not isinstance(card.get("allowInSubpage"), bool):
                errors.append(f"cards.{card_type or '<switch>'}.allowInSubpage must be a boolean")
            domains = card.get("domains", [])
            if not isinstance(domains, list) or not all(isinstance(domain, str) for domain in domains):
                errors.append(f"cards.{card_type or '<switch>'}.domains must be a list of strings")
            if "pickerKey" in card and not isinstance(card.get("pickerKey"), str):
                errors.append(f"cards.{card_type or '<switch>'}.pickerKey must be a string")
            if "experimental" in card and not isinstance(card.get("experimental"), str):
                errors.append(f"cards.{card_type or '<switch>'}.experimental must be a string")
            if "hidden" in card and not isinstance(card.get("hidden"), bool):
                errors.append(f"cards.{card_type or '<switch>'}.hidden must be a boolean")
            default = card.get("default")
            if not isinstance(default, dict):
                errors.append(f"cards.{card_type or '<switch>'}.default must be an object")
            else:
                for field in expected_fields:
                    if not isinstance(default.get(field), str):
                        errors.append(f"cards.{card_type or '<switch>'}.default.{field} must be a string")

    aliases = data.get("migrationAliases", {})
    if not isinstance(aliases, dict):
        errors.append("migrationAliases must be an object")
    else:
        for alias, target in aliases.items():
            if not isinstance(alias, str) or not isinstance(target, dict):
                errors.append("migrationAliases keys must map to objects")
                continue
            for field, value in target.items():
                if field not in expected_fields:
                    errors.append(f"migrationAliases.{alias}.{field} is not a saved config field")
                if not isinstance(value, str):
                    errors.append(f"migrationAliases.{alias}.{field} must be a string")

    codes = data.get("subpageTypeCodes")
    if not isinstance(codes, dict) or not codes:
        errors.append("subpageTypeCodes must be a non-empty object")
    else:
        seen = {}
        for card_type, code in codes.items():
            if not isinstance(card_type, str) or not isinstance(code, str) or not code:
                errors.append("subpageTypeCodes keys and values must be non-empty strings")
                continue
            if code in seen:
                errors.append(f"duplicate subpage type code {code!r}: {seen[code]!r} and {card_type!r}")
            seen[code] = card_type
            if isinstance(cards, dict) and card_type not in cards:
                errors.append(f"subpageTypeCodes.{card_type} must also be defined in cards")

    option_select = data.get("optionSelect")
    if not isinstance(option_select, dict):
        errors.append("optionSelect must be an object")
    else:
        canonical = option_select.get("canonicalAction")
        actions = option_select.get("actions")
        if not isinstance(canonical, str) or not canonical:
            errors.append("optionSelect.canonicalAction must be a non-empty string")
        if not isinstance(actions, list) or canonical not in actions:
            errors.append("optionSelect.actions must include optionSelect.canonicalAction")

    groups = data.get("cardGroups")
    if not isinstance(groups, dict):
        errors.append("cardGroups must be an object")
    else:
        if not isinstance(groups.get("brightnessSlider"), list):
            errors.append("cardGroups.brightnessSlider must be a list")
        fan = groups.get("fan")
        if not isinstance(fan, dict) or not fan:
            errors.append("cardGroups.fan must be a non-empty object")
        else:
            for card_type, config in fan.items():
                if not isinstance(config, dict) or not isinstance(config.get("defaultIcon"), str):
                    errors.append(f"cardGroups.fan.{card_type}.defaultIcon must be a string")

    large = data.get("largeNumbers")
    if not isinstance(large, dict):
        errors.append("largeNumbers must be an object")
    return errors


def assert_card_contract_valid(data):
    errors = validate_card_contract(data)
    if not errors:
        return
    print("Card contract is invalid:")
    for error in errors:
        print(f"  {error}")
    raise BuildError("Card contract validation failed.")


def js_string_list(values):
    return "[" + ", ".join(json.dumps(v) for v in values) + "]"


def gen_card_contract_js(data):
    groups = data["cardGroups"]
    fan = groups["fan"]
    fan_default_icons = {card_type: cfg["defaultIcon"] for card_type, cfg in fan.items()}
    fan_default_icon_on = {card_type: cfg["defaultIconOn"] for card_type, cfg in fan.items() if cfg.get("defaultIconOn")}
    codes = data["subpageTypeCodes"]
    code_to_type = {code: card_type for card_type, code in codes.items()}
    large = data["largeNumbers"]
    cards = data["cards"]
    aliases = data.get("migrationAliases", {})
    return (
        "// =============================================================================\n"
        "// GENERATED CARD CONFIG CONTRACT - do not edit by hand\n"
        "// Generated by scripts/build.py from common/config/card_contract.json.\n"
        "// =============================================================================\n"
        f"var CARD_CONFIG_FIELDS = {json.dumps(data['fields'])};\n"
        f"var CARD_CONTRACT_CARDS = {json.dumps(cards, indent=2)};\n"
        f"var CARD_CONTRACT_MIGRATION_ALIASES = {json.dumps(aliases, indent=2)};\n"
        f"var CARD_CONTRACT_BRIGHTNESS_SLIDER_TYPES = {js_string_list(groups['brightnessSlider'])};\n"
        f"var CARD_CONTRACT_FAN_DEFAULT_ICONS = {json.dumps(fan_default_icons, indent=2)};\n"
        f"var CARD_CONTRACT_FAN_DEFAULT_ICON_ON = {json.dumps(fan_default_icon_on, indent=2)};\n"
        f"var CARD_CONTRACT_OPTION_SELECT_ACTION = {json.dumps(data['optionSelect']['canonicalAction'])};\n"
        f"var CARD_CONTRACT_OPTION_SELECT_ACTIONS = {js_string_list(data['optionSelect']['actions'])};\n"
        f"var CARD_CONTRACT_SUBPAGE_TYPE_CODES = {json.dumps(codes, indent=2)};\n"
        f"var CARD_CONTRACT_SUBPAGE_TYPES_BY_CODE = {json.dumps(code_to_type, indent=2)};\n"
        f"var CARD_CONTRACT_LARGE_NUMBERS = {json.dumps(large, indent=2)};\n"
        "\n"
        "function cardContractListContains(list, value) {\n"
        "  return (list || []).indexOf(value) >= 0;\n"
        "}\n"
        "\n"
        "function cardContractCard(type) {\n"
        "  return CARD_CONTRACT_CARDS[type || \"\"] || null;\n"
        "}\n"
        "\n"
        "function cardContractCardKeys() {\n"
        "  return Object.keys(CARD_CONTRACT_CARDS);\n"
        "}\n"
        "\n"
        "function cardContractCardLabel(type) {\n"
        "  var card = cardContractCard(type);\n"
        "  return card ? card.label : (type || \"Switch\");\n"
        "}\n"
        "\n"
        "function cardContractAllowInSubpage(type) {\n"
        "  var card = cardContractCard(type);\n"
        "  return !!(card && card.allowInSubpage);\n"
        "}\n"
        "\n"
        "function cardContractDefaultConfig(type) {\n"
        "  var card = cardContractCard(type);\n"
        "  var defaults = card && card.default ? card.default : CARD_CONTRACT_CARDS[\"\"].default;\n"
        "  return Object.assign({}, defaults);\n"
        "}\n"
        "\n"
        "function cardContractDomains(type) {\n"
        "  var card = cardContractCard(type);\n"
        "  return card && card.domains ? card.domains.slice() : [];\n"
        "}\n"
        "\n"
        "function cardContractMigrationAlias(type) {\n"
        "  var alias = CARD_CONTRACT_MIGRATION_ALIASES[type || \"\"];\n"
        "  return alias ? Object.assign({}, alias) : null;\n"
        "}\n"
        "\n"
        "function cardContractIsBrightnessSliderType(type) {\n"
        "  return cardContractListContains(CARD_CONTRACT_BRIGHTNESS_SLIDER_TYPES, type);\n"
        "}\n"
        "\n"
        "function cardContractIsFanCardType(type) {\n"
        "  return Object.prototype.hasOwnProperty.call(CARD_CONTRACT_FAN_DEFAULT_ICONS, type || \"\");\n"
        "}\n"
        "\n"
        "function cardContractFanDefaultIcon(type) {\n"
        "  return CARD_CONTRACT_FAN_DEFAULT_ICONS[type] || CARD_CONTRACT_FAN_DEFAULT_ICONS.fan_speed || \"Fan Speed 2\";\n"
        "}\n"
        "\n"
        "function cardContractFanDefaultIconOn(type) {\n"
        "  return CARD_CONTRACT_FAN_DEFAULT_ICON_ON[type] || \"Auto\";\n"
        "}\n"
        "\n"
        "function cardContractIsOptionSelectType(type) {\n"
        "  return type === \"option_select\";\n"
        "}\n"
        "\n"
        "function cardContractIsOptionSelectAction(action) {\n"
        "  return cardContractListContains(CARD_CONTRACT_OPTION_SELECT_ACTIONS, action);\n"
        "}\n"
        "\n"
        "function cardContractSubpageTypeCode(type) {\n"
        "  return CARD_CONTRACT_SUBPAGE_TYPE_CODES[type || \"\"] || (type || \"\");\n"
        "}\n"
        "\n"
        "function cardContractSubpageTypeFromCode(code) {\n"
        "  return CARD_CONTRACT_SUBPAGE_TYPES_BY_CODE[code || \"\"] || (code || \"\");\n"
        "}\n"
        "\n"
        "function cardContractLargeNumbersSupported(type, precision) {\n"
        "  var rule = CARD_CONTRACT_LARGE_NUMBERS[type || \"\"];\n"
        "  if (rule === true) return true;\n"
        "  if (!rule) return false;\n"
        "  if (rule.excludedPrecisions) return !cardContractListContains(rule.excludedPrecisions, precision || \"\");\n"
        "  if (rule.precisions) return cardContractListContains(rule.precisions, precision || \"\");\n"
        "  return false;\n"
        "}\n"
    )


def cpp_string_array(name, values):
    quoted = ", ".join(json.dumps(v) for v in values)
    return f"inline const char *const {name}[] = {{{quoted}}};\n"


def gen_card_contract_h(data):
    groups = data["cardGroups"]
    fan = groups["fan"]
    codes = data["subpageTypeCodes"]
    option_actions = data["optionSelect"]["actions"]
    cards = data["cards"]
    lines = [
        "#pragma once\n",
        "\n",
        "// =============================================================================\n",
        "// GENERATED CARD CONFIG CONTRACT - do not edit by hand\n",
        "// Generated by scripts/build.py from common/config/card_contract.json.\n",
        "// =============================================================================\n",
        "\n",
        f'constexpr const char *CARD_CONTRACT_OPTION_SELECT_ACTION = {json.dumps(data["optionSelect"]["canonicalAction"])};\n',
        cpp_string_array("CARD_CONTRACT_OPTION_SELECT_ACTIONS", option_actions),
        cpp_string_array("CARD_CONTRACT_BRIGHTNESS_SLIDER_TYPES", groups["brightnessSlider"]),
        "\n",
        "inline bool card_contract_string_in(const std::string &value, const char *const *items, size_t count) {\n",
        "  for (size_t i = 0; i < count; i++) {\n",
        "    if (value == items[i]) return true;\n",
        "  }\n",
        "  return false;\n",
        "}\n",
        "\n",
        "inline bool card_contract_is_brightness_slider_type(const std::string &type) {\n",
        "  return card_contract_string_in(type, CARD_CONTRACT_BRIGHTNESS_SLIDER_TYPES,\n",
        "    sizeof(CARD_CONTRACT_BRIGHTNESS_SLIDER_TYPES) / sizeof(CARD_CONTRACT_BRIGHTNESS_SLIDER_TYPES[0]));\n",
        "}\n",
        "\n",
        "inline bool card_contract_is_option_select_action(const std::string &action) {\n",
        "  return card_contract_string_in(action, CARD_CONTRACT_OPTION_SELECT_ACTIONS,\n",
        "    sizeof(CARD_CONTRACT_OPTION_SELECT_ACTIONS) / sizeof(CARD_CONTRACT_OPTION_SELECT_ACTIONS[0]));\n",
        "}\n",
        "\n",
        "inline const char *card_contract_card_label(const std::string &type) {\n",
    ]
    for card_type, card in cards.items():
        lines.append(f'  if (type == {json.dumps(card_type)}) return {json.dumps(card["label"])};\n')
    lines.extend([
        "  return type.empty() ? \"Switch\" : type.c_str();\n",
        "}\n",
        "\n",
        "inline bool card_contract_allow_in_subpage(const std::string &type) {\n",
    ])
    for card_type, card in cards.items():
        lines.append(f'  if (type == {json.dumps(card_type)}) return {"true" if card["allowInSubpage"] else "false"};\n')
    lines.extend([
        "  return false;\n",
        "}\n",
        "\n",
        "inline const char *card_contract_default_icon_name(const std::string &type) {\n",
    ])
    for card_type, card in cards.items():
        lines.append(f'  if (type == {json.dumps(card_type)}) return {json.dumps(card["default"]["icon"])};\n')
    lines.extend([
        "  return \"Auto\";\n",
        "}\n",
        "\n",
        "inline const char *card_contract_default_icon_on_name(const std::string &type) {\n",
    ])
    for card_type, card in cards.items():
        lines.append(f'  if (type == {json.dumps(card_type)}) return {json.dumps(card["default"]["icon_on"])};\n')
    lines.extend([
        "  return \"Auto\";\n",
        "}\n",
        "\n",
        "inline bool card_contract_is_fan_card_type(const std::string &type) {\n",
    ]
    )
    fan_conditions = " ||\n         ".join(f'type == "{card_type}"' for card_type in fan.keys())
    lines.append(f"  return {fan_conditions};\n")
    lines.extend([
        "}\n",
        "\n",
        "inline const char *card_contract_fan_default_icon_name(const std::string &type) {\n",
    ])
    for card_type, config in fan.items():
        lines.append(f'  if (type == "{card_type}") return {json.dumps(config["defaultIcon"])};\n')
    lines.extend([
        "  return \"Fan Speed 2\";\n",
        "}\n",
        "\n",
        "inline const char *card_contract_fan_default_icon_on_name(const std::string &type) {\n",
    ])
    for card_type, config in fan.items():
        if config.get("defaultIconOn"):
            lines.append(f'  if (type == "{card_type}") return {json.dumps(config["defaultIconOn"])};\n')
    lines.extend([
        "  return \"Auto\";\n",
        "}\n",
        "\n",
        "inline bool card_contract_large_numbers_supported(const std::string &type, const std::string &precision) {\n",
        "  if (type == \"sensor\") return precision != \"text\";\n",
        "  if (type == \"weather\") return precision == \"today\" || precision == \"tomorrow\";\n",
        "  return type == \"calendar\" || type == \"timezone\";\n",
        "}\n",
        "\n",
        "inline const char *card_contract_subpage_type_code(const std::string &type) {\n",
    ])
    for card_type, code in codes.items():
        lines.append(f'  if (type == "{card_type}") return "{code}";\n')
    lines.extend([
        "  return type.c_str();\n",
        "}\n",
        "\n",
        "inline std::string card_contract_subpage_type_from_code(const std::string &code) {\n",
    ])
    for card_type, code in codes.items():
        lines.append(f'  if (code == "{code}") return "{card_type}";\n')
    lines.extend([
        "  return code;\n",
        "}\n",
    ])
    return "".join(lines)


def sync_card_contract(check_only=False):
    data = load_card_contract_data()
    assert_card_contract_valid(data)
    outputs = [
        (CARD_CONTRACT_JS, gen_card_contract_js(data)),
        (CARD_CONTRACT_H, gen_card_contract_h(data)),
    ]
    dirty = []
    for path, content in outputs:
        if not path.exists() or path.read_text() != content:
            dirty.append(path.relative_to(ROOT))

    if check_only:
        if dirty:
            print("Card contract outputs are out of sync. Run 'python scripts/build.py contract' to fix:")
            for rel in dirty:
                print(f"  {rel}")
        return dirty

    for path, content in outputs:
        if path.exists() and path.read_text() == content:
            continue
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content)
        print(f"  updated {path.relative_to(ROOT)}")
    return dirty


def icon_items(data):
    return [data["fallback"], *data.get("structural", []), *data["icons"]]


def load_mdi_codepoints():
    """Load the codepoint map from the same MDI CSS version used by the web UI."""
    try:
        with urllib.request.urlopen(MDI_CSS_URL, timeout=20) as response:
            css = response.read().decode("utf-8")
    except Exception as exc:
        raise BuildError(f"Unable to fetch pinned MDI CSS from {MDI_CSS_URL}: {exc}") from exc

    return {
        match.group(1): match.group(2).upper()
        for match in re.finditer(
            r'\.mdi-([a-z0-9-]+)::before \{\s*content: "\\([0-9A-Fa-f]+)";',
            css,
        )
    }


def check_duplicate_icon_fields(data):
    errors = []
    seen = {}
    for item in icon_items(data):
        seen.setdefault(item["name"], []).append(item["mdi"])
    for name, mdi_names in seen.items():
        if len(mdi_names) > 1:
            errors.append(f"duplicate name {name!r}: {', '.join(mdi_names)}")
    return errors


def check_mdi_versions():
    """Make sure the browser CSS and device font URLs stay on the same MDI version."""
    files = [
        ROOT / "src" / "webserver" / "www.js",
        ROOT / "common" / "assets" / "icons.yaml",
        *sorted(ROOT.glob("devices/*/device/fonts.yaml")),
    ]
    version_re = re.compile(
        r"(?:@mdi/font@|MaterialDesign-Webfont/raw/v|materialdesignicons\.com/cdn/)"
        r"([0-9]+(?:\.[0-9]+)+)"
    )
    errors = []
    for path in files:
        versions = set(version_re.findall(path.read_text()))
        if versions and versions != {MDI_VERSION}:
            rel = path.relative_to(ROOT)
            errors.append(f"{rel} references MDI version(s) {', '.join(sorted(versions))}, expected {MDI_VERSION}")
    return errors


def validate_icon_data(data):
    """Verify icons.json matches the pinned Material Design Icons release."""
    errors = []
    errors.extend(check_duplicate_icon_fields(data))
    errors.extend(check_mdi_versions())

    mdi_codepoints = load_mdi_codepoints()
    for item in icon_items(data):
        mdi = item["mdi"]
        expected = mdi_codepoints.get(mdi)
        actual = item["codepoint"].upper()
        if expected is None:
            errors.append(f"{item['name']} references missing mdi-{mdi}")
        elif actual != expected:
            errors.append(f"{item['name']} / mdi-{mdi}: icons.json={actual}, MDI {MDI_VERSION}={expected}")

    return errors


def assert_icon_data_valid(data):
    errors = validate_icon_data(data)
    if not errors:
        return

    print(f"Icon data does not match Material Design Icons {MDI_VERSION}:")
    for error in errors:
        print(f"  {error}")
    raise BuildError("Icon validation failed.")


# ===========================================================================
# Icon sync (formerly sync_icons.py)
# ===========================================================================

def gen_icon_glyphs(data):
    """Font glyph codepoint list for LVGL font subsetting."""
    fb = data["fallback"]
    seen_codepoints = {fb["codepoint"]}
    lines = [f'- "\\U{fb["codepoint"]:>08s}"  # mdi-{fb["mdi"]} (Auto fallback)\n']
    for icon in data.get("structural", []):
        if icon["codepoint"] in seen_codepoints:
            continue
        seen_codepoints.add(icon["codepoint"])
        comment = icon.get("comment", "")
        suffix = f" ({comment})" if comment else ""
        lines.append(f'- "\\U{icon["codepoint"]:>08s}"  # mdi-{icon["mdi"]}{suffix}\n')
    for icon in data["icons"]:
        if icon["codepoint"] in seen_codepoints:
            continue
        seen_codepoints.add(icon["codepoint"])
        cp = icon["codepoint"]
        lines.append(f'- "\\U{cp:>08s}"  # mdi-{icon["mdi"]}\n')
    return "".join(lines)


def gen_icons_h_entries(data):
    """C++ IconEntry array initializers for icons.h."""
    max_name_len = max(len(i["name"]) for i in data["icons"])
    lines = []
    for icon in data["icons"]:
        padded = f'"{icon["name"]}",'
        padded = padded.ljust(max_name_len + 3)
        lines.append(f'    {{{padded} "\\U{icon["codepoint"]:>08s}"}},\n')
    return "".join(lines)


def gen_icons_h_domain_icons(data):
    """C++ early-return chain for domain default icons in icons.h."""
    icon_by_name = {i["name"]: i for i in data["icons"]}
    entries = list(data["domain_defaults"].items())
    target_col = 46
    lines = []
    for domain, icon_name in entries:
        icon = icon_by_name[icon_name]
        cp = icon["codepoint"]
        prefix = f'  if (domain == "{domain}")'
        pad = max(target_col - len(prefix), 1)
        lines.append(
            f'{prefix}{" " * pad}'
            f'return "\\U{cp:>08s}";  // {icon_name}\n'
        )
    return "".join(lines)


def gen_www_js_icon_map(data):
    """JS ICON_EXCEPTIONS + ICON_NAMES for www.js."""
    fb = data["fallback"]
    exceptions = [f'    Auto: "{fb["mdi"]}",\n']
    names = []

    for icon in data["icons"]:
        name = icon["name"]
        mdi = icon["mdi"]
        names.append(name)
        expected = re.sub(r"[^a-z0-9 ]", "", name.lower()).replace(" ", "-")
        if expected != mdi:
            key = name if re.match(r"^[A-Za-z_$][A-Za-z0-9_$]*$", name) else f'"{name}"'
            exceptions.append(f'    {key}: "{mdi}",\n')

    lines = ["  var ICON_EXCEPTIONS = {\n"]
    lines.extend(exceptions)
    lines.append("  };\n")
    lines.append("  var ICON_NAMES = [\n")
    for i in range(0, len(names), 6):
        chunk = names[i : i + 6]
        formatted = ", ".join(f'"{n}"' for n in chunk)
        lines.append(f"    {formatted},\n")
    lines.append("  ];\n")
    return "".join(lines)


def gen_www_js_domain_icons(data):
    """JS DOMAIN_ICONS object entries."""
    icon_by_name = {i["name"]: i for i in data["icons"]}
    lines = []
    for domain, icon_name in data["domain_defaults"].items():
        mdi = icon_by_name[icon_name]["mdi"]
        lines.append(f'    {domain}: "{mdi}",\n')
    return "".join(lines)


def sync_icons(check_only=False):
    """Sync icon data from icons.json into all downstream files."""
    data = load_json(ICONS_JSON)
    assert_icon_data_valid(data)
    dirty = []

    icons_h = ROOT / "components" / "espcontrol" / "icons.h"
    icon_glyphs = ROOT / "common" / "assets" / "icon_glyphs.yaml"
    www_js = ROOT / "src" / "webserver" / "www.js"

    patches = [
        (icon_glyphs, "GENERATED:ICONS START", "GENERATED:ICONS END", gen_icon_glyphs),
        (icons_h, "GENERATED:ICONS START", "GENERATED:ICONS END", gen_icons_h_entries),
        (icons_h, "GENERATED:DOMAIN_ICONS START", "GENERATED:DOMAIN_ICONS END", gen_icons_h_domain_icons),
        (www_js, "GENERATED:ICONS START", "GENERATED:ICONS END", gen_www_js_icon_map),
        (www_js, "GENERATED:DOMAIN_ICONS START", "GENERATED:DOMAIN_ICONS END", gen_www_js_domain_icons),
    ]

    file_contents = {}
    for path, start_tag, end_tag, generator in patches:
        if path not in file_contents:
            file_contents[path] = path.read_text()
        old = file_contents[path]
        new_content = generator(data)
        updated = replace_between_markers(old, start_tag, end_tag, new_content)
        if updated != old:
            file_contents[path] = updated
            dirty.append((path.relative_to(ROOT), start_tag))

    if check_only:
        if dirty:
            print("Icon data is out of sync. Run 'python scripts/build.py icons' to fix:")
            for rel, tag in dirty:
                print(f"  {rel} ({tag})")
        return dirty

    for path, content in file_contents.items():
        original = path.read_text()
        if content != original:
            path.write_text(content)
            print(f"  updated {path.relative_to(ROOT)}")
    return dirty


# ===========================================================================
# www.js build (formerly build_www.py)
# ===========================================================================

WWW_SOURCE = ROOT / "src" / "webserver" / "www.js"
MODULES_DIR = ROOT / "src" / "webserver" / "modules"
TYPES_DIR = ROOT / "src" / "webserver" / "types"
WWW_OUTPUT_DIR = ROOT / "docs" / "public" / "webserver"
WEB_MODULE_ORDER_PATH = ROOT / "scripts" / "web_modules.json"

CONFIG_START = "__DEVICE_CONFIG_START__"
CONFIG_END = "__DEVICE_CONFIG_END__"
MODULES_START = "__WEB_MODULES_START__"
MODULES_END = "__WEB_MODULES_END__"
TYPES_START = "__BUTTON_TYPES_START__"
TYPES_END = "__BUTTON_TYPES_END__"

def load_web_module_order():
    order = load_json(WEB_MODULE_ORDER_PATH)
    if not isinstance(order, list) or not all(isinstance(name, str) and name for name in order):
        raise BuildError(f"Invalid web module order: {WEB_MODULE_ORDER_PATH.relative_to(ROOT)}")
    return order


def build_config_block(slug, cfg):
    cfg_lines = json.dumps(cfg, indent=2).splitlines()
    cfg_body = "\n".join("  " + line for line in cfg_lines[1:])
    return (
        f'  var DEVICE_ID = "{slug}";\n'
        f"  var CFG = {cfg_lines[0]}\n"
        f"{cfg_body};\n"
    )


def web_features(device):
    features = {}
    rotation = device.get("rotation") or {}
    if rotation.get("enabled"):
        features["screenRotation"] = True
        features["screenRotationOptions"] = rotation.get("options", [])
        if "default" in rotation:
            features["screenRotationDefault"] = rotation["default"]
        if "displayOffset" in rotation:
            features["screenRotationDisplayOffset"] = rotation["displayOffset"]
    if device.get("internalRelays"):
        features["internalRelays"] = device["internalRelays"]
    return features


def build_web_devices():
    devices = {}
    manifest = load_device_manifest_data()
    settings = {
        "largeSensorUnitOffsetPercent": -10,
        **manifest.get("settings", {}),
    }
    for slug, device in manifest["devices"].items():
        layout = device["layout"]
        features = web_features(device)
        cfg = {
            "slots": device["slots"],
            "cols": layout["cols"],
            "rows": layout["rows"],
            "largeSensorUnitOffsetPercent": settings["largeSensorUnitOffsetPercent"],
        }
        for key, value in device["web"].items():
            cfg[key] = copy.deepcopy(value)
            if key == "dragAnimation" and features:
                cfg["features"] = copy.deepcopy(features)
        if features and "features" not in cfg:
            cfg["features"] = copy.deepcopy(features)
        devices[slug] = cfg
    return devices


def load_button_types():
    if not TYPES_DIR.is_dir():
        return ""
    files = sorted(TYPES_DIR.glob("*.js"))
    if not files:
        return ""
    chunks = []
    for f in files:
        chunks.append(f"  // --- type: {f.stem} ---")
        for line in f.read_text().rstrip().splitlines():
            chunks.append(f"  {line}" if line.strip() else "")
    return "\n".join(chunks) + "\n"


def load_web_modules():
    chunks = []
    for name in load_web_module_order():
        path = MODULES_DIR / f"{name}.js"
        if not path.exists():
            raise BuildError(f"Missing web module: {path.relative_to(ROOT)}")
        chunks.append(f"  // --- module: {name} ---")
        for line in path.read_text().rstrip().splitlines():
            chunks.append(f"  {line}" if line.strip() else "")
    return "\n".join(chunks) + "\n"


def replace_marked_block(source_text, start_tag, end_tag, new_content):
    pattern = re.compile(
        r"(^[^\n]*" + re.escape(start_tag) + r"[^\n]*\n)"
        r"(.*?)"
        r"(^[^\n]*" + re.escape(end_tag) + r"[^\n]*$)",
        re.MULTILINE | re.DOTALL,
    )
    m = pattern.search(source_text)
    if not m:
        return None
    return source_text[: m.start(2)] + new_content + source_text[m.start(3) :]


def replace_types(source_text):
    replaced = replace_marked_block(source_text, TYPES_START, TYPES_END, load_button_types())
    if replaced is None:
        return source_text
    return replaced


def replace_modules(source_text):
    replaced = replace_marked_block(source_text, MODULES_START, MODULES_END, load_web_modules())
    if replaced is None:
        raise ValueError(f"Module markers not found: {MODULES_START} / {MODULES_END}")
    return replaced


def replace_config(source_text, slug, cfg):
    pattern = re.compile(
        r"(^[^\n]*" + re.escape(CONFIG_START) + r"[^\n]*\n)"
        r"(.*?)"
        r"(^[^\n]*" + re.escape(CONFIG_END) + r"[^\n]*$)",
        re.MULTILINE | re.DOTALL,
    )
    m = pattern.search(source_text)
    if not m:
        raise ValueError(f"Config markers not found: {CONFIG_START} / {CONFIG_END}")
    return source_text[: m.start(2)] + build_config_block(slug, cfg) + source_text[m.start(3) :]


def esbuild_cmd():
    """Return an esbuild command path, preferring the repo-installed binary."""
    local = ROOT / "node_modules" / ".bin" / ("esbuild.cmd" if sys.platform == "win32" else "esbuild")
    if local.exists():
        return str(local)
    found = shutil.which("esbuild")
    if found:
        return found
    raise RuntimeError("esbuild not found. Run 'npm ci' before building www.js outputs.")


def minify_js(source_text):
    """Minify generated web UI JavaScript with esbuild."""
    result = subprocess.run(
        [esbuild_cmd(), "--loader=js", "--minify"],
        input=source_text,
        text=True,
        capture_output=True,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or "esbuild failed")
    return result.stdout


def build_www(check_only=False):
    """Build per-device www.js from the single source template."""
    devices = build_web_devices()
    source_text = WWW_SOURCE.read_text()
    source_text = replace_types(source_text)
    source_text = replace_modules(source_text)
    dirty = []

    for slug, cfg in devices.items():
        output_path = WWW_OUTPUT_DIR / slug / "www.js"
        generated = minify_js(replace_config(source_text, slug, cfg))

        if output_path.exists():
            current = output_path.read_text()
            if current == generated:
                continue

        dirty.append(slug)

        if not check_only:
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_text(generated)
            print(f"  updated docs/public/webserver/{slug}/www.js")

    if check_only and dirty:
        print("www.js outputs are out of date. Run 'python scripts/build.py www' to fix:")
        for slug in dirty:
            print(f"  docs/public/webserver/{slug}/www.js")
    return dirty


# ===========================================================================
# Main
# ===========================================================================

def main():
    args = sys.argv[1:]
    check_only = "--check" in args
    commands = [a for a in args if a != "--check"]

    if not commands:
        commands = ["all"]

    exit_code = 0

    try:
        for cmd in commands:
            if cmd == "all":
                entity_dirty = sync_entity_names(check_only=check_only)
                contract_dirty = sync_card_contract(check_only=check_only)
                icon_dirty = sync_icons(check_only=check_only)
                www_dirty = build_www(check_only=check_only)
                if check_only and (entity_dirty or contract_dirty or icon_dirty or www_dirty):
                    exit_code = 1
                elif not entity_dirty and not contract_dirty and not icon_dirty and not www_dirty:
                    print("All outputs are up to date.")
                else:
                    total = len(entity_dirty) + len(contract_dirty) + len(icon_dirty) + len(www_dirty)
                    print(f"Updated {total} target(s).")
            elif cmd == "entities":
                dirty = sync_entity_names(check_only=check_only)
                if check_only and dirty:
                    exit_code = 1
                elif not dirty:
                    print("Entity name outputs are in sync.")
                else:
                    print(f"Synced {len(dirty)} entity name output(s).")
            elif cmd == "icons":
                dirty = sync_icons(check_only=check_only)
                if check_only and dirty:
                    exit_code = 1
                elif not dirty:
                    print("Icon data is in sync.")
                else:
                    print(f"Synced {len(dirty)} section(s).")
            elif cmd == "contract":
                dirty = sync_card_contract(check_only=check_only)
                if check_only and dirty:
                    exit_code = 1
                elif not dirty:
                    print("Card contract outputs are in sync.")
                else:
                    print(f"Synced {len(dirty)} card contract output(s).")
            elif cmd == "www":
                dirty = build_www(check_only=check_only)
                if check_only and dirty:
                    exit_code = 1
                elif not dirty:
                    print("All www.js outputs are up to date.")
                else:
                    print(f"Built {len(dirty)} file(s).")
            else:
                print(f"Unknown command: {cmd}")
                print("Usage: python scripts/build.py [all|entities|contract|icons|www] [--check]")
                exit_code = 1
    except BuildError as exc:
        print(exc)
        return 1

    return exit_code


if __name__ == "__main__":
    sys.exit(main())
