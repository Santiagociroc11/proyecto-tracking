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
      return new Response(null, {
        status: 302,
        headers: {
          Location: '/dashboard?error=meta_auth_failed',
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
    const userInfo = await userInfoResponse.json();

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

    let selectedAdAccount = null;
    if (adAccountsData.data && adAccountsData.data.length > 0) {
      // Por simplicidad, tomamos la primera cuenta activa
      selectedAdAccount = adAccountsData.data.find((account: any) => account.account_status === 1) || adAccountsData.data[0];
    }

    // Cifrar el access token antes de guardarlo
    const encryptedToken = encryptToken(accessToken, ENCRYPTION_KEY);

    // Aquí necesitarías obtener el product_id y user_id desde el state o session
    // Por ahora, usaremos un placeholder. En producción, deberías guardarlo en el state
    const productId = 'PLACEHOLDER_PRODUCT_ID'; // Esto debe venir del localStorage o session
    const userId = 'PLACEHOLDER_USER_ID'; // Esto debe venir de la sesión autenticada

    // Guardar la integración en la base de datos
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

    // Redirigir de vuelta al dashboard con éxito
    return new Response(null, {
      status: 302,
      headers: {
        Location: `/products/${productId}?tab=setup&meta_connected=true`,
      },
    });

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