import os
import sys

ROOT = os.path.dirname(__file__)
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

if __name__ == "__main__":
    import uvicorn

    uvicorn.run("backend.src.api.app:app", host="0.0.0.0", port=8002, reload=True)
