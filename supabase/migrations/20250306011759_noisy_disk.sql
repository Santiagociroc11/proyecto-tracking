/*
  # Set up admin functionality and roles

  1. Changes
    - Add role column to users table if not exists
    - Create function to create admin user
    - Add RLS policies for admin access
    - Add function to check if user is admin

  2. Security
    - Enable RLS on users table
    - Add policies for admin and regular users
    - Secure role management
*/

-- Ensure role column exists and has proper constraint
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'role'
  ) THEN
    ALTER TABLE users ADD COLUMN role text DEFAULT 'user';
    ALTER TABLE users ADD CONSTRAINT valid_role CHECK (role IN ('admin', 'user'));
  END IF;
END $$;

-- Function to create admin user
CREATE OR REPLACE FUNCTION create_admin_user(
  p_email text,
  p_password text,
  p_max_monthly_events integer DEFAULT 10000
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_user json;
BEGIN
  -- Create auth user
  v_user := auth.sign_up(p_email, p_password)::json;
  v_user_id := (v_user->>'id')::uuid;

  -- Create user record with admin role
  INSERT INTO public.users (
    id,
    role,
    active,
    max_monthly_events,
    events_count,
    created_at
  ) VALUES (
    v_user_id,
    'admin',
    true,
    p_max_monthly_events,
    0,
    now()
  );

  RETURN json_build_object(
    'user_id', v_user_id,
    'email', p_email,
    'role', 'admin'
  );
END;
$$;

-- Function to check if user is admin
CREATE OR REPLACE FUNCTION is_admin(user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM users 
    WHERE id = user_id 
    AND role = 'admin' 
    AND active = true
  );
$$;

-- Update RLS policies
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can read own data" ON users;
DROP POLICY IF EXISTS "Admins can read all data" ON users;
DROP POLICY IF EXISTS "Admins can update all data" ON users;

-- Create new policies
CREATE POLICY "Users can read own data"
  ON users
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id OR is_admin(auth.uid()));

CREATE POLICY "Admins can update all data"
  ON users
  FOR UPDATE
  TO authenticated
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

-- Function to create paid user (for admin use)
CREATE OR REPLACE FUNCTION create_paid_user(
  p_email text,
  p_password text,
  p_max_monthly_events integer DEFAULT 10000
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_user json;
BEGIN
  -- Verify caller is admin
  IF NOT (SELECT is_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Only admins can create paid users';
  END IF;

  -- Create auth user
  v_user := auth.sign_up(p_email, p_password)::json;
  v_user_id := (v_user->>'id')::uuid;

  -- Create user record
  INSERT INTO public.users (
    id,
    role,
    active,
    max_monthly_events,
    events_count,
    created_at
  ) VALUES (
    v_user_id,
    'user',
    true,
    p_max_monthly_events,
    0,
    now()
  );

  RETURN json_build_object(
    'user_id', v_user_id,
    'email', p_email,
    'role', 'user',
    'max_monthly_events', p_max_monthly_events
  );
END;
$$;