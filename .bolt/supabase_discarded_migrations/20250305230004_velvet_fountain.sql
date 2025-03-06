/*
  # Subscription Management System Schema

  1. Core Tables
    - Plans and pricing
    - Subscriptions and billing
    - Usage tracking
    - Payment processing
    
  2. Supporting Tables
    - Currencies and regions
    - Features and limits
    - Webhooks and events
    
  3. Security
    - RLS policies for data access
    - Secure payment handling
*/

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create updated enum types for subscription management
CREATE TYPE subscription_status AS ENUM (
  'active',
  'expired',
  'payment_pending',
  'cancelled',
  'grace_period'
);

CREATE TYPE payment_status AS ENUM (
  'pending',
  'completed',
  'failed',
  'refunded'
);

CREATE TYPE webhook_status AS ENUM (
  'pending',
  'delivered',
  'failed'
);

CREATE TYPE price_type AS ENUM (
  'one_time',
  'recurring'
);

CREATE TYPE interval_type AS ENUM (
  'day',
  'week',
  'month',
  'year'
);

-- Core Tables
CREATE TABLE IF NOT EXISTS plans (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  description text,
  features jsonb NOT NULL DEFAULT '{}',
  is_active boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  version integer DEFAULT 1,
  archived_at timestamptz
);

