from healer import heal_item, get_confidence, should_heal

test_items = [
    ("Chkn Tcos", "Oscars Mexican Seafood"),
    ("Fsh Brto", "Oscars Mexican Seafood"),
    ("Street Chicken Tacos", "Oscars Mexican Seafood"),
    ("Loaded Nachos Grande", "Oscars Mexican Seafood"),
    ("Marg Ptzr", "Oscars Mexican Seafood"),
    ("Carne Asada Fries", "Oscars Mexican Seafood")
]

for item_name, restaurant in test_items:
    confidence = get_confidence(item_name)
    needs_healing = should_heal(item_name)
    print(f"\nItem: {item_name}")
    print(f"Confidence: {confidence} | Needs healing: {needs_healing}")
    if needs_healing:
        result = heal_item(item_name, restaurant)
        print(f"Healed: {result}")
    else:
        print(f"Clean enough, no healing needed")
