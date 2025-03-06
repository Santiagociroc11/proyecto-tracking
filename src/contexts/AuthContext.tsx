import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { User } from '@supabase/supabase-js';

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

  useEffect(() => {
    // Check active sessions and sets the user
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user);
        checkUserStatus(session.user.id);
      }
      setLoading(false);
    });

    // Listen for changes on auth state
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser(session.user);
        checkUserStatus(session.user.id);
      } else {
        setUser(null);
        setIsActive(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

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

    // Create user record in users table
    if (data.user) {
      const { error: userError } = await supabase
        .from('users')
        .insert([{ 
          id: data.user.id,
          active: true,
          max_monthly_events: 10000,
          events_count: 0
        }]);

      if (userError) {
        await supabase.auth.signOut();
        throw userError;
      }
    }
  };

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;

    if (data.user) {
      // Check if user is active
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('active')
        .eq('id', data.user.id)
        .single();

      if (userError || !userData?.active) {
        await signOut();
        throw new Error('Usuario inactivo. Por favor contacta al soporte.');
      }
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setIsActive(false);
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