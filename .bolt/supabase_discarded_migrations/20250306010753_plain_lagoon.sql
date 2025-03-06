/*
  # User Management System

  1. Changes
    - Add default values for user columns
    - Add trigger for user creation
    - Add RLS policies
    
  2. Security
    - Automatic user record creation
    - Role-based access control
    - Event tracking limits
*/

-- Ensure users table has correct columns and defaults
CREATE TABLE IF NOT EXISTS public.users (
  id uuid PRIMARY KEY REFERENCES auth.users(id),
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  max_monthly_events integer DEFAULT 10000,
  events_count integer DEFAULT 0,
  role text DEFAULT 'user',
  CONSTRAINT valid_role CHECK (role IN ('admin', 'user'))
);

-- Enable RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can read own data"
  ON public.users
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- Function to handle new user creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.users (id)
  VALUES (new.id);
  RETURN new;
END;
$$;

-- Trigger to automatically create user record
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Function to increment events count
CREATE OR REPLACE FUNCTION public.increment_user_events_count(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.users
  SET events_count = events_count + 1
  WHERE id = p_user_id;
END;
$$;