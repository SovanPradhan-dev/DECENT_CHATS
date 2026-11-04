import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format, formatDistanceToNow, isSameDay, isToday, isYesterday } from 'date-fns';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Bell, BellOff, Check, CheckCheck, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, File, Image, Info, LogOut, MessageCircle, MoreHorizontal, Paperclip, Plus, Search, Send, Settings, ShieldCheck, Shuffle, Smile, Sparkles, UserPlus, Users, Waves, X } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../services/api';
import { useAppStore } from '../../stores/appStore';
import { useSocket } from '../../socket/SocketProvider';

const avatarInitial = (person) => (person?.fullName || person?.username || '?').slice(0, 1).toUpperCase();
const initialsColor = (text = '') => ['avatar-violet', 'avatar-blue', 'avatar-pink', 'avatar-green', 'avatar-orange'][text.charCodeAt(0) % 5];
const wavePrompts = {
  private: [
    { category: 'A little deeper', text: 'What is something small that made today better?' },
    { category: 'A little deeper', text: 'What is something you are looking forward to this week?' },
    { category: 'A little deeper', text: 'What is one thing you wish you had more time for?' },
    { category: 'Just for fun', text: 'If you could teleport anywhere for dinner tonight, where would we go?' },
    { category: 'Just for fun', text: 'What song instantly takes you back to a favorite memory?' },
    { category: 'Just for fun', text: 'What harmless opinion will you defend forever?' },
    { category: 'Make a plan', text: 'What is one new thing we should try together?' },
    { category: 'Make a plan', text: 'Pick a free afternoon: outdoors, good food, or a cozy night in?' },
    { category: 'Make a plan', text: 'What would make this weekend feel like a mini adventure?' }
  ],
  group: [
    { category: 'A little deeper', text: 'Everyone share one small win from this week.' },
    { category: 'A little deeper', text: 'What is something you learned recently that surprised you?' },
    { category: 'A little deeper', text: 'What is one thing this group should celebrate soon?' },
    { category: 'Just for fun', text: 'Build a group playlist: what is the first song you are adding?' },
    { category: 'Just for fun', text: 'Which fictional world would this group survive best in?' },
    { category: 'Just for fun', text: 'Give the group a silly team name. Best one wins.' },
    { category: 'Make a plan', text: 'What is one low-effort thing we should all do together?' },
    { category: 'Make a plan', text: 'Choose our next group hangout: food, games, or getting outside?' },
    { category: 'Make a plan', text: 'Add one idea to our group bucket list.' }
  ]
};

