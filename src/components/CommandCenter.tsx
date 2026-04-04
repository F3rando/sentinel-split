import { Camera, ChevronRight, Users, DollarSign } from 'lucide-react';
import { AgentFeed } from './AgentFeed';
import { useAppStore } from '@/lib/store';
import { recentSplits } from '@/lib/mockData';
import { useRef } from 'react';

export function CommandCenter() {
  const { startHealingSimulation, setActiveTab, setUploadedImage, scanReceipt } = useAppStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleScan = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // TODO [BACKEND]: Send image file to FastAPI POST /ocr, receive parsed items
      // Expected endpoint: POST /ocr
      // Expected payload: FormData with 'file' field
      // Expected response: { items: ReceiptItem[], restaurant_name: string, tax: number, tip: number }
      setUploadedImage(file);
    }
    // For now, run local simulation
    startHealingSimulation();
    // Navigate to group setup so user can add people before assigning
    setTimeout(() => setActiveTab('group'), 800);
  };

  return (
    <div className="space-y-5 animate-fade-in-up">
      {/* Scan Button */}
      <button
        onClick={handleScan}
        className="group relative w-full overflow-hidden rounded-xl bg-primary px-6 py-5 text-primary-foreground shadow-elevated transition-all active:scale-[0.98]"
      >
        <div className="relative z-10 flex items-center justify-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary-foreground/15">
            <Camera className="h-6 w-6" />
          </div>
          <div className="text-left">
            <span className="block text-lg font-bold tracking-tight">Scan New Receipt</span>
            <span className="block text-xs font-medium opacity-75">Point camera at receipt to begin</span>
          </div>
        </div>
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-primary-foreground/5 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Agent Feed */}
      <AgentFeed />

      {/* Recent Splits */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Recent Splits
        </h2>
        <div className="space-y-2.5">
          {recentSplits.map((split) => (
            <div
              key={split.id}
              className="flex items-center gap-3 rounded-lg border border-border bg-card p-3.5 shadow-card transition-colors"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary">
                <DollarSign className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{split.restaurant}</p>
                <p className="text-xs text-muted-foreground">{split.date}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-foreground">${split.total.toFixed(2)}</p>
                <div className="flex items-center gap-0.5 text-xs text-muted-foreground">
                  <Users className="h-3 w-3" />
                  <span>{split.people}</span>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </div>
          ))}
        </div>
      </div>

      {/* Demo trigger */}
      <button
        onClick={() => {
          // TODO [BACKEND]: Replace simulation with actual FastAPI calls:
          // 1. POST /ocr with demo image → parsed items
          // 2. POST /heal with parsed items → healed items
          startHealingSimulation();
          setTimeout(() => setActiveTab('group'), 800);
        }}
        className="w-full rounded-lg border border-dashed border-accent/40 bg-accent/5 py-3 text-xs font-semibold text-accent transition-colors hover:bg-accent/10"
      >
        ▶ Run Demo Simulation
      </button>
    </div>
  );
}
