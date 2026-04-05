import { Camera, ChevronRight, Users, DollarSign } from 'lucide-react';
import { AgentFeed } from './AgentFeed';
import { useAppStore } from '@/lib/store';
import { recentSplits } from '@/lib/mockData';
import { useState } from 'react';

const RECEIPT_INPUT_ID = 'sentinel-receipt-file';

export function CommandCenter() {
  const { startHealingSimulation, setActiveTab, setUploadedImage, scanReceipt } = useAppStore();
  const [pickHint, setPickHint] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Immediate feedback on mobile (before Zustand + network). Programmatic input.click() is flaky on iOS.
      setPickHint('Image selected — scanning…');
      setUploadedImage(file);
      void scanReceipt(file).finally(() => setPickHint(null));
    }
    e.target.value = '';
  };

  return (
    <div className="space-y-5 animate-fade-in-up">
      {/* Native <label htmlFor> — iOS Safari handles this reliably; avoid button + input.click() */}
      <input
        id={RECEIPT_INPUT_ID}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={handleFileChange}
      />
      <label
        htmlFor={RECEIPT_INPUT_ID}
        className="group relative flex w-full cursor-pointer overflow-hidden rounded-xl bg-primary px-6 py-5 text-primary-foreground shadow-elevated transition-all active:scale-[0.98]"
      >
        <div className="relative z-10 flex w-full items-center justify-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-foreground/15">
            <Camera className="h-6 w-6" />
          </div>
          <div className="min-w-0 text-left">
            <span className="block text-lg font-bold tracking-tight">Scan New Receipt</span>
            <span className="block text-xs font-medium opacity-75">Camera or choose a photo from your library</span>
          </div>
        </div>
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-primary-foreground/5 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
      </label>

      {pickHint ? (
        <p className="text-center text-sm font-medium text-accent" role="status" aria-live="polite">
          {pickHint}
        </p>
      ) : null}

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
