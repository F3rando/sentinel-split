import os
import json
from groq import Groq

client = Groq(api_key=os.getenv("GROQ_API_KEY"))

def heal_item(item_name: str, restaurant_name: str) -> dict:
    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[
            {
                "role": "user",
                "content": f"""
                A receipt OCR misread an item from '{restaurant_name}'.
                The garbled item name is: '{item_name}'
                Guess the most likely correct menu item name and price.
                Return ONLY this JSON, nothing else:
                {{"verified_name": "...", "price": 0.00}}
                """
            }
        ]
    )
    text = response.choices[0].message.content.strip().replace("```json","").replace("```","")
    return json.loads(text)

COMMON_SHORT_WORDS = {
    "the", "and", "or", "in", "on", "at", "to", "a", "an",
    "hot", "red", "tea", "ice", "egg", "beef", "fish", "rice",
    "pho", "bbq", "blt", "ahi", "ono", "poi", "mac"
}

def get_confidence(item_name: str) -> float:
    issues = 0
    
    # Very short total name (likely just an abbreviation)
    if len(item_name) <= 3:
        issues += 4

    # Check vowel density — main abbreviation signal
    letters = [c.lower() for c in item_name if c.isalpha()]
    if letters:
        vowels = set("aeiou")
        vowel_ratio = sum(1 for c in letters if c in vowels) / len(letters)
        if vowel_ratio < 0.15:
            issues += 4
        elif vowel_ratio < 0.25:
            issues += 2

    # Short words that aren't in the whitelist and have no vowels
    words = item_name.split()
    for word in words:
        clean = word.lower().strip(".,")
        if clean in COMMON_SHORT_WORDS:
            continue
        if len(clean) <= 4:
            has_vowel = any(c in "aeiou" for c in clean)
            if not has_vowel:
                issues += 3

    confidence = max(0.0, 1.0 - (issues * 0.2))
    return round(confidence, 2)
