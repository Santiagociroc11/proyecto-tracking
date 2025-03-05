import express from 'express';
import { handleTrackingEvent } from './api/track';
import { handleHotmartWebhook } from './api/hotmart';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Sistema de logging
function log(context: string, message: string, data?: any) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [Server] [${context}] ${message}`, data || '');
}

// Configurar límites de tasa
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minuto
  max: 100 // límite de 100 solicitudes por minuto
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

// API Routes - DEFINIR LAS RUTAS DE API ANTES DE SERVIR ARCHIVOS ESTÁTICOS
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

// Montar rutas API
app.use('/api', apiRouter);

// Servir archivos estáticos (por ejemplo, el script de tracking)
app.use('/track.js', express.static(path.join(__dirname, '../public/track.js'), {
  maxAge: '1h',
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
  }
}));

// Servir la aplicación React (los archivos compilados del frontend)
app.use(express.static(path.join(__dirname, '../dist')));

// Todas las demás rutas sirven index.html para el enrutamiento del lado del cliente
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

// Middleware para manejar errores
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  log('Error', 'Error no manejado', err);
  res.status(500).json({ success: false, error: 'Error interno del servidor' });
});

const PORT = process.env.PORT || 1975;
app.listen(PORT, '0.0.0.0', () => {
  log('Server', `Servidor escuchando en puerto ${PORT}`);
});
