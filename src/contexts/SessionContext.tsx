import React, { createContext, useContext, useState, useEffect } from 'react';
import Cookies from 'js-cookie';

interface SessionContextType {
  setSessionCookie: (token: string) => void;
  clearSessionCookie: () => void;
  hasSession: boolean;
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);

const SESSION_COOKIE_NAME = 'hotapi_session';
const SESSION_EXPIRY_DAYS = 30;

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    const sessionExists = !!Cookies.get(SESSION_COOKIE_NAME);
    setHasSession(sessionExists);
  }, []);

  const setSessionCookie = (token: string) => {
    Cookies.set(SESSION_COOKIE_NAME, token, {
      expires: SESSION_EXPIRY_DAYS,
      secure: window.location.protocol === 'https:',
      sameSite: 'Lax'
    });
    setHasSession(true);
  };

  const clearSessionCookie = () => {
    Cookies.remove(SESSION_COOKIE_NAME);
    setHasSession(false);
  };

  return (
    <SessionContext.Provider value={{ setSessionCookie, clearSessionCookie, hasSession }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const context = useContext(SessionContext);
  if (context === undefined) {
    throw new Error('useSession must be used within a SessionProvider');
  }
  return context;
}