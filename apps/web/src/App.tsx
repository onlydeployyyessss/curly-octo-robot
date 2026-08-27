import * as React from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Layout } from './components/layout/Layout';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Creators } from './pages/Creators';
import { Campaigns } from './pages/Campaigns';
import { Accounts } from './pages/Accounts';
import { Messages } from './pages/Messages';
import { Replies } from './pages/Replies';
import { Activity } from './pages/Activity';
import { TelegramPage } from './pages/Telegram';
import { SettingsPage } from './pages/Settings';
import { api, DEMO_MODE } from './lib/api';
import type { UserDTO } from '@pc/shared';

export default function App() {
  const [user, setUser] = React.useState<UserDTO | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [needsSetup, setNeedsSetup] = React.useState(false);
  const location = useLocation();

  React.useEffect(() => {
    (async () => {
      try {
        if (DEMO_MODE) {
          setUser({ id: 'demo', email: 'demo@pcmission.app', name: 'Demo Operator', role: 'admin', createdAt: '' });
        } else {
          const me = await api.me();
          if (me) setUser(me.user);
          else {
            const b = await api.bootstrap();
            setNeedsSetup(b.needsSetup);
          }
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Booting mission control…</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Login needsSetup={needsSetup} onAuthed={setUser} />;
  }

  return (
    <Layout user={user} onLogout={() => { setUser(null); }}>
      <Routes location={location}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/creators" element={<Creators />} />
        <Route path="/campaigns" element={<Campaigns />} />
        <Route path="/accounts" element={<Accounts />} />
        <Route path="/messages" element={<Messages />} />
        <Route path="/replies" element={<Replies />} />
        <Route path="/activity" element={<Activity />} />
        <Route path="/telegram" element={<TelegramPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