CREATE TABLE IF NOT EXISTS plan_prices (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  plan_id uuid REFERENCES plans(id) ON DELETE CASCADE,
  currency text NOT NULL DEFAULT 'USD',
  amount decimal NOT NULL,
  interval_type interval_type NOT NULL DEFAULT 'month',
  interval_count integer NOT NULL DEFAULT 1,
  trial_days integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE (plan_id, currency, interval_type, interval_count)
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id uuid REFERENCES plans(id),
  status subscription_status NOT NULL,
  trial_ends_at timestamptz,
  current_period_ends_at timestamptz,
  grace_period_ends_at timestamptz,
  last_payment_date timestamptz,
  next_payment_date timestamptz,
  payment_method jsonb,
  cancellation_date timestamptz,
  cancellation_reason text,
  auto_renew boolean DEFAULT true,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subscription_items (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  subscription_id uuid REFERENCES subscriptions(id) ON DELETE CASCADE,
  plan_price_id uuid REFERENCES plan_prices(id),
  quantity integer DEFAULT 1,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subscription_usage (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  subscription_id uuid REFERENCES subscriptions(id) ON DELETE CASCADE,
  feature_name text NOT NULL,
  used_quantity integer DEFAULT 0,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (subscription_id, feature_name, period_start)
);

CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  subscription_id uuid REFERENCES subscriptions(id) ON DELETE SET NULL,
  amount decimal NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  status payment_status NOT NULL,
  provider text NOT NULL,
  provider_payment_id text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  subscription_id uuid REFERENCES subscriptions(id) ON DELETE SET NULL,
  amount decimal NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  status payment_status NOT NULL DEFAULT 'pending',
  due_date timestamptz NOT NULL,
  paid_at timestamptz,
  items jsonb NOT NULL DEFAULT '[]',
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- Supporting Tables
CREATE TABLE IF NOT EXISTS currencies (
  code text PRIMARY KEY,
  name text NOT NULL,
  symbol text NOT NULL,
  is_active boolean DEFAULT true
);

CREATE TABLE IF NOT EXISTS regions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  code text UNIQUE NOT NULL,
  currency text REFERENCES currencies(code),
  is_active boolean DEFAULT true
);

CREATE TABLE IF NOT EXISTS subscription_status_history (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  subscription_id uuid REFERENCES subscriptions(id) ON DELETE CASCADE,
  previous_status subscription_status,
  new_status subscription_status NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  reason text,
  metadata jsonb DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS webhooks (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  url text NOT NULL,
  description text,
  secret text NOT NULL,
  is_active boolean DEFAULT true,
  events text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS webhook_events (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  webhook_id uuid REFERENCES webhooks(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  status webhook_status NOT NULL DEFAULT 'pending',
  attempts integer DEFAULT 0,
  last_attempt_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX idx_subscriptions_user ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
CREATE INDEX idx_subscriptions_next_payment ON subscriptions(next_payment_date);
CREATE INDEX idx_subscriptions_user_status ON subscriptions(user_id, status);
CREATE INDEX idx_subscription_items_subscription ON subscription_items(subscription_id);
CREATE INDEX idx_subscription_history_subscription ON subscription_status_history(subscription_id);
CREATE INDEX idx_payments_subscription ON payments(subscription_id);
CREATE INDEX idx_webhook_events_webhook ON webhook_events(webhook_id);

-- Functions
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE OR REPLACE FUNCTION handle_subscription_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status) THEN
    INSERT INTO subscription_status_history (
      subscription_id,
      previous_status,
      new_status,
      changed_at,
      reason,
      metadata
    ) VALUES (
      NEW.id,
      OLD.status,
      NEW.status,
      now(),
      NEW.status_reason,
      jsonb_build_object(
        'trial_ends_at', NEW.trial_ends_at,
        'current_period_ends_at', NEW.current_period_ends_at,
        'grace_period_ends_at', NEW.grace_period_ends_at
      )
    );
  END IF;
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers
CREATE TRIGGER update_plans_updated_at
  BEFORE UPDATE ON plans
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_webhooks_updated_at
  BEFORE UPDATE ON webhooks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER track_subscription_status_changes
  AFTER UPDATE ON subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION handle_subscription_status_change();

-- RLS Policies
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;

-- Plans policies
CREATE POLICY "Public can view active plans"
  ON plans FOR SELECT
  TO public
  USING (is_active = true);

-- Subscriptions policies
CREATE POLICY "Users can view own subscriptions"
  ON subscriptions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can view own subscription items"
  ON subscription_items FOR SELECT
  TO authenticated
  USING (subscription_id IN (
    SELECT id FROM subscriptions WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can view own subscription usage"
  ON subscription_usage FOR SELECT
  TO authenticated
  USING (subscription_id IN (
    SELECT id FROM subscriptions WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can view their own subscription history"
  ON subscription_status_history FOR SELECT
  TO authenticated
  USING (subscription_id IN (
    SELECT id FROM subscriptions WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can view own payments"
  ON payments FOR SELECT
  TO authenticated
  USING (subscription_id IN (
    SELECT id FROM subscriptions WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can view own invoices"
  ON invoices FOR SELECT
  TO authenticated
  USING (subscription_id IN (
    SELECT id FROM subscriptions WHERE user_id = auth.uid()
  ));

-- Initial Data
INSERT INTO currencies (code, name, symbol) VALUES
  ('USD', 'US Dollar', '$'),
  ('EUR', 'Euro', '€'),
  ('GBP', 'British Pound', '£'),
  ('BRL', 'Brazilian Real', 'R$'),
  ('MXN', 'Mexican Peso', '$')
ON CONFLICT (code) DO NOTHING;

-- Initial Plans
INSERT INTO plans (name, description, features, is_active) VALUES
  (
    'Basic',
    'Perfect for getting started',
    '{
      "api_calls": 10000,
      "storage_gb": 10,
      "team_members": 2,
      "features": ["basic_analytics", "email_support"]
    }'::jsonb,
    true
  ),
  (
    'Pro',
    'For growing businesses',
    '{
      "api_calls": 100000,
      "storage_gb": 50,
      "team_members": 5,
      "features": ["advanced_analytics", "priority_support", "api_access"]
    }'::jsonb,
    true
  ),
  (
    'Enterprise',
    'For large organizations',
    '{
      "api_calls": 1000000,
      "storage_gb": 500,
      "team_members": -1,
      "features": ["enterprise_analytics", "dedicated_support", "api_access", "custom_integration"]
    }'::jsonb,
    true
  )
ON CONFLICT (id) DO NOTHING;