#!/usr/bin/env python3
"""Guard firmware modal row click payloads against heap allocation."""

from __future__ import annotations

import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
FIRMWARE_DIR = ROOT / "components" / "espcontrol"
FORBIDDEN_ALLOCATIONS = (
    "ClimateOptionClick",
    "FanPresetClick",
    "OptionSelectOptionClick",
)


def main() -> int:
    pattern = re.compile(r"\bnew\s+(" + "|".join(FORBIDDEN_ALLOCATIONS) + r")\b")
    errors: list[str] = []

    for path in sorted(FIRMWARE_DIR.glob("button_grid*.h")):
        for line_no, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
            match = pattern.search(line)
            if match:
                rel = path.relative_to(ROOT)
                errors.append(
                    f"{rel}:{line_no}: avoid per-row heap allocation for {match.group(1)}"
                )

    if errors:
        print("Firmware modal allocation check failed:")
        for error in errors:
            print(f"  {error}")
        return 1

    print("Firmware modal allocation checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
