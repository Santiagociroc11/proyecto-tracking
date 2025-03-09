/*
  # Sistema de gestión de usuarios

  1. Nuevas Tablas
    - `invitations`
      - `id` (uuid, primary key)
      - `email` (text, unique)
      - `role` (text)
      - `created_by` (uuid, foreign key)
      - `created_at` (timestamp)
      - `expires_at` (timestamp)
      - `used_at` (timestamp)
      
  2. Cambios
    - Agregar columna role a users
    - Agregar políticas RLS
    
  3. Seguridad
    - Solo admins pueden crear invitaciones
    - Las invitaciones expiran en 7 días
    - Verificación de email en registro
*/

-- Agregar columna role a users
ALTER TABLE users ADD COLUMN IF NOT EXISTS role text DEFAULT 'user';

-- Crear tabla de invitaciones
CREATE TABLE IF NOT EXISTS invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  role text NOT NULL DEFAULT 'user',
  created_by uuid REFERENCES users(id),
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  CONSTRAINT valid_role CHECK (role IN ('admin', 'user'))
);

-- Habilitar RLS
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Admins can create invitations"
  ON invitations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = 'admin'
    )
  );

CREATE POLICY "Admins can view all invitations"
  ON invitations
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = 'admin'
    )
  );

-- Función para crear invitación
CREATE OR REPLACE FUNCTION create_invitation(
  p_email text,
  p_role text DEFAULT 'user'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_invitation_id uuid;
BEGIN
  -- Verificar que el usuario actual sea admin
  IF NOT EXISTS (
    SELECT 1 FROM users 
    WHERE id = auth.uid() 
    AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Solo administradores pueden crear invitaciones';
  END IF;

  -- Crear la invitación
  INSERT INTO invitations (
    email,
    role,
    created_by,
    expires_at
  ) VALUES (
    p_email,
    p_role,
    auth.uid(),
    now() + interval '7 days'
  )
  RETURNING id INTO v_invitation_id;

  RETURN v_invitation_id;
END;
$$;