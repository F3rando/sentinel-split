from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from scanner import scan_receipt

app = FastAPI()

# This lets the React frontend talk to the backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/scan")
async def scan(file: UploadFile = File(...)):
    image_bytes = await file.read()
    result = scan_receipt(image_bytes)
    return result

@app.get("/health")
async def health():
    return {"status": "ok"}
