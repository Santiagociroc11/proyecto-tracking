# Guía de Configuración UTM para Meta Ads

Esta guía explica cómo configurar correctamente los parámetros UTM en tus anuncios de Meta (Facebook/Instagram) para aprovechar al máximo el nuevo sistema de tracking integrado.

## 🔄 Nuevo Flujo de Datos

### Antes (Método Antiguo)
- Los eventos de tracking nos decían qué campañas existían
- Solo veíamos campañas que generaban tráfico
- No teníamos visibilidad de campañas activas sin conversiones

### Ahora (Método Nuevo)
- **Meta Ads API** nos dice qué campañas están activas y sus métricas
- **Eventos de tracking** agregan las conversiones capturadas
- **Visibilidad completa** de todas las campañas activas, con o sin conversiones

## 📝 Formato UTM Requerido

Debes usar exactamente este formato en todos tus anuncios de Meta:

```
utm_source=FB&utm_campaign={{campaign.name}}|{{campaign.id}}&utm_medium={{adset.name}}|{{adset.id}}&utm_content={{ad.name}}|{{ad.id}}&utm_term={{placement}}
```

### Desglose del Formato

| Parámetro | Valor | Descripción |
|-----------|-------|-------------|
| `utm_source` | `FB` | Identifica que el tráfico viene de Facebook/Meta |
| `utm_campaign` | `{{campaign.name}}\|{{campaign.id}}` | Nombre y ID de la campaña separados por `\|` |
| `utm_medium` | `{{adset.name}}\|{{adset.id}}` | Nombre y ID del conjunto de anuncios separados por `\|` |
| `utm_content` | `{{ad.name}}\|{{ad.id}}` | Nombre y ID del anuncio separados por `\|` |
| `utm_term` | `{{placement}}` | Placement donde se muestra el anuncio |

## 🎯 Cómo Configurar en Meta Ads Manager

### Paso 1: A Nivel de Campaña
1. Ve a **Ads Manager**
2. Selecciona tu campaña
3. Ve a **Ad Set** → **Ads**
4. Edita tu anuncio
5. En la sección **URL Parameters**, agrega:

```
utm_source=FB&utm_campaign={{campaign.name}}|{{campaign.id}}&utm_medium={{adset.name}}|{{adset.id}}&utm_content={{ad.name}}|{{ad.id}}&utm_term={{placement}}
```

### Paso 2: Verificar Variables Dinámicas
Asegúrate de que estas variables dinámicas estén disponibles:
- `{{campaign.name}}` - Nombre de la campaña
- `{{campaign.id}}` - ID único de la campaña
- `{{adset.name}}` - Nombre del conjunto de anuncios
- `{{adset.id}}` - ID único del conjunto de anuncios
- `{{ad.name}}` - Nombre del anuncio
- `{{ad.id}}` - ID único del anuncio
- `{{placement}}` - Ubicación del anuncio (feed, stories, etc.)

## 📊 Beneficios del Nuevo Sistema

### 1. **Visibilidad Completa**
- Ve todas las campañas activas, incluso las que no convierten
- Identifica "agujeros negros" que gastan sin generar resultados

### 2. **Métricas Enriquecidas**
- **Impresiones**: Cuántas veces se mostró tu anuncio
- **CPM**: Costo por mil impresiones
- **CPC**: Costo por clic
- **CTR**: Tasa de clics
- **Reach**: Personas únicas alcanzadas

### 3. **Análisis de Presupuesto**
- Presupuestos diarios y lifetime por campaña/conjunto
- Identificación de CBO (Campaign Budget Optimization)
- Seguimiento de gasto vs. presupuesto

### 4. **ROAS Preciso**
- Cálculo basado en datos reales de gasto
- Comparación entre ROAS de Meta Pixel vs. Tracking interno

## 🔧 Troubleshooting

### Problema: UTMs no aparecen en el dashboard
**Solución**: Verifica que:
1. El formato UTM sea exactamente como se especifica
2. Las variables dinámicas `{{}}` no aparezcan literalmente en la URL
3. La sincronización de Meta Ads esté funcionando

### Problema: Datos duplicados o inconsistentes
**Solución**: 
1. Verifica que no tengas UTMs antiguos mezclados
2. Ejecuta una sincronización manual desde Settings
3. Contacta soporte si persiste

### Problema: Campañas no aparecen
**Solución**:
1. Verifica que la cuenta de Meta esté conectada
2. Asegúrate de que la campaña tenga gasto > $0
3. Revisa que la campaña esté activa en Meta Ads Manager

## ⚡ Sincronización Automática

El sistema sincroniza automáticamente:

- **Ad Spend básico**: Cada 5 minutos
- **Meta Ads detallado**: Cada 10 minutos (offset +2min)

### Sincronización Manual
Los administradores pueden ejecutar sincronización manual desde:
**Settings** → **Sincronización de Meta Ads** → **Sincronizar Ahora**

## 📈 Interpretación de Datos

### En el Dashboard verás:

1. **KPIs Principales**
   - ROAS (Return on Ad Spend)
   - Gasto publicitario total y diario
   - Beneficio neto y margen

2. **Tabla UTM Enriquecida**
   - Columnas de Meta: Impresiones, CPM, CPC, CTR
   - Columnas de Tracking: Visitas, Conversiones, Ingresos
   - ROAS calculado combinando ambos

3. **Insights Inteligentes**
   - **ROAS Champions**: Campañas más rentables
   - **Agujeros Negros**: Campañas que gastan sin convertir
   - **Gigantes Cansados**: Alto tráfico, bajas conversiones

## 🚨 Importante

- **No mezcles formatos**: Usa solo el nuevo formato UTM
- **Migración gradual**: Puedes migrar campañas una por una
- **Datos históricos**: Los datos anteriores se mantendrán separados
- **Backup**: Guarda tus UTMs anteriores por si necesitas revertir

## 🆘 Soporte

Si tienes problemas con la configuración:
1. Verifica la documentación de Meta sobre parámetros UTM
2. Usa el debugger de URLs de Facebook
3. Revisa los logs de sincronización en Settings
4. Contacta al equipo técnico con capturas de pantalla 