import React, { useState } from 'react';
import { Sync, AlertCircle, CheckCircle } from 'lucide-react';

interface SyncResult {
  success: boolean;
  message?: string;
  processed?: number;
  errors?: number;
  date?: string;
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
          <Sync className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Sincronizando...' : 'Sincronizar Ahora'}
        </button>
      </div>

      <p className="text-sm text-gray-600 mb-4">
        Este proceso obtiene los gastos publicitarios del día actual desde Meta Ads API 
        y los guarda en la base de datos para cada producto configurado.
      </p>

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
                        <p>• Registros procesados: {result.processed}</p>
                        <p>• Errores: {result.errors}</p>
                        <p>• Fecha: {result.date}</p>
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
        <h4 className="text-sm font-medium text-gray-900 mb-2">Información del Cron Job</h4>
        <div className="text-sm text-gray-600 space-y-1">
          <p>• Se ejecuta automáticamente cada 10 minutos</p>
          <p>• Procesa todas las integraciones activas de Meta</p>
          <p>• Guarda los gastos por producto y cuenta publicitaria</p>
          <p>• Los datos se usan para calcular ROAS en el dashboard</p>
        </div>
      </div>
    </div>
  );
} 