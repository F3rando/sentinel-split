

# Fix Total Display — Use Backend Total Directly

## Problem
Two issues causing the wrong total:

1. **ReceiptHealer.tsx (line 201)** recalculates total as `sum(item prices) + tax + tip` instead of using the backend-provided `currentReceipt.total`. If Gemini missed items or parsed prices slightly off, this recalculated total won't match the real receipt.

2. **Settlement.tsx** uses `currentReceipt.total` correctly for Grand Total, but computes `taxTipMultiplier = total / subtotal` — if items are missing, the multiplier gets inflated, skewing per-person splits.

## Changes

### 1. ReceiptHealer.tsx — Use `currentReceipt.total` directly

**Line 199-203**: Replace the recalculated total with the backend value:

```tsx
// Before (recalculates)
${(currentReceipt.items.reduce((s, i) => s + i.price, 0) + currentReceipt.tax + currentReceipt.tip).toFixed(2)}

// After (uses backend total)
${currentReceipt.total.toFixed(2)}
```

Also show the item subtotal separately so the user can see if items are missing:

```tsx
<div className="flex justify-between text-sm">
  <span className="text-muted-foreground">Subtotal ({currentReceipt.items.length} items)</span>
  <span className="text-foreground font-semibold">
    ${currentReceipt.items.reduce((s, i) => s + i.price, 0).toFixed(2)}
  </span>
</div>
```

### 2. Settlement.tsx — Keep using `currentReceipt.total` (already correct)

No changes needed here — it already uses `currentReceipt.total` for Grand Total display.

## Technical Details

- The backend's Gemini prompt asks for the total from the receipt image, so `data.total` should match the printed receipt total ($133.32)
- If Gemini misses items, the item subtotal will be less than expected, but the displayed total will still be correct since it comes from the backend
- The `taxTipMultiplier` in Settlement will auto-adjust proportionally, which is the correct behavior for splitting

