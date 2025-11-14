from __future__ import annotations

import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.etl_pipeline2 import run_pipeline


def main() -> dict[str, int]:

    run_pipeline()

if __name__ == "__main__":
    main()
