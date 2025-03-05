import express from 'express';
import { handleTrackingEvent } from './api/track.js';
import { handleHotmartWebhook } from './api/hotmart.js';
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
  // Configuración personalizada para obtener IP
  keyGenerator: (req) => {
    const forwardedFor = req.headers['x-forwarded-for'];
    const ip = typeof forwardedFor === 'string' ? forwardedFor.split(',')[0] : 
               req.ip || 
               req.connection.remoteAddress || 
               'unknown';
    return `${ip}:${req.method}:${req.path}`;
  }
});

// Configurar CORS específicamente
app.use(cors({
  origin: '*', // En producción, configura los dominios permitidos
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'x-hotmart-hottok']
}));

app.use(express.json({ limit: '1mb' })); // Limitar tamaño de payload
app.use(limiter); // Aplicar rate limiting

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
const apiRouter = express.Router();

// Endpoint para recibir eventos de tracking
apiRouter.post('/track', async (req, res) => {
  log('Track', 'Recibiendo evento', req.body);
  try {
    const result = await handleTrackingEvent(req.body);
    log('Track', 'Evento procesado', result);
    res.json(result);
  } catch (error) {
    log('Track', 'Error procesando evento', error);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

// Endpoint para recibir webhooks de Hotmart
apiRouter.post('/hotmart/webhook', async (req, res) => {
  log('Hotmart', 'Recibiendo webhook', { headers: req.headers, body: req.body });
  try {
    const hottok = req.headers['x-hotmart-hottok'];
    if (!hottok) {
      log('Hotmart', 'Webhook sin token');
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    const result = await handleHotmartWebhook(req.body);
    log('Hotmart', 'Webhook procesado', result);
    res.json(result);
  } catch (error) {
    log('Hotmart', 'Error procesando webhook', error);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

// Mount API routes
app.use('/api', apiRouter);

// Serve static files
app.use(express.static(path.join(__dirname, 'dist')));
app.use('/track.js', express.static(path.join(__dirname, 'public/track.js'), {
  maxAge: '1h',
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
  }
}));

// Handle client-side routing
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  res.sendFile(path.join(__dirname, 'dist/index.html'));
});

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  log('Error', 'Error no manejado', err);
  res.status(500).json({ success: false, error: 'Error interno del servidor' });
});

const PORT = parseInt(process.env.PORT || '3000', 10);

app.listen(PORT, '0.0.0.0', () => {
  log('Server', `Servidor escuchando en puerto ${PORT}`);
});