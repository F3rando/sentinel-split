import { Receipt, ReceiptItem } from './mockData';
import { createId } from './id';

/**
 * Backend base URL for fetch calls.
 * - In dev: same-origin `/api` — Vite proxies to FastAPI on 127.0.0.1:8000. The phone only opens :8080,
 *   which fixes iOS issues with cross-origin requests to :8000 (CORS, local network, firewall).
 * - Production / preview: VITE_API_URL, or same hostname on port 8000 when not localhost.
 */
export function getFastApiBaseUrl(): string {
  const fromEnv = import.meta.env.VITE_API_URL?.trim();

  if (import.meta.env.DEV) {
    if (
      fromEnv &&
      (fromEnv.startsWith("https:") ||
        /ngrok|trycloudflare|\.railway\.|\.fly\.dev|\.vercel\.app/i.test(fromEnv))
    ) {
      return fromEnv;
    }
    if (typeof window !== "undefined") {
      return `${window.location.origin}/api`;
    }
    return "http://127.0.0.1:8080/api";
  }

  if (fromEnv) return fromEnv;

  if (typeof window !== "undefined") {
    const { protocol, hostname } = window.location;
    if (hostname !== "localhost" && hostname !== "127.0.0.1") {
      return `${protocol}//${hostname}:8000`;
    }
  }
  return "http://localhost:8000";
}

interface BackendItem {
  name: string;
  price: number;
  confidence: number;
  needs_healing: boolean;
}

interface BackendResponse {
  restaurant: string;
  items: BackendItem[];
  tax: number;
  tip: number;
  total: number;
}

export async function healItemAPI(item_name: string, restaurant_name: string, price: number = 0): Promise<string> {
  const res = await fetch(`${getFastApiBaseUrl()}/heal`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'ngrok-skip-browser-warning': 'true',
    },
    body: JSON.stringify({ item_name, restaurant_name, price }),
  });
  if (!res.ok) throw new Error(`Heal error: ${res.status}`);
  const data = await res.json();
  return data.verified_name;
}

/** One low-confidence line to heal in a single `/heal-batch` run (same restaurant). */
export interface HealBatchItemIn {
  id: string;
  item_name: string;
  price: number;
}

export interface HealBatchResultRow {
  id: string;
  verified_name: string;
  price: number;
  decision: string;
  confidence: number;
  sources: { url: string; type: string }[];
}

const HEAL_BATCH_TIMEOUT_MS = 300_000;

/**
 * Runs one browser-use session for all items (vs. one session per line with `/heal`).
 */
export async function healBatchAPI(
  restaurant_name: string,
  items: HealBatchItemIn[],
): Promise<HealBatchResultRow[]> {
  if (items.length === 0) return [];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HEAL_BATCH_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${getFastApiBaseUrl()}/heal-batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true',
      },
      body: JSON.stringify({ restaurant_name, items }),
      signal: controller.signal,
    });
  } catch (e) {
    const name = e instanceof Error ? e.name : '';
    if (name === 'AbortError') {
      throw new Error(
        `Batch heal timed out after ${HEAL_BATCH_TIMEOUT_MS / 1000}s — is FastAPI running?`,
      );
    }
    throw e;
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) throw new Error(`Heal-batch error: ${res.status}`);
  const data = (await res.json()) as { results: HealBatchResultRow[] };
  return data.results ?? [];
}

const SCAN_TIMEOUT_MS = 120_000;

export async function scanReceiptAPI(file: File): Promise<Receipt> {
  const formData = new FormData();
  formData.append('file', file);

  const base = getFastApiBaseUrl();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SCAN_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${base}/scan`, {
      method: 'POST',
      headers: {
        'ngrok-skip-browser-warning': 'true',
      },
      body: formData,
      signal: controller.signal,
    });
  } catch (e) {
    const name = e instanceof Error ? e.name : '';
    if (name === 'AbortError') {
      throw new Error(
        `Scan timed out after ${SCAN_TIMEOUT_MS / 1000}s — is FastAPI running on port 8000? (dev uses Vite proxy at ${base})`,
      );
    }
    throw new Error(
      `Network error: ${e instanceof Error ? e.message : String(e)} — tried ${base}. Start API: cd backend && python -m uvicorn main:app --reload --port 8000`,
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    throw new Error(`Backend error: ${res.status} ${res.statusText}`);
  }

  const data: BackendResponse = await res.json();

  // Map backend response to frontend Receipt interface
  const receiptId = createId();
  const items: ReceiptItem[] = data.items.map((item, index) => ({
    id: `${receiptId}-item-${index}`,
    receipt_id: receiptId,
    original_ocr_name: item.name,
    healed_name: null,
    price: item.price,
    confidence_score: item.confidence,
    status: item.needs_healing ? 'low_confidence' as const : 'verified' as const,
    assigned_to: [],
  }));

  const itemSubtotal = items.reduce((sum, i) => sum + i.price, 0);
  const tax = data.tax || 0;
  const tip = data.tip || 0;
  const computedTotal = itemSubtotal + tax + tip;

  // Trust the backend/receipt total if provided — it may include tax/fees
  // that weren't separately itemized. If the backend total is higher than
  // what we can compute from items+tax+tip, back-derive the actual tax.
  let finalTotal = computedTotal;
  let finalTax = tax;
  if (data.total && data.total > 0) {
    finalTotal = data.total;
    // If backend total is higher than items+tax+tip, the difference is unaccounted tax/fees
    if (data.total > computedTotal + 0.01) {
      finalTax = Math.round((data.total - tip - itemSubtotal) * 100) / 100;
    }
  }

  return {
    id: receiptId,
    user_id: 'current-user',
    image_url: null,
    raw_ocr_text: '',
    status: 'parsed',
    restaurant_name: data.restaurant,
    created_at: new Date().toISOString(),
    items,
    tax: finalTax,
    tip,
    total: finalTotal,
    baseTotal: finalTotal - tip,
  };
}
