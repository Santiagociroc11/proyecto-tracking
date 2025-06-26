import React, { useState } from 'react';
import { Zap, AlertCircle, CheckCircle, Clock } from 'lucide-react';

interface SyncResult {
  success: boolean;
  message?: string;
  totalProcessed?: number;
  totalErrors?: number;
  duration?: number;
  error?: string;
}

export default function MetaAdsSync() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);

  const handleSync = async () => {
    setLoading(true);
    setResult(null);

    try {
      const response = await fetch('/api/meta-ads/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      });

      const data = await response.json();
      setResult(data);
    } catch (error) {
      console.error('Error en sincronización de Meta Ads:', error);
      setResult({
        success: false,
        error: 'Error de conexión al servidor'
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center">
          <Zap className="h-6 w-6 text-blue-600 mr-3" />
          <div>
            <h3 className="text-lg font-medium text-gray-900">
              Sincronización de Meta Ads
            </h3>
            <p className="text-sm text-gray-500">
              Sincronizar datos detallados de campañas, conjuntos y anuncios de Meta
            </p>
          </div>
        </div>
        <button
          onClick={handleSync}
          disabled={loading}
          className={`inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white ${
            loading 
              ? 'bg-gray-400 cursor-not-allowed' 
              : 'bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500'
          }`}
        >
          {loading ? (
            <>
              <Clock className="h-4 w-4 mr-2 animate-spin" />
              Sincronizando...
            </>
          ) : (
            <>
              <Zap className="h-4 w-4 mr-2" />
              Sincronizar Ahora
            </>
          )}
        </button>
      </div>

      <div className="text-sm text-gray-600 mb-4">
        <p>
          <strong>Qué sincroniza:</strong> Campañas, conjuntos de anuncios, anuncios individuales, 
          métricas (gasto, impresiones, clicks, CPM, CPC, CTR), presupuestos y estados.
        </p>
        <p className="mt-1">
          <strong>Frecuencia automática:</strong> Cada 10 minutos (offset +2min del ad spend básico)
        </p>
      </div>

      {result && (
        <div className={`mt-4 p-4 rounded-md ${
          result.success 
            ? 'bg-green-50 border border-green-200' 
            : 'bg-red-50 border border-red-200'
        }`}>
          <div className="flex items-start">
            {result.success ? (
              <CheckCircle className="h-5 w-5 text-green-400 mt-0.5 mr-3 flex-shrink-0" />
            ) : (
              <AlertCircle className="h-5 w-5 text-red-400 mt-0.5 mr-3 flex-shrink-0" />
            )}
            <div className="flex-1">
              <h4 className={`text-sm font-medium ${
                result.success ? 'text-green-800' : 'text-red-800'
              }`}>
                {result.success ? 'Sincronización Exitosa' : 'Error en Sincronización'}
              </h4>
              <div className={`mt-1 text-sm ${
                result.success ? 'text-green-700' : 'text-red-700'
              }`}>
                {result.message && <p>{result.message}</p>}
                {result.error && <p>{result.error}</p>}
                
                {result.success && (
                  <div className="mt-2 grid grid-cols-3 gap-4 text-xs">
                    <div>
                      <span className="font-medium">Procesados:</span>
                      <span className="ml-1">{result.totalProcessed || 0}</span>
                    </div>
                    <div>
                      <span className="font-medium">Errores:</span>
                      <span className="ml-1">{result.totalErrors || 0}</span>
                    </div>
                    <div>
                      <span className="font-medium">Duración:</span>
                      <span className="ml-1">{result.duration || 0}ms</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="mt-4 text-xs text-gray-500">
        <p>
          <strong>Nota:</strong> Esta sincronización obtiene datos de ayer. Los datos del día actual 
          pueden estar incompletos hasta el final del día.
        </p>
      </div>
    </div>
  );
} 