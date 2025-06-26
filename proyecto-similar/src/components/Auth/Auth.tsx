import { Auth as SupabaseAuth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { supabase } from '../../lib/supabase';

export function Auth() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="max-w-md w-full mx-auto p-8">
        <div className="bg-white shadow-lg rounded-lg p-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center">
            Panel de Facebook Ads
          </h2>
          <SupabaseAuth
            supabaseClient={supabase}
            appearance={{
              theme: ThemeSupa,
              variables: {
                default: {
                  colors: {
                    brand: '#4F46E5',
                    brandAccent: '#4338CA',
                  },
                },
              },
            }}
            localization={{
              variables: {
                sign_in: {
                  email_label: 'Correo electrónico',
                  password_label: 'Contraseña',
                  button_label: 'Iniciar sesión',
                  loading_button_label: 'Iniciando sesión...',
                  link_text: '¿Ya tienes una cuenta? Inicia sesión',
                },
                sign_up: {
                  email_label: 'Correo electrónico',
                  password_label: 'Contraseña',
                  button_label: 'Registrarse',
                  loading_button_label: 'Registrando...',
                  link_text: '¿No tienes una cuenta? Regístrate',
                },
                magic_link: {
                  button_label: 'Enviar enlace mágico',
                  loading_button_label: 'Enviando enlace mágico...',
                },
                forgotten_password: {
                  button_label: 'Enviar instrucciones',
                  loading_button_label: 'Enviando instrucciones...',
                  link_text: '¿Olvidaste tu contraseña?',
                },
              },
            }}
            providers={[]}
          />
        </div>
      </div>
    </div>
  );
}