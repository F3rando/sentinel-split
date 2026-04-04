export interface Friend {
  id: string;
  name: string;
  venmo_username: string;
  profile_pic_url: string;
}

export interface ReceiptItem {
  id: string;
  receipt_id: string;
  original_ocr_name: string;
  healed_name: string | null;
  price: number;
  confidence_score: number;
  status: 'parsed' | 'low_confidence' | 'verified';
  assigned_to: string[]; // friend ids or 'self' or 'all'
}

export interface Receipt {
  id: string;
  user_id: string;
  image_url: string | null;
  raw_ocr_text: string;
  status: 'uploaded' | 'parsed' | 'healed' | 'completed';
  restaurant_name: string;
  created_at: string;
  items: ReceiptItem[];
  tax: number;
  tip: number;
  total: number;
}

export interface AgentMessage {
  id: string;
  timestamp: Date;
  message: string;
  type: 'idle' | 'processing' | 'searching' | 'healed' | 'error';
}

// mockFriends removed — friends are now managed dynamically via Zustand store
// TODO [BACKEND]: Friends could optionally be fetched from FastAPI if persisting groups

export const mockReceipt: Receipt = {
  id: 'r1',
  user_id: 'u1',
  image_url: null,
  raw_ocr_text: 'Chkn Tcos 14.50\nFsh Brto 16.00\nNchos Grd 12.50\nMarg Ptzr 11.00\nCarne Asda Frs 15.50',
  status: 'parsed',
  restaurant_name: 'Oscars Mexican Seafood',
  created_at: new Date().toISOString(),
  tax: 5.82,
  tip: 13.90,
  items: [
    {
      id: 'i1',
      receipt_id: 'r1',
      original_ocr_name: 'Chkn Tcos',
      healed_name: null,
      price: 14.50,
      confidence_score: 0.4,
      status: 'low_confidence',
      assigned_to: [],
    },
    {
      id: 'i2',
      receipt_id: 'r1',
      original_ocr_name: 'Fsh Brto',
      healed_name: null,
      price: 16.00,
      confidence_score: 0.55,
      status: 'low_confidence',
      assigned_to: [],
    },
    {
      id: 'i3',
      receipt_id: 'r1',
      original_ocr_name: 'Nchos Grd',
      healed_name: null,
      price: 12.50,
      confidence_score: 0.35,
      status: 'low_confidence',
      assigned_to: [],
    },
    {
      id: 'i4',
      receipt_id: 'r1',
      original_ocr_name: 'Marg Ptzr',
      healed_name: null,
      price: 11.00,
      confidence_score: 0.6,
      status: 'low_confidence',
      assigned_to: [],
    },
    {
      id: 'i5',
      receipt_id: 'r1',
      original_ocr_name: 'Carne Asda Frs',
      healed_name: null,
      price: 15.50,
      confidence_score: 0.45,
      status: 'low_confidence',
      assigned_to: [],
    },
  ],
};

export const healingMap: Record<string, string> = {
  'Chkn Tcos': 'Street Chicken Tacos',
  'Fsh Brto': 'Fish Burrito Supreme',
  'Nchos Grd': 'Loaded Nachos Grande',
  'Marg Ptzr': 'Margarita Pitcher',
  'Carne Asda Frs': 'Carne Asada Fries',
};

export const recentSplits = [
  { id: 's1', restaurant: 'Phil\'s BBQ', date: '2 days ago', total: 87.40, people: 3, status: 'completed' as const },
  { id: 's2', restaurant: 'Convoy Sushi', date: '5 days ago', total: 124.60, people: 4, status: 'completed' as const },
];
