// TODO [BACKEND]: Update this URL to your deployed FastAPI server
export const FASTAPI_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

import { Receipt, ReceiptItem } from './mockData';

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
  const res = await fetch(`${FASTAPI_BASE_URL}/heal`, {
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

export async function scanReceiptAPI(file: File): Promise<Receipt> {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(`${FASTAPI_BASE_URL}/scan`, {
    method: 'POST',
    headers: {
      'ngrok-skip-browser-warning': 'true',
    },
    body: formData,
  });

  if (!res.ok) {
    throw new Error(`Backend error: ${res.status} ${res.statusText}`);
  }

  const data: BackendResponse = await res.json();

  // Map backend response to frontend Receipt interface
  const receiptId = crypto.randomUUID();
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
  };
}
