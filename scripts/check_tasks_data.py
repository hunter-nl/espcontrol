"""Declarative task definitions for the EspControl check suite.

This module is intentionally data-only.  The runner imports it, but validators and
generators do not depend on the runner and keep their existing entry points.
"""

from __future__ import annotations

from dataclasses import dataclass


PROFILES = ("product", "fast", "ci", "all", "release")
DOMAINS = ("product", "firmware", "web", "docs", "workflow")


@dataclass(frozen=True)
class Task:
    id: str
    commands: tuple[tuple[str, ...], ...]
    dependencies: tuple[str, ...] = ()
    profiles: tuple[str, ...] = ()
    domains: tuple[str, ...] = ()
    inputs: tuple[str, ...] = ()
    generated_inputs: tuple[str, ...] = ()
    cache: str = "never"


def task(
    task_id: str,
    *commands: tuple[str, ...],
    dependencies: tuple[str, ...] = (),
    profiles: tuple[str, ...] = (),
    domains: tuple[str, ...] = (),
    inputs: tuple[str, ...] = (),
    generated_inputs: tuple[str, ...] = (),
    cache: str = "deterministic",
) -> Task:
    return Task(task_id, commands, dependencies, profiles, domains, inputs, generated_inputs, cache)


PRODUCT = ("product", "fast", "ci", "all", "release")
FAST = ("fast", "ci", "all")
CI = ("ci", "all")
RELEASE = ("release",)


