import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from './services/api';
import { useAppStore } from './stores/appStore';
import { SocketProvider, useSocket } from './socket/SocketProvider';
const AuthPage = lazy(() => import('./pages/auth/AuthPage'));
const ChatPage = lazy(() => import('./pages/chat/ChatPage'));
const SettingsPage = lazy(() => import('./pages/settings/SettingsPage'));

function Shell() {
  const { data, isLoading } = useQuery({ queryKey: ['me'], queryFn: () => api('/auth/me'), retry: false });
  const setUser = useAppStore(state => state.setUser);
  const clearUser = useAppStore(state => state.clearUser);
  const user = useAppStore(state => state.user);
  useEffect(() => {
    if (data?.user) {
      setUser(data.user);
      if (data.user.preferences?.theme) useAppStore.getState().setTheme(data.user.preferences.theme);
    }
    if (!isLoading && !data?.user) clearUser();
  }, [data, isLoading, setUser, clearUser]);
  if (isLoading) return <div className="boot-screen"><div className="brand-mark pulse">w</div><span>Opening your space…</span></div>;
  return (
    <SocketProvider>
      <Suspense fallback={<div className="boot-screen"><div className="brand-mark pulse">w</div><span>Opening your space…</span></div>}><Routes>
        <Route path="/login" element={user ? <Navigate to="/" replace /> : <AuthPage mode="login" />} />
        <Route path="/register" element={user ? <Navigate to="/" replace /> : <AuthPage mode="register" />} />
        <Route path="/" element={user ? <ChatPage /> : <Navigate to="/login" replace />} />
        <Route path="/settings" element={user ? <SettingsPage /> : <Navigate to="/login" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes></Suspense>
      <RealtimeEvents />
    </SocketProvider>
  );
}

function RealtimeEvents() {
  const socket = useSocket();
  const user = useAppStore(state => state.user);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  useEffect(() => {
    if (!socket) return undefined;
    const notify = ({ notification }) => {
      const viewingConversation = new URLSearchParams(window.location.search).get('conversation');
      if (user?.preferences?.mutedConversations?.includes(notification?.conversationId)) return;
      const isViewing = !document.hidden && viewingConversation === notification?.conversationId;
      if (isViewing) return;
      toast(notification?.title || 'New message', { description: notification?.body || 'You have a new message.' });
      if (user?.preferences?.notificationSound && !document.hidden && window.AudioContext) {
        try {
          const context = new window.AudioContext();
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          oscillator.frequency.value = 660;
          gain.gain.setValueAtTime(0.035, context.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.12);
          oscillator.connect(gain); gain.connect(context.destination);
          oscillator.start(); oscillator.stop(context.currentTime + 0.12);
          oscillator.onended = () => context.close();
        } catch (error) { console.warn('Notification sound is unavailable:', error.message); }
      }
      if (user?.preferences?.desktopNotifications && 'Notification' in window && Notification.permission === 'granted' && document.hidden) {
        const notice = new Notification(notification?.title || 'New message', { body: notification?.body, icon: '/icons/chatwave.svg', tag: notification?.conversationId });
        notice.onclick = () => { window.focus(); navigate(`/?conversation=${notification.conversationId}`); notice.close(); };
      }
    };
    socket.on('notification:new', notify);
    return () => socket.off('notification:new', notify);
  }, [socket, navigate, queryClient, user]);
  return null;
}
export default function App() { return <Shell />; }
