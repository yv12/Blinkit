"""Run full Phase 3: tag catalog → generate candidates."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = Path(__file__).resolve().parent


def run(script: str, extra: list[str] | None = None) -> None:
    cmd = [sys.executable, str(SCRIPTS / script), *(extra or [])]
    print(f"\n>>> {' '.join(cmd)}")
    subprocess.check_call(cmd, cwd=str(ROOT))


def main() -> None:
    extra = sys.argv[1:]
    run("phase3_tag_catalog.py", extra)
    run("phase3_generate_candidates.py", extra)
    print("\n=== Phase 3 complete ===")
    print("Outputs: data/catalog.json, data/tag_review.json,")
    print("         data/candidates_{akash,janvi,bardhan}.json, data/bridge_review.json")


if __name__ == "__main__":
    main()
