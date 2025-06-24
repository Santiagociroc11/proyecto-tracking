import { createClient } from '@supabase/supabase-js';

// NOTA: Estos valores deben estar en tus variables de entorno
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  throw new Error('Supabase URL or Service Role Key is not defined in environment variables.');
}

// Crear un cliente de Supabase con privilegios de administrador
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

export async function handleAdminCreateUser(request: Request) {
  try {
    const { adminPassword, email, password } = await request.json();

    // 1. Validar la contraseña de administrador
    if (adminPassword !== 'admin123') {
      return new Response(JSON.stringify({ error: 'Contraseña de administrador incorrecta' }), {
        status: 401, // Unauthorized
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 2. Validar que los datos del nuevo usuario existan
    if (!email || !password) {
        return new Response(JSON.stringify({ error: 'Email y contraseña son requeridos' }), {
            status: 400, // Bad Request
            headers: { 'Content-Type': 'application/json' },
        });
    }

    // 3. Crear el usuario usando el cliente de administrador
    const { data: authData, error: signUpError } = await supabaseAdmin.auth.admin.createUser({
      email: email,
      password: password,
      email_confirm: true, // Marcar el email como confirmado inmediatamente
    });

    if (signUpError) {
      throw new Error(`Error de Supabase al crear usuario: ${signUpError.message}`);
    }

    if (!authData.user) {
        throw new Error('La creación del usuario no devolvió un usuario.');
    }
    
    // 4. (Opcional) Insertar en la tabla 'users' si tienes una tabla de perfiles
    const { error: insertError } = await supabaseAdmin
        .from('users')
        .insert([{ 
            id: authData.user.id,
            // Aquí puedes añadir valores por defecto para el nuevo usuario
            // Por ejemplo: role, plan, etc.
        }]);

    if (insertError) {
        // Si falla la inserción en la tabla de perfiles, es buena idea eliminar el usuario de auth para evitar inconsistencias
        await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
        throw new Error(`Error de Supabase al insertar perfil: ${insertError.message}`);
    }


    // 5. Devolver éxito
    return new Response(JSON.stringify({ 
      message: 'Usuario creado exitosamente',
      user: authData.user 
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[Admin Create User] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Error interno del servidor';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
} 