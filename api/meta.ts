import { supabase } from '../lib/supabase-server.js';


export async function handleRefreshAdAccounts(request: Request) {
  try {
    const body = await request.json();
    const { userId, integrationId } = body;

    if (!userId || !integrationId) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Faltan parámetros requeridos (userId, integrationId)'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
    if (!ENCRYPTION_KEY) {
      console.error('Missing ENCRYPTION_KEY environment variable');
      return new Response(JSON.stringify({
        success: false,
        error: 'Configuración del servidor incompleta'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Obtener la integración del usuario
    const { data: integration, error: integrationError } = await supabase
      .from('user_integrations')
      .select('*')
      .eq('id', integrationId)
      .eq('user_id', userId)
      .eq('provider', 'meta')
      .eq('status', 'active')
      .single();

    if (integrationError || !integration) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Integración de Meta no encontrada o inactiva'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Descifrar el access token
    let accessToken: string;
    try {
      accessToken = integration.access_token_encrypted; // DEBUG: Reading plaintext
    } catch (error) {
      console.error('Error decrypting access token:', error);
      return new Response(JSON.stringify({
        success: false,
        error: 'Error al descifrar el token de acceso. Es posible que necesites reconectar tu cuenta.'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Obtener las cuentas publicitarias del usuario con paginación
    let allAdAccounts: any[] = [];
    
    try {
      let nextUrl = `https://graph.facebook.com/v19.0/me/adaccounts?fields=id,name,account_status&limit=100&access_token=${accessToken}`;
      
      while (nextUrl) {
        const adAccountsResponse = await fetch(nextUrl);
        const adAccountsData = await adAccountsResponse.json();
        
        if (adAccountsData.error) {
          console.error('Error obteniendo cuentas publicitarias:', adAccountsData.error);
          
          // Si el token ha expirado o es inválido
          if (adAccountsData.error.code === 190) {
            return new Response(JSON.stringify({
              success: false,
              error: 'Token de acceso expirado. Por favor reconecta tu cuenta de Meta.'
            }), {
              status: 401,
              headers: { 'Content-Type': 'application/json' }
            });
          }
          
          throw new Error(`Error de Meta API: ${adAccountsData.error.message}`);
        }

        if (adAccountsData.data) {
          allAdAccounts = allAdAccounts.concat(adAccountsData.data);
        }

        // Verificar si hay más páginas
        nextUrl = adAccountsData.paging?.next || null;
      }

      console.log(`[Meta Refresh] ${allAdAccounts.length} cuentas publicitarias obtenidas para usuario ${userId}`);

      // Actualizar las cuentas publicitarias en la base de datos
      if (allAdAccounts.length > 0) {
        const adAccountsToUpsert = allAdAccounts.map((account: any) => ({
          meta_id: account.id,
          user_integration_id: integrationId,
          name: account.name,
          status: account.account_status === 1 ? 'active' : 'inactive'
        }));

        // Primero, marcar todas las cuentas existentes como inactivas para este usuario
        const { error: deactivateError } = await supabase
          .from('meta_ad_accounts')
          .update({ status: 'inactive' })
          .eq('user_integration_id', integrationId);

        if (deactivateError) {
          console.error('Error deactivating old ad accounts:', deactivateError);
        }

        // Luego, insertar/actualizar las cuentas actuales para este usuario
        const { error: upsertError } = await supabase
          .from('meta_ad_accounts')
          .upsert(adAccountsToUpsert, { onConflict: 'meta_id,user_integration_id' });

        if (upsertError) {
          console.error('Error upserting ad accounts:', upsertError);
          return new Response(JSON.stringify({
            success: false,
            error: 'Error al guardar las cuentas publicitarias en la base de datos'
          }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        console.log(`[Meta Refresh] ${adAccountsToUpsert.length} cuentas publicitarias sincronizadas`);
      } else {
        // Si no hay cuentas, marcar todas como inactivas
        const { error: deactivateError } = await supabase
          .from('meta_ad_accounts')
          .update({ status: 'inactive' })
          .eq('user_integration_id', integrationId);

        if (deactivateError) {
          console.error('Error deactivating ad accounts:', deactivateError);
        }
      }

      return new Response(JSON.stringify({
        success: true,
        adAccountsCount: allAdAccounts.length,
        message: `${allAdAccounts.length} cuentas publicitarias sincronizadas correctamente`
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });

    } catch (error) {
      console.error('Error fetching ad accounts from Meta:', error);
      return new Response(JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Error obteniendo cuentas publicitarias de Meta'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

  } catch (error) {
    console.error('Error in handleRefreshAdAccounts:', error);
    return new Response(JSON.stringify({
      success: false,
      error: 'Error interno del servidor'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
} 