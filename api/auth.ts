import { supabase } from '../lib/supabase-server.js';
import crypto from 'crypto';

/**
 * Maneja las solicitudes de eliminación de datos de usuarios de Meta
 * Este endpoint es requerido por Meta para cumplir con las políticas de datos
 */
export async function handleDataDeletionRequest(request: Request) {
  try {
    const body = await request.text();
    
    // Meta envía una signed request con los datos del usuario
    // Para este ejemplo, vamos a manejar una implementación básica
    // En producción deberías verificar la firma de Meta
    
    console.log('[Data Deletion] Solicitud recibida de Meta:', body);
    
    // Generar un confirmation code único para la eliminación
    const confirmationCode = crypto.randomBytes(16).toString('hex');
    
    // En una implementación completa, aquí deberías:
    // 1. Verificar la signed request de Meta
    // 2. Extraer el user_id de Meta del payload
    // 3. Buscar y eliminar todos los datos relacionados con ese usuario de Meta
    // 4. Registrar la eliminación en un log de auditoría
    
    // Respuesta requerida por Meta
    const response = {
      url: `${process.env.SITE_URL || 'https://hotapi.automscc.com'}/data-deletion-status/${confirmationCode}`,
      confirmation_code: confirmationCode
    };
    
    console.log('[Data Deletion] Respuesta enviada:', response);
    
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
  } catch (error) {
    console.error('[Data Deletion] Error procesando solicitud:', error);
    
    return new Response(JSON.stringify({
      error: 'Error interno del servidor'
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }
}

export async function handleMetaCallback(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  const generateErrorResponse = (errorMessage: string) => {
    console.error('Meta Auth Error:', errorMessage);
    const errorHtml = `
      <!DOCTYPE html>
      <html>
      <head><title>Error</title></head>
      <body>
        <h3>Error de Conexión</h3>
        <p>${errorMessage}</p>
        <script>
          if (window.opener) {
            window.opener.postMessage({ type: 'META_AUTH_ERROR', error: '${errorMessage}' }, window.location.origin);
          }
          setTimeout(() => window.close(), 3000);
        </script>
      </body>
      </html>
    `;
    return new Response(errorHtml, { status: 400, headers: { 'Content-Type': 'text/html' } });
  };

  try {
    if (error) {
      return generateErrorResponse(`Error de Meta: ${error}`);
    }

    if (!code || !state) {
      return generateErrorResponse('Parámetros de callback inválidos. Faltan código o estado.');
    }
    
    // NOTA: La validación del 'state' debería hacerse en el frontend
    // o usando una sesión en el backend. Como el state se generó en el cliente,
    // el servidor no tiene cómo validarlo directamente. El flujo actual confía
    // en que el cliente que abrió el popup es el mismo que lo procesa.
    // La verdadera validación CSRF ocurrirá cuando asociemos la sesión de usuario.

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

    // Obtener información básica del usuario para verificar la conexión (solo ID)
    const userInfoUrl = `https://graph.facebook.com/v19.0/me?fields=id&access_token=${accessToken}`;
    const userInfoResponse = await fetch(userInfoUrl);
    const userInfo: { id: string; error?: any } = await userInfoResponse.json();

    if (userInfo.error) {
      console.error('Error obteniendo información del usuario:', userInfo.error);
      return generateErrorResponse(`Error obteniendo información del usuario: ${userInfo.error.message}`);
    }

    // Obtener las cuentas publicitarias del usuario (requiere ads_read)
    let selectedAdAccount: { id: string; name: string; account_status: number } | null = null;
    let adAccountsData: any = {};
    
    try {
      const adAccountsUrl = `https://graph.facebook.com/v19.0/me/adaccounts?fields=id,name,account_status&access_token=${accessToken}`;
      const adAccountsResponse = await fetch(adAccountsUrl);
      adAccountsData = await adAccountsResponse.json();

      if (adAccountsData.data && adAccountsData.data.length > 0) {
        // Por simplicidad, tomamos la primera cuenta activa
        selectedAdAccount = adAccountsData.data.find((account: any) => account.account_status === 1) || adAccountsData.data[0];
        console.log(`[Meta Auth] Cuenta publicitaria seleccionada: ${selectedAdAccount?.name} (${selectedAdAccount?.id})`);
      } else if (adAccountsData.error) {
        console.log(`[Meta Auth] No se pudieron obtener cuentas publicitarias (permisos pendientes): ${adAccountsData.error.message}`);
      }
    } catch (error) {
      console.log(`[Meta Auth] ads_read permission not yet approved, continuing without ad account data`);
    }

    // Decodificar el state para obtener el product_id y user_id
    let productId: string, userId: string;
    try {
      const decodedState = JSON.parse(atob(state));
      productId = decodedState.productId;
      userId = decodedState.userId;
      
      if (!productId || !userId) {
        throw new Error('State inválido: falta productId o userId');
      }
      // TODO: Validar decodedState.csrf contra un valor guardado en sesión/cookie
    } catch (e) {
      return generateErrorResponse('El parámetro state es inválido o ha sido manipulado.');
    }

    // Cifrar el access token antes de guardarlo
    const encryptedToken = encryptToken(accessToken, ENCRYPTION_KEY);

    // Guardar la integración en la base de datos
    const { error: dbError } = await supabase.from('product_integrations').upsert({
      product_id: productId,
      user_id: userId,
      provider: 'meta',
      meta_ad_account_id: selectedAdAccount?.id || null,
      meta_business_id: userInfo.id,
      // Solo guardamos el ID para identificación, no información personal
      access_token_encrypted: encryptedToken,
      status: 'active',
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'product_id, provider'
    });

    if (dbError) {
      console.error('Error guardando la integración en DB:', dbError);
      return generateErrorResponse('No se pudo guardar la integración en la base de datos.');
    }

    console.log(`[Meta Auth] Integración guardada exitosamente para productId: ${productId}`);
    
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

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Error desconocido en el servidor.';
    return generateErrorResponse(errorMessage);
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