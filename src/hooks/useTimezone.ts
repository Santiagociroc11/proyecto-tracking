import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

export function useTimezone() {
  const { user } = useAuth();
  const [timezone, setTimezone] = useState('UTC');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadTimezone() {
      try {
        if (!user) {
          setLoading(false);
          return;
        }

        const { data, error } = await supabase
          .from('user_settings')
          .select('timezone')
          .eq('user_id', user.id)
          .maybeSingle();

        if (!error && data) {
          setTimezone(data.timezone);
        }
      } catch (err) {
        console.error('Error loading timezone:', err);
      } finally {
        setLoading(false);
      }
    }

    loadTimezone();
  }, [user]);

  return { timezone, loading };
}