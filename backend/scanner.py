import os
import json
from google import genai
from healer import get_confidence, should_heal, heal_item

client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

def scan_receipt(image_bytes: bytes) -> dict:
    # Send image to Gemini Vision
    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=[
            {
                "parts": [
                    {
                        "inline_data": {
                            "mime_type": "image/jpeg",
                            "data": image_bytes
                        }
                    },
                    {
                        "text": """
                        You are a receipt parser. Look at this receipt image.
                        Extract the restaurant name, and every item with its price.
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
    
    # Add confidence scores to each item
    for item in data["items"]:
        item["confidence"] = get_confidence(item["name"])
        item["needs_healing"] = should_heal(item["name"])
    
    return data
