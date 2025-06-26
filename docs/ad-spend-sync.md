# Sincronización de Gastos Publicitarios

Este sistema obtiene automáticamente los gastos publicitarios desde Meta Ads API y los almacena en la base de datos para calcular ROAS y métricas de rendimiento.

## 🚀 Características

- **Sincronización Automática**: Cron job que se ejecuta cada 10 minutos
- **Multi-cuenta**: Soporta múltiples cuentas publicitarias por usuario
- **Multi-producto**: Asigna gastos a productos específicos según configuración
- **Manejo de Errores**: Sistema robusto de logging y manejo de errores
- **Seguridad**: Tokens cifrados con AES-256-GCM

## 📊 Flujo de Datos

```
Meta Ads API → Sincronización → Base de Datos → Dashboard Analytics
```

1. El cron job obtiene todas las integraciones activas de Meta
2. Para cada integración, descifra el access token
3. Consulta el gasto diario de todas las cuentas publicitarias activas
4. Guarda los datos en la tabla `ad_spend` relacionados con productos

## 🗄️ Estructura de Base de Datos

### Tabla `ad_spend`
```sql
- id (uuid, PK)
- product_id (uuid, FK to products)
- product_ad_account_id (uuid, FK to product_ad_accounts)
- date (date)
- spend (numeric)
- currency (varchar)
- created_at (timestamp)
```

## ⚙️ Configuración

### Variables de Entorno

```bash
# Requeridas
ENCRYPTION_KEY=your_encryption_key_hex
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_key

# Opcionales
ENABLE_AD_SPEND_CRON=true  # Para habilitar el cron en desarrollo
CRON_SECRET=your_secret_key # Para endpoints manuales
```

### Habilitar Cron Job

El cron job se inicia automáticamente cuando:
- `NODE_ENV=production`, O
- `ENABLE_AD_SPEND_CRON=true`

## 🔧 Uso

### Automático
El sistema se ejecuta automáticamente cada 10 minutos sin intervención.

### Manual
Los administradores pueden ejecutar la sincronización manualmente desde Settings:

1. Ir a **Settings** (solo administradores verán la sección)
2. Buscar **"Sincronización de Gastos Publicitarios"**
3. Hacer clic en **"Sincronizar Ahora"**

### API Manual
```bash
POST /api/ad-spend/sync
Authorization: Bearer your_cron_secret
```

### Script de Prueba
```bash
node scripts/test-ad-spend-sync.js
```

## 📝 Logs

El sistema genera logs detallados:

```
[Ad Spend Sync] Starting ad spend sync
[Ad Spend Sync] Found integrations: { count: 2 }
[Ad Spend Sync] Processing integration: { integrationId: "...", userId: "...", adAccountsCount: 3 }
[Ad Spend Sync] Fetched ad spend data: { integrationId: "...", dataCount: 3 }
[Ad Spend Sync] Ad spend saved: { productId: "...", adAccountId: "...", spend: 150.50, currency: "USD" }
[Ad Spend Sync] Ad spend sync completed: { totalProcessed: 5, totalErrors: 0, date: "2025-01-15" }
```

## 🔐 Seguridad

- **Cifrado de Tokens**: Los access tokens se almacenan cifrados
- **Autorización de API**: El endpoint manual requiere autorización
- **Validación de Acceso**: Solo procesa integraciones activas del usuario

## 📈 Métricas Disponibles

Una vez sincronizados los datos, están disponibles para:

- **ROAS (Return on Ad Spend)**: Ingresos / Gasto publicitario
- **Análisis de Rendimiento**: Comparación día a día
- **Dashboard Analytics**: Métricas en tiempo real
- **Reportes**: Exportación de datos

## 🐛 Troubleshooting

### Problemas Comunes

1. **No se procesan datos**
   - Verificar que las integraciones de Meta estén activas
   - Comprobar que los productos tengan cuentas publicitarias asignadas
   - Revisar logs para errores de autenticación

2. **Tokens expirados**
   - Los usuarios deben reconectar su cuenta de Meta
   - Los tokens se refrescan automáticamente cuando es posible

3. **Errores de API**
   - Verificar límites de rate de Meta Ads API
   - Comprobar permisos de las cuentas publicitarias

### Verificar Estado

```bash
# Ver logs del servidor
docker logs proyecto-tracking

# Verificar último procesamiento
SELECT * FROM ad_spend ORDER BY created_at DESC LIMIT 10;

# Verificar integraciones activas
SELECT * FROM user_integrations WHERE provider = 'meta' AND status = 'active';
```

## 🚀 Próximas Mejoras

- [ ] Soporte para Google Ads
- [ ] Alertas automáticas por ROAS bajo
- [ ] Optimización automática de presupuestos
- [ ] Dashboard avanzado de métricas
- [ ] Histórico de cambios de gasto 