export default function ChatPage() {
  const user = useAppStore(state => state.user);
  const clearUser = useAppStore(state => state.clearUser);
  const socket = useSocket();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [debouncedUserSearch, setDebouncedUserSearch] = useState('');
  const [messageSearch, setMessageSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [mobileChat, setMobileChat] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(() => window.innerWidth > 820);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [groupMode, setGroupMode] = useState(false);
  const [addToExistingGroup, setAddToExistingGroup] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [typingNames, setTypingNames] = useState([]);
  const [onlineUsers, setOnlineUsers] = useState(() => new Set());
  const [draft, setDraft] = useState('');
  const [reply, setReply] = useState(null);
  const [editing, setEditing] = useState(null);
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [draggingFiles, setDraggingFiles] = useState(false);
  const [menuMessage, setMenuMessage] = useState(null);
  const [mobileDrawer, setMobileDrawer] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [muted, setMuted] = useState(false);
  const [waveSparksOpen, setWaveSparksOpen] = useState(false);
  const [waveSparkOffset, setWaveSparkOffset] = useState(0);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const fileRef = useRef(null);
  const typingTimer = useRef(null);

  const conversationsQuery = useQuery({ queryKey: ['conversations'], queryFn: () => api('/conversations') });
  const notificationQuery = useQuery({ queryKey: ['notifications'], queryFn: () => api('/notifications'), enabled: notificationsOpen });
  const conversations = conversationsQuery.data?.conversations || [];
  const selectedId = params.get('conversation') || null;
  const selected = conversations.find(c => c._id === selectedId);
  const dailySparkSeed = `${new Date().toISOString().slice(0, 10)}:${selectedId || ''}`.split('').reduce((seed, character) => (seed * 31 + character.charCodeAt(0)) >>> 0, 7);
  const availableSparks = wavePrompts[selected?.type === 'group' ? 'group' : 'private'];
  const waveSpark = availableSparks[(dailySparkSeed + waveSparkOffset) % availableSparks.length];
  useEffect(() => {
    setMuted(Boolean(user?.preferences?.mutedConversations?.includes(selectedId)));
  }, [selectedId, user?.preferences?.mutedConversations]);
  const messageKey = ['messages', selectedId];
  const messagesQuery = useQuery({ queryKey: messageKey, queryFn: () => api(`/messages/${selectedId}?limit=50`), enabled: Boolean(selectedId) });
  const messages = messagesQuery.data?.messages || [];
  const usersQuery = useQuery({ queryKey: ['userSearch', debouncedUserSearch], queryFn: () => api(`/users/search?q=${encodeURIComponent(debouncedUserSearch)}`), enabled: debouncedUserSearch.trim().length > 1 });
  const messagesFiltered = useMemo(() => messages, [messages]);
  const displayConversations = useMemo(() => conversations.filter(conversation => {
    const peer = conversation.participants?.find(p => p._id !== user?.id);
    const label = conversation.type === 'group' ? conversation.groupInfo?.name : peer?.fullName || peer?.username;
    const matchesText = !search || label?.toLowerCase().includes(search.toLowerCase()) || conversation.lastMessage?.content?.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = activeFilter === 'all' || (activeFilter === 'unread' && conversation.unreadCount > 0) || (activeFilter === 'groups' && conversation.type === 'group');
    return matchesText && matchesFilter;
  }), [conversations, search, activeFilter, user?.id]);

  const getPeer = (conversation) => conversation?.participants?.find(person => person._id !== user?.id) || conversation?.participants?.[0];
  const getTitle = (conversation) => conversation?.type === 'group' ? conversation.groupInfo?.name : getPeer(conversation)?.fullName || getPeer(conversation)?.username || 'Conversation';
  const openConversation = (id) => {
    setParams({ conversation: id });
    setMobileChat(true);
    setMobileDrawer(false);
    setReply(null);
    setWaveSparkOffset(0);
    setWaveSparksOpen(false);
  };
  const closeNewChat = () => {
    setNewChatOpen(false);
    setGroupMode(false);
    setAddToExistingGroup(false);
    setSelectedUsers([]);
    setGroupName('');
    setUserSearch('');
  };

  useEffect(() => {
    if (selectedId) {
      if (params.get('conversation')) setMobileChat(true);
      socket?.emit('conversation:join', { conversationId: selectedId });
      return () => socket?.emit('conversation:leave', { conversationId: selectedId });
    }
    if (!selectedId) setMobileChat(false);
    return undefined;
  }, [selectedId, socket, params]);

  useEffect(() => {
    if (!socket) return undefined;
    const onMessage = ({ message }) => {
      queryClient.setQueryData(['messages', String(message.conversationId?._id || message.conversationId)], old => {
        if (!old) return old;
        if (old.messages.some(item => item._id === message._id || item.clientMessageId === message.clientMessageId)) return { ...old, messages: old.messages.map(item => item.clientMessageId === message.clientMessageId ? message : item) };
        return { ...old, messages: [...old.messages, message] };
      });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      if (String(message.conversationId?._id || message.conversationId) === selectedId) {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
        if (message.senderId?._id !== user?.id && message._id) api(`/messages/${message._id}/read`, { method: 'POST' }).catch(() => {});
      }
    };
    const onEdit = ({ message }) => queryClient.setQueryData(['messages', String(message.conversationId)], old => old ? { ...old, messages: old.messages.map(item => item._id === message._id ? message : item) } : old);
    const onDelete = ({ messageId, conversationId }) => queryClient.setQueryData(['messages', String(conversationId)], old => old ? { ...old, messages: old.messages.map(item => item._id === messageId ? { ...item, deletedAt: new Date().toISOString(), content: '' } : item) } : old);
    const onTyping = ({ userId, name }) => { if (userId !== user?.id) setTypingNames(names => names.includes(name) ? names : [...names, name]); };
    const onStopTyping = ({ userId }) => { if (userId !== user?.id) setTypingNames([]); };
    const onNotification = () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    };
    const onRead = ({ conversationId, messageId, userId }) => queryClient.setQueryData(['messages', String(conversationId)], old => old ? {
      ...old, messages: old.messages.map(message => message._id === messageId && !message.readBy?.some(item => String(item.userId?._id || item.userId) === userId)
        ? { ...message, readBy: [...(message.readBy || []), { userId, readAt: new Date().toISOString() }] }
        : message)
    } : old);
    const onGroupChanged = () => queryClient.invalidateQueries({ queryKey: ['conversations'] });
    const onGroupRemoved = ({ conversationId }) => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      if (conversationId === selectedId) { setParams({}); setMobileChat(false); }
    };
    const onPresenceSnapshot = ({ userIds }) => setOnlineUsers(new Set(userIds));
    const onUserOnline = ({ userId }) => setOnlineUsers(current => new Set([...current, userId]));
    const onUserOffline = ({ userId }) => {
      setOnlineUsers(current => { const next = new Set(current); next.delete(userId); return next; });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    };
    const requestPresence = () => socket.emit('presence:request', ({ userIds }) => setOnlineUsers(new Set(userIds)));
    socket.on('message:new', onMessage);
    socket.on('message:updated', onEdit);
    socket.on('message:deleted', onDelete);
    socket.on('typing:start', onTyping);
    socket.on('typing:stop', onStopTyping);
    socket.on('notification:new', onNotification);
    socket.on('message:read', onRead);
    socket.on('group:created', onGroupChanged);
    socket.on('group:updated', onGroupChanged);
    socket.on('group:member-added', onGroupChanged);
    socket.on('group:member-removed', onGroupRemoved);
    socket.on('presence:snapshot', onPresenceSnapshot);
    socket.on('user:online', onUserOnline);
    socket.on('user:offline', onUserOffline);
    socket.on('connect', requestPresence);
    if (socket.connected) requestPresence();
    return () => {
      socket.off('message:new', onMessage); socket.off('message:updated', onEdit); socket.off('message:deleted', onDelete);
      socket.off('typing:start', onTyping); socket.off('typing:stop', onStopTyping);
      socket.off('notification:new', onNotification);
      socket.off('message:read', onRead);
      socket.off('group:created', onGroupChanged); socket.off('group:updated', onGroupChanged);
      socket.off('group:member-added', onGroupChanged); socket.off('group:member-removed', onGroupRemoved);
      socket.off('presence:snapshot', onPresenceSnapshot); socket.off('user:online', onUserOnline); socket.off('user:offline', onUserOffline);
      socket.off('connect', requestPresence);
    };
  }, [socket, selectedId, queryClient, user?.id]);

  useEffect(() => {
    if (messages.length) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selectedId, messages.length]);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedUserSearch(userSearch), 250);
    return () => clearTimeout(timer);
  }, [userSearch]);
  useEffect(() => {
    const latestId = messages[messages.length - 1]?._id;
    if (!messagesQuery.isLoading && latestId && /^[a-f\d]{24}$/i.test(latestId)) api(`/messages/${latestId}/read`, { method: 'POST' }).catch(() => {});
  }, [selectedId, messagesQuery.isLoading]);

  const searchMessages = async () => {
    if (!selectedId) return;
    if (!messageSearch.trim()) {
      await queryClient.invalidateQueries({ queryKey: messageKey });
      return;
    }
    try {
      const result = await api(`/messages/${selectedId}?q=${encodeURIComponent(messageSearch.trim())}`);
      queryClient.setQueryData(messageKey, result);
      if (!result.messages.length) toast.info('No matching messages in this conversation.');
    } catch (error) { toast.error(error.message); }
  };

  const sendMessage = async (event) => {
    event?.preventDefault();
    const text = draft.trim();
    if (!text || !selectedId) return;
    if (editing) {
      try {
        const { message } = await api(`/messages/${editing._id}`, { method: 'PATCH', body: JSON.stringify({ content: text }) });
        queryClient.setQueryData(messageKey, old => ({ ...old, messages: old.messages.map(item => item._id === message._id ? message : item) }));
        setEditing(null); setDraft('');
      } catch (error) { toast.error(error.message); }
      return;
    }
    const clientMessageId = crypto.randomUUID();
    const optimistic = { _id: clientMessageId, clientMessageId, conversationId: selectedId, content: text, senderId: user, createdAt: new Date().toISOString(), readBy: [{ userId: user.id }], replyTo: reply };
    queryClient.setQueryData(messageKey, old => ({ messages: [...(old?.messages || []), optimistic], hasMore: old?.hasMore }));
    setDraft(''); setReply(null);
    socket?.emit('typing:stop', { conversationId: selectedId });
    const payload = { conversationId: selectedId, clientMessageId, content: text, replyTo: optimistic.replyTo?._id };
    const reconcile = ({ message }) => {
      queryClient.setQueryData(messageKey, old => ({ ...old, messages: old.messages.map(item => item.clientMessageId === clientMessageId ? message : item) }));
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    };
    const fail = (error) => {
      queryClient.setQueryData(messageKey, old => ({ ...old, messages: old.messages.filter(item => item.clientMessageId !== clientMessageId) }));
      toast.error(error.message);
      setDraft(text);
    };
    const sendWithHttp = () => api('/messages', { method: 'POST', body: JSON.stringify(payload) }).then(reconcile).catch(fail);
    if (socket?.connected) {
      socket.timeout(8000).emit('message:send', payload, (timeoutError, result) => {
        if (timeoutError || result?.error) {
          sendWithHttp();
        } else {
          reconcile(result);
        }
      });
    } else {
      sendWithHttp();
    }
  };
  const handleTyping = (value) => {
    setDraft(value);
    if (!selectedId || !socket) return;
    socket.emit('typing:start', { conversationId: selectedId });
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => socket.emit('typing:stop', { conversationId: selectedId }), 1800);
  };
  const startPrivate = async (person) => {
    try {
      const { conversation } = await api('/conversations/private', { method: 'POST', body: JSON.stringify({ userId: person.id }) });
      await queryClient.invalidateQueries({ queryKey: ['conversations'] });
      openConversation(conversation._id);
      setNewChatOpen(false); setUserSearch('');
    } catch (error) { toast.error(error.message); }
  };
  const createGroup = async () => {
    if (addToExistingGroup && selectedUsers.length === 0) return toast.error('Select at least one person to add.');
    if (!addToExistingGroup && groupName.trim().length < 2) return toast.error('Add a group name to continue.');
    try {
      const { conversation } = addToExistingGroup
        ? await api(`/conversations/${selectedId}`, { method: 'PATCH', body: JSON.stringify({ addMemberIds: selectedUsers.map(person => person.id) }) })
        : await api('/conversations/group', { method: 'POST', body: JSON.stringify({ name: groupName.trim(), memberIds: selectedUsers.map(person => person.id) }) });
      await queryClient.invalidateQueries({ queryKey: ['conversations'] });
      if (!addToExistingGroup) openConversation(conversation._id);
      setNewChatOpen(false); setGroupName(''); setSelectedUsers([]); setGroupMode(false); setAddToExistingGroup(false); setUserSearch('');
    } catch (error) { toast.error(error.message); }
  };
  const attachFile = async (file) => {
    if (!file || !selectedId) return;
    setAttachmentBusy(true);
    setUploadProgress(0);
    try {
      const form = new FormData(); form.append('file', file); form.append('conversationId', selectedId);
      const { attachment } = await new Promise((resolve, reject) => {
        const request = new XMLHttpRequest();
        request.open('POST', '/api/uploads');
        request.withCredentials = true;
        request.upload.onprogress = event => {
          if (event.lengthComputable) setUploadProgress(Math.round(event.loaded / event.total * 100));
        };
        request.onerror = () => reject(new Error('Upload failed. Check your connection and try again.'));
        request.onload = () => {
          let result;
          try { result = JSON.parse(request.responseText || '{}'); }
          catch { return reject(new Error('The server returned an invalid upload response.')); }
          if (request.status >= 200 && request.status < 300) resolve(result);
          else reject(new Error(result.error || 'Upload failed.'));
        };
        request.send(form);
      });
      const clientMessageId = crypto.randomUUID();
      const { message } = await api('/messages', { method: 'POST', body: JSON.stringify({ conversationId: selectedId, clientMessageId, content: '', attachmentId: attachment.id }) });
      queryClient.setQueryData(messageKey, old => ({ ...old, messages: [...(old?.messages || []), message] }));
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    } catch (error) { toast.error(error.message); }
    finally { setAttachmentBusy(false); setUploadProgress(0); if (fileRef.current) fileRef.current.value = ''; }
  };
  const signOut = async () => {
    try { await api('/auth/logout', { method: 'POST' }); clearUser(); navigate('/login'); }
    catch (error) { toast.error(error.message); }
  };
  const loadOlder = async () => {
    const first = messages[0];
    if (!first) return;
    try {
      const older = await api(`/messages/${selectedId}?limit=50&before=${encodeURIComponent(first.createdAt)}`);
      queryClient.setQueryData(messageKey, old => ({ ...older, messages: [...older.messages, ...(old?.messages || [])] }));
    } catch (error) { toast.error(error.message); }
  };
  const toggleMute = async () => {
    if (!selected) return;
    try {
      const next = !muted;
      await api(`/conversations/${selectedId}/mute`, { method: 'PATCH', body: JSON.stringify({ muted: next }) });
      setMuted(next);
      useAppStore.getState().setUser({ ...user, preferences: { ...user.preferences, mutedConversations: next ? [...(user.preferences?.mutedConversations || []), selectedId] : (user.preferences?.mutedConversations || []).filter(id => id !== selectedId) } });
      toast.success(next ? 'Conversation muted.' : 'Notifications enabled.');
    } catch (error) { toast.error(error.message); }
  };

  return (
    <div className={`chat-shell ${mobileChat ? 'mobile-chat-open' : ''} ${detailsOpen ? 'details-expanded' : ''}`}>
      <aside className={`sidebar ${mobileDrawer ? 'drawer-open' : ''}`}>
        <div className="sidebar-brand"><div className="brand-mark"><Waves size={19} /></div><span>ChatWave</span><button className="mobile-close icon-button" onClick={() => setMobileDrawer(false)} aria-label="Close menu"><X size={18} /></button></div>
        <div className="profile-card">
          <div className={`avatar avatar-lg ${initialsColor(user?.fullName)}`}>{avatarInitial(user)}</div>
          <div className="profile-copy"><strong>{user?.fullName}</strong><span>@{user?.username}</span></div>
          <button className="icon-button profile-menu" aria-label="Profile settings" onClick={() => navigate('/settings')}><MoreHorizontal size={19} /></button>
        </div>
        <div className="search-box sidebar-search"><Search size={16} /><input placeholder="Search conversations" value={search} onChange={event => setSearch(event.target.value)} /><kbd>⌘ K</kbd></div>
        <div className="section-heading"><span>MESSAGES</span><button className="icon-button add-conversation" aria-label="New conversation" onClick={() => setNewChatOpen(true)}><Plus size={17} /></button></div>
        <div className="filter-tabs">
          {[['all', 'All'], ['unread', 'Unread'], ['groups', 'Groups']].map(([key, label]) => <button key={key} className={activeFilter === key ? 'selected' : ''} onClick={() => setActiveFilter(key)}>{label}</button>)}
        </div>
        <div className="conversation-list">
          {conversationsQuery.isLoading ? <div className="conversation-skeleton">{[1, 2, 3, 4].map(n => <div key={n} className="skeleton-row"><span /><i /></div>)}</div> : displayConversations.map(conversation => {
            const person = getPeer(conversation);
            const title = getTitle(conversation);
            return <button key={conversation._id} className={`conversation-row ${selectedId === conversation._id ? 'active' : ''}`} onClick={() => openConversation(conversation._id)}>
              <div className={`avatar ${conversation.type === 'group' ? 'avatar-group' : initialsColor(title)}`}>{conversation.type === 'group' ? <Users size={17} /> : avatarInitial(person)}</div>
              <span className="conversation-info"><span className="conversation-top"><strong>{title}</strong><time>{conversation.updatedAt ? format(new Date(conversation.updatedAt), 'HH:mm') : ''}</time></span><span className="conversation-bottom"><span>{conversation.lastMessage?.content || (conversation.type === 'group' ? `${conversation.participants.length} members` : 'Start a conversation')}</span>{conversation.unreadCount > 0 && <b>{conversation.unreadCount}</b>}</span></span>
            </button>;
          })}
          {!conversationsQuery.isLoading && displayConversations.length === 0 && <div className="sidebar-empty"><MessageCircle size={20} /><span>No conversations yet</span><button onClick={() => setNewChatOpen(true)}>Start one</button></div>}
        </div>
        <div className="sidebar-bottom">
          <button className="nav-row" onClick={() => setNotificationsOpen(!notificationsOpen)}><Bell size={17} /><span>Notifications</span>{notificationQuery.data?.notifications?.some(item => !item.isRead) && <span className="nav-live-dot" />}</button>
          <button className="nav-row" onClick={() => navigate('/settings')}><Settings size={17} /><span>Settings</span><ChevronRight size={15} className="nav-chevron" /></button>
          <button className="nav-row signout-row" onClick={signOut}><LogOut size={17} /><span>Sign out</span></button>
          <div className="sidebar-footer"><span className="online-indicator" /> All systems feeling good <CircleHelp size={14} /></div>
        </div>
      </aside>
      {notificationsOpen && <div className="notification-popover"><div className="notification-popover-head"><b>Notifications</b><button className="text-button" onClick={async () => { try { await api('/notifications/read-all', { method: 'PATCH' }); await queryClient.invalidateQueries({ queryKey: ['notifications'] }); } catch (error) { toast.error(error.message); } }}>Mark all read</button></div>{notificationQuery.isLoading ? <div className="search-empty">Loading your notifications…</div> : notificationQuery.data?.notifications?.length ? notificationQuery.data.notifications.map(item => <button key={item._id} className={`notification-item ${item.isRead ? '' : 'unread'}`} onClick={async () => { try { if (!item.isRead) await api(`/notifications/${item._id}/read`, { method: 'PATCH' }); await queryClient.invalidateQueries({ queryKey: ['notifications'] }); openConversation(item.conversationId); setNotificationsOpen(false); } catch (error) { toast.error(error.message); } }}><span className={`avatar avatar-sm ${initialsColor(item.senderId?.fullName)}`}>{avatarInitial(item.senderId)}</span><span><b>{item.title}</b><small>{item.body}</small></span><time>{format(new Date(item.createdAt), 'MMM d')}</time></button>) : <div className="search-empty">All caught up. No notifications yet.</div>}</div>}
      <div className={`mobile-scrim ${mobileDrawer ? 'show' : ''}`} onClick={() => setMobileDrawer(false)} />
      <main className="chat-main">
        <header className="chat-header">
          <button className="icon-button mobile-menu" onClick={() => mobileChat ? (setMobileChat(false), setParams({})) : setMobileDrawer(true)} aria-label={mobileChat ? 'Back to conversations' : 'Open menu'}>{mobileChat ? <ArrowLeft size={20} /> : <ChevronLeft size={20} />}</button>
          {selected ? <><div className={`avatar header-avatar ${selected.type === 'group' ? 'avatar-group' : initialsColor(getTitle(selected))}`}>{selected.type === 'group' ? <Users size={17} /> : avatarInitial(getPeer(selected))}</div><div className="chat-title"><strong>{getTitle(selected)}</strong><span>{selected.type === 'group' ? `${selected.participants.length} members` : onlineUsers.has(String(getPeer(selected)?._id)) ? <><i className="online-indicator" /> Online now</> : `Last seen ${formatDistanceToNow(new Date(getPeer(selected)?.lastSeen || Date.now()), { addSuffix: true })}`}</span></div><div className="header-actions"><div className="search-box message-search"><Search size={16} /><input placeholder="Find in chat" value={messageSearch} onChange={event => setMessageSearch(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') searchMessages(); if (event.key === 'Escape') { setMessageSearch(''); queryClient.invalidateQueries({ queryKey: messageKey }); } }} /></div><button className={`icon-button wave-spark-toggle ${waveSparksOpen ? 'selected-icon' : ''}`} title="Open today's Wave Spark" aria-label="Open today's Wave Spark" aria-expanded={waveSparksOpen} onClick={() => setWaveSparksOpen(!waveSparksOpen)}><Sparkles size={18} /></button><button className={`icon-button ${muted ? 'is-muted' : ''}`} title={muted ? 'Unmute conversation' : 'Mute conversation'} onClick={toggleMute}>{muted ? <BellOff size={18} /> : <Bell size={18} />}</button><button className={`icon-button details-toggle ${detailsOpen ? 'selected-icon' : ''}`} onClick={() => setDetailsOpen(!detailsOpen)} aria-label="Conversation details"><Info size={18} /></button></div></> : <div className="chat-title welcome-title"><strong>Your conversations</strong><span>A little closer, wherever you are.</span></div>}
        </header>
        {selected ? <><section className={`message-area ${draggingFiles ? 'file-dragging' : ''}`} onDragOver={event => { if (event.dataTransfer.types.includes('Files')) { event.preventDefault(); setDraggingFiles(true); } }} onDragLeave={event => { if (event.currentTarget === event.target) setDraggingFiles(false); }} onDrop={event => { event.preventDefault(); setDraggingFiles(false); attachFile(event.dataTransfer.files?.[0]); }}>
          {draggingFiles && <div className="drop-overlay"><Paperclip size={22} /><b>Drop a file to share</b><span>Images, documents, and PDFs up to 10 MB</span></div>}
          <div className="conversation-intro"><div className="intro-orb"><Sparkles size={20} /></div><span className="eyebrow">A LITTLE SPACE JUST FOR YOU TWO</span><h2>{getTitle(selected)}</h2><p>{selected.type === 'group' ? selected.groupInfo?.description || `${selected.participants.length} people, one conversation.` : `This is the beginning of your conversation with ${getPeer(selected)?.fullName || getTitle(selected)}.`}</p></div>
          {messagesQuery.data?.hasMore && <button className="load-older" onClick={loadOlder}><ArrowUp size={14} /> Load earlier messages</button>}
          {messagesQuery.isLoading ? <div className="messages-loading"><span /><span /><span /></div> : messagesFiltered.map((message, index) => {
            const own = String(message.senderId?._id || message.senderId?.id || message.senderId) === user?.id;
            const previous = messagesFiltered[index - 1];
            const showDate = !previous || !isSameDay(new Date(previous.createdAt), new Date(message.createdAt));
            const dateLabel = isToday(new Date(message.createdAt)) ? 'Today' : isYesterday(new Date(message.createdAt)) ? 'Yesterday' : format(new Date(message.createdAt), 'MMMM d, yyyy');
            return (<div key={message._id} className="message-block">
              {showDate && <div className="date-divider"><span>{dateLabel}</span></div>}
              <div className={`message-row ${own ? 'own' : ''}`}>
                {!own && <div className={`avatar message-avatar ${initialsColor(message.senderId?.fullName)}`}>{avatarInitial(message.senderId)}</div>}
                <div className="message-content-wrap">
                  {!own && selected.type === 'group' && <span className="message-author">{message.senderId?.fullName}</span>}
                  {message.replyTo && <div className="reply-quote"><span>{message.replyTo.senderId?.fullName || 'Earlier message'}</span><p>{message.replyTo.content || 'Message deleted'}</p></div>}
                  <div className="message-and-tools"><div className={`message-bubble ${own ? 'sent' : 'received'} ${message.deletedAt ? 'deleted' : ''}`}>
                    {message.deletedAt ? <i>This message was deleted</i> : <><span>{message.content}</span>{message.attachment && <>{message.attachment.mimeType?.startsWith('image/') && <a className="message-image-preview" href={`/api/uploads/${message.attachment._id}`} target="_blank" rel="noreferrer"><img src={`/api/uploads/${message.attachment._id}?inline=1`} alt={message.attachment.originalName} loading="lazy" /></a>}<a className="file-card" href={`/api/uploads/${message.attachment._id}`}><File size={18} /><span><b>{message.attachment.originalName}</b><small>{(message.attachment.size / 1024).toFixed(0)} KB · Download</small></span></a></>}</>}
                  </div><button className="icon-button message-more" onClick={() => setMenuMessage(menuMessage === message._id ? null : message._id)} aria-label="Message actions"><MoreHorizontal size={17} /></button>
                    {menuMessage === message._id && <div className="message-menu"><button onClick={() => { setReply(message); setMenuMessage(null); inputRef.current?.focus(); }}>Reply</button><button onClick={() => { navigator.clipboard.writeText(message.content || ''); toast.success('Message copied'); setMenuMessage(null); }}>Copy text</button>{own && !message.deletedAt && <><button onClick={() => { setEditing(message); setDraft(message.content); setMenuMessage(null); inputRef.current?.focus(); }}>Edit</button><button className="danger-text" onClick={async () => { try { await api(`/messages/${message._id}`, { method: 'DELETE' }); queryClient.setQueryData(messageKey, old => ({ ...old, messages: old.messages.map(item => item._id === message._id ? { ...item, deletedAt: new Date().toISOString(), content: '' } : item) })); } catch (error) { toast.error(error.message); } setMenuMessage(null); }}>Delete</button></>}</div>}
                  </div><span className="message-meta">{format(new Date(message.createdAt), 'h:mm a')}{message.editedAt && <span> · edited</span>}{own && (message.readBy?.length > 1 ? <CheckCheck size={14} className="read-check" /> : <Check size={14} />)}</span></div>
                </div>
            </div>);
          })}
          {typingNames.length > 0 && <div className="typing-indicator"><span className="typing-dots"><i /><i /><i /></span><span>{typingNames[0]} is typing</span></div>}
          <div ref={bottomRef} />
          {messages.length > 4 && <button className="scroll-bottom" onClick={() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' })} aria-label="Scroll to latest"><ArrowDown size={17} /></button>}
        </section><form className="composer-wrap" onSubmit={sendMessage}>
          {reply && <div className="composer-context"><span>Replying to <b>{reply.senderId?.fullName || 'message'}</b><small>{reply.content}</small></span><button className="icon-button" type="button" onClick={() => setReply(null)}><X size={16} /></button></div>}
          {editing && <div className="composer-context"><span>Editing message</span><button className="icon-button" type="button" onClick={() => { setEditing(null); setDraft(''); }}><X size={16} /></button></div>}
          <div className="composer"><button className="icon-button composer-attach" type="button" aria-label="Attach file" onClick={() => fileRef.current?.click()} disabled={attachmentBusy}><Paperclip size={19} /></button><input ref={fileRef} type="file" hidden accept="image/jpeg,image/png,image/gif,image/webp,.pdf,.txt,.doc,.docx,.xls,.xlsx" onChange={event => attachFile(event.target.files?.[0])} /><input ref={inputRef} value={draft} onChange={event => handleTyping(event.target.value)} placeholder={attachmentBusy ? `Uploading file · ${uploadProgress}%` : `Message ${getTitle(selected)}`} maxLength={4000} /><button className="icon-button composer-emoji" type="button" title="Add a smile" onClick={() => handleTyping(`${draft}☺`)}><Smile size={19} /></button><button className="send-button" type="submit" disabled={!draft.trim()} aria-label="Send message"><Send size={17} /></button></div><div className="composer-hint"><span><kbd>Enter</kbd> to send <span>·</span> Keep it kind</span><span>{draft.length}/4000</span></div>
        </form></> : <div className="empty-chat home-dashboard">
          <div className="home-greeting"><span className="eyebrow">YOUR SPACE, IN SYNC</span><div className="home-profile"><span className={`avatar avatar-sm ${initialsColor(user?.fullName)}`}>{avatarInitial(user)}</span><span>{user?.fullName}</span></div></div>
          <section className="home-hero">
            <div className="home-hero-copy"><span className="hero-kicker"><span className="online-indicator" /> YOUR PEOPLE, IN SYNC</span><h1>Good to see you,<br /><span>{user?.fullName?.split(' ')[0]}.</span></h1><p>Make room for a good conversation. Pick up where you left off or start something new.</p><button className="primary-button" onClick={() => setNewChatOpen(true)}><Plus size={17} /> Start a conversation <ArrowRight size={16} /></button></div>
            <div className="home-hero-art" aria-hidden="true"><div className="hero-art-glow" /><div className="hero-art-ring ring-one" /><div className="hero-art-ring ring-two" /><div className="hero-art-core"><Waves size={38} /></div><span className="hero-art-orb orb-one" /><span className="hero-art-orb orb-two" /><span className="hero-art-orb orb-three" /></div>
          </section>
          <div className="home-section-heading"><div><span className="eyebrow">A GOOD PLACE TO START</span><h2>{conversations.length ? 'Your recent conversations' : 'Make your first connection'}</h2></div>{conversations.length > 3 && <span className="home-count">{conversations.length} conversations</span>}</div>
          {conversations.length ? <div className="home-recent">{conversations.slice(0, 3).map(conversation => <button className="home-conversation" key={conversation._id} onClick={() => openConversation(conversation._id)}><span className={`avatar ${conversation.type === 'group' ? 'avatar-group' : initialsColor(getTitle(conversation))}`}>{conversation.type === 'group' ? <Users size={18} /> : avatarInitial(getPeer(conversation))}</span><span className="home-conversation-copy"><b>{getTitle(conversation)}</b><small>{conversation.lastMessage?.content || (conversation.type === 'group' ? `${conversation.participants.length} members` : 'Start a conversation')}</small></span><ArrowRight size={16} /></button>)}</div> : <div className="home-quick-grid"><button className="home-quick-card" onClick={() => setNewChatOpen(true)}><span className="quick-icon"><MessageCircle size={19} /></span><span><b>Find your people</b><small>Search for someone by name or username.</small></span><ArrowRight size={16} /></button><button className="home-quick-card" onClick={() => { setGroupMode(true); setNewChatOpen(true); }}><span className="quick-icon group-quick"><Users size={19} /></span><span><b>Bring everyone together</b><small>Start a group conversation with your crew.</small></span><ArrowRight size={16} /></button></div>}
          <div className="home-privacy"><ShieldCheck size={15} /><span>Your conversations are private and yours.</span></div>
        </div>}
      </main>
      {selected && <aside className={`details-panel ${detailsOpen ? 'open' : ''}`}>
        <div className="details-heading"><strong>Conversation</strong><button className="icon-button" onClick={() => setDetailsOpen(false)} aria-label="Close details"><X size={18} /></button></div>
        <div className="details-profile"><div className={`avatar avatar-xl ${selected.type === 'group' ? 'avatar-group' : initialsColor(getTitle(selected))}`}>{selected.type === 'group' ? <Users size={25} /> : avatarInitial(getPeer(selected))}</div><h3>{getTitle(selected)}</h3><span>{selected.type === 'group' ? `${selected.participants.length} members` : `@${getPeer(selected)?.username}`}</span><p>{selected.type === 'group' ? selected.groupInfo?.description : getPeer(selected)?.bio || 'Available for a good conversation.'}</p></div>
        <div className="details-section"><div className="details-label"><span>PEOPLE</span><span>{selected.participants.length}</span></div>{selected.type === 'group' && selected.groupInfo?.admins?.some(id => String(id) === user?.id) && <button className="add-members-button" onClick={() => { setAddToExistingGroup(true); setGroupMode(true); setNewChatOpen(true); }}><UserPlus size={14} /> Add people</button>}{selected.participants.map(person => <div className="member-row" key={person._id}><div className={`avatar avatar-sm ${initialsColor(person.fullName)}`}>{avatarInitial(person)}</div><span>{person.fullName}{person._id === user?.id ? ' (you)' : ''}<small>@{person.username}</small></span>{selected.type === 'group' && selected.groupInfo?.admins?.some(id => String(id) === user?.id) && person._id !== user?.id ? <button className="icon-button remove-member" title={`Remove ${person.fullName}`} onClick={async () => { try { await api(`/conversations/${selectedId}`, { method: 'PATCH', body: JSON.stringify({ removeMemberId: person._id }) }); await queryClient.invalidateQueries({ queryKey: ['conversations'] }); toast.success(`${person.fullName} removed from the group.`); } catch (error) { toast.error(error.message); } }}><X size={14} /></button> : <i className={`online-indicator ${onlineUsers.has(String(person._id)) ? '' : 'offline'}`} />}</div>)}</div>
        <div className="details-section"><div className="details-label"><span>SHARED FILES</span></div>{messages.filter(message => message.attachment).length ? messages.filter(message => message.attachment).slice(-5).reverse().map(message => <a className="shared-file-row" key={message.attachment._id} href={`/api/uploads/${message.attachment._id}`}><File size={16} /><span><b>{message.attachment.originalName}</b><small>{(message.attachment.size / 1024).toFixed(0)} KB</small></span></a>) : <div className="shared-empty"><Image size={17} /><span>Files shared here will appear in this space.</span></div>}</div>
        {selected.type === 'group' && <button className="leave-group" onClick={async () => { try { await api(`/conversations/${selectedId}/leave`, { method: 'POST' }); await queryClient.invalidateQueries({ queryKey: ['conversations'] }); setParams({}); setDetailsOpen(false); toast.success('You left the group.'); } catch (error) { toast.error(error.message); } }}>Leave group</button>}
        {selected.type === 'group' && selected.groupInfo?.admins?.some(id => String(id) === user?.id) && <button className="delete-group" onClick={async () => { if (!window.confirm(`Permanently delete "${getTitle(selected)}" and its messages?`)) return; try { await api(`/conversations/${selectedId}`, { method: 'DELETE' }); await queryClient.invalidateQueries({ queryKey: ['conversations'] }); setParams({}); setMobileChat(false); toast.success('Group deleted.'); } catch (error) { toast.error(error.message); } }}>Delete group</button>}
        <div className="details-footer">Made for meaningful moments <Waves size={14} /></div>
      </aside>}
      {waveSparksOpen && selected && <div className="wave-spark-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setWaveSparksOpen(false); }}>
        <section className="wave-spark-card" role="dialog" aria-modal="true" aria-labelledby="wave-spark-title">
          <div className="wave-spark-heading"><div><span className="eyebrow">A DAILY CHATWAVE RITUAL</span><h2 id="wave-spark-title">A spark for {getTitle(selected)}</h2></div><button className="icon-button" onClick={() => setWaveSparksOpen(false)} aria-label="Close Wave Sparks"><X size={18} /></button></div>
          <div className="wave-spark-prompt"><span><Sparkles size={14} /> {waveSpark.category} <span>·</span> {format(new Date(), 'EEEE, MMMM d')}</span><p>{waveSpark.text}</p></div>
          <p className="wave-spark-note">A fresh prompt each day, picked for this kind of conversation. No bots, no data leaves your device.</p>
          <div className="wave-spark-actions"><button className="text-button" onClick={() => setWaveSparkOffset(offset => offset + 1)}><Shuffle size={14} /> Another spark</button><button className="primary-button small-button" onClick={() => { setDraft(currentDraft => currentDraft.trim() ? `${currentDraft.trim()} ${waveSpark.text}` : waveSpark.text); setWaveSparksOpen(false); inputRef.current?.focus(); }}>Use this spark <ArrowRight size={15} /></button></div>
        </section>
      </div>}
      {newChatOpen && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) closeNewChat(); }}><div className="new-chat-modal">
        <div className="modal-title"><div><span className="eyebrow">{addToExistingGroup ? 'GROW THE GROUP' : 'A NEW CONVERSATION'}</span><h2>{groupMode ? addToExistingGroup ? `Add people to ${getTitle(selected)}` : 'Bring your people together' : 'Who’s on your mind?'}</h2></div><button className="icon-button" onClick={closeNewChat}><X size={19} /></button></div>
        {groupMode && !addToExistingGroup && <input className="modal-input" placeholder="Give your group a name" value={groupName} onChange={event => setGroupName(event.target.value)} maxLength={80} />}
        {groupMode && selectedUsers.length > 0 && <div className="selected-user-chips">{selectedUsers.map(person => <button key={person.id} onClick={() => setSelectedUsers(selectedUsers.filter(userItem => userItem.id !== person.id))}>{person.fullName} <X size={13} /></button>)}</div>}
        <div className="search-box modal-search"><Search size={17} /><input placeholder="Search by name or username" value={userSearch} onChange={event => setUserSearch(event.target.value)} autoFocus /><kbd>↵</kbd></div>
        <div className="user-results">{usersQuery.data?.users?.map(person => <button className="user-result" key={person.id} onClick={() => groupMode ? setSelectedUsers(selectedUsers.some(item => item.id === person.id) ? selectedUsers.filter(item => item.id !== person.id) : [...selectedUsers, person]) : startPrivate(person)}><div className={`avatar ${initialsColor(person.fullName)}`}>{avatarInitial(person)}</div><span><b>{person.fullName}</b><small>@{person.username}</small></span>{groupMode && <span className={`select-check ${selectedUsers.some(item => item.id === person.id) ? 'checked' : ''}`}><Check size={13} /></span>}</button>)}
          {userSearch.length > 1 && !usersQuery.data?.users?.length && <div className="search-empty">No people found. Try another name.</div>}
          {userSearch.length < 2 && <div className="search-empty">Search for a teammate to get started.</div>}</div>
        <div className="modal-footer">{groupMode ? <><button className="text-button" onClick={() => { setGroupMode(false); setAddToExistingGroup(false); }}>One-to-one instead</button><button className="primary-button small-button" disabled={!selectedUsers.length || (!addToExistingGroup && !groupName.trim())} onClick={createGroup}><Users size={15} /> {addToExistingGroup ? 'Add to group' : 'Create group'}</button></> : <button className="text-button" onClick={() => setGroupMode(true)}>Create a group instead <ArrowRight size={14} /></button>}</div>
      </div></div>}
    </div>
  );
}
