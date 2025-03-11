import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

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
    // Check if user is stored in localStorage
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        const userData = JSON.parse(storedUser);
        setUser(userData);
        setIsActive(userData.active);
      } catch (error) {
        console.error('Error parsing stored user:', error);
        localStorage.removeItem('user');
      }
    }
    setLoading(false);
  }, []);

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .eq('password', password)
      .single();

    if (error || !data) {
      throw new Error('Credenciales inválidas');
    }

    if (!data.active) {
      throw new Error('Usuario inactivo');
    }

    const userData = {
      id: data.id,
      email: data.email,
      role: data.role,
      active: data.active
    };

    setUser(userData);
    setIsActive(data.active);
    localStorage.setItem('user', JSON.stringify(userData));
  };

  const signUp = async (email: string, password: string) => {
    // Check if email already exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .single();

    if (existingUser) {
      throw new Error('El email ya está registrado');
    }

    // Create new user
    const { data, error } = await supabase
      .from('users')
      .insert([{
        email,
        password,
        active: true,
        role: 'user',
        max_monthly_events: 100,
        max_products: 2,
        events_count: 0
      }])
      .select()
      .single();

    if (error) throw error;

    const userData = {
      id: data.id,
      email: data.email,
      role: data.role,
      active: data.active
    };

    setUser(userData);
    setIsActive(true);
    localStorage.setItem('user', JSON.stringify(userData));
  };

  const signOut = () => {
    setUser(null);
    setIsActive(false);
    localStorage.removeItem('user');
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