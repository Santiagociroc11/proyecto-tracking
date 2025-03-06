import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { User } from '@supabase/supabase-js';
import { useSession } from './SessionContext';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  isActive: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isActive, setIsActive] = useState(false);
  const { setSessionCookie, clearSessionCookie, hasSession } = useSession();

  useEffect(() => {
    if (hasSession) {
      // Check active sessions and sets the user
      supabase.auth.getSession().then(({ data: { session } }) => {
        setUser(session?.user ?? null);
        if (session?.user) {
          checkUserStatus(session.user.id);
        }
        setLoading(false);
      });

      // Listen for changes on auth state
      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        setUser(session?.user ?? null);
        if (session?.user) {
          checkUserStatus(session.user.id);
        } else {
          setIsActive(false);
        }
        setLoading(false);
      });

      return () => subscription.unsubscribe();
    } else {
      setUser(null);
      setIsActive(false);
      setLoading(false);
    }
  }, [hasSession]);

  const checkUserStatus = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('active')
        .eq('id', userId)
        .single();

      if (error) throw error;
      setIsActive(data?.active ?? false);

      // If user is inactive, sign them out
      if (!data?.active) {
        await signOut();
      }
    } catch (err) {
      console.error('Error checking user status:', err);
      setIsActive(false);
    }
  };

  const signUp = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });
    if (error) throw error;
    if (data.session?.access_token) {
      setSessionCookie(data.session.access_token);
    }
  };

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
    if (data.session?.access_token) {
      setSessionCookie(data.session.access_token);
    }
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    clearSessionCookie();
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signOut, isActive }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}