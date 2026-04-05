

# Fix Total — Use Backend Total as Base, Adjust with Tip

## Problem
`updateTaxTip` on line 95-98 recalculates total as `subtotal + tax + tip` where subtotal = sum of parsed items. Since the backend may not parse every line item, this sum is less than the real receipt total, causing it to drop from $133.32 to ~$107.

The fix: store the backend's original total (which already includes tax but not tip since we zero it) and use it as the anchor. When tip changes, compute `total = backendTotal + tip`.

## Changes

### 1. `src/lib/mockData.ts` — Add `baseTotal` to Receipt interface
Add `baseTotal: number` after `total: number`. This stores the original backend total and never changes.

### 2. `src/lib/api.ts` — Set `baseTotal` from `data.total`
In `scanReceiptAPI`, add `baseTotal: data.total` to the returned Receipt object. This is not hardcoded — it's whatever the API returns for that specific receipt scan.

### 3. `src/lib/store.ts` — Fix `updateTaxTip` to use `baseTotal`
```ts
updateTaxTip: (tax, tip) =>
  set((state) => {
    if (!state.currentReceipt) return state;
    return {
      currentReceipt: {
        ...state.currentReceipt,
        tax,
        tip,
        total: state.currentReceipt.baseTotal + tip,
      },
    };
  }),
```

### 4. `src/lib/mockData.ts` — Add `baseTotal` to `mockReceipt`
Set `baseTotal` equal to `total` in the mock data so fallback mode still works.

## Key point
Nothing is hardcoded. `baseTotal` is set from `data.total` — whatever the API reads from that particular receipt. It just preserves that value so tip adjustments don't cause a recalculation from incomplete item data.

