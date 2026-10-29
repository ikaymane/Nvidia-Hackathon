"""Print the models your Token Factory key can use. NVIDIA ones are listed first.

Run:  python list_models.py
Then copy the IDs you want into MODEL_FAST / MODEL_SMART / MODEL_DEEP in .env
"""

import os
from pathlib import Path

from dotenv import load_dotenv
from openai import OpenAI

load_dotenv(Path(__file__).parent / ".env")
client = OpenAI(
    api_key=os.environ["NEBIUS_API_KEY"],
    base_url=os.getenv("NEBIUS_BASE_URL", "https://api.tokenfactory.nebius.com/v1/"),
)

ids = sorted(m.id for m in client.models.list())
nvidia = [i for i in ids if "nvidia" in i.lower() or "nemotron" in i.lower()]

print("NVIDIA / Nemotron models:")
for i in nvidia:
    print("  ", i)
print(f"\n({len(ids) - len(nvidia)} other models available)")
