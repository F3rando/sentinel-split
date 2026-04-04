

# Editable Tax & Tip Fields in Receipt View

## Summary
Replace the static tax and tip display in `ReceiptHealer.tsx` with editable text inputs that are **autofilled** from the receipt data (currently mock, later from FastAPI `/ocr` response) but can be manually changed by the user before proceeding to settlement.

## Changes

### 1. Add `updateTaxTip` action to Store (`src/lib/store.ts`)
- New action: `updateTaxTip(tax: number, tip: number)` that updates `currentReceipt.tax` and `currentReceipt.tip`
- Comment: `// TODO [BACKEND]: Tax/tip may come from FastAPI /ocr response, user can override here`

### 2. Update `ReceiptHealer.tsx` — Tax & Tip Section (lines 168-184)
- Replace the static `<span>` displays for tax and tip with `<input type="number">` fields
- Inputs are prefilled with `currentReceipt.tax` and `currentReceipt.tip` (autofilled from OCR/mock data)
- On change, call `updateTaxTip` to update the store so Settlement picks up the correct values
- Style inputs to match the existing card design (small, right-aligned, matching font)
- Total recalculates live as user edits tax or tip
- Comment: `// TODO [BACKEND]: Tax/tip autofilled from FastAPI /ocr, editable for user corrections`

### 3. No changes needed to `Settlement.tsx`
- It already reads `currentReceipt.tax` and `currentReceipt.tip` from the store, so edits flow through automatically

## What This Gives You
- Tax and tip are autofilled from whatever data source populates the receipt (mock now, FastAPI later)
- User can correct wrong values before settling
- Settlement calculations automatically use the corrected values

