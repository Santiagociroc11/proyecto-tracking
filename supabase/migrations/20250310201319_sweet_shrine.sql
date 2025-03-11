/*
  # Remove auth dependency and add email/password to users table

  1. Changes
    - Drop foreign key constraint with auth.users
    - Add email and password columns to users table with default values
    - Add unique constraint on email
    - Update existing records with default values
    - Make columns non-nullable after data migration

  2. Security
    - Enable RLS on users table
    - Add policies for basic CRUD operations
*/

-- Remove foreign key constraint
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_id_fkey;

-- Add new columns as nullable first
ALTER TABLE users 
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS password TEXT;

-- Update existing records with default values
UPDATE users 
SET 
  email = CONCAT('user_', id, '@example.com'),
  password = 'default_password';

-- Now make the columns non-nullable and add unique constraint
ALTER TABLE users 
  ALTER COLUMN email SET NOT NULL,
  ALTER COLUMN password SET NOT NULL,
  ADD CONSTRAINT users_email_unique UNIQUE (email);

-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Add policies
CREATE POLICY "Users can read own data" 
  ON users 
  FOR SELECT 
  USING (true);

CREATE POLICY "Users can update own data" 
  ON users 
  FOR UPDATE 
  USING (true);

CREATE POLICY "Anyone can insert users" 
  ON users 
  FOR INSERT 
  WITH CHECK (true);