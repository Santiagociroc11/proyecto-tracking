import express from 'express';
import { handleTrackingEvent } from './api/track.js';
import { handleHotmartWebhook } from './api/hotmart.js';
import { sendTestNotification } from './api/telegram.js';
import { handleMetaCallback, handleDataDeletionRequest } from './api/auth.js';
import { handleRefreshAdAccounts } from './api/meta.js';
import { handleAdSpendSync, handleManualAdSpendSync, handleProductAdAccountSync } from './api/ad-spend.js';
import cors from 'cors';
import cron from 'node-cron';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();

// Enable trust proxy for rate limiting behind reverse proxy
app.set('trust proxy', 'loopback, linklocal, uniquelocal');

// Sistema de logging
function log(context: string, message: string, data?: any) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [Server] [${context}] ${message}`, data || '');
}

// Configurar límites de tasa
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minuto
  max: 100, // límite de 100 solicitudes por minuto
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const forwardedFor = req.headers['x-forwarded-for'];
    const ip = typeof forwardedFor === 'string' ? forwardedFor.split(',')[0].trim() : 
               req.ip || 
               req.connection.remoteAddress || 
               'unknown';
    return `${ip}:${req.method}:${req.path}`;
  }
});

// Configurar CORS
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'x-hotmart-hottok', 'X-Tracking-ID', 'X-Visitor-ID']
}));

app.use(express.json({ limit: '1mb' }));
app.use(limiter);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Debug endpoint para verificar el estado del cron y la base de datos
app.get('/debug/ad-spend-status', async (req, res) => {
  try {
    log('Debug', 'Verificando estado de sincronización de gastos publicitarios');
    
    // Verificar si el cron está corriendo
    const cronStatus = adSpendCronTask ? 'running' : 'stopped';
    
    // Verificar últimos datos en la base de datos
    const { supabase } = await import('./lib/supabase-server.js');
    const { data: latestRecords, error: dbError } = await supabase
      .from('ad_spend')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5);

    if (dbError) {
      throw new Error(`Database error: ${dbError.message}`);
    }

    // Verificar integraciones activas de Meta
    const { data: integrations, error: integrationsError } = await supabase
      .from('user_integrations')
      .select(`
        id,
        user_id,
        status,
        created_at,
        meta_ad_accounts (
          id,
          name,
          status
        )
      `)
      .eq('provider', 'meta')
      .eq('status', 'active');

    if (integrationsError) {
      throw new Error(`Integrations error: ${integrationsError.message}`);
    }

    const activeAdAccounts = integrations?.reduce((total, integration) => {
      return total + (integration.meta_ad_accounts?.filter((acc: any) => acc.status === 'active').length || 0);
    }, 0) || 0;

    const statusData = {
      timestamp: new Date().toISOString(),
      cron: {
        status: cronStatus,
        schedule: '*/5 * * * * (every 5 minutes)',
        enabled: process.env.ENABLE_AD_SPEND_CRON === 'true' || process.env.NODE_ENV === 'production'
      },
      integrations: {
        total: integrations?.length || 0,
        activeAdAccounts
      },
      database: {
        latestRecords: latestRecords?.length || 0,
        lastSync: latestRecords?.[0]?.created_at || null,
        recentData: latestRecords?.map(record => ({
          product_id: record.product_id,
          date: record.date,
          spend: record.spend,
          currency: record.currency,
          created_at: record.created_at
        })) || []
      },
      environment: {
        NODE_ENV: process.env.NODE_ENV,
        ENABLE_AD_SPEND_CRON: process.env.ENABLE_AD_SPEND_CRON,
        ENCRYPTION_KEY_SET: !!process.env.ENCRYPTION_KEY
      }
    };

    log('Debug', 'Estado de sincronización obtenido', statusData);
    res.json(statusData);
    
  } catch (error) {
    log('Debug', 'Error verificando estado', error);
    res.status(500).json({
      error: 'Error verificando estado',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// API Routes
const apiRouter = express.Router();

apiRouter.post('/track', async (req, res) => {
  log('Track', 'Recibiendo evento', {
    headers: req.headers,
    body: req.body
  });
  
  try {
    const result = await handleTrackingEvent(req.body);
    log('Track', 'Evento procesado', result);
    res.json(result);
  } catch (error) {
    log('Track', 'Error procesando evento', error);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

apiRouter.post('/hotmart/webhook', async (req, res) => {
  log('Hotmart', 'Recibiendo webhook', { headers: req.headers, body: req.body });
  try {
    const result = await handleHotmartWebhook(req.body);
    log('Hotmart', 'Webhook procesado', result);
    res.json(result);
  } catch (error) {
    log('Hotmart', 'Error procesando webhook', error);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

apiRouter.post('/telegram/test', async (req, res) => {
  log('Telegram', 'Recibiendo prueba de notificación', { body: req.body });
  try {
    const { chatId, threadId, userId } = req.body;

    if (!chatId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Chat ID es requerido' 
      });
    }

    const result = await sendTestNotification(chatId, userId, threadId);
    log('Telegram', 'Prueba de notificación procesada', result);

    if (result.success) {
      return res.status(200).json({ 
        success: true, 
        message: 'Notificación de prueba enviada exitosamente' 
      });
    } else {
      return res.status(400).json({ 
        success: false, 
        error: result.error || 'Error desconocido' 
      });
    }

  } catch (error) {
    log('Telegram', 'Error en prueba de notificación', error);
    res.status(500).json({ 
      success: false, 
      error: 'Error interno del servidor' 
    });
  }
});

apiRouter.post('/meta/refresh-ad-accounts', async (req, res) => {
  log('Meta Refresh', 'Recibiendo solicitud para refrescar cuentas publicitarias', { body: req.body });
  try {
    // Convertir la request de Express a una Request estándar
    const url = new URL(req.url, `${req.protocol}://${req.get('host')}`);
    const request = new Request(url.toString(), {
      method: req.method,
      headers: req.headers as any,
      body: JSON.stringify(req.body)
    });

    const result = await handleRefreshAdAccounts(request);
    const responseData = await result.json();
    
    log('Meta Refresh', 'Respuesta enviada', responseData);
    return res.status(result.status).json(responseData);
    
  } catch (error) {
    log('Meta Refresh', 'Error refrescando cuentas publicitarias', error);
    res.status(500).json({ 
      success: false, 
      error: 'Error interno del servidor' 
    });
  }
});

