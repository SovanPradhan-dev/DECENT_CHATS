import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';
import { useAppStore } from '../stores/appStore';

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const user = useAppStore(state => state.user);
  const [socket, setSocket] = useState(null);
  useEffect(() => {
    if (!user) { setSocket(null); return undefined; }
    const connection = io({ withCredentials: true, transports: ['websocket', 'polling'] });
    setSocket(connection);
    return () => { connection.disconnect(); setSocket(null); };
  }, [user?.id]);
  const value = useMemo(() => socket, [socket]);
  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}
export const useSocket = () => useContext(SocketContext);
