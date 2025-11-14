import os
import sys
import runpy

# Ensure project root is on sys.path so top-level packages like `lib` are importable
ROOT = os.path.dirname(__file__)
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

# Run backend/src/main.py as a script (preserves behavior of top-level script execution)
runpy.run_path(os.path.join(ROOT, 'backend', 'src', 'main.py'), run_name='__main__')
