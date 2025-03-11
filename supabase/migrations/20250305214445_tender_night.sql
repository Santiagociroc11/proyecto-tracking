/*
  # Add subscription and tracking validation

  1. New Tables
    - `subscriptions`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references users)
      - `plan` (text)
      - `status` (text)
      - `trial_ends_at` (timestamptz)
      - `current_period_ends_at` (timestamptz)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    
    - `tracking_logs`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references users)
      - `product_id` (uuid, references products)
      - `event_type` (text)
      - `status` (text)
      - `error_message` (text)
      - `created_at` (timestamptz)

  2. Changes
    - Add `max_monthly_events` to users table
    - Add `events_count` to users table
    - Add tracking validation functions

  3. Security
    - Enable RLS on new tables
    - Add policies for authenticated users
*/

-- Create subscriptions table
CREATE TABLE IF NOT EXISTS subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) NOT NULL,
  plan text NOT NULL,
  status text NOT NULL,
  trial_ends_at timestamptz,
  current_period_ends_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create tracking_logs table
CREATE TABLE IF NOT EXISTS tracking_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) NOT NULL,
  product_id uuid REFERENCES products(id) NOT NULL,
  event_type text NOT NULL,
  status text NOT NULL,
  error_message text,
  created_at timestamptz DEFAULT now()
);

-- Add new columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS max_monthly_events integer DEFAULT 10000;
ALTER TABLE users ADD COLUMN IF NOT EXISTS events_count integer DEFAULT 0;

-- Enable RLS
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tracking_logs ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can read own subscriptions"
  ON subscriptions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can read own tracking logs"
  ON tracking_logs
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Create function to validate tracking
CREATE OR REPLACE FUNCTION validate_tracking(
  p_user_id uuid,
  p_product_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_record users%ROWTYPE;
  v_subscription subscriptions%ROWTYPE;
  v_result jsonb;
BEGIN
  -- Get user record
  SELECT * INTO v_user_record
  FROM users
  WHERE id = p_user_id;

  -- Check if user exists and is active
  IF v_user_record.id IS NULL THEN
    RETURN jsonb_build_object(
      'valid', false,
      'error', 'User not found'
    );
  END IF;

  IF NOT v_user_record.active THEN
    RETURN jsonb_build_object(
      'valid', false,
      'error', 'User is inactive'
    );
  END IF;

  -- Get latest subscription
  SELECT * INTO v_subscription
  FROM subscriptions
  WHERE user_id = p_user_id
  ORDER BY created_at DESC
  LIMIT 1;

  -- Check subscription status
  IF v_subscription.id IS NULL THEN
    -- No subscription found, check if within trial period
    IF v_user_record.created_at + interval '14 days' > now() THEN
      RETURN jsonb_build_object(
        'valid', true,
        'type', 'trial'
      );
    ELSE
      RETURN jsonb_build_object(
        'valid', false,
        'error', 'No active subscription'
      );
    END IF;
  END IF;

  -- Check subscription status and period
  IF v_subscription.status != 'active' THEN
    RETURN jsonb_build_object(
      'valid', false,
      'error', 'Subscription is not active'
    );
  END IF;

  IF v_subscription.current_period_ends_at < now() THEN
    RETURN jsonb_build_object(
      'valid', false,
      'error', 'Subscription period has ended'
    );
  END IF;

  -- Check monthly event limit
  IF v_user_record.events_count >= v_user_record.max_monthly_events THEN
    RETURN jsonb_build_object(
      'valid', false,
      'error', 'Monthly event limit reached'
    );
  END IF;

  -- All checks passed
  RETURN jsonb_build_object(
    'valid', true,
    'type', 'subscription',
    'plan', v_subscription.plan
  );
END;
$$;

-- Create function to log tracking attempt
CREATE OR REPLACE FUNCTION log_tracking_attempt(
  p_user_id uuid,
  p_product_id uuid,
  p_event_type text,
  p_status text,
  p_error_message text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO tracking_logs (
    user_id,
    product_id,
    event_type,
    status,
    error_message
  ) VALUES (
    p_user_id,
    p_product_id,
    p_event_type,
    p_status,
    p_error_message
  );

  -- Increment events count if successful
  IF p_status = 'success' THEN
    UPDATE users
    SET events_count = events_count + 1
    WHERE id = p_user_id;
  END IF;
END;
$$;

-- Create function to reset monthly event counts
CREATE OR REPLACE FUNCTION reset_monthly_event_counts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE users SET events_count = 0;
END;
$$;