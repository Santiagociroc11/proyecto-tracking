import express from 'express';
import { handleTrackingEvent } from './api/track.js';
import { handleHotmartWebhook } from './api/hotmart.js';
import { sendTestNotification } from './api/telegram.js';
import { handleMetaCallback, handleDataDeletionRequest } from './api/auth.js';
import { handleRefreshAdAccounts } from './api/meta.js';
import { handleAdSpendSync, handleManualAdSpendSync } from './api/ad-spend.js';
import cors from 'cors';
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

// Cron job para sincronizar gastos publicitarios cada 10 minutos
let adSpendSyncInterval: NodeJS.Timeout;

function startAdSpendCron() {
  log('Cron', 'Iniciando cron job de sincronización de gastos publicitarios');
  
  // Ejecutar inmediatamente al iniciar
  handleAdSpendSync().catch(error => {
    log('Cron', 'Error en primera ejecución de sincronización', error);
  });
  
  // Configurar para ejecutar cada 10 minutos (600,000 ms)
  adSpendSyncInterval = setInterval(async () => {
    try {
      log('Cron', 'Ejecutando sincronización programada de gastos publicitarios');
      await handleAdSpendSync();
    } catch (error) {
      log('Cron', 'Error en sincronización programada', error);
    }
  }, 10 * 60 * 1000); // 10 minutos
}

// Función para detener el cron job
function stopAdSpendCron() {
  if (adSpendSyncInterval) {
    clearInterval(adSpendSyncInterval);
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