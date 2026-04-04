import { Shield } from 'lucide-react';
import { BottomNav } from '@/components/BottomNav';
import { CommandCenter } from '@/components/CommandCenter';
import { GroupSetup } from '@/components/GroupSetup';
import { ReceiptHealer } from '@/components/ReceiptHealer';
import { Settlement } from '@/components/Settlement';
import { useAppStore } from '@/lib/store';

const screens = {
  home: CommandCenter,
  group: GroupSetup,
  receipt: ReceiptHealer,
  settle: Settlement,
};

export default function Index() {
  const { activeTab } = useAppStore();
  const Screen = screens[activeTab];

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-card/80 backdrop-blur-lg">
        <div className="mx-auto flex max-w-lg items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <Shield className="h-4 w-4 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-sm font-extrabold tracking-tight text-foreground">Sentinel Split</h1>
              <p className="text-[9px] font-medium uppercase tracking-widest text-muted-foreground">
                AI-Powered Splitting
              </p>
            </div>
          </div>
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-xs font-bold text-muted-foreground">
            U
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-lg px-4 pb-24 pt-4">
        <Screen />
      </main>

      <BottomNav />
    </div>
  );
}