apiRouter.post('/ad-spend/sync', async (req, res) => {
  log('Ad Spend', 'Recibiendo solicitud de sincronización de gastos publicitarios', { 
    body: req.body,
    headers: req.headers 
  });
  
  try {
    // Convertir la request de Express a una Request estándar
    const url = new URL(req.url, `${req.protocol}://${req.get('host')}`);
    const request = new Request(url.toString(), {
      method: req.method,
      headers: req.headers as any,
      body: JSON.stringify(req.body)
    });

    const result = await handleManualAdSpendSync(request);
    const responseData = await result.json();
    
    log('Ad Spend', 'Sincronización completada', responseData);
    return res.status(result.status).json(responseData);
    
  } catch (error) {
    log('Ad Spend', 'Error en sincronización de gastos publicitarios', error);
    res.status(500).json({ 
      success: false, 
      error: 'Error interno del servidor' 
    });
  }
});

apiRouter.post('/ad-spend/sync-product', async (req, res) => {
  log('Product Ad Spend', 'Recibiendo solicitud de sincronización de gastos para producto específico', { 
    body: req.body,
    headers: req.headers 
  });
  
  try {
    // Convertir la request de Express a una Request estándar
    const url = new URL(req.url, `${req.protocol}://${req.get('host')}`);
    const request = new Request(url.toString(), {
      method: req.method,
      headers: req.headers as any,
      body: JSON.stringify(req.body)
    });

    const result = await handleProductAdAccountSync(request);
    const responseData = await result.json();
    
    log('Product Ad Spend', 'Sincronización de producto completada', responseData);
    return res.status(result.status).json(responseData);
    
  } catch (error) {
    log('Product Ad Spend', 'Error en sincronización de gastos de producto', error);
    res.status(500).json({ 
      success: false, 
      error: 'Error interno del servidor' 
    });
  }
});

// Ruta para el callback de Meta OAuth
apiRouter.get('/auth/meta/callback', async (req, res) => {
  log('Meta Auth', 'Recibiendo callback de Meta', { 
    query: req.query, 
    headers: req.headers 
  });
  
  try {
    // Convertir la request de Express a una Request estándar
    const url = new URL(req.url, `${req.protocol}://${req.get('host')}`);
    const request = new Request(url.toString(), {
      method: req.method,
      headers: req.headers as any
    });

    const result = await handleMetaCallback(request);
    
    // Convertir la Response estándar a una respuesta de Express
    const body = await result.text();
    const headers = Object.fromEntries(result.headers.entries());

    if (result.status === 302) {
      const location = result.headers.get('Location');
      log('Meta Auth', 'Redirigiendo después del callback', { location });
      return res.redirect(location || '/dashboard');
    } else {
      log('Meta Auth', 'Devolviendo HTML de callback', { status: result.status });
      return res.status(result.status).set(headers).send(body);
    }
    
  } catch (error) {
    log('Meta Auth', 'Error en callback de Meta', error);
    res.redirect('/dashboard?error=callback_failed');
  }
});

