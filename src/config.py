"""Project-wide paths.

Single source of truth for where raw and processed data live, so the
the notebooks can't silently drift out of sync on path handling.
"""

from pathlib import Path


def _find_project_root() -> Path:
    """Anchor to the project root regardless of where the kernel starts.

    Notebooks live one level below root (in notebooks/), so if the kernel's
    cwd is the notebooks folder, go up one level.
    """
    root = Path.cwd()
    if root.name == "notebooks":
        root = root.parent
    return root


PROJECT_ROOT = _find_project_root()

RAW_DATA_DIR = PROJECT_ROOT / "data" / "raw"
PROCESSED_DATA_DIR = PROJECT_ROOT / "data" / "processed"

RAW_CSV_PATH = RAW_DATA_DIR / "telco_churn.csv"
PROCESSED_CSV_PATH = PROCESSED_DATA_DIR / "telco_churn_cleaned.csv"