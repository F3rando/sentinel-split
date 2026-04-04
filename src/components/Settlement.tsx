import { ExternalLink } from 'lucide-react';
import { useAppStore } from '@/lib/store';

// TODO [BACKEND]: Fetch final split calculations from FastAPI GET /split response
// Expected endpoint: GET /split/{receipt_id}
// Expected response: { splits: { friend_id: string, amount: number }[], self_amount: number }

export function Settlement() {
  const { currentReceipt, friends } = useAppStore();

  if (!currentReceipt) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center animate-fade-in-up">
        <p className="text-sm font-semibold text-foreground">No Receipt to Settle</p>
        <p className="mt-1 text-xs text-muted-foreground">Assign items first in the Receipt view</p>
      </div>
    );
  }

  const subtotal = currentReceipt.items.reduce((s, i) => s + i.price, 0);
  const grandTotal = currentReceipt.total;
  const taxTipMultiplier = grandTotal / subtotal;

  // Calculate per-person totals using dynamic friends from store
  const personTotals: Record<string, number> = {};

  currentReceipt.items.forEach((item) => {
    if (item.assigned_to.includes('all')) {
      // Split among self + all friends (dynamic count)
      const splitCount = friends.length + 1;
      const share = item.price / splitCount;
      friends.forEach((f) => {
        personTotals[f.id] = (personTotals[f.id] || 0) + share;
      });
      personTotals['self'] = (personTotals['self'] || 0) + share;
    } else {
      const splitCount = item.assigned_to.length;
      if (splitCount === 0) return;
      const share = item.price / splitCount;
      item.assigned_to.forEach((id) => {
        personTotals[id] = (personTotals[id] || 0) + share;
      });
    }
  });

  // Apply proportional tax + tip
  Object.keys(personTotals).forEach((id) => {
    personTotals[id] = personTotals[id] * taxTipMultiplier;
  });

  const friendTotals = friends
    .filter((f) => personTotals[f.id] && personTotals[f.id] > 0)
    .map((f) => ({
      ...f,
      total: Math.round(personTotals[f.id] * 100) / 100,
    }));

  const selfTotal = Math.round((personTotals['self'] || 0) * 100) / 100;

  // TODO [BACKEND]: Venmo deep links use real usernames entered by the user
  const makeVenmoLink = (username: string, amount: number, note: string) =>
    `venmo://paycharge?txn=charge&recipients=${username}&amount=${amount.toFixed(2)}&note=${encodeURIComponent(note)}`;

  return (
    <div className="space-y-4 animate-fade-in-up">
      {/* Header */}
      <div className="rounded-lg border border-border bg-card p-4 shadow-card">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Settlement</p>
        <h2 className="text-lg font-bold text-foreground">{currentReceipt.restaurant_name}</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Proportional tax ({((currentReceipt.tax / subtotal) * 100).toFixed(1)}%) & tip ({((currentReceipt.tip / subtotal) * 100).toFixed(1)}%) applied
        </p>
      </div>

      {/* Self */}
      {selfTotal > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-accent/30 bg-accent/5 p-3.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/15 text-sm font-bold text-accent">
            You
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground">Your Share</p>
          </div>
          <span className="text-lg font-bold text-foreground">${selfTotal.toFixed(2)}</span>
        </div>
      )}

      {/* Friends */}
      <div className="space-y-2">
        {friendTotals.map((friend) => (
          <div
            key={friend.id}
            className="flex items-center gap-3 rounded-lg border border-border bg-card p-3.5 shadow-card"
          >
            <img
              src={friend.profile_pic_url}
              alt={friend.name}
              className="h-10 w-10 rounded-full bg-secondary"
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">{friend.name}</p>
              <p className="text-[10px] text-muted-foreground">@{friend.venmo_username}</p>
            </div>
            <span className="text-base font-bold text-foreground mr-2">${friend.total.toFixed(2)}</span>
            <a
              href={makeVenmoLink(
                friend.venmo_username,
                friend.total,
                `${currentReceipt.restaurant_name} Split - Agent Verified`
              )}
              className="flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-bold text-primary-foreground shadow-card transition-all active:scale-95"
            >
              <ExternalLink className="h-3 w-3" />
              Request
            </a>
          </div>
        ))}
      </div>

      {friendTotals.length === 0 && (
        <div className="rounded-lg border border-dashed border-border p-6 text-center">
          <p className="text-sm text-muted-foreground">No friends have items assigned yet</p>
        </div>
      )}

      {/* Grand total */}
      <div className="rounded-lg border border-border bg-card p-4 shadow-card">
        <div className="flex justify-between text-sm font-bold text-foreground">
          <span>Grand Total</span>
          <span>${totalWithTaxTip.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}
