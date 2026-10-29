"""Entry point on Hugging Face Spaces (copied to app.py by deploy/huggingface.sh).

A Gradio Space simply runs `python app.py` and expects a web server on port 7860.
We don't use Gradio itself: we start Vox's own FastAPI server, which serves both the
API and the already-built React app (frontend/dist).
"""

import os
import sys
from pathlib import Path

ROOT = Path(__file__).parent
sys.path.insert(0, str(ROOT / "backend"))

# The database must be set before `db` is imported.
(ROOT / "data").mkdir(exist_ok=True)
os.environ.setdefault("VOX_DB", str(ROOT / "data" / "vox.db"))

import uvicorn  # noqa: E402

from main import app  # noqa: E402

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "7860")))
