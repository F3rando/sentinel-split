// TODO [BACKEND]: Update this URL to your deployed FastAPI server
export const FASTAPI_BASE_URL = 'https://kimberlee-unlucent-noneagerly.ngrok-free.dev';

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

  return {
    id: receiptId,
    user_id: 'current-user',
    image_url: null,
    raw_ocr_text: '',
    status: 'parsed',
    restaurant_name: data.restaurant,
    created_at: new Date().toISOString(),
    items,
    tax: data.tax,
    tip: data.tip,
    total: data.total,
  };
}
