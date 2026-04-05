import { create } from 'zustand';
import { Receipt, AgentMessage, Friend, mockReceipt, healingMap } from './mockData';
import { scanReceiptAPI, healBatchAPI } from './api';
import { createId } from './id';

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
  /** Set every line item to split evenly among you + all friends (same as per-item "Split All"). */
  splitAllItemsEvenly: () => void;
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
        { ...msg, id: createId(), timestamp: new Date() },
        ...state.agentMessages,
      ],
    })),

  // TODO [BACKEND]: Replace with POST /friends or include in /split payload
  addFriend: (name, venmo_username) =>
    set((state) => ({
      friends: [
        ...state.friends,
        {
          id: createId(),
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

  splitAllItemsEvenly: () =>
    set((state) => {
      if (!state.currentReceipt) return state;
      return {
        currentReceipt: {
          ...state.currentReceipt,
          items: state.currentReceipt.items.map((item) => ({
            ...item,
            assigned_to: ['all'],
          })),
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
    // Static copy first — must not throw; iOS Safari needs this update to paint before await.
    addAgentMessage({
      message: 'Scanning receipt with AI…',
      type: 'processing',
    });
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });

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
      // Heal low-confidence items — one browser-use run for the whole list (same restaurant)
      const itemsToHeal = receipt.items.filter((i) => i.status === 'low_confidence');
      if (itemsToHeal.length > 0) {
        addAgentMessage({
          message: `Healing ${itemsToHeal.length} item(s) in one web search…`,
          type: 'searching',
        });
        try {
          const batchResults = await healBatchAPI(
            receipt.restaurant_name,
            itemsToHeal.map((i) => ({
              id: i.id,
              item_name: i.original_ocr_name,
              price: i.price,
            })),
          );
          const byId = new Map(batchResults.map((r) => [r.id, r]));

          for (const item of itemsToHeal) {
            const row = byId.get(item.id);
            const verifiedName = row?.verified_name ?? item.original_ocr_name;
            const conf =
              row && row.confidence > 0 ? Math.min(0.99, row.confidence) : 0.7;
            addAgentMessage({
              message: `Healed: ${item.original_ocr_name} → ${verifiedName}`,
              type: 'healed',
            });
            set((state) => ({
              currentReceipt: state.currentReceipt
                ? {
                    ...state.currentReceipt,
                    items: state.currentReceipt.items.map((i) =>
                      i.id === item.id
                        ? {
                            ...i,
                            healed_name: verifiedName,
                            confidence_score: conf,
                            status: 'verified' as const,
                          }
                        : i,
                    ),
                  }
                : null,
            }));
          }
        } catch {
          addAgentMessage({
            message: 'Could not heal low-confidence items — keeping original names',
            type: 'idle',
          });
          set((state) => ({
            currentReceipt: state.currentReceipt
              ? {
                  ...state.currentReceipt,
                  items: state.currentReceipt.items.map((i) =>
                    itemsToHeal.some((h) => h.id === i.id)
                      ? {
                          ...i,
                          healed_name: i.original_ocr_name,
                          confidence_score: 0.7,
                          status: 'verified' as const,
                        }
                      : i,
                  ),
                }
              : null,
          }));
        }
      }
      // Always finalize receipt status after healing loop
      if (itemsToHeal.length > 0) {
        addAgentMessage({ message: 'All items verified. Ready for assignment.', type: 'healed' });
      }
      set(state => {
        if (!state.currentReceipt) return state;
        // Recalculate total from current items to ensure consistency
        const subtotal = state.currentReceipt.items.reduce((s, i) => s + i.price, 0);
        return {
          currentReceipt: {
            ...state.currentReceipt,
            status: 'healed',
            total: subtotal + state.currentReceipt.tax + state.currentReceipt.tip,
          },
        };
      });
      setActiveTab('group');
    } catch (err) {
      console.error('Backend scan failed, falling back to demo:', err);
      addAgentMessage({
        message: `Scan failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
        type: 'error',
      });
      addAgentMessage({
        message:
          'Using demo data below. Fix: run backend on port 8000, npm run dev on 8080, open the same LAN URL as Vite shows (phone only uses :8080; /api is proxied).',
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

    const receipt: Receipt = {
      ...mockReceipt,
      items: mockReceipt.items.map((item) => ({ ...item, assigned_to: [...item.assigned_to] })),
    };
    set({
      currentReceipt: receipt,
      agentMessages: [
        {
          id: createId(),
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
          const allVerified = updatedItems.every((i) => i.status === 'verified');
          return {
            currentReceipt: {
              ...state.currentReceipt,
              items: updatedItems,
              status: allVerified ? 'healed' : state.currentReceipt.status,
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
