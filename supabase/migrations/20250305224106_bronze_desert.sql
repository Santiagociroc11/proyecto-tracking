/*
  # Sistema de gestión de suscripciones

  1. Nuevas Tablas
    - `subscription_status_history`
      - Registro histórico de cambios de estado de suscripciones
      - Permite auditoría y análisis de cambios
    
  2. Modificaciones
    - Tabla `subscriptions`: nuevos campos y estados
    - Tabla `users`: campos para notificaciones
    
  3. Funciones
    - Funciones para manejo de estados
    - Triggers para histórico y notificaciones
    
  4. Políticas
    - RLS para nuevas tablas
    - Actualización de políticas existentes
*/

-- Modificar la tabla de suscripciones para soportar más estados
ALTER TABLE subscriptions
ADD COLUMN IF NOT EXISTS status_reason text,
ADD COLUMN IF NOT EXISTS grace_period_ends_at timestamptz,
ADD COLUMN IF NOT EXISTS last_payment_date timestamptz,
ADD COLUMN IF NOT EXISTS next_payment_date timestamptz,
ADD COLUMN IF NOT EXISTS payment_method jsonb,
ADD COLUMN IF NOT EXISTS cancellation_date timestamptz,
ADD COLUMN IF NOT EXISTS cancellation_reason text,
ADD COLUMN IF NOT EXISTS auto_renew boolean DEFAULT true;

-- Crear tipo ENUM para estados de suscripción
DO $$ BEGIN
  CREATE TYPE subscription_status AS ENUM (
    'active',
    'expired',
    'payment_pending',
    'cancelled',
    'grace_period'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Modificar columna status para usar el ENUM
ALTER TABLE subscriptions 
ALTER COLUMN status TYPE subscription_status 
USING status::subscription_status;

-- Tabla para historial de estados de suscripción
CREATE TABLE IF NOT EXISTS subscription_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES subscriptions(id),
  previous_status subscription_status,
  new_status subscription_status NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  reason text,
  metadata jsonb
);

-- Modificar tabla de usuarios para preferencias de notificación
ALTER TABLE users
ADD COLUMN IF NOT EXISTS notification_preferences jsonb DEFAULT '{"email": true, "in_app": true}'::jsonb,
ADD COLUMN IF NOT EXISTS last_notification_sent timestamptz;

-- Función para actualizar estado de suscripción
CREATE OR REPLACE FUNCTION update_subscription_status(
  p_subscription_id uuid,
  p_new_status subscription_status,
  p_reason text DEFAULT NULL,
  p_metadata jsonb DEFAULT NULL
)
RETURNS void AS $$
DECLARE
  v_previous_status subscription_status;
BEGIN
  -- Obtener estado actual
  SELECT status INTO v_previous_status
  FROM subscriptions
  WHERE id = p_subscription_id;

  -- Actualizar estado
  UPDATE subscriptions
  SET 
    status = p_new_status,
    status_reason = p_reason,
    updated_at = now()
  WHERE id = p_subscription_id;

  -- Registrar en historial
  INSERT INTO subscription_status_history
  (subscription_id, previous_status, new_status, reason, metadata)
  VALUES
  (p_subscription_id, v_previous_status, p_new_status, p_reason, p_metadata);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger para manejar períodos de gracia
CREATE OR REPLACE FUNCTION handle_grace_period()
RETURNS trigger AS $$
BEGIN
  -- Si la suscripción expira y tiene derecho a período de gracia
  IF NEW.status = 'expired' AND OLD.status = 'active' THEN
    -- Dar 7 días de gracia
    NEW.status := 'grace_period';
    NEW.grace_period_ends_at := now() + interval '7 days';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER subscription_grace_period
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION handle_grace_period();

-- Políticas de seguridad

-- RLS para historial de estados
ALTER TABLE subscription_status_history ENABLE ROW LEVEL SECURITY;

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

-- Actualizar política de suscripciones para nuevos campos
DROP POLICY IF EXISTS "Users can read own subscriptions" ON subscriptions;

CREATE POLICY "Users can read own subscriptions"
  ON subscriptions
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Índices para mejor rendimiento
CREATE INDEX IF NOT EXISTS idx_subscription_status_history_subscription_id
  ON subscription_status_history(subscription_id);

CREATE INDEX IF NOT EXISTS idx_subscriptions_status
  ON subscriptions(status);

CREATE INDEX IF NOT EXISTS idx_subscriptions_next_payment
  ON subscriptions(next_payment_date);