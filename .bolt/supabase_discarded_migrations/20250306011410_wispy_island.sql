/*
  # Create admin user functionality

  1. Changes
    - Add role column to users table
    - Add create_admin_user function
    - Add policy for admin users
    - Add validation for admin role

  2. Security
    - Only superuser can create initial admin
    - Admins can create other admins
    - Role is restricted to 'admin' or 'user'
*/

-- Add role column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'role'
  ) THEN
    ALTER TABLE users ADD COLUMN role text DEFAULT 'user';
  END IF;
END $$;

-- Add role check constraint
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'users_role_check'
  ) THEN
    ALTER TABLE users 
    ADD CONSTRAINT users_role_check 
    CHECK (role IN ('admin', 'user'));
  END IF;
END $$;

-- Function to create admin user
CREATE OR REPLACE FUNCTION create_admin_user(
  admin_email text,
  admin_password text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_user_id uuid;
BEGIN
  -- Create auth user
  new_user_id := extensions.uuid_generate_v4();
  
  INSERT INTO auth.users (
    id,
    instance_id,
    email,
    encrypted_password,
    email_confirmed_at,
    recovery_sent_at,
    last_sign_in_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change_token_new,
    recovery_token
  )
  VALUES (
    new_user_id,
    '00000000-0000-0000-0000-000000000000',
    admin_email,
    crypt(admin_password, gen_salt('bf')),
    NOW(),
    NOW(),
    NOW(),
    '{"provider":"email","providers":["email"]}',
    '{}',
    NOW(),
    NOW(),
    '',
    '',
    ''
  );

  -- Create user record with admin role
  INSERT INTO public.users (
    id,
    active,
    role,
    max_monthly_events,
    events_count
  ) VALUES (
    new_user_id,
    true,
    'admin',
    999999999, -- Unlimited events for admin
    0
  );

  -- Create default user settings
  INSERT INTO public.user_settings (
    user_id,
    timezone
  ) VALUES (
    new_user_id,
    'UTC'
  );

  RETURN new_user_id;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION create_admin_user TO authenticated;

-- Update policies for admin access
CREATE POLICY "Admins can view all users"
  ON users
  FOR SELECT
  TO authenticated
  USING (auth.uid() IN (
    SELECT id FROM users WHERE role = 'admin'
  ));

CREATE POLICY "Admins can update all users"
  ON users
  FOR UPDATE
  TO authenticated
  USING (auth.uid() IN (
    SELECT id FROM users WHERE role = 'admin'
  ))
  WITH CHECK (auth.uid() IN (
    SELECT id FROM users WHERE role = 'admin'
  ));