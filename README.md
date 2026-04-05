# CheckMate (Sentinel Split)

React + Vite frontend (deploy to Vercel) and FastAPI backend (deploy to Railway).

## Architecture

- Frontend: Vite/React app in the repo root
- Backend: FastAPI app in `backend/`
- OCR + healing: Gemini + browser-use/Playwright in backend endpoints

## Local Development

1. Install frontend deps:
	- `npm install`
2. Install backend deps:
	- `pip install -r requirements.txt`
3. Set env vars:
	- Copy `.env.example` to `.env`
	- Set `GEMINI_API_KEY`
4. Run backend:
	- `cd backend && python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000`
5. Run frontend:
	- `npm run dev`

The Vite dev server proxies `/api` to the FastAPI backend on `127.0.0.1:8000`.

## Deploy Frontend to Vercel

This repo includes `vercel.json` with:

- `buildCommand`: `npm run build`
- `outputDirectory`: `dist`
- SPA rewrite fallback to `index.html`

Required Vercel environment variable:

- `VITE_API_URL=https://<your-railway-backend-domain>`

Important:

- No trailing slash on `VITE_API_URL`
- Set the env var for Production
- Redeploy after adding/updating env vars (Vite bakes env vars at build time)

## Deploy Backend to Railway

This repo includes `railway.json` with:

- Build: `pip install -r requirements.txt && python -m playwright install chromium`
- Start: `cd backend && python -m uvicorn main:app --host 0.0.0.0 --port $PORT`
- Health check: `/health`

Required Railway environment variables:

- `GEMINI_API_KEY=<your-key>`
- Optional: `GEMINI_BROWSER_MODEL=gemini-2.5-flash`
- Optional: `BROWSER_USE_MAX_STEPS=32`

## Deployment Checklist

1. Railway backend deploy succeeds and `/health` returns `{"status":"ok"}`.
2. Copy Railway public URL into Vercel as `VITE_API_URL`.
3. Redeploy Vercel frontend.
4. Validate `/scan` from the UI with a test receipt.

## Notes

- Frontend production calls the backend at `VITE_API_URL`.
- If browser automation endpoints fail in your Railway runtime, verify Playwright browser install logs in Railway build output.
