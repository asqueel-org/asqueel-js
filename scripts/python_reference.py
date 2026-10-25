"""Locate the explicit Python reference checkout; never depend on the PoC layout."""
import importlib.metadata
import json
import os
from pathlib import Path
import subprocess
import sys
import tomllib

ROOT = Path(__file__).resolve().parents[1]
CORE = Path(os.environ.get("ASQUEEL_PYTHON_ROOT", ROOT / ".reference/asqueel-current")).resolve()
if not (CORE / "src/asqueel").is_dir():
    raise RuntimeError(f"Missing Python reference at {CORE}. Set ASQUEEL_PYTHON_ROOT; see docs/parity.md")
sys.path[:0] = [str(CORE / "src"), str(ROOT / "examples")]

expected = json.loads((ROOT / "test/fixtures/provenance.json").read_text())
if tomllib.loads((CORE / "pyproject.toml").read_text())["project"]["version"] != expected["coreVersion"]:
    raise RuntimeError(f"Model parity requires the pinned Asqueel {expected['coreVersion']} reference")
# A release number alone is insufficient: a different commit is a different oracle.
if (CORE / ".git").exists():
    revision = subprocess.check_output(["git", "-C", str(CORE), "rev-parse", "HEAD"], text=True).strip()
    if revision != expected["coreCommit"]:
        raise RuntimeError(f"Reference commit {revision} differs from pinned {expected['coreCommit']}")
    if subprocess.check_output(["git", "-C", str(CORE), "status", "--porcelain", "--untracked-files=no"], text=True).strip():
        raise RuntimeError("The Python reference contains tracked modifications; use a clean pinned checkout")
# asqueel-migration, genro-builders, genro-bag and genro-tytx are the installed releases.
for package, key in (("asqueel-migration", "migrationVersion"), ("genro-builders", "buildersVersion"),
                     ("genro-bag", "bagVersion"), ("genro-tytx", "tytxVersion")):
    if importlib.metadata.version(package) != expected[key]:
        raise RuntimeError(f"{package} {importlib.metadata.version(package)} differs from pinned {expected[key]}")
