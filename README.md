# CheckMate

**AI-powered receipt splitting** — photo a bill, verify garbled line items against the live menu, assign shares, and settle with Venmo.

Built for [DiamondHacks 2026](https://devpost.com/software/checkmate-jg1s5t) (ACM @ UCSD).

---

## The problem

Group dinners end with smudged receipts, abbreviated dish names, and messy Venmo math. CheckMate turns a receipt photo into a fair, agent-verified split so everyone agrees on the line items before anyone pays.

## What it does

1. **Scan** — Upload a receipt; Gemini Vision extracts restaurant, items, prices, tax, and tip.
2. **Heal** — Low-confidence OCR lines are verified by a Browser Use agent that looks up the restaurant’s live menu (official site preferred, Yelp as backup). Multiple uncertain items share one browser session to cut latency and cost.
3. **Assign** — Add friends, assign dishes (or split the whole bill evenly), adjust tax/tip.
4. **Settle** — See per-person totals with proportional tax/tip and open Venmo charge deep links.

## Tech stack

| Layer | Tools |
|--------|--------|
| Frontend | React 18, TypeScript, Vite, Zustand, Tailwind, Radix/shadcn |
| Backend | FastAPI, Uvicorn, Pydantic |
| AI | Gemini 2.5 Flash (vision), Browser Use + Playwright (menu verification) |
| Deploy | Vercel (UI), Railway (API) |

## Architecture

```
Phone / browser
   React + Vite  ──API──►  FastAPI
      │                       ├─ POST /scan       → Gemini Vision
      │                       ├─ POST /heal       → Browser Use (single item)
      │                       └─ POST /heal-batch → one agent run, many lines
      ▼
   Settlement + Venmo deep links (client-side)
```

**Confidence gating:** Heuristic OCR quality scores decide which lines need healing (threshold 0.80) so the browser agent only runs when it adds value.

**Matching:** Fuzzy name similarity (phrase / compact / initials) plus price proximity ranks menu candidates into verified / needs review / unresolved.

## Project structure

```
backend/
  main.py       # FastAPI routes: /scan, /heal, /heal-batch, /health
  scanner.py    # Gemini Vision receipt parsing
  healer.py     # Confidence heuristics, fuzzy ranking, Browser Use agent
src/
  components/   # Command Center, Agent Feed, Group, Receipt, Settlement
  lib/          # API client, Zustand store, types / demo data
```

## Local setup

**Prerequisites:** Node.js, Python 3.10+, a [Gemini API key](https://aistudio.google.com/apikey).

```bash
# Env
cp .env.example .env   # set GEMINI_API_KEY=

# Frontend
npm install
npm run dev            # http://localhost:8080

# Backend (separate terminal)
npm run dev:api        # http://localhost:8000
```

Vite proxies `/api` to the FastAPI server in local development. For production, set `VITE_API_URL` to your deployed API base URL (no trailing slash) and redeploy the frontend.

## Links

- [Devpost](https://devpost.com/software/checkmate-jg1s5t)
- [GitHub](https://github.com/F3rando/sentinel-split)
