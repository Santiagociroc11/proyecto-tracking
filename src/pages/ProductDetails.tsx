import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Copy, CheckCircle, ArrowLeft } from 'lucide-react';
import AnalyticsDashboard from '../components/AnalyticsDashboard';

interface Product {
  id: string;
  name: string;
  tracking_id: string;
  active: boolean;
  created_at: string;
  fb_pixel_id: string | null;
  fb_access_token: string | null;
  fb_test_event_code: string | null;
}

export default function ProductDetails() {
  const { id } = useParams<{ id: string }>();
  const [product, setProduct] = useState<Product | null>(null);
  const [copied, setCopied] = useState<'id' | 'script' | 'webhook' | null>(null);
  const [fbPixelId, setFbPixelId] = useState('');
  const [fbAccessToken, setFbAccessToken] = useState('');
  const [fbTestEventCode, setFbTestEventCode] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'setup' | 'analytics'>('setup');

  useEffect(() => {
    loadProduct();
  }, [id]);

  async function loadProduct() {
    if (!id) return;

    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error loading product:', error);
      return;
    }

    setProduct(data);
    setFbPixelId(data.fb_pixel_id || '');
    setFbAccessToken(data.fb_access_token || '');
    setFbTestEventCode(data.fb_test_event_code || '');
  }

  async function handleSaveFacebookConfig(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      const { error } = await supabase
        .from('products')
        .update({
          fb_pixel_id: fbPixelId,
          fb_access_token: fbAccessToken,
          fb_test_event_code: fbTestEventCode
        })
        .eq('id', id);

      if (error) throw error;
      
      await loadProduct();
    } catch (err) {
      console.error('Error saving Facebook config:', err);
      setError('Error al guardar la configuración de Facebook');
    } finally {
      setSaving(false);
    }
  }

  function getWebhookUrl() {
    return `${window.location.origin}/api/hotmart/webhook`;
  }

  function getTrackingScript() {
    if (!product) return '';
    
    return `<!-- Script de Seguimiento -->
<script>
(function() {
  var t = document.createElement('script');
  t.async = true;
  t.src = '${window.location.origin}/track.js';
  t.setAttribute('data-tracking-id', '${product.tracking_id}');
  var s = document.getElementsByTagName('script')[0];
  s.parentNode.insertBefore(t, s);
  window._lt = window._lt || [];
  window._lt.push(['init', '${product.tracking_id}']);
})();
</script>
<!-- Fin del Script de Seguimiento -->

${product.fb_pixel_id ? `<!-- Meta Pixel Code -->
<script>
!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${product.fb_pixel_id}');
fbq('track', 'PageView');
</script>
<noscript>
  <img height="1" width="1" style="display:none" 
       src="https://www.facebook.com/tr?id=${product.fb_pixel_id}&ev=PageView&noscript=1"/>
</noscript>
<!-- End Meta Pixel Code -->` : ''}`;
  }

  function copyToClipboard(text: string, type: 'id' | 'script' | 'webhook') {
    navigator.clipboard.writeText(text);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  }

  if (!product) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <Link
          to="/dashboard"
          className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Volver al Dashboard
        </Link>
      </div>

      <div className="bg-white shadow overflow-hidden sm:rounded-lg">
        <div className="px-4 py-5 sm:px-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900">
            {product.name}
          </h3>
          <p className="mt-1 max-w-2xl text-sm text-gray-500">
            {product.active ? 'Activo' : 'Inactivo'}
          </p>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex" aria-label="Tabs">
            <button
              onClick={() => setActiveTab('setup')}
              className={`${
                activeTab === 'setup'
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } w-1/2 py-4 px-1 text-center border-b-2 font-medium text-sm`}
            >
              Configuración
            </button>
            <button
              onClick={() => setActiveTab('analytics')}
              className={`${
                activeTab === 'analytics'
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } w-1/2 py-4 px-1 text-center border-b-2 font-medium text-sm`}
            >
              Analytics
            </button>
          </nav>
        </div>

        <div className="px-4 py-5 sm:px-6">
          {activeTab === 'setup' ? (
            <dl className="grid grid-cols-1 gap-x-4 gap-y-8 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <dt className="text-sm font-medium text-gray-500">Configuración de Facebook</dt>
                <dd className="mt-1">
                  <form onSubmit={handleSaveFacebookConfig} className="space-y-4">
                    {error && (
                      <div className="bg-red-50 border-l-4 border-red-400 p-4">
                        <div className="flex">
                          <div className="flex-shrink-0">
                            <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                            </svg>
                          </div>
                          <div className="ml-3">
                            <p className="text-sm text-red-700">{error}</p>
                          </div>
                        </div>
                      </div>
                    )}

                    <div>
                      <label htmlFor="fbPixelId" className="block text-sm font-medium text-gray-700">
                        ID del Píxel de Facebook
                      </label>
                      <input
                        type="text"
                        id="fbPixelId"
                        value={fbPixelId}
                        onChange={(e) => setFbPixelId(e.target.value)}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                        placeholder="Ej: 123456789012345"
                      />
                    </div>

                    <div>
                      <label htmlFor="fbAccessToken" className="block text-sm font-medium text-gray-700">
                        Token de Acceso de la API de Conversiones
                      </label>
                      <input
                        type="text"
                        id="fbAccessToken"
                        value={fbAccessToken}
                        onChange={(e) => setFbAccessToken(e.target.value)}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                        placeholder="Ej: EAAxxxxx..."
                      />
                    </div>

                    <div>
                      <label htmlFor="fbTestEventCode" className="block text-sm font-medium text-gray-700">
                        Código de Evento de Prueba (opcional)
                      </label>
                      <input
                        type="text"
                        id="fbTestEventCode"
                        value={fbTestEventCode}
                        onChange={(e) => setFbTestEventCode(e.target.value)}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                        placeholder="Ej: TEST123"
                      />
                    </div>

                    <div>
                      <button
                        type="submit"
                        disabled={saving}
                        className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                      >
                        {saving ? 'Guardando...' : 'Guardar Configuración'}
                      </button>
                    </div>
                  </form>
                </dd>
              </div>

              <div className="sm:col-span-2">
                <dt className="text-sm font-medium text-gray-500">URL del Webhook de Hotmart</dt>
                <dd className="mt-1">
                  <div className="flex items-center space-x-2">
                    <code className="bg-gray-100 px-2 py-1 rounded">{getWebhookUrl()}</code>
                    <button
                      onClick={() => copyToClipboard(getWebhookUrl(), 'webhook')}
                      className="inline-flex items-center px-2.5 py-1.5 border border-gray-300 shadow-sm text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                    >
                      {copied === 'webhook' ? (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      ) : (
                        <Copy className="h-4 w-4 text-gray-500" />
                      )}
                      <span className="ml-1">{copied === 'webhook' ? '¡Copiado!' : 'Copiar'}</span>
                    </button>
                  </div>
                  <p className="mt-2 text-sm text-gray-500">
                    Copia esta URL y pégala en la configuración de webhooks de tu producto en Hotmart.
                  </p>
                </dd>
              </div>

              <div className="sm:col-span-2">
                <dt className="text-sm font-medium text-gray-500">ID de Seguimiento</dt>
                <dd className="mt-1 text-sm text-gray-900">
                  <div className="flex items-center space-x-2">
                    <code className="bg-gray-100 px-2 py-1 rounded">{product.tracking_id}</code>
                    <button
                      onClick={() => copyToClipboard(product.tracking_id, 'id')}
                      className="inline-flex items-center px-2.5 py-1.5 border border-gray-300 shadow-sm text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                    >
                      {copied === 'id' ? (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      ) : (
                        <Copy className="h-4 w-4 text-gray-500" />
                      )}
                      <span className="ml-1">{copied === 'id' ? '¡Copiado!' : 'Copiar'}</span>
                    </button>
                  </div>
                </dd>
              </div>

              <div className="sm:col-span-2">
                <dt className="text-sm font-medium text-gray-500 mb-2">Instrucciones de Integración</dt>
                <dd className="mt-1 text-sm text-gray-900">
                  <div className="prose prose-sm max-w-none">
                    <p>Para comenzar a rastrear analíticas para {product.name}, sigue estos pasos:</p>
                    <ol className="list-decimal list-inside space-y-2 mt-2">
                      <li>Copia el script de seguimiento de abajo</li>
                      <li>Pégalo justo antes de la etiqueta de cierre <code>&lt;/body&gt;</code> en tu HTML</li>
                      <li>Copia la URL del webhook y configúrala en tu producto de Hotmart</li>
                      <li>El sistema comenzará a rastrear automáticamente las visitas y compras</li>
                    </ol>
                  </div>
                </dd>
              </div>

              <div className="sm:col-span-2">
                <dt className="text-sm font-medium text-gray-500">Script de Seguimiento</dt>
                <dd className="mt-1">
                  <div className="relative">
                    <pre className="bg-gray-800 text-white p-4 rounded-lg text-sm overflow-x-auto">
                      {getTrackingScript()}
                    </pre>
                    <button
                      onClick={() => copyToClipboard(getTrackingScript(), 'script')}
                      className="absolute top-2 right-2 inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md text-white bg-gray-700 hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-indigo-500"
                    >
                      {copied === 'script' ? (
                        <>
                          <CheckCircle className="h-4 w-4 mr-1" />
                          ¡Copiado!
                        </>
                      ) : (
                        <>
                          <Copy className="h-4 w-4 mr-1" />
                          Copiar Script
                        </>
                      )}
                    </button>
                  </div>
                </dd>
              </div>
            </dl>
          ) : (
            <AnalyticsDashboard productId={product.id} />
          )}
        </div>
      </div>
    </div>
  );
}