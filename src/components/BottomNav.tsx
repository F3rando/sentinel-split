import { Home, Users, Receipt, CreditCard } from 'lucide-react';
import { useAppStore } from '@/lib/store';

const tabs = [
  { id: 'home' as const, label: 'Command', icon: Home },
  { id: 'group' as const, label: 'Group', icon: Users },
  { id: 'receipt' as const, label: 'Receipt', icon: Receipt },
  { id: 'settle' as const, label: 'Settle', icon: CreditCard },
];

export function BottomNav() {
  const { activeTab, setActiveTab } = useAppStore();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card shadow-elevated">
      <div className="mx-auto flex max-w-lg items-center justify-around py-2">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex flex-col items-center gap-0.5 px-4 py-1.5 transition-colors ${
                isActive
                  ? 'text-accent'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <tab.icon className={`h-5 w-5 ${isActive ? 'stroke-[2.5]' : ''}`} />
              <span className="text-[10px] font-semibold tracking-wide uppercase">
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
      <div className="h-[env(safe-area-inset-bottom)]" />
    </nav>
  );
}
