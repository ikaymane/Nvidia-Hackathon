import os
import sys
from pathlib import Path

# Let tests import main, agent and db from the backend folder.
sys.path.insert(0, str(Path(__file__).parent.parent))
# Never touch the real vox.db, even at import time.
os.environ["VOX_DB"] = str(Path(__file__).parent / "_import.db")
