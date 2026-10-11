import React, { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { AuthContext } from './AuthContext';

export const SocketContext = createContext(null);

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const { isAuthenticated } = useContext(AuthContext);

  useEffect(() => {
    if (isAuthenticated) {
      // The server rejects connections without a valid token for an active account, and
      // disconnects a user's sockets when the account is deactivated.
      const newSocket = io('/', {
        auth: { token: localStorage.getItem('token') }
      });
      newSocket.on('connect_error', (err) => console.warn('Live updates unavailable:', err.message));
      setSocket(newSocket);

      return () => newSocket.close();
    }
  }, [isAuthenticated]);

  return (
    <SocketContext.Provider value={socket}>
      {children}
    </SocketContext.Provider>
  );
};
