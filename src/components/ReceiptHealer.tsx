import { useState } from 'react';
import { CheckCircle2, AlertTriangle, Users, User, ChevronDown } from 'lucide-react';
import { useAppStore } from '@/lib/store';

// TODO [BACKEND]: Item assignments could be sent to FastAPI POST /split endpoint
// Expected payload: { receipt_id: string, assignments: { item_id: string, assigned_to: string[] }[] }

export function ReceiptHealer() {
  const { currentReceipt, assignItem, setActiveTab, friends } = useAppStore();
  const [expandedItem, setExpandedItem] = useState<string | null>(null);

  if (!currentReceipt) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center animate-fade-in-up">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-secondary">
          <AlertTriangle className="h-7 w-7 text-muted-foreground" />
        </div>
        <p className="text-sm font-semibold text-foreground">No Receipt Loaded</p>
        <p className="mt-1 text-xs text-muted-foreground">Scan a receipt from the Command Center</p>
      </div>
    );
  }

  // Prompt user to set up group if no friends added
  if (friends.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center animate-fade-in-up">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-secondary">
          <Users className="h-7 w-7 text-muted-foreground" />
        </div>
        <p className="text-sm font-semibold text-foreground">No Group Set Up</p>
        <p className="mt-1 text-xs text-muted-foreground">Add people to split with first</p>
        <button
          onClick={() => setActiveTab('group')}
          className="mt-4 rounded-lg bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground shadow-card transition-all active:scale-95"
        >
          Set Up Group
        </button>
      </div>
    );
  }

  const allAssigned = currentReceipt.items.every((i) => i.assigned_to.length > 0);

  return (
    <div className="space-y-4 animate-fade-in-up">
      {/* Header */}
      <div className="rounded-lg border border-border bg-card p-4 shadow-card">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Restaurant</p>
        <h2 className="text-lg font-bold text-foreground">{currentReceipt.restaurant_name}</h2>
        <div className="mt-2 flex items-center gap-2">
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
            currentReceipt.status === 'healed'
              ? 'bg-success/10 text-success'
              : 'bg-warning/10 text-warning'
          }`}>
            {currentReceipt.status === 'healed' ? (
              <><CheckCircle2 className="h-3 w-3" /> All Verified</>
            ) : (
              <><AlertTriangle className="h-3 w-3" /> Healing...</>
            )}
          </span>
        </div>
      </div>

      {/* Items */}
      <div className="space-y-2">
        {currentReceipt.items.map((item) => {
          const isLow = item.status === 'low_confidence';
          const isVerified = item.status === 'verified';
          const isExpanded = expandedItem === item.id;
          const displayName = item.healed_name || item.original_ocr_name;

          return (
            <div
              key={item.id}
              className={`overflow-hidden rounded-lg border bg-card shadow-card transition-all ${
                isLow ? 'border-warning/50 animate-pulse-warning' : 'border-border'
              }`}
            >
              <button
                onClick={() => setExpandedItem(isExpanded ? null : item.id)}
                className="flex w-full items-center gap-3 p-3.5 text-left"
              >
                <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${
                  isVerified ? 'bg-success/10' : isLow ? 'bg-warning/10' : 'bg-secondary'
                }`}>
                  {isVerified ? (
                    <CheckCircle2 className="h-4 w-4 text-success" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-warning" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-foreground truncate">{displayName}</p>
                    {isVerified && (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-success/10 px-1.5 py-0.5 text-[9px] font-bold uppercase text-success">
                        Agent Verified
                      </span>
                    )}
                  </div>
                  {isVerified && item.healed_name && (
                    <p className="mt-0.5 text-[10px] text-muted-foreground line-through">
                      OCR: {item.original_ocr_name}
                    </p>
                  )}
                  {isLow && (
                    <p className="mt-0.5 font-mono text-[10px] text-warning">
                      Confidence: {(item.confidence_score * 100).toFixed(0)}% — Verifying...
                    </p>
                  )}
                </div>

                <span className="text-sm font-bold text-foreground">${item.price.toFixed(2)}</span>
                <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
              </button>

              {/* Assignment panel */}
              {isExpanded && (
                <div className="border-t border-border bg-secondary/30 p-3">
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Assign to
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {/* Self */}
                    <AssignButton
                      label="Self"
                      icon={<User className="h-3 w-3" />}
                      active={item.assigned_to.includes('self')}
                      onClick={() => {
                        const next = item.assigned_to.includes('self')
                          ? item.assigned_to.filter((a) => a !== 'self')
                          : [...item.assigned_to.filter((a) => a !== 'all'), 'self'];
                        assignItem(item.id, next);
                      }}
                    />
                    {/* Split All */}
                    <AssignButton
                      label="Split All"
                      icon={<Users className="h-3 w-3" />}
                      active={item.assigned_to.includes('all')}
                      onClick={() => assignItem(item.id, ['all'])}
                    />
                    {/* Dynamic friends from store */}
                    {friends.map((f) => (
                      <AssignButton
                        key={f.id}
                        label={f.name.split(' ')[0]}
                        active={item.assigned_to.includes(f.id)}
                        onClick={() => {
                          const next = item.assigned_to.includes(f.id)
                            ? item.assigned_to.filter((a) => a !== f.id)
                            : [...item.assigned_to.filter((a) => a !== 'all'), f.id];
                          assignItem(item.id, next);
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Tax & Tip */}
      <div className="rounded-lg border border-border bg-card p-4 shadow-card">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Tax</span>
          <span className="font-semibold text-foreground">${currentReceipt.tax.toFixed(2)}</span>
        </div>
        <div className="mt-1 flex justify-between text-sm">
          <span className="text-muted-foreground">Tip</span>
          <span className="font-semibold text-foreground">${currentReceipt.tip.toFixed(2)}</span>
        </div>
        <div className="mt-2 flex justify-between border-t border-border pt-2 text-sm">
          <span className="font-bold text-foreground">Total</span>
          <span className="font-bold text-foreground">
            ${(currentReceipt.items.reduce((s, i) => s + i.price, 0) + currentReceipt.tax + currentReceipt.tip).toFixed(2)}
          </span>
        </div>
      </div>

      {/* Proceed button */}
      {allAssigned && (
        <button
          onClick={() => setActiveTab('settle')}
          className="w-full rounded-xl bg-primary py-4 text-sm font-bold text-primary-foreground shadow-elevated transition-all active:scale-[0.98]"
        >
          Proceed to Settlement →
        </button>
      )}
    </div>
  );
}

function AssignButton({ label, icon, active, onClick }: {
  label: string;
  icon?: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-all ${
        active
          ? 'bg-accent text-accent-foreground shadow-glow'
          : 'bg-secondary text-muted-foreground hover:bg-secondary/80'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
