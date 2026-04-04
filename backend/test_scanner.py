from scanner import scan_receipt

# Load a real receipt image
with open("test_receipt.jpg", "rb") as f:
    image_bytes = f.read()

result = scan_receipt(image_bytes)

import json
print(json.dumps(result, indent=2))
