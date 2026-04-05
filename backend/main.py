from pathlib import Path

from dotenv import load_dotenv

# Load repo-root .env before scanner (Gemini client reads GEMINI_API_KEY at import time).
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from starlette.requests import Request
from scanner import scan_receipt
from healer import (
    heal_item,
    gather_candidates_with_browser_use_async,
    gather_candidates_batch_with_browser_use_async,
    UncertainItem,
)
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


@app.middleware("http")
async def add_private_network_cors_header(request: Request, call_next):
    """Helps some browsers allow cross-origin fetches to a private LAN IP (port 8080 → 8000)."""
    response = await call_next(request)
    response.headers["Access-Control-Allow-Private-Network"] = "true"
    return response


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


class HealBatchItemIn(BaseModel):
    id: str
    item_name: str
    price: float = 0.0


class HealBatchRequest(BaseModel):
    restaurant_name: str
    items: list[HealBatchItemIn]


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


@app.post("/heal-batch")
async def heal_batch(request: HealBatchRequest):
    """One browser-use run for multiple low-confidence lines at the same restaurant."""
    n = len(request.items)
    logger.info(
        f"🔧 /heal-batch — {n} item(s) for '{request.restaurant_name}' "
        f"(single agent run)"
    )
    if n == 0:
        return {"results": []}

    lines = [(it.item_name, it.price) for it in request.items]
    start = time.time()

    try:
        candidates_by_idx = await gather_candidates_batch_with_browser_use_async(
            restaurant_name=request.restaurant_name,
            batch_lines=lines,
        )
    except Exception as e:
        logger.error(f"🔧 /heal-batch — Browser Use failed: {e}")
        candidates_by_idx = {i: [] for i in range(n)}

    results: list[dict] = []
    for i, it in enumerate(request.items):
        item = UncertainItem(
            restaurant_name=request.restaurant_name,
            item_text=it.item_name,
            ocr_price=it.price,
        )
        cands = candidates_by_idx.get(i, [])
        healing = heal_item(item=item, candidates=cands)

        if healing.best_match_name is None:
            results.append(
                {
                    "id": it.id,
                    "verified_name": it.item_name,
                    "price": it.price,
                    "decision": "unresolved",
                    "confidence": 0.0,
                    "sources": [],
                }
            )
        else:
            results.append(
                {
                    "id": it.id,
                    "verified_name": healing.best_match_name,
                    "price": healing.best_match_price
                    if healing.best_match_price is not None
                    else it.price,
                    "decision": healing.decision,
                    "confidence": healing.match_confidence,
                    "sources": healing.sources,
                }
            )

    elapsed = time.time() - start
    logger.info(f"🔧 /heal-batch — Done in {elapsed:.1f}s for {n} item(s)")

    return {"results": results}
