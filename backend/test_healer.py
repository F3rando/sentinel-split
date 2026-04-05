from healer import (
    get_confidence,
    should_heal,
    heal_item,
    UncertainItem,
    MenuCandidate,
)

test_items = [
    ("Chkn Tcos", "Oscars Mexican Seafood", 14.50),
    ("Fsh Brto", "Oscars Mexican Seafood", 16.00),
    ("Street Chicken Tacos", "Oscars Mexican Seafood", 14.50),
    ("Loaded Nachos Grande", "Oscars Mexican Seafood", 12.50),
    ("Marg Ptzr", "Oscars Mexican Seafood", 11.00),
    ("Carne Asada Fries", "Oscars Mexican Seafood", 15.50),
]

print("=== Confidence & Should-Heal Tests ===\n")
for item_name, restaurant, price in test_items:
    confidence = get_confidence(item_name)
    needs_healing = should_heal(item_name)
    print(f"Item: {item_name}")
    print(f"  Confidence: {confidence} | Needs healing: {needs_healing}")

print("\n=== Heal Item with Mock Candidates (no browser) ===\n")

# Simulate what Browser Use would return for "Chkn Tcos"
uncertain = UncertainItem(
    restaurant_name="Oscars Mexican Seafood",
    item_text="Chkn Tcos",
    ocr_price=14.50,
    ocr_confidence=0.0,
)

mock_candidates = [
    MenuCandidate(
        name="Street Chicken Tacos",
        price=14.50,
        source_url="https://oscarsmexicanseafood.com/menu",
        source_type="official",
    ),
    MenuCandidate(
        name="Chicken Taco Plate",
        price=13.00,
        source_url="https://www.yelp.com/menu/oscars-mexican-seafood",
        source_type="yelp",
    ),
    MenuCandidate(
        name="Chicken Nachos",
        price=12.50,
        source_url="https://grubhub.com/oscars",
        source_type="third_party",
    ),
]

result = heal_item(item=uncertain, candidates=mock_candidates)
print(f"Original:    {result.original_item_text}")
print(f"Best match:  {result.best_match_name}")
print(f"Best price:  {result.best_match_price}")
print(f"Confidence:  {result.match_confidence}")
print(f"Decision:    {result.decision}")
print(f"Reason:      {result.reason}")
print(f"Sources:     {result.sources}")
