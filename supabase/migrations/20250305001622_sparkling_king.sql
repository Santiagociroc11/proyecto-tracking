/*
  # Tracking Platform Schema

  1. New Tables
    - `users`
      - `id` (uuid, primary key) - Maps to auth.users
      - `active` (boolean) - User status
      - `created_at` (timestamp)
    
    - `products`
      - `id` (uuid, primary key)
      - `user_id` (uuid) - References users.id
      - `name` (text) - Product name
      - `tracking_id` (text) - Unique tracking ID
      - `active` (boolean) - Product status
      - `created_at` (timestamp)
    
    - `tracking_events`
      - `id` (uuid, primary key)
      - `product_id` (uuid) - References products.id
      - `event_data` (jsonb) - Event payload
      - `created_at` (timestamp)

  2. Security
    - Enable RLS on all tables
    - Users can only read/write their own data
    - Public can write to tracking_events but only if product is active
*/

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY REFERENCES auth.users,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own data"
  ON users
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- Products table
CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) NOT NULL,
  name text NOT NULL,
  tracking_id text UNIQUE NOT NULL,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own products"
  ON products
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own products"
  ON products
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Tracking events table
CREATE TABLE IF NOT EXISTS tracking_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES products(id) NOT NULL,
  event_data jsonb NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE tracking_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can insert events for active products"
  ON tracking_events
  FOR INSERT
  TO public
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM products p
      JOIN users u ON u.id = p.user_id
      WHERE p.id = tracking_events.product_id
      AND p.active = true
      AND u.active = true
    )
  );

CREATE POLICY "Users can read own product events"
  ON tracking_events
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM products
      WHERE products.id = tracking_events.product_id
      AND products.user_id = auth.uid()
    )
  );