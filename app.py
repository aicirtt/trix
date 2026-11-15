"""Start TRIX: python app.py  ->  open http://localhost:8000 on the tablet or laptop."""
import os

import uvicorn
from dotenv import load_dotenv

load_dotenv()  # settings from .env (API key, model choice); see .env.example

if __name__ == "__main__":
    uvicorn.run("trix.api:app", host=os.environ.get("TRIX_HOST", "0.0.0.0"), port=int(os.environ.get("TRIX_PORT", "8000")))
