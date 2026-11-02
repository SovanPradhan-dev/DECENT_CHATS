import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Bell, BellRing, ChevronRight, CircleHelp, KeyRound, Monitor, Moon, Shield, Sun, Trash2, UserCog, UserRound, Users, Waves } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../services/api';
import { useAppStore } from '../../stores/appStore';

function decodeKey(value) {
  const padding = '='.repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64), char => char.charCodeAt(0));
}

export default function SettingsPage() {
  const user = useAppStore(state => state.user);
  const setUser = useAppStore(state => state.setUser);
  const theme = useAppStore(state => state.theme);
  const setTheme = useAppStore(state => state.setTheme);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [section, setSection] = useState('profile');
  const [adminMessageSearch, setAdminMessageSearch] = useState('');
  const [profile, setProfile] = useState({ fullName: user?.fullName || '', username: user?.username || '', bio: user?.bio || '' });
  const [password, setPassword] = useState({ currentPassword: '', newPassword: '' });
  const [busy, setBusy] = useState(false);
  const [preferences, setPreferences] = useState({ desktopNotifications: user?.preferences?.desktopNotifications || false, pushNotifications: user?.preferences?.pushNotifications || false, notificationSound: user?.preferences?.notificationSound ?? true });
  const adminStats = useQuery({ queryKey: ['adminStats'], queryFn: () => api('/admin/statistics'), enabled: section === 'admin' && user?.role === 'admin' });
  const adminUsers = useQuery({ queryKey: ['adminUsers'], queryFn: () => api('/admin/users'), enabled: section === 'admin' && user?.role === 'admin' });
  const adminMessages = useQuery({ queryKey: ['adminMessages', adminMessageSearch], queryFn: () => api(`/admin/messages?q=${encodeURIComponent(adminMessageSearch)}`), enabled: section === 'admin' && user?.role === 'admin' && adminMessageSearch.trim().length > 1 });
  const activeSessions = useQuery({ queryKey: ['sessions'], queryFn: () => api('/auth/sessions'), enabled: section === 'security' });

  const savePreferences = async (updates) => {
    const next = { ...preferences, ...updates };
    setPreferences(next);
    try {
      await api('/users/preferences', { method: 'PATCH', body: JSON.stringify(updates) });
      setUser({ ...user, preferences: { ...user.preferences, ...updates } });
    } catch (error) { setPreferences(preferences); toast.error(error.message); }
  };
  const updateTheme = async (value) => {
    setTheme(value);
    try {
      await api('/users/preferences', { method: 'PATCH', body: JSON.stringify({ theme: value }) });
      setUser({ ...user, preferences: { ...user.preferences, theme: value } });
    } catch (error) { toast.error(error.message); }
  };
  const enableDesktop = async () => {
    if (!('Notification' in window)) return toast.error('This browser does not support desktop notifications.');
    if (preferences.desktopNotifications) {
      await savePreferences({ desktopNotifications: false });
      toast.success('Desktop notifications are off.');
      return;
    }
    const permission = await Notification.requestPermission();
    const enabled = permission === 'granted';
    await savePreferences({ desktopNotifications: enabled });
    toast[enabled ? 'success' : 'info'](enabled ? 'Desktop notifications are ready.' : 'Notification permission was not granted.');
  };
  const togglePush = async () => {
    setBusy(true);
    try {
      if (preferences.pushNotifications) {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          await api('/push/subscribe', { method: 'DELETE', body: JSON.stringify({ endpoint: subscription.endpoint }) });
          await subscription.unsubscribe();
        }
        await savePreferences({ pushNotifications: false });
        toast.success('Background push notifications are off.');
      } else {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) throw new Error('This browser does not support background push.');
        if (location.protocol !== 'https:' && location.hostname !== 'localhost') throw new Error('Background push requires HTTPS. Open ChatWave through its HTTPS tunnel URL.');
        const registration = await navigator.serviceWorker.ready;
        const { publicKey } = await api('/push/public-key');
        const permission = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
        if (permission !== 'granted') throw new Error('Allow browser notifications to enable background push.');
        const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeKey(publicKey) });
        await api('/push/subscribe', { method: 'POST', body: JSON.stringify(subscription.toJSON()) });
        await savePreferences({ pushNotifications: true, desktopNotifications: true });
        toast.success('Background push notifications are enabled.');
      }
    } catch (error) { toast.error(error.message); }
    finally { setBusy(false); }
  };
  const saveProfile = async (event) => {
    event.preventDefault(); setBusy(true);
    try {
      const { user: updated } = await api('/users/profile', { method: 'PATCH', body: JSON.stringify(profile) });
      setUser({ ...user, ...updated }); toast.success('Profile updated.');
    } catch (error) { toast.error(error.message); }
    finally { setBusy(false); }
  };
  const changePassword = async (event) => {
    event.preventDefault(); setBusy(true);
    try {
      await api('/users/password', { method: 'PATCH', body: JSON.stringify(password) });
      setPassword({ currentPassword: '', newPassword: '' }); toast.success('Password changed. Other sessions were signed out.');
    } catch (error) { toast.error(error.message); }
    finally { setBusy(false); }
  };
  const logoutOthers = async () => {
    try { await api('/auth/logout-others', { method: 'POST' }); await queryClient.invalidateQueries({ queryKey: ['sessions'] }); toast.success('Other active sessions have been signed out.'); }
    catch (error) { toast.error(error.message); }
  };
  const deleteAccount = async () => {
    if (!window.confirm('Delete your account permanently? Your account will be removed and you will be signed out. This cannot be undone.')) return;
    try { await api('/users/account', { method: 'DELETE' }); setUser(null); navigate('/register'); }
    catch (error) { toast.error(error.message); }
  };
  const setAccountStatus = async (target, isActive) => {
    try {
      await api(`/admin/users/${target.id}/status`, { method: 'PATCH', body: JSON.stringify({ isActive }) });
      await queryClient.invalidateQueries({ queryKey: ['adminUsers'] });
      toast.success(isActive ? 'Account reactivated.' : 'Account disabled.');
    } catch (error) { toast.error(error.message); }
  };
  const removeAdminMessage = async (id) => {
    if (!window.confirm('Delete this message for everyone? This cannot be undone.')) return;
    try {
      await api(`/admin/messages/${id}`, { method: 'DELETE' });
      await queryClient.invalidateQueries({ queryKey: ['adminMessages'] });
      toast.success('Message deleted.');
    } catch (error) { toast.error(error.message); }
  };
  const sections = [
    { id: 'profile', label: 'Profile', icon: UserRound },
    { id: 'appearance', label: 'Appearance', icon: Sun },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'security', label: 'Security', icon: Shield },
    ...(user?.role === 'admin' ? [{ id: 'admin', label: 'Admin', icon: UserCog }] : [])
  ];
  return <div className="settings-page">
    <header className="settings-topbar"><button className="icon-button" onClick={() => navigate('/')} aria-label="Back to chat"><ArrowLeft size={19} /></button><div className="brand-lockup"><div className="brand-mark"><Waves size={18} /></div><span>ChatWave</span></div><span className="settings-breadcrumb">Settings</span></header>
    <div className="settings-layout">
      <aside className="settings-nav"><span className="eyebrow">YOUR SPACE</span><h1>Settings</h1><p>Make ChatWave feel like yours.</p><div className="settings-nav-items">{sections.map(item => <button key={item.id} className={section === item.id ? 'active' : ''} onClick={() => setSection(item.id)}><item.icon size={17} />{item.label}<ChevronRight size={15} /></button>)}</div><div className="settings-help"><CircleHelp size={17} /><span><b>Need a hand?</b><small>Recovery email isn’t configured. Ask your admin to reset your account.</small></span></div></aside>
      <main className="settings-content">
        {section === 'profile' && <section className="settings-section"><span className="eyebrow">YOUR IDENTITY</span><h2>Profile</h2><p className="settings-description">The details people see when you show up in a conversation.</p><div className="settings-avatar-row"><div className="avatar avatar-xl avatar-violet">{(user?.fullName || '?').slice(0, 1).toUpperCase()}</div><div><b>{user?.fullName}</b><span>@{user?.username}</span></div></div><form className="settings-form" onSubmit={saveProfile}><label>Full name<input value={profile.fullName} onChange={event => setProfile({ ...profile, fullName: event.target.value })} minLength="2" maxLength="80" required /></label><label>Username<input value={profile.username} onChange={event => setProfile({ ...profile, username: event.target.value })} pattern="[A-Za-z0-9_]{3,24}" required /><small>3–24 letters, numbers, or underscores.</small></label><label>Email address<input value={user?.email || ''} disabled /><small>Email changes aren’t available right now.</small></label><label>About you<textarea value={profile.bio} onChange={event => setProfile({ ...profile, bio: event.target.value })} maxLength="240" rows="3" placeholder="A little about you…" /></label><button className="primary-button small-button" disabled={busy}>Save changes</button></form></section>}
        {section === 'appearance' && <section className="settings-section"><span className="eyebrow">MAKE IT YOURS</span><h2>Appearance</h2><p className="settings-description">A comfortable workspace, day or night. Your choice is saved to this device and account.</p><div className="theme-choices">{[['dark', Moon, 'Dark', 'Easy on the eyes, around the clock.'], ['light', Sun, 'Light', 'A little more daylight in your day.']].map(([value, Icon, title, caption]) => <button key={value} className={`theme-choice ${theme === value ? 'chosen' : ''}`} onClick={() => updateTheme(value)}><div className={`theme-preview ${value}`}><span /><span /><span /></div><div><b><Icon size={15} />{title}</b><small>{caption}</small></div><span className="radio-dot" /></button>)}</div></section>}
        {section === 'notifications' && <section className="settings-section"><span className="eyebrow">STAY IN THE LOOP</span><h2>Notifications</h2><p className="settings-description">Choose how ChatWave reaches you. Browser push needs HTTPS and an online server.</p><div className="settings-options">
          <div className="setting-option"><div className="option-icon"><Bell size={18} /></div><span><b>Desktop notifications</b><small>Show alerts while ChatWave is open in your browser.</small></span><button className={`toggle ${preferences.desktopNotifications ? 'on' : ''}`} onClick={enableDesktop} aria-label="Toggle desktop notifications"><i /></button></div>
          <div className="setting-option"><div className="option-icon"><BellRing size={18} /></div><span><b>Background push</b><small>Receive alerts when the browser is closed. Requires configured VAPID keys.</small></span><button className={`toggle ${preferences.pushNotifications ? 'on' : ''}`} disabled={busy} onClick={togglePush} aria-label="Toggle background push"><i /></button></div>
          <div className="setting-option"><div className="option-icon"><Monitor size={18} /></div><span><b>Notification sound</b><small>A subtle sound when a message arrives.</small></span><button className={`toggle ${preferences.notificationSound ? 'on' : ''}`} onClick={() => savePreferences({ notificationSound: !preferences.notificationSound })} aria-label="Toggle notification sound"><i /></button></div>
          <button className="notification-preview" onClick={() => toast('A little hello from ChatWave', { description: 'This is what a new message notification looks like.' })}><span className="preview-avatar">C</span><span><b>ChatWave preview</b><small>Let a good conversation find you.</small></span><span>now</span></button>
        </div></section>}
        {section === 'security' && <section className="settings-section"><span className="eyebrow">KEEP YOUR ACCOUNT SAFE</span><h2>Security</h2><p className="settings-description">Your account is protected with a private, expiring browser session.</p><form className="settings-form security-form" onSubmit={changePassword}><h3><KeyRound size={17} /> Change password</h3><label>Current password<input type="password" autoComplete="current-password" value={password.currentPassword} onChange={event => setPassword({ ...password, currentPassword: event.target.value })} required /></label><label>New password<input type="password" autoComplete="new-password" minLength="10" value={password.newPassword} onChange={event => setPassword({ ...password, newPassword: event.target.value })} required /><small>Use at least 10 characters.</small></label><button className="primary-button small-button" disabled={busy}>Update password</button></form><div className="sessions-section"><div className="security-action"><span><b>Active sessions</b><small>Signed-in browsers for this account.</small></span><button className="subtle-button" onClick={logoutOthers}>Sign out other sessions</button></div>{activeSessions.data?.sessions?.map(session => <div className="session-row" key={session.id}><Monitor size={15} /><span><b>{session.deviceName || 'Browser'}</b><small>{session.current ? 'This device' : 'Other device'} · expires {new Date(session.expiresAt).toLocaleDateString()}</small></span>{session.current && <i>Current</i>}</div>)}</div><div className="security-action danger-action"><span><b>Delete account</b><small>Permanently remove your account and sign out.</small></span><button className="danger-button" onClick={deleteAccount}>Delete account</button></div></section>}
        {section === 'admin' && user?.role === 'admin' && <section className="settings-section"><span className="eyebrow">COMMUNITY CARE</span><h2>Administration</h2><p className="settings-description">Manage accounts and remove abusive content. These controls are only available to administrators.</p><div className="admin-stats">{[['Users', adminStats.data?.statistics?.users], ['Active accounts', adminStats.data?.statistics?.activeUsers], ['Conversations', adminStats.data?.statistics?.conversations], ['Messages', adminStats.data?.statistics?.messages]].map(([label, value]) => <div key={label}><span>{label}</span><b>{value ?? '—'}</b></div>)}</div><div className="admin-section"><h3><Users size={16} /> Accounts</h3>{adminUsers.data?.users?.map(account => <div className="admin-user-row" key={account.id}><span className="admin-user-name"><b>{account.fullName}</b><small>@{account.username} · {account.role}</small></span><span className={account.isActive ? 'account-active' : 'account-disabled'}>{account.isActive ? 'Active' : 'Disabled'}</span><button className="subtle-button" disabled={account.id === user.id} onClick={() => setAccountStatus(account, !account.isActive)}>{account.isActive ? 'Disable' : 'Reactivate'}</button></div>)}</div><div className="admin-section"><h3><Trash2 size={16} /> Review messages</h3><input className="admin-search" minLength="2" placeholder="Search message content (2+ characters)" value={adminMessageSearch} onChange={event => setAdminMessageSearch(event.target.value)} />{adminMessages.data?.messages?.map(message => <div className="admin-message-row" key={message._id}><span><b>{message.senderId?.fullName || 'Account'}</b><small>{message.content}</small></span><button className="danger-button" onClick={() => removeAdminMessage(message._id)}>Delete</button></div>)}{adminMessageSearch.length > 1 && !adminMessages.data?.messages?.length && <div className="search-empty">No matching messages.</div>}</div></section>}
      </main>
    </div>
  </div>;
}
