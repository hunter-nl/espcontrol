#!/usr/bin/env python3
"""Apply registered mutations in temporary copies and require their checks to fail."""

from __future__ import annotations

import json
import shutil
import subprocess
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
REGISTRY = ROOT / "tests" / "mutations" / "registry.json"


def main() -> int:
    entries = json.loads(REGISTRY.read_text(encoding="utf-8"))
    if not isinstance(entries, list):
        raise SystemExit("Mutation registry must contain a JSON list")

    seen: set[str] = set()
    for entry in entries:
        mutation_id = entry["id"]
        if mutation_id in seen:
            raise SystemExit(f"Duplicate mutation id: {mutation_id}")
        seen.add(mutation_id)
        patch = ROOT / "tests" / "mutations" / entry["patch"]
        if not patch.is_file() or not entry.get("command"):
            raise SystemExit(f"Invalid mutation entry: {mutation_id}")

        with tempfile.TemporaryDirectory(prefix=f"espcontrol-{mutation_id}-") as directory:
            copy = Path(directory) / "repo"
            shutil.copytree(ROOT, copy, ignore=shutil.ignore_patterns(".git", "node_modules", "build", ".cache"))
            applied = subprocess.run(
                ["git", "apply", str(patch)], cwd=copy, text=True, capture_output=True, check=False
            )
            if applied.returncode:
                raise SystemExit(f"{mutation_id}: patch did not apply\n{applied.stderr}")
            result = subprocess.run(entry["command"], cwd=copy, check=False)
            if result.returncode == 0:
                raise SystemExit(f"{mutation_id}: replacement check did not catch mutation")
            print(f"{mutation_id}: caught")

    print(f"Mutation checks passed ({len(entries)} registered).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
