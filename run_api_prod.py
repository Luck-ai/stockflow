import os
import sys
import sys, traceback
if getattr(sys, 'frozen', False):
    import os
    log_path = os.path.join(os.path.dirname(sys.executable), "error.log")
    sys.stderr = open(log_path, "w", encoding="utf-8")
    sys.stdout = sys.stderr
try:
    if getattr(sys, 'frozen', False):
        application_path = sys._MEIPASS
    else:
        application_path = os.path.dirname(__file__)

    backend_path = os.path.join(application_path, 'backend')
    if backend_path not in sys.path:
        sys.path.insert(0, backend_path)

    ROOT = os.path.dirname(__file__)
    if ROOT not in sys.path:
        sys.path.insert(0, ROOT)

    if __name__ == "__main__":
        import uvicorn
        from src.api.app import app

        port = int(os.environ.get("PORT", 8002))
        
        uvicorn.run(
            app,
            host="0.0.0.0",
            port=port,
            reload=False,
            log_level="info"
        )

        print("App started successfully")
        
except Exception:
    traceback.print_exc()
    input("Press Enter to exit...")

