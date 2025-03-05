/*
  # Agregar soporte para tracking de Hotmart

  1. Nueva Tabla
    - hotmart_clicks: Almacena información específica de clicks en enlaces de Hotmart
      - id (uuid, primary key)
      - product_id (uuid, referencia a products)
      - visitor_id (text)
      - url (text)
      - fbc (text)
      - fbp (text)
      - browser_info (jsonb)
      - utm_data (jsonb)
      - timestamp (timestamptz)

  2. Seguridad
    - Habilitar RLS
    - Agregar políticas de acceso
*/

-- Crear tabla para tracking de Hotmart
CREATE TABLE IF NOT EXISTS hotmart_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES products(id) NOT NULL,
  visitor_id text NOT NULL,
  url text NOT NULL,
  fbc text,
  fbp text,
  browser_info jsonb,
  utm_data jsonb,
  timestamp timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE hotmart_clicks ENABLE ROW LEVEL SECURITY;

-- Políticas de seguridad
CREATE POLICY "Users can read own product hotmart clicks"
  ON hotmart_clicks
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM products
      WHERE products.id = hotmart_clicks.product_id
      AND products.user_id = auth.uid()
    )
  );

CREATE POLICY "Public can insert hotmart clicks"
  ON hotmart_clicks
  FOR INSERT
  TO public
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM products p
      JOIN users u ON u.id = p.user_id
      WHERE p.id = hotmart_clicks.product_id
      AND p.active = true
      AND u.active = true
    )
  );

-- Índices para mejor rendimiento
CREATE INDEX IF NOT EXISTS idx_hotmart_clicks_product_visitor
  ON hotmart_clicks (product_id, visitor_id);

CREATE INDEX IF NOT EXISTS idx_hotmart_clicks_timestamp
  ON hotmart_clicks (timestamp);