/*
  # Agregar configuración de Facebook para productos

  1. Nuevos Campos
    - Agregar campos para configuración de Facebook en la tabla products:
      - fb_pixel_id (text)
      - fb_access_token (text)
      - fb_test_event_code (text, opcional)

  2. Seguridad
    - Mantener RLS existente
    - Asegurar que los tokens sean accesibles solo por el dueño del producto
*/

ALTER TABLE products
ADD COLUMN IF NOT EXISTS fb_pixel_id text,
ADD COLUMN IF NOT EXISTS fb_access_token text,
ADD COLUMN IF NOT EXISTS fb_test_event_code text;

-- Índice para búsqueda por pixel_id
CREATE INDEX IF NOT EXISTS idx_products_fb_pixel
ON products (fb_pixel_id);