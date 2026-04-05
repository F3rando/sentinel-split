import { useState } from 'react';
import { Plus, Minus, Trash2, Users, ArrowRight } from 'lucide-react';
import { useAppStore } from '@/lib/store';
import { createId } from '@/lib/id';

// TODO [BACKEND]: If persisting groups, POST to FastAPI /groups endpoint
// Expected payload: { friends: { name: string, venmo_username: string }[] }

interface FriendInput {
  tempId: string;
  name: string;
  venmo_username: string;
}

export function GroupSetup() {
  const { friends, addFriend, clearFriends, setActiveTab, currentReceipt } = useAppStore();
  const [inputs, setInputs] = useState<FriendInput[]>(
    friends.length > 0
      ? friends.map((f) => ({ tempId: f.id, name: f.name, venmo_username: f.venmo_username }))
      : [{ tempId: createId(), name: '', venmo_username: '' }]
  );

  const addRow = () => {
    setInputs((prev) => [...prev, { tempId: createId(), name: '', venmo_username: '' }]);
  };

  const removeRow = (tempId: string) => {
    setInputs((prev) => prev.filter((r) => r.tempId !== tempId));
  };

  const updateRow = (tempId: string, field: 'name' | 'venmo_username', value: string) => {
    setInputs((prev) =>
      prev.map((r) => (r.tempId === tempId ? { ...r, [field]: value } : r))
    );
  };

  const handleContinue = () => {
    // Save all valid friends to store
    clearFriends();
    inputs.forEach((input) => {
      if (input.name.trim() && input.venmo_username.trim()) {
        addFriend(input.name.trim(), input.venmo_username.trim());
      }
    });
    setActiveTab('receipt');
  };

  const validCount = inputs.filter((i) => i.name.trim() && i.venmo_username.trim()).length;
  const hasReceipt = !!currentReceipt;

  return (
    <div className="space-y-4 animate-fade-in-up">
      {/* Header */}
      <div className="rounded-lg border border-border bg-card p-4 shadow-card">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
            <Users className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Step 1</p>
            <h2 className="text-base font-bold text-foreground">Set Up Your Group</h2>
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Add each person splitting the bill. You (Self) are included automatically.
        </p>
      </div>

      {/* People count */}
      <div className="flex items-center justify-between rounded-lg border border-border bg-card p-4 shadow-card">
        <span className="text-sm font-semibold text-foreground">People (excluding you)</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              if (inputs.length > 0) {
                setInputs((prev) => prev.slice(0, -1));
              }
            }}
            disabled={inputs.length === 0}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary text-foreground transition-colors disabled:opacity-30"
          >
            <Minus className="h-4 w-4" />
          </button>
          <span className="w-8 text-center text-lg font-bold text-foreground">{inputs.length}</span>
          <button
            onClick={addRow}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-colors"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Input rows */}
      <div className="space-y-2">
        {inputs.map((input, idx) => (
          <div
            key={input.tempId}
            className="rounded-lg border border-border bg-card p-3 shadow-card"
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Person {idx + 1}
              </span>
              <button
                onClick={() => removeRow(input.tempId)}
                className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                placeholder="Name"
                value={input.name}
                onChange={(e) => updateRow(input.tempId, 'name', e.target.value)}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <input
                type="text"
                placeholder="@venmo-username"
                value={input.venmo_username}
                onChange={(e) => updateRow(input.tempId, 'venmo_username', e.target.value)}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
        ))}
      </div>

      {/* Add another */}
      <button
        onClick={addRow}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border py-3 text-xs font-semibold text-muted-foreground transition-colors hover:border-primary hover:text-primary"
      >
        <Plus className="h-3.5 w-3.5" />
        Add Another Person
      </button>

      {/* Continue */}
      <button
        onClick={handleContinue}
        disabled={validCount === 0}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-4 text-sm font-bold text-primary-foreground shadow-elevated transition-all active:scale-[0.98] disabled:opacity-40 disabled:active:scale-100"
      >
        {hasReceipt ? 'Continue to Receipt' : 'Save Group'}
        <ArrowRight className="h-4 w-4" />
      </button>

      {!hasReceipt && (
        <p className="text-center text-[10px] text-muted-foreground">
          Tip: Scan a receipt first from the Command Center, then set up your group
        </p>
      )}
    </div>
  );
}
