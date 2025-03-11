import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { diagnostics } from '../lib/diagnostics';

interface User {
  id: string;
  email: string;
  role: string;
  active: boolean;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => void;
  isActive: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    diagnostics.info('Auth', 'Initializing AuthProvider');
    try {
      const storedUser = localStorage.getItem('user');
      if (storedUser) {
        const userData = JSON.parse(storedUser);
        if (userData && userData.id && userData.email) {
          diagnostics.info('Auth', 'Restored user from localStorage', { userId: userData.id });
          setUser(userData);
          setIsActive(userData.active);
        } else {
          diagnostics.warn('Auth', 'Invalid stored user data, clearing');
          localStorage.removeItem('user');
        }
      } else {
        diagnostics.info('Auth', 'No stored user found');
      }
    } catch (error) {
      diagnostics.error('Auth', 'Error loading stored user', error);
      localStorage.removeItem('user');
    } finally {
      setLoading(false);
    }
  }, []);

  const signIn = async (email: string, password: string) => {
    diagnostics.info('Auth', 'Attempting sign in', { email });
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('email', email)
        .eq('password', password)
        .single();

      if (error) {
        diagnostics.error('Auth', 'Sign in error', error);
        throw new Error('Credenciales inválidas');
      }

      if (!data) {
        diagnostics.warn('Auth', 'No user found with credentials');
        throw new Error('Credenciales inválidas');
      }

      if (!data.active) {
        diagnostics.warn('Auth', 'Inactive user attempted login', { userId: data.id });
        throw new Error('Usuario inactivo');
      }

      const userData = {
        id: data.id,
        email: data.email,
        role: data.role,
        active: data.active
      };

      diagnostics.info('Auth', 'Sign in successful', { userId: userData.id, role: userData.role });
      setUser(userData);
      setIsActive(data.active);
      localStorage.setItem('user', JSON.stringify(userData));
    } catch (error) {
      diagnostics.error('Auth', 'Sign in process failed', error);
      throw error;
    }
  };

  const signUp = async (email: string, password: string) => {
    diagnostics.info('Auth', 'Attempting sign up', { email });
    try {
      // Generate UUID for the new user
      const userId = crypto.randomUUID();

      const { error: insertError } = await supabase
        .from('users')
        .insert([{
          id: userId,
          email,
          password,
          active: true,
          role: 'user',
          max_monthly_events: 100,
          max_products: 2,
          events_count: 0
        }]);

      if (insertError) {
        diagnostics.error('Auth', 'Error creating user', insertError);
        if (insertError.code === '23505') { // Unique constraint violation
          throw new Error('El email ya está registrado');
        }
        throw insertError;
      }

      // Fetch the newly created user
      const { data: userData, error: fetchError } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (fetchError || !userData) {
        diagnostics.error('Auth', 'Error fetching new user', fetchError);
        throw new Error('Error al crear el usuario');
      }

      const user = {
        id: userData.id,
        email: userData.email,
        role: userData.role,
        active: userData.active
      };

      diagnostics.info('Auth', 'Sign up successful', { userId: user.id });
      setUser(user);
      setIsActive(true);
      localStorage.setItem('user', JSON.stringify(user));

      // Create default user settings
      await supabase
        .from('user_settings')
        .insert([{
          user_id: userId,
          timezone: 'UTC',
          notification_preferences: {
            email: true,
            in_app: true
          }
        }]);

    } catch (error) {
      diagnostics.error('Auth', 'Sign up process failed', error);
      throw error;
    }
  };

  const signOut = () => {
    diagnostics.info('Auth', 'Signing out', { userId: user?.id });
    setUser(null);
    setIsActive(false);
    localStorage.removeItem('user');
  };

  const value = {
    user,
    loading,
    signIn,
    signUp,
    signOut,
    isActive
  };

  return (
    <AuthContext.Provider value={value}>
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