/*
  # Fix product security and access control

  1. Changes
    - Update RLS policies for products table
    - Update RLS policies for tracking_events table
    - Ensure users can only see their own data

  2. Security
    - Enable RLS on all tables
    - Strict policies for data access
    - Admins can view all data
    - Regular users can only view their own data
*/

-- Drop existing policies to recreate them
DROP POLICY IF EXISTS "Users can insert own products" ON products;
DROP POLICY IF EXISTS "Users can read own products" ON products;

-- Create new policies for products
CREATE POLICY "Users can manage own products"
ON products
FOR ALL
TO authenticated
USING (
  user_id = auth.uid() OR 
  EXISTS (
    SELECT 1 FROM users 
    WHERE users.id = auth.uid() 
    AND users.role = 'admin'
  )
)
WITH CHECK (
  user_id = auth.uid() OR 
  EXISTS (
    SELECT 1 FROM users 
    WHERE users.id = auth.uid() 
    AND users.role = 'admin'
  )
);

-- Drop existing policies for tracking_events
DROP POLICY IF EXISTS "Public can insert events for active products" ON tracking_events;
DROP POLICY IF EXISTS "Users can read own product events" ON tracking_events;

-- Create new policies for tracking_events
CREATE POLICY "Public can insert events for active products"
ON tracking_events
FOR INSERT
TO public
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM products p
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
    SELECT 1
    FROM products
    WHERE products.id = tracking_events.product_id
    AND (
      products.user_id = auth.uid() OR
      EXISTS (
        SELECT 1 FROM users
        WHERE users.id = auth.uid()
        AND users.role = 'admin'
      )
    )
  )
);

-- Ensure RLS is enabled
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE tracking_events ENABLE ROW LEVEL SECURITY;