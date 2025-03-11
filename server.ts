import express from 'express';
import { handleTrackingEvent } from './api/track.js';
import { handleHotmartWebhook } from './api/hotmart.js';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Ensure logs directory exists
const logsDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Create write streams for logs
const accessLogStream = fs.createWriteStream(path.join(logsDir, 'access.log'), { flags: 'a' });
const errorLogStream = fs.createWriteStream(path.join(logsDir, 'error.log'), { flags: 'a' });

const app = express();

// Enable trust proxy for rate limiting behind reverse proxy
app.set('trust proxy', 'loopback, linklocal, uniquelocal');

// Enhanced logging system
function log(context: string, message: string, data?: any, isError = false) {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] [Server] [${context}] ${message} ${data ? JSON.stringify(data, null, 2) : ''}\n`;
  
  // Write to appropriate log file
  const stream = isError ? errorLogStream : accessLogStream;
  stream.write(logEntry);

  // Also log to console
  console[isError ? 'error' : 'log'](logEntry);
}

// Process error handling
process.on('uncaughtException', (error) => {
  log('Process', 'Uncaught Exception', error, true);
  // Give time for logs to be written before exiting
  setTimeout(() => process.exit(1), 1000);
});

process.on('unhandledRejection', (reason, promise) => {
  log('Process', 'Unhandled Rejection', { reason, promise }, true);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  log('Process', 'Received SIGTERM - Graceful shutdown initiated');
  shutdown();
});

process.on('SIGINT', () => {
  log('Process', 'Received SIGINT - Graceful shutdown initiated');
  shutdown();
});

function shutdown() {
  // Close server and other resources
  server.close(() => {
    log('Process', 'Server closed');
    // Close log streams
    accessLogStream.end();
    errorLogStream.end();
    process.exit(0);
  });

  // Force close if graceful shutdown fails
  setTimeout(() => {
    log('Process', 'Forced shutdown after timeout', null, true);
    process.exit(1);
  }, 10000);
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

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    log('Request', `${req.method} ${req.url}`, {
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent: req.headers['user-agent']
    });
  });
  next();
});

// Error logging middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  log('Error', 'Unhandled error', { 
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    body: req.body
  }, true);
  res.status(500).json({ success: false, error: 'Error interno del servidor' });
});

// Configurar CORS
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'x-hotmart-hottok', 'X-Tracking-ID', 'X-Visitor-ID']
}));

app.use(express.json({ limit: '1mb' }));
app.use(limiter);

// Health check endpoint with detailed status
app.get('/health', (req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    environment: process.env.NODE_ENV,
    version: process.version
  };
  res.json(health);
  log('Health', 'Health check performed', health);
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
    log('Track', 'Error procesando evento', error, true);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

apiRouter.post('/hotmart/webhook', async (req, res) => {
  log('Hotmart', 'Recibiendo webhook', { headers: req.headers, body: req.body });
  try {
    const hottok = req.headers['x-hotmart-hottok'];
    if (!hottok) {
      log('Hotmart', 'Webhook sin token', null, true);
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    const result = await handleHotmartWebhook(req.body);
    log('Hotmart', 'Webhook procesado', result);
    res.json(result);
  } catch (error) {
    log('Hotmart', 'Error procesando webhook', error, true);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

app.use('/api', apiRouter);

// Servir archivos estáticos y manejar rutas del SPA
if (process.env.NODE_ENV === 'production') {
  log('Server', 'Iniciando en modo producción');
  
  // Servir archivos estáticos del frontend
  const staticPath = path.join(__dirname, '..', 'client');
  app.use(express.static(staticPath));
  log('Server', 'Sirviendo archivos estáticos desde', { staticPath });

  // Servir script de tracking
  const trackJsPath = path.join(staticPath, 'public', 'track.js');
  if (fs.existsSync(trackJsPath)) {
    app.use('/track.js', express.static(trackJsPath, {
      maxAge: '1h',
      setHeaders: (res) => {
        res.setHeader('Cache-Control', 'public, max-age=3600');
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        res.setHeader('X-Content-Type-Options', 'nosniff');
      }
    }));
    log('Server', 'Sirviendo track.js desde', { trackJsPath });
  } else {
    log('Server', 'Archivo track.js no encontrado', { trackJsPath }, true);
  }

  // Manejar todas las rutas del frontend
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) {
      log('Server', 'Ruta de API no encontrada', { path: req.path }, true);
      return res.status(404).json({ error: 'API endpoint not found' });
    }

    const indexPath = path.join(staticPath, 'index.html');
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      log('Server', 'Archivo index.html no encontrado', { indexPath }, true);
      res.status(404).send('Not found');
    }
  });
} else {
  log('Server', 'Iniciando en modo desarrollo');
}

const PORT = parseInt(process.env.PORT || '3000', 10);

// Create server instance for graceful shutdown
const server = app.listen(PORT, '0.0.0.0', () => {
  log('Server', `Servidor escuchando en puerto ${PORT} (${process.env.NODE_ENV || 'development'})`);
});