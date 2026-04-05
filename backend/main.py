from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from scanner import scan_receipt
from healer import heal_item_via_browser_use, UncertainItem
from pydantic import BaseModel

app = FastAPI()

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

class HealRequest(BaseModel):
    item_name: str
    restaurant_name: str
    price: float = 0.0

@app.post("/heal")
async def heal(request: HealRequest):
    item = UncertainItem(
        restaurant_name=request.restaurant_name,
        item_text=request.item_name,
        ocr_price=request.price,
    )
    result = heal_item_via_browser_use(item)

    # Return the same shape the frontend expects: {"verified_name": "...", "price": 0.00}
    return {
        "verified_name": result.best_match_name or request.item_name,
        "price": result.best_match_price if result.best_match_price is not None else request.price,
        "decision": result.decision,
        "confidence": result.match_confidence,
        "sources": result.sources,
    }
