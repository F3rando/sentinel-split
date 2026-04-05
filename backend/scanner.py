import os
import json
import logging
from google import genai
from healer import get_confidence, should_heal

logger = logging.getLogger("sentinel")

client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

def scan_receipt(image_bytes: bytes) -> dict:
    import base64
    # Send image to Gemini Vision
    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=[
            {
                "parts": [
                    {
                        "inline_data": {
                            "mime_type": "image/jpeg",
                            "data": base64.standard_b64encode(image_bytes).decode("utf-8")
                        }
                    },
                    {
                        "text": """
                        You are a receipt parser. Look at this receipt image.
                        Extract the restaurant name, and every item with its price.
                        Make sure to extract the tax, tip, and total from the receipt.
                        For discounts, use negative prices.
                        Return ONLY this JSON, nothing else:
                        {
                            "restaurant": "...",
                            "items": [
                                {"name": "...", "price": 0.00},
                                {"name": "...", "price": 0.00}
                            ],
                            "tax": 0.00,
                            "tip": 0.00,
                            "total": 0.00
                        }
                        """
                    }
                ]
            }
        ]
    )
    
    # Parse response
    text = response.text.strip().replace("```json", "").replace("```", "")
    data = json.loads(text)

    logger.info(f"🧾 Gemini raw response — tax: {data.get('tax')}, tip: {data.get('tip')}, total: {data.get('total')}")
    item_sum = sum(item.get("price", 0) for item in data.get("items", []))
    logger.info(f"🧾 Item prices sum: {item_sum:.2f}")
    
    # Add confidence scores to each item
    for item in data["items"]:
        item["confidence"] = get_confidence(item["name"])
        item["needs_healing"] = should_heal(item["name"])
    
    return data
