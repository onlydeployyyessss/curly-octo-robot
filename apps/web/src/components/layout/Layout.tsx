import * as React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Rocket,
  Instagram,
  MessageSquareText,
  Reply,
  Activity as ActivityIcon,
  Send,
  Settings as SettingsIcon,
  LogOut,
  AlertOctagon,
  Menu,
  X,
  Target,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';
import { api, DEMO_MODE } from '../../lib/api';
import { useToast } from '../ui/toast';
import type { UserDTO } from '@pc/shared';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/creators', label: 'Creators', icon: Users },
  { to: '/campaigns', label: 'Campaigns', icon: Rocket },
  { to: '/accounts', label: 'Instagram Accounts', icon: Instagram },
  { to: '/messages', label: 'Messages', icon: MessageSquareText },
  { to: '/replies', label: 'Replies', icon: Reply },
  { to: '/activity', label: 'Activity', icon: ActivityIcon },
  { to: '/telegram', label: 'Telegram', icon: Send },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
];

export function Layout({
  user,
  onLogout,
  children,
}: {
  user: UserDTO;
  onLogout: () => void;
  children: React.ReactNode;
}) {
  const navigate = useNavigate();
  const toast = useToast();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [automationOn, setAutomationOn] = React.useState(true);
  const [confirmStop, setConfirmStop] = React.useState(false);

  React.useEffect(() => {
    api.stats().then((s) => setAutomationOn(s.automationEnabled)).catch(() => {});
  }, []);

  const emergencyStop = async () => {
    await api.emergencyStop();
    setAutomationOn(false);
    setConfirmStop(false);
    toast('error', '🛑 ALL AUTOMATION STOPPED — every scheduled outreach action is halted.');
  };

  const logout = async () => {
    await api.logout().catch(() => {});
    onLogout();
    navigate('/');
  };

  return (
    <div className="glow-grid flex min-h-screen bg-background">
      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-border bg-card/80 backdrop-blur-xl transition-transform lg:static lg:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-16 items-center gap-2 border-b border-border px-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-lg">🎯</div>
          <div>
            <div className="text-sm font-bold tracking-tight">PC MISSION</div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Command Center</div>
          </div>
          <button className="ml-auto lg:hidden" onClick={() => setMobileOpen(false)}>
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary/15 text-primary'
                    : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
                )
              }
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="space-y-3 border-t border-border p-3">
          {!automationOn && (
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              🛑 Automation is stopped
            </div>
          )}
          <button
            onClick={() => setConfirmStop(true)}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-red-600 px-3 py-2.5 text-sm font-bold text-white shadow-lg shadow-red-900/30 transition hover:bg-red-500 animate-pulse-ring"
          >
            <AlertOctagon className="h-4 w-4" />
            STOP ALL AUTOMATION
          </button>
          <div className="flex items-center gap-2 px-1">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-xs font-bold">
              {user.name.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium">{user.name}</div>
              <div className="truncate text-[10px] text-muted-foreground">{user.email}</div>
            </div>
            <button onClick={logout} title="Log out" className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {mobileOpen && <div className="fixed inset-0 z-30 bg-black/60 lg:hidden" onClick={() => setMobileOpen(false)} />}

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur-xl lg:px-8">
          <button className="lg:hidden" onClick={() => setMobileOpen(true)}>
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            <span className="text-sm text-muted-foreground">
              Multi-day creator outreach · respectful, logged, auto-pausing on reply
            </span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {DEMO_MODE && (
              <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-amber-300">
                Demo data
              </span>
            )}
            <span
              className={cn(
                'hidden items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium sm:flex',
                automationOn ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400',
              )}
            >
              <span className={cn('h-1.5 w-1.5 rounded-full', automationOn ? 'bg-emerald-400' : 'bg-red-400')} />
              {automationOn ? 'Automation live' : 'Automation stopped'}
            </span>
          </div>
        </header>

        <main className="flex-1 space-y-6 p-4 lg:p-8">{children}</main>
      </div>

      {confirmStop && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="animate-fade-in w-full max-w-md rounded-xl border border-red-500/40 bg-card p-6 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-red-500/15">
                <AlertOctagon className="h-6 w-6 text-red-400" />
              </div>
              <div>
                <h3 className="text-base font-bold text-red-300">Stop ALL automation?</h3>
                <p className="text-sm text-muted-foreground">
                  Every scheduled DM and comment halts immediately. Creators are not contacted until you resume.
                </p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirmStop(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={emergencyStop}>
                Yes, stop everything
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
