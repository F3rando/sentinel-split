

# Dynamic Group Setup — Frontend-Only (No Supabase)

## Context
No Supabase backend. Your teammates are building a **FastAPI** backend (with OCR, healing, splitting) separately. This plan covers only the frontend changes needed to make group management and splitting work dynamically, with `// TODO [BACKEND]` notes for smooth handoff when the FastAPI endpoints are ready.

## Architecture

```text
React Frontend (Lovable)
    │
    ├── Local Zustand state (friends, receipt, assignments)
    │
    └── // TODO [BACKEND]: POST receipt image to FastAPI /ocr
        // TODO [BACKEND]: POST items to FastAPI /heal
        // TODO [BACKEND]: GET split from FastAPI /split
```

Everything stays in-memory via Zustand. No database. When FastAPI is ready, you swap mock data calls with `fetch()` to your FastAPI server.

## Changes

### 1. Add dynamic friends to Store (`src/lib/store.ts`)
- Add `friends: Friend[]` array (starts empty)
- Add actions: `addFriend(name, venmo_username)`, `removeFriend(id)`, `clearFriends()`
- Auto-generate `id` via `crypto.randomUUID()` and avatar via DiceBear seed
- Add `'group'` to the `activeTab` union
- Comments: `// TODO [BACKEND]: POST /friends or pass friends list to FastAPI /split endpoint`

### 2. New Component: `GroupSetup.tsx`
- Stepper for number of people (+/− buttons)
- Dynamic input rows: **Name** + **Venmo username** per person
- Add/remove row buttons
- "Continue to Receipt" button saves friends to store, navigates to `receipt` tab
- Comment: `// TODO [BACKEND]: If persisting groups, POST to FastAPI /groups endpoint`

### 3. Update Navigation (`BottomNav.tsx` + `Index.tsx`)
- Add `group` tab (icon: `Users`) between Command and Receipt
- Add `GroupSetup` to the screens map in `Index.tsx`
- After healing simulation, auto-navigate to `group` instead of `receipt`

### 4. Update `ReceiptHealer.tsx`
- Replace `import { mockFriends }` with `const { friends } = useAppStore()`
- If `friends` is empty, show a message prompting user to set up the group first
- Assignment buttons render from dynamic friends list
- Comment: `// TODO [BACKEND]: Item assignments could be sent to FastAPI /split endpoint`

### 5. Update `Settlement.tsx`
- Replace `mockFriends` with store `friends`
- "Split All" divides by `friends.length + 1` (friends + self)
- Venmo links use real usernames from user input
- Remove or gate the hardcoded "Test Request from Aman" button behind a dev flag
- Comment: `// TODO [BACKEND]: Fetch final split calculations from FastAPI /split response`

### 6. Update `CommandCenter.tsx`
- On scan/demo, capture the uploaded image file in state
- Comment: `// TODO [BACKEND]: Send image file to FastAPI POST /ocr, receive parsed items`
- Comment: `// TODO [BACKEND]: Send parsed items to FastAPI POST /heal, receive healed items`

### 7. Clean up `mockData.ts`
- Remove `mockFriends` export
- Keep `Friend` interface, `mockReceipt`, `healingMap`, `recentSplits` (still used for demo mode)

## TODO Comment Convention
All backend integration points marked as:
```
// TODO [BACKEND]: <what to replace with FastAPI call>
// Expected endpoint: POST /ocr | POST /heal | POST /split
// Expected payload: { ... }
// Expected response: { ... }
```
This way your teammates know exactly where to plug in their FastAPI routes.

## What This Gives You
- Fully working frontend flow: add people → scan receipt → assign items → settle → Venmo links with real usernames
- Zero backend dependency — all in Zustand
- Clear handoff points for FastAPI integration

