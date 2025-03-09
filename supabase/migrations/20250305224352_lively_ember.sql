/*
  # Fix Subscription Schema

  1. Updates
    - Add notification_preferences to user_settings
    - Create subscription status enum type
    - Create subscriptions and history tables
    
  2. Security
    - Enable RLS on new tables
    - Add appropriate policies with existence checks
*/

-- Add notification_preferences to user_settings if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'user_settings' 
    AND column_name = 'notification_preferences'
  ) THEN
    ALTER TABLE user_settings 
    ADD COLUMN notification_preferences jsonb DEFAULT '{"email": true, "in_app": true}'::jsonb;
  END IF;
END $$;

-- Create subscription status enum if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'subscription_status') THEN
    CREATE TYPE subscription_status AS ENUM (
      'active',
      'expired',
      'payment_pending',
      'cancelled',
      'grace_period'
    );
  END IF;
END $$;

-- Create subscriptions table if it doesn't exist
CREATE TABLE IF NOT EXISTS subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  plan text NOT NULL,
  status subscription_status NOT NULL DEFAULT 'active',
  status_reason text,
  trial_ends_at timestamptz,
  current_period_ends_at timestamptz,
  grace_period_ends_at timestamptz,
  last_payment_date timestamptz,
  next_payment_date timestamptz,
  payment_method jsonb,
  cancellation_date timestamptz,
  cancellation_reason text,
  auto_renew boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create subscription history table if it doesn't exist
CREATE TABLE IF NOT EXISTS subscription_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid REFERENCES subscriptions(id) NOT NULL,
  previous_status subscription_status,
  new_status subscription_status NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  reason text,
  metadata jsonb
);

-- Enable RLS on tables if not already enabled
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_status_history ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist and recreate them
DO $$ 
BEGIN
  DROP POLICY IF EXISTS "Users can read own subscriptions" ON subscriptions;
  DROP POLICY IF EXISTS "Users can view their own subscription history" ON subscription_status_history;
END $$;

-- Create new policies
CREATE POLICY "Users can read own subscriptions"
  ON subscriptions
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can view their own subscription history"
  ON subscription_status_history
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM subscriptions s
      WHERE s.id = subscription_status_history.subscription_id
      AND s.user_id = auth.uid()
    )
  );

-- Add useful indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_status 
  ON subscriptions(user_id, status);

CREATE INDEX IF NOT EXISTS idx_subscription_history_subscription 
  ON subscription_status_history(subscription_id);

-- Create or replace function to handle subscription updates
CREATE OR REPLACE FUNCTION update_subscription_status(
  p_subscription_id uuid,
  p_new_status subscription_status,
  p_reason text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_previous_status subscription_status;
BEGIN
  -- Get current status
  SELECT status INTO v_previous_status
  FROM subscriptions
  WHERE id = p_subscription_id;

  -- Update subscription
  UPDATE subscriptions
  SET 
    status = p_new_status,
    status_reason = p_reason,
    updated_at = now()
  WHERE id = p_subscription_id;

  -- Record history
  INSERT INTO subscription_status_history
  (subscription_id, previous_status, new_status, reason)
  VALUES
  (p_subscription_id, v_previous_status, p_new_status, p_reason);
END;
$$;

-- Create or replace function to reactivate subscription
CREATE OR REPLACE FUNCTION reactivate_subscription(
  p_subscription_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM update_subscription_status(
    p_subscription_id := p_subscription_id,
    p_new_status := 'active'::subscription_status,
    p_reason := 'Subscription reactivated'
  );
END;
$$;

-- Create or replace function to renew subscription
CREATE OR REPLACE FUNCTION renew_subscription(
  p_subscription_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE subscriptions
  SET 
    status = 'active',
    current_period_ends_at = now() + interval '1 month',
    updated_at = now()
  WHERE id = p_subscription_id;
  
  PERFORM update_subscription_status(
    p_subscription_id := p_subscription_id,
    p_new_status := 'active'::subscription_status,
    p_reason := 'Subscription renewed'
  );
END;
$$;