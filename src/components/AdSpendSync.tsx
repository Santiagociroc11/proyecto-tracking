import React, { useState } from 'react';
import { RefreshCw, AlertCircle, CheckCircle } from 'lucide-react';

interface SyncResult {
  success: boolean;
  message?: string;
  processed?: number;
  errors?: number;
  adPerformanceSynced?: number;
  adPerformanceErrors?: number;
  adPerformanceSkipped?: number;
  date?: string;
  dateRange?: string;
  daysProcessed?: number;
  error?: string;
}

export default function AdSpendSync() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);

  const handleSync = async () => {
    setLoading(true);
    setResult(null);

    try {
      const response = await fetch('/api/ad-spend/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.REACT_APP_CRON_SECRET || 'your-secret-key'}`
        },
        body: JSON.stringify({})
      });

      const data = await response.json();
      setResult(data);
    } catch (error) {
      console.error('Error en sincronización:', error);
      setResult({
        success: false,
        error: 'Error de conexión al servidor'
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-medium text-gray-900">
          Sincronización de Gastos Publicitarios
        </h3>
        <button
          onClick={handleSync}
          disabled={loading}
          className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Sincronizando...' : 'Sincronizar Ahora'}
        </button>
      </div>

      <p className="text-sm text-gray-600 mb-4">
        Este proceso obtiene los gastos publicitarios del día actual desde Meta Ads API 
        y los guarda en la base de datos para cada producto configurado.
      </p>

      <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <h4 className="text-sm font-medium text-blue-900 mb-2">🚀 Carga Automática de Historial</h4>
        <div className="text-xs text-blue-700 space-y-1">
          <p>• <strong>Al conectar cuentas nuevas:</strong> Se cargan automáticamente los últimos 30 días</p>
          <p>• <strong>Sincronización diaria:</strong> Solo actualiza el día actual (cada 5 minutos)</p>
          <p>• <strong>Crecimiento natural:</strong> El historial crece día a día (31, 32, 33 días...)</p>
        </div>
      </div>

      <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
        <h4 className="text-sm font-medium text-green-900 mb-2">🛡️ Protección de Datos Históricos</h4>
        <div className="text-xs text-green-700 space-y-1">
          <p>• Los datos del día actual se actualizarán cada vez que se ejecute</p>
          <p>• Los datos de días anteriores están protegidos y NO se sobreescriben</p>
          <p>• Esto preserva el historial exacto de gastos de cada día</p>
        </div>
      </div>

      <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <h4 className="text-sm font-medium text-blue-900 mb-2">🔍 Debug y Verificación</h4>
        <div className="space-y-2">
          <a 
            href="/debug/ad-spend-status" 
            target="_blank" 
            rel="noopener noreferrer"
            className="inline-flex items-center text-sm text-blue-700 hover:text-blue-800 underline"
          >
            Ver estado detallado del sistema
          </a>
          <p className="text-xs text-blue-600">
            • Verifica si el cron está funcionando<br/>
            • Muestra últimos datos sincronizados<br/>
            • Estado de integraciones de Meta
          </p>
        </div>
      </div>

      {result && (
        <div className={`p-4 rounded-lg ${result.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
          <div className="flex items-center">
            {result.success ? (
              <CheckCircle className="h-5 w-5 text-green-600" />
            ) : (
              <AlertCircle className="h-5 w-5 text-red-600" />
            )}
            <div className="ml-3">
              <h4 className={`text-sm font-medium ${result.success ? 'text-green-900' : 'text-red-900'}`}>
                {result.success ? 'Sincronización Completada' : 'Error en Sincronización'}
              </h4>
              <div className={`text-sm ${result.success ? 'text-green-700' : 'text-red-700'} mt-1`}>
                {result.success ? (
                  <div>
                    <p>{result.message}</p>
                    {typeof result.processed !== 'undefined' && (
                      <div className="mt-2 space-y-1">
                        <p>• Gastos procesados: {result.processed}</p>
                        <p>• Errores: {result.errors}</p>
                        {typeof result.adPerformanceSynced !== 'undefined' && (
                          <>
                            <p>• Anuncios sincronizados: {result.adPerformanceSynced}</p>
                            <p>• Errores en anuncios: {result.adPerformanceErrors}</p>
                            {result.adPerformanceSkipped > 0 && (
                              <p>• Datos históricos preservados: {result.adPerformanceSkipped}</p>
                            )}
                          </>
                        )}
                        {result.date && <p>• Fecha: {result.date}</p>}
                        {result.dateRange && <p>• Rango de fechas: {result.dateRange}</p>}
                        {result.daysProcessed && <p>• Días procesados: {result.daysProcessed}</p>}
                      </div>
                    )}
                  </div>
                ) : (
                  <p>{result.error || result.message}</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="mt-4 p-3 bg-gray-50 rounded-lg">
        <h4 className="text-sm font-medium text-gray-900 mb-2">Información del Sistema</h4>
        <div className="text-sm text-gray-600 space-y-1">
          <p><strong>Cron Job Automático:</strong></p>
          <p>• Se ejecuta cada 5 minutos sincronizando solo el día actual</p>
          <p>• Mantiene los datos frescos sin sobreescribir historial</p>
          <p><strong>Carga Inicial (al conectar cuentas):</strong></p>
          <p>• Obtiene automáticamente los últimos 30 días de historial</p>
          <p>• Permite análisis inmediato con contexto completo</p>
          <p><strong>Uso de datos:</strong></p>
          <p>• Gastos por producto y métricas detalladas por anuncio</p>
          <p>• Cálculo de ROAS y análisis de rendimiento en dashboard</p>
        </div>
      </div>
    </div>
  );
} 