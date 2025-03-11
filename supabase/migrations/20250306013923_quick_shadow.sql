/*
  # Remove RLS from all tables
  
  1. Changes
    - Disable RLS on all tables
    - Remove all existing policies
*/

-- Disable RLS and remove policies from products
ALTER TABLE products DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage own products" ON products;

-- Disable RLS and remove policies from tracking_events
ALTER TABLE tracking_events DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can insert events for active products" ON tracking_events;
DROP POLICY IF EXISTS "Users can read own product events" ON tracking_events;

-- Disable RLS and remove policies from users
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can read own data" ON users;
DROP POLICY IF EXISTS "Admins can update all data" ON users;

-- Disable RLS and remove policies from user_settings
ALTER TABLE user_settings DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can insert own settings" ON user_settings;
DROP POLICY IF EXISTS "Users can read own settings" ON user_settings;
DROP POLICY IF EXISTS "Users can update own settings" ON user_settings;