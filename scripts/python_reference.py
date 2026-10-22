"""Locate explicit Python reference checkouts; never depend on the PoC layout."""
import os
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
CORE = Path(os.environ.get("ASQUEEL_PYTHON_ROOT", ROOT / ".reference" / ("asqueel-current" if (ROOT / ".reference/asqueel-current").is_dir() else "asqueel"))).resolve()
MIGRATION = Path(os.environ.get("ASQUEEL_MIGRATION_ROOT", ROOT / ".reference/asqueel-migration")).resolve()
for path, module, variable in ((CORE, "asqueel", "ASQUEEL_PYTHON_ROOT"),
                               (MIGRATION, "asqueel_migration", "ASQUEEL_MIGRATION_ROOT")):
    if not (path / "src" / module).is_dir():
        raise RuntimeError(f"Missing Python reference at {path}. Set {variable}; see docs/parity.md")
sys.path[:0] = [str(CORE / "src"), str(MIGRATION / "src"), str(ROOT / "examples")]

import tomllib
if tomllib.loads((CORE / "pyproject.toml").read_text())["project"]["version"] != "0.6.4":
    raise RuntimeError("Model parity requires the pinned Asqueel 0.6.4 reference; refusing an older checkout")

# A release number alone is insufficient: a different 0.6.4 commit is a different oracle.
import json
import subprocess
expected = json.loads((ROOT / "test/fixtures/provenance.json").read_text())
if (CORE / ".git").exists():
    revision = subprocess.check_output(["git", "-C", str(CORE), "rev-parse", "HEAD"], text=True).strip()
    if revision != expected["coreCommit"]:
        raise RuntimeError(f"Reference commit {revision} differs from pinned {expected['coreCommit']}")
    if subprocess.check_output(["git", "-C", str(CORE), "status", "--porcelain", "--untracked-files=no"], text=True).strip():
        raise RuntimeError("The Python reference contains tracked modifications; use a clean pinned checkout")
