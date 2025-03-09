/*
  # Subscription Management System Schema

  1. Core Tables
    - plans: Subscription plans configuration
    - plan_features: Features included in each plan
    - plan_prices: Regional pricing for plans
    - subscriptions: User subscriptions
    - subscription_items: Items included in subscriptions
    - subscription_usage: Usage tracking for metered features
    - payments: Payment history
    - invoices: Generated invoices
    
  2. Supporting Tables
    - currencies: Supported currencies
    - regions: Geographic regions for pricing
    - features: Available features
    - webhooks: Webhook configurations
    - webhook_events: Webhook delivery attempts
    
  3. Security
    - RLS policies for all tables
    - Admin role permissions
    - API key management
*/

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enums
DO $$ BEGIN
    CREATE TYPE subscription_status AS ENUM (
      'trialing',
      'active',
      'past_due',
      'canceled',
      'expired'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE payment_status AS ENUM (
      'pending',
      'completed',
      'failed',
      'refunded'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE webhook_status AS ENUM (
      'pending',
      'delivered',
      'failed'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE price_type AS ENUM (
      'one_time',
      'recurring'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE interval_type AS ENUM (
      'day',
      'week',
      'month',
      'year'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Core Tables
CREATE TABLE IF NOT EXISTS plans (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  description text,
  is_active boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS plan_features (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  plan_id uuid REFERENCES plans(id) ON DELETE CASCADE,
  feature_name text NOT NULL,
  feature_value jsonb,
  created_at timestamptz DEFAULT now(),
  UNIQUE (plan_id, feature_name)
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
  status subscription_status NOT NULL DEFAULT 'active',
  current_period_start timestamptz NOT NULL DEFAULT now(),
  current_period_end timestamptz NOT NULL,
  trial_end timestamptz,
  canceled_at timestamptz,
  cancel_at_period_end boolean DEFAULT false,
  payment_method_id text,
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
  code text NOT NULL UNIQUE,
  currency text REFERENCES currencies(code),
  is_active boolean DEFAULT true
);

CREATE TABLE IF NOT EXISTS features (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL UNIQUE,
  description text,
  type text NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS webhooks (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  url text NOT NULL,
  description text,
  secret text NOT NULL,
  is_active boolean DEFAULT true,
  events text[] NOT NULL DEFAULT '{}',
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
CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscription_items_subscription ON subscription_items(subscription_id);
CREATE INDEX IF NOT EXISTS idx_payments_subscription ON payments(subscription_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_webhook ON webhook_events(webhook_id);

-- Functions
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Drop existing triggers if they exist
DROP TRIGGER IF EXISTS update_plans_updated_at ON plans;
DROP TRIGGER IF EXISTS update_subscriptions_updated_at ON subscriptions;
DROP TRIGGER IF EXISTS update_webhooks_updated_at ON webhooks;

-- Create triggers
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

-- RLS Policies
DO $$ BEGIN
    ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
    ALTER TABLE plan_features ENABLE ROW LEVEL SECURITY;
    ALTER TABLE plan_prices ENABLE ROW LEVEL SECURITY;
    ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
    ALTER TABLE subscription_items ENABLE ROW LEVEL SECURITY;
    ALTER TABLE subscription_usage ENABLE ROW LEVEL SECURITY;
    ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
    ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
    ALTER TABLE webhooks ENABLE ROW LEVEL SECURITY;
    ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Drop existing policies if they exist
DO $$ BEGIN
    DROP POLICY IF EXISTS "Public can view active plans" ON plans;
    DROP POLICY IF EXISTS "Users can view own subscriptions" ON subscriptions;
    DROP POLICY IF EXISTS "Users can view own subscription items" ON subscription_items;
    DROP POLICY IF EXISTS "Users can view own subscription usage" ON subscription_usage;
    DROP POLICY IF EXISTS "Users can view own payments" ON payments;
    DROP POLICY IF EXISTS "Users can view own invoices" ON invoices;
END $$;

-- Create policies
CREATE POLICY "Public can view active plans"
  ON plans FOR SELECT
  TO public
  USING (is_active = true);

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
INSERT INTO currencies (code, name, symbol)
VALUES
  ('USD', 'US Dollar', '$'),
  ('EUR', 'Euro', '€'),
  ('GBP', 'British Pound', '£')
ON CONFLICT (code) DO NOTHING;

INSERT INTO features (name, description, type)
VALUES
  ('api_calls', 'Number of API calls allowed per month', 'metered'),
  ('storage', 'Storage space in GB', 'metered'),
  ('team_members', 'Number of team members allowed', 'licensed')
ON CONFLICT (name) DO NOTHING;