// Ruta para eliminación de datos requerida por Meta
apiRouter.post('/auth/meta/data-deletion', async (req, res) => {
  log('Meta Data Deletion', 'Recibiendo solicitud de eliminación de datos', { 
    body: req.body, 
    headers: req.headers 
  });
  
  try {
    // Convertir la request de Express a una Request estándar
    const url = new URL(req.url, `${req.protocol}://${req.get('host')}`);
    const request = new Request(url.toString(), {
      method: req.method,
      headers: req.headers as any,
      body: JSON.stringify(req.body)
    });

    const result = await handleDataDeletionRequest(request);
    const responseData = await result.json();
    
    log('Meta Data Deletion', 'Respuesta enviada', responseData);
    return res.status(result.status).json(responseData);
    
  } catch (error) {
    log('Meta Data Deletion', 'Error en eliminación de datos', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.use('/api', apiRouter);

// Serve static files
const staticPath = path.join(__dirname, '..', 'client');
app.use(express.static(staticPath));

// Serve tracking script
app.use('/track.js', express.static(path.join(__dirname, '..', 'public', 'track.js'), {
  maxAge: '1h',
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
  }
}));

// Ruta específica para el estado de eliminación de datos
app.get('/data-deletion-status/*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'data-deletion-status.html'));
});

// Handle client-side routing
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  res.sendFile(path.join(staticPath, 'index.html'));
});

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  log('Error', 'Error no manejado', err);
  res.status(500).json({ success: false, error: 'Error interno del servidor' });
});

const PORT = parseInt(process.env.PORT || '3000', 10);

// Cron job para sincronizar gastos publicitarios cada 5 minutos
let adSpendCronTask: any = null;

function startAdSpendCron() {
  log('Cron', 'Iniciando cron job de sincronización de gastos publicitarios (cada 5 minutos)');
  
  // Ejecutar inmediatamente al iniciar
  executeAdSpendSync('startup');
  
  // Configurar cron para ejecutar cada 5 minutos: */5 * * * *
  adSpendCronTask = cron.schedule('*/5 * * * *', async () => {
    executeAdSpendSync('scheduled');
  }, {
    timezone: "UTC"
  });
  
  // Iniciar el cron job
  adSpendCronTask.start();
  
  log('Cron', 'Cron job configurado exitosamente - ejecutará cada 5 minutos');
}

// Función auxiliar para ejecutar la sincronización con mejor logging
async function executeAdSpendSync(trigger: 'startup' | 'scheduled' | 'manual') {
  const startTime = Date.now();
  log('Cron', `Iniciando sincronización de gastos publicitarios (trigger: ${trigger})`);
  
  try {
    const result = await handleAdSpendSync();
    const responseData = await result.json();
    const duration = Date.now() - startTime;
    
    log('Cron', `Sincronización completada exitosamente (${duration}ms)`, {
      trigger,
      processed: responseData.processed,
      errors: responseData.errors,
      date: responseData.date
    });
    
    return responseData;
  } catch (error) {
    const duration = Date.now() - startTime;
    log('Cron', `Error en sincronización (${duration}ms)`, {
      trigger,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    throw error;
  }
}

// Función para detener el cron job
function stopAdSpendCron() {
  if (adSpendCronTask) {
    adSpendCronTask.stop();
    adSpendCronTask.destroy();
    adSpendCronTask = null;
    log('Cron', 'Cron job de sincronización de gastos publicitarios detenido');
  }
}

// Manejar señales de cierre para limpiar recursos
process.on('SIGTERM', () => {
  log('Server', 'Recibida señal SIGTERM, cerrando servidor...');
  stopAdSpendCron();
  process.exit(0);
});

process.on('SIGINT', () => {
  log('Server', 'Recibida señal SIGINT, cerrando servidor...');
  stopAdSpendCron();
  process.exit(0);
});

app.listen(PORT, '0.0.0.0', () => {
  log('Server', `Servidor escuchando en puerto ${PORT}`);
  
  // Iniciar el cron job solo en producción o si está explícitamente habilitado
  const enableCron = process.env.ENABLE_AD_SPEND_CRON === 'true' || process.env.NODE_ENV === 'production';
  
  if (enableCron) {
    startAdSpendCron();
  } else {
    log('Cron', 'Cron job de sincronización de gastos publicitarios deshabilitado (establecer ENABLE_AD_SPEND_CRON=true para habilitar)');
  }
});