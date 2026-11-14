"""Start TRIX: python app.py  ->  open http://localhost:8000 on the tablet or laptop."""
import os

import uvicorn

if __name__ == "__main__":
    uvicorn.run("trix.api:app", host=os.environ.get("TRIX_HOST", "0.0.0.0"), port=int(os.environ.get("TRIX_PORT", "8000")))
