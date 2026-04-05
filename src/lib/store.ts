import { create } from 'zustand';
import { Receipt, AgentMessage, Friend, mockReceipt, healingMap } from './mockData';
import { scanReceiptAPI } from './api';

interface AppState {
  currentReceipt: Receipt | null;
  agentMessages: AgentMessage[];
  activeTab: 'home' | 'group' | 'receipt' | 'settle';
  friends: Friend[];
  // TODO [BACKEND]: Add uploadedImage: File | null for sending to FastAPI POST /ocr
  uploadedImage: File | null;

  setActiveTab: (tab: 'home' | 'group' | 'receipt' | 'settle') => void;
  setCurrentReceipt: (receipt: Receipt | null) => void;
  addAgentMessage: (msg: Omit<AgentMessage, 'id' | 'timestamp'>) => void;
  startHealingSimulation: () => void;
  assignItem: (itemId: string, assignees: string[]) => void;
  // TODO [BACKEND]: Tax/tip may come from FastAPI /ocr response, user can override here
  updateTaxTip: (tax: number, tip: number) => void;
  scanReceipt: (file: File) => Promise<void>;

  // Friends management
  // TODO [BACKEND]: Pass friends list to FastAPI POST /split endpoint payload
  addFriend: (name: string, venmo_username: string) => void;
  removeFriend: (id: string) => void;
  clearFriends: () => void;
  setUploadedImage: (file: File | null) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  currentReceipt: null,
  agentMessages: [
    {
      id: 'init',
      timestamp: new Date(),
      message: 'Awaiting Receipt...',
      type: 'idle',
    },
  ],
  activeTab: 'home',
  friends: [],
  uploadedImage: null,

  setActiveTab: (tab) => set({ activeTab: tab }),

  setCurrentReceipt: (receipt) => set({ currentReceipt: receipt }),

  setUploadedImage: (file) => set({ uploadedImage: file }),

  addAgentMessage: (msg) =>
    set((state) => ({
      agentMessages: [
        { ...msg, id: crypto.randomUUID(), timestamp: new Date() },
        ...state.agentMessages,
      ],
    })),

  // TODO [BACKEND]: Replace with POST /friends or include in /split payload
  addFriend: (name, venmo_username) =>
    set((state) => ({
      friends: [
        ...state.friends,
        {
          id: crypto.randomUUID(),
          name,
          venmo_username,
          profile_pic_url: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(name)}&backgroundColor=b6e3f4`,
        },
      ],
    })),

  removeFriend: (id) =>
    set((state) => ({
      friends: state.friends.filter((f) => f.id !== id),
    })),

  clearFriends: () => set({ friends: [] }),

  assignItem: (itemId, assignees) =>
    set((state) => {
      if (!state.currentReceipt) return state;
      return {
        currentReceipt: {
          ...state.currentReceipt,
          items: state.currentReceipt.items.map((item) =>
            item.id === itemId ? { ...item, assigned_to: assignees } : item
          ),
        },
      };
    }),

  updateTaxTip: (tax, tip) =>
    set((state) => {
      if (!state.currentReceipt) return state;
      const subtotal = state.currentReceipt.items.reduce((s, i) => s + i.price, 0);
      return {
        currentReceipt: { ...state.currentReceipt, tax, tip, total: subtotal + tax + tip },
      };
    }),

  scanReceipt: async (file) => {
    const { addAgentMessage, startHealingSimulation, setActiveTab } = get();
    addAgentMessage({ message: 'Scanning receipt with AI...', type: 'processing' });

    try {
      const receipt = await scanReceiptAPI(file);
      set({ currentReceipt: receipt });
      addAgentMessage({
        message: `Parsed ${receipt.items.length} items from "${receipt.restaurant_name}"`,
        type: 'healed',
      });
      receipt.items.forEach((item) => {
        addAgentMessage({
          message: `${item.original_ocr_name} — $${item.price.toFixed(2)} (confidence: ${item.confidence_score.toFixed(2)})${item.status === 'low_confidence' ? ' ⚠️ needs healing' : ' ✓'}`,
          type: item.status === 'low_confidence' ? 'searching' : 'healed',
        });
      });
      setActiveTab('group');
    } catch (err) {
      console.error('Backend scan failed, falling back to demo:', err);
      addAgentMessage({
        message: `Backend unavailable — using demo data. (${err instanceof Error ? err.message : 'Unknown error'})`,
        type: 'idle',
      });
      startHealingSimulation();
      setTimeout(() => setActiveTab('group'), 800);
    }
  },

  startHealingSimulation: () => {
    // TODO [BACKEND]: Replace this entire simulation with:
    // 1. POST image to FastAPI /ocr → receive parsed items
    // 2. POST parsed items to FastAPI /heal → receive healed items
    // Expected payload: FormData with image file
    // Expected response: { items: ReceiptItem[], restaurant_name: string, tax: number, tip: number }

    const receipt = { ...mockReceipt };
    set({
      currentReceipt: receipt,
      agentMessages: [
        {
          id: crypto.randomUUID(),
          timestamp: new Date(),
          message: 'Agent Parsing Image...',
          type: 'processing',
        },
      ],
    });

    const items = receipt.items;
    let delay = 1500;

    items.forEach((item, index) => {
      setTimeout(() => {
        const { addAgentMessage } = get();
        addAgentMessage({
          message: `Searching Menu: '${item.original_ocr_name}' (Confidence: ${item.confidence_score.toFixed(1)})...`,
          type: 'searching',
        });
      }, delay);
      delay += 1800;

      setTimeout(() => {
        const healedName = healingMap[item.original_ocr_name] || item.original_ocr_name;
        const { addAgentMessage } = get();
        addAgentMessage({
          message: `Data Healed! (${item.original_ocr_name} → ${healedName})`,
          type: 'healed',
        });

        set((state) => {
          if (!state.currentReceipt) return state;
          const updatedItems = state.currentReceipt.items.map((i) =>
            i.id === item.id
              ? { ...i, healed_name: healedName, confidence_score: 0.98, status: 'verified' as const }
              : i
          );
          return {
            currentReceipt: {
              ...state.currentReceipt,
              items: updatedItems,
              status: index === items.length - 1 ? 'healed' : state.currentReceipt.status,
            },
          };
        });
      }, delay);
      delay += 1200;
    });

    setTimeout(() => {
      const { addAgentMessage } = get();
      addAgentMessage({
        message: 'All items verified. Ready for assignment.',
        type: 'healed',
      });
    }, delay);
  },
}));
