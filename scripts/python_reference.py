"""Locate explicit Python reference checkouts; never depend on the PoC layout."""
import os
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
CORE = Path(os.environ.get("ASQUEEL_PYTHON_ROOT", ROOT.parent / "asqueel")).resolve()
MIGRATION = Path(os.environ.get("ASQUEEL_MIGRATION_ROOT", ROOT.parent / "asqueel-migration")).resolve()
for path, module, variable in ((CORE, "asqueel", "ASQUEEL_PYTHON_ROOT"),
                               (MIGRATION, "asqueel_migration", "ASQUEEL_MIGRATION_ROOT")):
    if not (path / "src" / module).is_dir():
        raise RuntimeError(f"Missing Python reference at {path}. Set {variable}; see docs/parity.md")
sys.path[:0] = [str(CORE / "src"), str(MIGRATION / "src"), str(ROOT / "examples")]
