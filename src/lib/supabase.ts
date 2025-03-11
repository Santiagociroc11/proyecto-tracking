import { createClient } from '@supabase/supabase-js';
import { diagnostics } from './diagnostics';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  const error = 'Missing Supabase environment variables';
  diagnostics.error('Supabase', error, {
    VITE_SUPABASE_URL: !!supabaseUrl,
    VITE_SUPABASE_ANON_KEY: !!supabaseAnonKey
  });
  throw new Error(error);
}

diagnostics.info('Supabase', 'Initializing Supabase client', { url: supabaseUrl });

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false
  }
});

// Add error handling for failed requests
supabase.handleError = (error: any) => {
  diagnostics.error('Supabase', 'Request error', error);
  return error;
};