/*
  # Admin User Management System

  1. Schema Updates
    - Adds role column to users table
    - Adds role validation constraint
    - Enables RLS on users table

  2. Functions
    - is_admin: Checks if a user has admin privileges
    - create_paid_user: Allows admins to create new users

  3. Security
    - Implements RLS policies for user access control
    - Sets up admin-specific permissions
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

-- Function to check if user is admin
CREATE OR REPLACE FUNCTION is_admin(user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM users 
    WHERE id = user_id 
    AND role = 'admin' 
    AND active = true
  );
$$;

-- Function to create paid user (for admin use)
CREATE OR REPLACE FUNCTION create_paid_user(
  p_email text,
  p_password text,
  p_max_monthly_events integer DEFAULT 10000
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  -- Verify caller is admin
  IF NOT (SELECT is_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Only admins can create paid users';
  END IF;

  -- Create auth user through Supabase
  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    created_at,
    updated_at,
    confirmation_token,
    email_change_token_new,
    recovery_token
  )
  VALUES (
    '00000000-0000-0000-0000-000000000000',
    gen_random_uuid(),
    'authenticated',
    'authenticated',
    p_email,
    crypt(p_password, gen_salt('bf')),
    now(),
    now(),
    now(),
    encode(gen_random_bytes(32), 'hex'),
    encode(gen_random_bytes(32), 'hex'),
    encode(gen_random_bytes(32), 'hex')
  )
  RETURNING id INTO v_user_id;

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

-- Enable RLS on users table
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can read own data" ON users;
DROP POLICY IF EXISTS "Admins can update all data" ON users;

-- Create new policies with fixed syntax
CREATE POLICY "Users can read own data" ON users
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR is_admin(auth.uid()));

CREATE POLICY "Admins can update all data" ON users
  FOR UPDATE TO authenticated
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

-- Create initial admin user if none exists
DO $$
DECLARE
  v_count int;
BEGIN
  SELECT COUNT(*) INTO v_count FROM users WHERE role = 'admin';
  IF v_count = 0 THEN
    UPDATE users 
    SET role = 'admin' 
    WHERE id = (
      SELECT id 
      FROM users 
      WHERE role = 'user' 
      ORDER BY created_at 
      FETCH FIRST 1 ROW ONLY
    );
  END IF;
END $$;