# Declaration order is the stable tie-breaker used by the planner.
TASKS = (
    task("generated", ("python3", "scripts/build.py", "--check"), profiles=PRODUCT,
         domains=("product", "firmware", "web", "docs"), inputs=("common/**", "devices/**", "src/webserver/**", "scripts/build.py"),
         generated_inputs=("components/espcontrol/*_generated.h", "docs/generated/**", "docs/public/**")),
    task("device-manifest", ("python3", "scripts/check_device_manifest.py"),
         ("python3", "scripts/check_device_manifest.py", "--self-test"), profiles=FAST,
         domains=("product", "firmware"), inputs=("devices/**", "builds/**", "scripts/check_device_manifest.py")),
    task("device-manifest-output", ("python3", "scripts/generate_device_manifest.py", "--check"), profiles=PRODUCT,
         domains=("product", "firmware", "docs"), inputs=("devices/catalog.json", "scripts/generate_device_manifest.py"),
         generated_inputs=("devices/manifest.json",)),
    task("product-schema", ("python3", "scripts/check_product_schema.py", "--self-test"),
         ("python3", "scripts/check_product_schema.py"), dependencies=("generated",), profiles=PRODUCT,
         domains=("product",), inputs=("common/config/**", "devices/**", "scripts/check_product_schema.py")),
    task("product-snapshot", ("python3", "scripts/check_product_snapshot.py"), dependencies=("generated",), profiles=PRODUCT,
         domains=("product",), inputs=("common/config/**", "common/assets/**", "devices/**", "compatibility/**"),
         generated_inputs=("product/product_snapshot.json",)),
    task("local-artifacts", ("python3", "scripts/check_local_artifacts.py"),
         ("python3", "scripts/check_local_artifacts.py", "--self-test"), profiles=FAST,
         domains=("workflow",), inputs=("scripts/check_local_artifacts.py",), cache="never"),
    task("local-esphome", ("python3", "scripts/local_esphome.py", "--self-test"), profiles=FAST,
         domains=("firmware", "workflow"), inputs=("scripts/local_esphome.py",), cache="never"),
    task("dev-docs", ("python3", "scripts/check_dev_docs.py", "--check"), profiles=FAST,
         domains=("docs",), inputs=("dev-docs/**", "scripts/check_dev_docs.py")),
    task("pr-process", ("python3", "scripts/check_pr_process.py", "--self-test"), profiles=FAST,
         domains=("workflow",), inputs=(".github/**", "scripts/check_pr_process.py"), cache="never"),
    task("pr-testing-guidance", ("python3", "scripts/pr_testing_guidance.py", "--self-test"), profiles=FAST,
         domains=("workflow",), inputs=(".github/**", "scripts/pr_testing_guidance.py"), cache="never"),
    task("config", ("node", "scripts/check_config_formats.js"), profiles=FAST,
         domains=("product", "web"), inputs=("common/config/**", "src/webserver/**", "scripts/check_config_formats.js")),
    task("backup-contract", ("node", "scripts/check_backup_contract.js"), dependencies=("generated",), profiles=PRODUCT,
         domains=("product", "web", "firmware"), inputs=("compatibility/**", "common/config/**", "src/webserver/**", "components/**")),
    task("model-contract", ("node", "scripts/check_model_contract.js"), dependencies=("generated",), profiles=PRODUCT,
         domains=("product", "web"), inputs=("src/webserver/model/**", "src/webserver/contracts/**", "scripts/check_model_contract.js")),
    task("memory-monitor", ("python3", "scripts/monitor_display_memory.py", "--self-test"), profiles=FAST,
         domains=("firmware",), inputs=("scripts/monitor_display_memory.py",)),
    task("cover-art-contract", ("python3", "scripts/check_cover_art_contract.py"), profiles=FAST,
         domains=("firmware",), inputs=("common/device/screen_cover_art.yaml", "components/espcontrol/cover_art.h", "scripts/check_cover_art_contract.py")),
    task("web-smoke", ("node", "scripts/check_web_smoke.js"), dependencies=("generated",), profiles=PRODUCT,
         domains=("web", "product"), inputs=("src/webserver/**", "scripts/check_web_smoke.js"), generated_inputs=("docs/public/webserver/**",)),
    task("types", ("tsc", "--noEmit"), profiles=FAST,
         domains=("web",), inputs=("src/**/*.ts", "tsconfig.json", "package-lock.json")),
    task("firmware-parser", ("python3", "scripts/check_firmware_parser.py"), profiles=FAST,
         domains=("firmware",), inputs=("components/**", "scripts/check_firmware_parser.py")),
    task("firmware-modals", ("python3", "scripts/check_firmware_modals.py"),
         ("python3", "scripts/check_firmware_modals.py", "--self-test"), profiles=FAST,
         domains=("firmware",), inputs=("components/**", "scripts/check_firmware_modals.py")),
    task("firmware-display-tokens", ("python3", "scripts/check_firmware_display_tokens.py"),
         ("python3", "scripts/check_firmware_display_tokens.py", "--self-test"), profiles=FAST,
         domains=("firmware",), inputs=("components/**", "scripts/check_firmware_display_tokens.py")),
    task("firmware-ha-bindings", ("python3", "scripts/check_firmware_ha_bindings.py"),
         ("python3", "scripts/check_firmware_ha_bindings.py", "--self-test"), profiles=FAST,
         domains=("firmware",), inputs=("components/**", "devices/**", "scripts/check_firmware_ha_bindings.py")),
    task("firmware-card-runtime", ("python3", "scripts/check_firmware_card_runtime.py"),
         ("python3", "scripts/check_firmware_card_runtime.py", "--self-test"), dependencies=("generated",), profiles=PRODUCT,
         domains=("firmware", "product"), inputs=("components/**", "common/config/card_contract.json", "scripts/check_firmware_card_runtime.py")),
    task("firmware-release", ("python3", "scripts/check_firmware_release.py"), profiles=FAST + RELEASE,
         domains=("firmware", "workflow"), inputs=("builds/**", "devices/**", ".github/workflows/release.yml", "scripts/check_firmware_release.py")),
    task("device-matrix", ("python3", "scripts/check_device_matrix.py"), profiles=FAST,
         domains=("firmware", "product"), inputs=("builds/**", "devices/**", "scripts/check_device_matrix.py")),
    task("device-profiles", ("python3", "scripts/check_device_profiles.py"), dependencies=("generated", "device-slots"), profiles=PRODUCT,
         domains=("firmware", "product"), inputs=("devices/**", "scripts/check_device_profiles.py"), generated_inputs=("docs/public/device-profiles.json",)),
    task("release-confidence", ("python3", "scripts/check_release_confidence.py"), profiles=PRODUCT,
         domains=("product", "workflow"), inputs=("builds/**", "devices/**", "scripts/check_release_confidence.py"), cache="never"),
    task("release-changelog", ("python3", "scripts/check_release_changelog.py"), profiles=FAST + RELEASE,
         domains=("docs", "workflow"), inputs=("docs/**", "scripts/check_release_changelog.py"), cache="never"),
    task("card-contract-outputs", ("python3", "scripts/check_card_contract_outputs.py"), dependencies=("generated",), profiles=PRODUCT,
         domains=("product", "firmware", "web", "docs"), inputs=("common/config/card_contract.json", "scripts/check_card_contract_outputs.py")),
    task("device-slots", ("python3", "scripts/generate_device_slots.py", "--check"), profiles=PRODUCT,
         domains=("firmware", "product"), inputs=("devices/**", "scripts/generate_device_slots.py"), generated_inputs=("devices/*/packages.yaml", "devices/*/device/sensors.yaml")),
    task("icon-groups", ("python3", "scripts/check_icon_groups.py"), dependencies=("generated",), profiles=FAST,
         domains=("firmware", "product"), inputs=("common/assets/**", "devices/**", "scripts/check_icon_groups.py")),
    task("timezones", ("python3", "scripts/check_timezones.py"),
         ("python3", "scripts/check_timezones.py", "--self-test"), profiles=FAST,
         domains=("firmware", "web"), inputs=("common/**", "src/webserver/**", "scripts/check_timezones.py")),
    task("public-firmware-script", ("python3", "scripts/check_public_firmware.py", "--self-test"), profiles=PRODUCT,
         domains=("firmware", "workflow"), inputs=("scripts/**", "docs/public/**")),
    task("web-browser-smoke", ("node", "scripts/check_web_browser_smoke.js"), dependencies=("generated",), profiles=CI,
         domains=("web",), inputs=("src/webserver/**", "scripts/check_web_browser_smoke.js", "package-lock.json"), cache="never"),
    task("docs-build", ("npm", "run", "docs:build"), dependencies=("generated",), profiles=("all", "release"),
         domains=("docs",), inputs=("docs/**", "package-lock.json"), generated_inputs=("docs/generated/**",)),
)
