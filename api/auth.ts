import { supabase } from '../lib/supabase-server.js';
import crypto from 'crypto';

export async function handleMetaCallback(request: Request) {
  try {
    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const error = url.searchParams.get('error');

    if (error) {
      console.error('Error from Meta OAuth:', error);
      
      // Devolver HTML de error para el popup
      const errorHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Error de Conexión</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              display: flex;
              align-items: center;
              justify-content: center;
              height: 100vh;
              margin: 0;
              background-color: #f8f9fa;
            }
            .container {
              text-align: center;
              padding: 2rem;
              background: white;
              border-radius: 8px;
              box-shadow: 0 2px 10px rgba(0,0,0,0.1);
              max-width: 400px;
            }
            .error-icon {
              font-size: 48px;
              color: #dc3545;
              margin-bottom: 1rem;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="error-icon">⚠️</div>
            <h3>Error de Conexión</h3>
            <p>No se pudo conectar con Meta. Por favor, inténtalo de nuevo.</p>
            <p><small>Error: ${error}</small></p>
          </div>
          <script>
            if (window.opener) {
              window.opener.postMessage({
                type: 'META_AUTH_ERROR',
                error: '${error}'
              }, window.location.origin);
            }
            
            setTimeout(() => {
              window.close();
            }, 3000);
          </script>
        </body>
        </html>
      `;
      
      return new Response(errorHtml, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
        },
      });
    }

    if (!code || !state) {
      return new Response(null, {
        status: 302,
        headers: {
          Location: '/dashboard?error=invalid_callback',
        },
      });
    }

    // Obtener las variables de entorno
    const META_APP_ID = process.env.VITE_META_APP_ID;
    const META_APP_SECRET = process.env.META_APP_SECRET;
    const REDIRECT_URI = `${process.env.SITE_URL || 'http://localhost:3000'}/api/auth/meta/callback`;
    const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

    if (!META_APP_ID || !META_APP_SECRET || !ENCRYPTION_KEY) {
      console.error('Missing environment variables for Meta integration');
      return new Response(null, {
        status: 302,
        headers: {
          Location: '/dashboard?error=server_configuration',
        },
      });
    }

    // Intercambiar el código por un Access Token
    const tokenUrl = `https://graph.facebook.com/v19.0/oauth/access_token?client_id=${META_APP_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&client_secret=${META_APP_SECRET}&code=${code}`;

    const response = await fetch(tokenUrl);
    const tokenData = await response.json();

    if (tokenData.error) {
      console.error('Error obteniendo Access Token de Meta:', tokenData.error);
      return new Response(null, {
        status: 302,
        headers: {
          Location: '/dashboard?error=token_exchange_failed',
        },
      });
    }

    const accessToken = tokenData.access_token;

    // Obtener información básica del usuario y sus cuentas publicitarias
    const userInfoUrl = `https://graph.facebook.com/v19.0/me?fields=id,name&access_token=${accessToken}`;
    const userInfoResponse = await fetch(userInfoUrl);
    const userInfo: { id: string; name: string; error?: any } = await userInfoResponse.json();

    if (userInfo.error) {
      console.error('Error obteniendo información del usuario:', userInfo.error);
      return new Response(null, {
        status: 302,
        headers: {
          Location: '/dashboard?error=user_info_failed',
        },
      });
    }

    // Obtener las cuentas publicitarias del usuario
    const adAccountsUrl = `https://graph.facebook.com/v19.0/me/adaccounts?fields=id,name,account_status&access_token=${accessToken}`;
    const adAccountsResponse = await fetch(adAccountsUrl);
    const adAccountsData = await adAccountsResponse.json();

    let selectedAdAccount: { id: string; name: string; account_status: number } | null = null;
    if (adAccountsData.data && adAccountsData.data.length > 0) {
      // Por simplicidad, tomamos la primera cuenta activa
      selectedAdAccount = adAccountsData.data.find((account: any) => account.account_status === 1) || adAccountsData.data[0];
    }

    // Cifrar el access token antes de guardarlo
    const encryptedToken = encryptToken(accessToken, ENCRYPTION_KEY);

    // TODO: Necesitamos una forma de obtener el product_id y user_id reales
    // Por ahora, intentaremos extraerlos del state o usar valores por defecto
    // En una implementación completa, deberías guardar esta información en una sesión segura
    
    // Para la demostración, vamos a intentar extraer el product_id del state
    // En producción, deberías implementar un sistema de sesiones más robusto
    const productId = 'temp-placeholder'; // Esto se debe resolver con sesiones
    const userId = 'temp-placeholder'; // Esto se debe resolver con sesiones

    console.log('Meta OAuth: Guardando integración temporal (necesita implementar sesiones)', {
      productId,
      userId,
      selectedAdAccountId: selectedAdAccount?.id
    });

    // En lugar de redirigir, vamos a devolver HTML que se comunique con la ventana principal
    const callbackHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Conectando con Meta...</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
            background-color: #f8f9fa;
          }
          .container {
            text-align: center;
            padding: 2rem;
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          }
          .spinner {
            width: 40px;
            height: 40px;
            border: 4px solid #e3e3e3;
            border-top: 4px solid #1877f2;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin: 0 auto 1rem;
          }
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="spinner"></div>
          <h3>¡Conexión exitosa!</h3>
          <p>Cerrando ventana...</p>
        </div>
        <script>
          // Enviar mensaje a la ventana principal
          if (window.opener) {
            window.opener.postMessage({
              type: 'META_AUTH_SUCCESS',
              data: {
                meta_account_id: '${selectedAdAccount?.id || ''}',
                meta_business_id: '${userInfo.id}',
                access_token_received: true
              }
            }, window.location.origin);
          }
          
          // Cerrar la ventana después de un breve delay
          setTimeout(() => {
            window.close();
          }, 2000);
        </script>
      </body>
      </html>
    `;

    return new Response(callbackHtml, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
      },
    });

    // NOTA: En una implementación completa, necesitarías:
    // 1. Implementar un sistema de sesiones para relacionar el OAuth con el usuario logueado
    // 2. Guardar el token en la base de datos después de verificar la sesión
    // 3. Asociar correctamente el product_id con la integración
    
    /* 
    // Este código se ejecutaría una vez que tengas el sistema de sesiones:
    const { error: insertError } = await supabase
      .from('product_integrations')
      .upsert({
        product_id: productId,
        user_id: userId,
        provider: 'meta',
        access_token_encrypted: encryptedToken,
        meta_ad_account_id: selectedAdAccount?.id || null,
        meta_business_id: userInfo.id,
        status: 'active'
      }, {
        onConflict: 'product_id,provider'
      });

    if (insertError) {
      console.error('Error guardando integración en la base de datos:', insertError);
      return new Response(null, {
        status: 302,
        headers: {
          Location: '/dashboard?error=database_error',
        },
      });
    }
    */

  } catch (error) {
    console.error('Error en callback de Meta:', error);
    return new Response(null, {
      status: 302,
      headers: {
        Location: '/dashboard?error=unexpected_error',
      },
    });
  }
}

// Función para cifrar el token de acceso
function encryptToken(text: string, key: string): string {
  const algorithm = 'aes-256-gcm';
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipher(algorithm, key);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
}

// Función para descifrar el token de acceso
export function decryptToken(encryptedText: string, key: string): string {
  const algorithm = 'aes-256-gcm';
  const parts = encryptedText.split(':');
  
  const iv = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const encrypted = parts[2];
  
  const decipher = crypto.createDecipher(algorithm, key);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
} 