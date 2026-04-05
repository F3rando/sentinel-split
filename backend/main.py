from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from scanner import scan_receipt
from healer import heal_item, gather_candidates_with_browser_use_async, UncertainItem
from pydantic import BaseModel
import logging
import time

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("sentinel")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/scan")
async def scan(file: UploadFile = File(...)):
    logger.info(f"📸 /scan — Received file: {file.filename} ({file.content_type})")
    image_bytes = await file.read()
    logger.info(f"📸 /scan — Image size: {len(image_bytes)} bytes, sending to Gemini...")
    start = time.time()
    result = scan_receipt(image_bytes)
    elapsed = time.time() - start
    item_count = len(result.get("items", []))
    needs_healing = sum(1 for i in result.get("items", []) if i.get("needs_healing"))
    logger.info(f"📸 /scan — Done in {elapsed:.1f}s: {item_count} items parsed, {needs_healing} need healing")
    for item in result.get("items", []):
        status = "⚠️  NEEDS HEALING" if item.get("needs_healing") else "✅ OK"
        logger.info(f"   → {item['name']} — ${item['price']:.2f} (confidence: {item['confidence']:.2f}) {status}")
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
    logger.info(f"🔧 /heal — Healing '{request.item_name}' from '{request.restaurant_name}' (OCR price: ${request.price:.2f})")
    logger.info(f"🔧 /heal — Launching Browser Use agent (this may take 15-30s)...")
    start = time.time()
    item = UncertainItem(
        restaurant_name=request.restaurant_name,
        item_text=request.item_name,
        ocr_price=request.price,
    )
    try:
        candidates = await gather_candidates_with_browser_use_async(
            restaurant_name=request.restaurant_name,
            item_hint=request.item_name,
            item_price=request.price,
        )
        result = heal_item(item=item, candidates=candidates)
    except Exception as e:
        logger.error(f"🔧 /heal — Browser Use failed: {e}")
        result = None
    elapsed = time.time() - start

    if result is None or result.best_match_name is None:
        logger.warning(f"🔧 /heal — Failed after {elapsed:.1f}s, returning original name")
        return {
            "verified_name": request.item_name,
            "price": request.price,
            "decision": "unresolved",
            "confidence": 0.0,
            "sources": [],
        }

    logger.info(f"🔧 /heal — Done in {elapsed:.1f}s:")
    logger.info(f"   → Original:   '{request.item_name}'")
    logger.info(f"   → Healed to:  '{result.best_match_name}' (${result.best_match_price})")
    logger.info(f"   → Decision:   {result.decision} (confidence: {result.match_confidence:.2f})")
    logger.info(f"   → Reason:     {result.reason}")
    for src in result.sources:
        logger.info(f"   → Source:     [{src['type']}] {src['url']}")

    # Return the same shape the frontend expects: {"verified_name": "...", "price": 0.00}
    return {
        "verified_name": result.best_match_name or request.item_name,
        "price": result.best_match_price if result.best_match_price is not None else request.price,
        "decision": result.decision,
        "confidence": result.match_confidence,
        "sources": result.sources,
    }
