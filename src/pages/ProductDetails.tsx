import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Copy, CheckCircle, ArrowLeft, Code2, Globe, Webhook, Facebook, AlertTriangle, ExternalLink, Info } from 'lucide-react';
import AnalyticsDashboard from '../components/AnalyticsDashboard';
import { useAuth } from '../contexts/AuthContext';

interface Product {
  id: string;
  name: string;
  tracking_id: string;
  active: boolean;
  created_at: string;
  fb_pixel_id: string | null;
  fb_access_token: string | null;
  fb_test_event_code: string | null;
  user_id: string;
}

export default function ProductDetails() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [product, setProduct] = useState<Product | null>(null);
  const [copied, setCopied] = useState<'script' | 'webhook' | null>(null);
  const [fbPixelId, setFbPixelId] = useState('');
  const [fbAccessToken, setFbAccessToken] = useState('');
  const [fbTestEventCode, setFbTestEventCode] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'setup' | 'analytics'>('setup');
  const [currentStep, setCurrentStep] = useState(1);

  useEffect(() => {
    if (user && id) {
      loadProduct();
    }
  }, [id, user]);

  async function loadProduct() {
    if (!id || !user) return;

    try {
      setLoading(true);
      setError('');

      const { data: userData } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single();

      const { data: product, error: productError } = await supabase
        .from('products')
        .select('*')
        .eq('id', id)
        .single();

      if (productError || !product) {
        throw new Error('Producto no encontrado');
      }

      if (product.user_id !== user.id && userData?.role !== 'admin') {
        throw new Error('No tienes acceso a este producto');
      }

      setProduct(product);
      setFbPixelId(product.fb_pixel_id || '');
      setFbAccessToken(product.fb_access_token || '');
      setFbTestEventCode(product.fb_test_event_code || '');
    } catch (err) {
      console.error('Error loading product:', err);
      setError(err instanceof Error ? err.message : 'Error cargando el producto');
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveFacebookConfig(e: React.FormEvent) {
    e.preventDefault();
    if (!id || !user) return;

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
        .eq('id', id)
        .eq('user_id', user.id);

      if (error) throw error;
      
      await loadProduct();
      setCurrentStep(3);
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

  function copyToClipboard(text: string, type: 'script' | 'webhook') {
    navigator.clipboard.writeText(text);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-red-50 border-l-4 border-red-400 p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <AlertTriangle className="h-5 w-5 text-red-400" />
            </div>
            <div className="ml-3">
              <p className="text-sm text-red-700">{error || 'Error cargando el producto'}</p>
              <Link to="/" className="mt-2 text-sm text-red-700 underline">Volver al inicio</Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6 flex items-center justify-between">
        <Link
          to="/"
          className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Volver al Dashboard
        </Link>
        <div className="flex items-center">
          <h1 className="text-2xl font-bold text-gray-900 mr-3">{product.name}</h1>
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${
            product.active 
              ? 'bg-green-100 text-green-800' 
              : 'bg-red-100 text-red-800'
          }`}>
            {product.active ? 'Activo' : 'Inactivo'}
          </span>
        </div>
      </div>

      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex" aria-label="Tabs">
            <button
              onClick={() => setActiveTab('setup')}
              className={`${
                activeTab === 'setup'
                  ? 'border-indigo-500 text-indigo-600 bg-indigo-50'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } w-1/2 py-4 px-1 text-center border-b-2 font-medium text-sm flex items-center justify-center`}
            >
              <Code2 className="h-4 w-4 mr-2" />
              Guía de Instalación
            </button>
            <button
              onClick={() => setActiveTab('analytics')}
              className={`${
                activeTab === 'analytics'
                  ? 'border-indigo-500 text-indigo-600 bg-indigo-50'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } w-1/2 py-4 px-1 text-center border-b-2 font-medium text-sm flex items-center justify-center`}
            >
              <Globe className="h-4 w-4 mr-2" />
              Analytics
            </button>
          </nav>
        </div>

        {activeTab === 'setup' ? (
          <div className="px-4 py-5 sm:px-6">
            <div className="mb-8">
              <div className="relative">
                <div className="absolute inset-0 flex items-center" aria-hidden="true">
                  <div className="w-full border-t border-gray-200"></div>
                </div>
                <div className="relative flex justify-between">
                  {[
                    { step: 1, title: 'Facebook', icon: <Facebook className="h-4 w-4" /> },
                    { step: 2, title: 'Script', icon: <Code2 className="h-4 w-4" /> },
                    { step: 3, title: 'Hotmart', icon: <Webhook className="h-4 w-4" /> }
                  ].map(({ step, title, icon }) => (
                    <button
                      key={step}
                      onClick={() => setCurrentStep(step)}
                      className={`${
                        currentStep === step
                          ? 'border-indigo-500 bg-indigo-600 text-white'
                          : currentStep > step
                          ? 'border-indigo-500 bg-indigo-100 text-indigo-500'
                          : 'border-gray-200 bg-white text-gray-500'
                      } relative w-24 h-24 rounded-full border-2 flex flex-col items-center justify-center text-sm font-medium hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500`}
                    >
                      <div className={`mb-1 ${currentStep === step ? 'text-white' : ''}`}>
                        {icon}
                      </div>
                      <span className={`text-xs ${currentStep === step ? 'text-white' : 'text-gray-500'}`}>
                        {title}
                      </span>
                      <span className="absolute -top-2 left-1/2 transform -translate-x-1/2 w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs">
                        {step}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-12">
                {currentStep === 1 && (
                  <div className="space-y-6">
                    <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
                      <div className="p-6">
                        <h4 className="text-lg font-medium text-gray-900 flex items-center">
                          <Facebook className="h-5 w-5 mr-2 text-indigo-500" />
                          Configurar Facebook Pixel
                        </h4>
                        <div className="mt-2 text-sm text-gray-500">
                          <p className="mb-4">Para rastrear las conversiones de tus ventas en Facebook Ads, necesitas configurar el Pixel:</p>
                          <ol className="list-decimal list-inside space-y-3">
                            <li>Accede a tu <a href="https://business.facebook.com/events_manager" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:text-indigo-500">Events Manager <ExternalLink className="h-3 w-3 inline" /></a></li>
                            <li>Crea un nuevo Pixel o selecciona uno existente</li>
                            <li>Copia el ID del Pixel y el Token de Acceso</li>
                          </ol>
                        </div>
                        <div className="mt-6">
                          <form onSubmit={handleSaveFacebookConfig} className="space-y-4">
                            <div>
                              <label htmlFor="fbPixelId" className="block text-sm font-medium text-gray-700">
                                ID del Píxel
                              </label>
                              <input
                                type="text"
                                id="fbPixelId"
                                value={fbPixelId}
                                onChange={(e) => setFbPixelId(e.target.value)}
                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                                placeholder="Ej: 123456789012345"
                                required
                              />
                            </div>

                            <div>
                              <label htmlFor="fbAccessToken" className="block text-sm font-medium text-gray-700">
                                Token de Acceso
                              </label>
                              <input
                                type="text"
                                id="fbAccessToken"
                                value={fbAccessToken}
                                onChange={(e) => setFbAccessToken(e.target.value)}
                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                                placeholder="Ej: EAAxxxxx..."
                                required
                              />
                              <p className="mt-1 text-xs text-gray-500">
                                Encuentra esto en Events Manager → Configuración → Token de Acceso
                              </p>
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

                            <div className="flex justify-end pt-4">
                              <button
                                type="submit"
                                disabled={saving}
                                className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                              >
                                {saving ? 'Guardando...' : 'Guardar y Continuar'}
                              </button>
                            </div>
                          </form>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {currentStep === 2 && (
                  <div className="space-y-6">
                    <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
                      <div className="p-6">
                        <h4 className="text-lg font-medium text-gray-900 flex items-center">
                          <Code2 className="h-5 w-5 mr-2 text-indigo-500" />
                          Instalar Script de Seguimiento
                        </h4>
                        <div className="mt-2 text-sm text-gray-500">
                          <p className="mb-4">Para comenzar a rastrear las visitas y conversiones, agrega este código a tu página de venta:</p>
                          <ol className="list-decimal list-inside space-y-3 mb-4">
                            <li>Accede al editor de tu página de venta</li>
                            <li>Localiza la etiqueta <code>&lt;/body&gt;</code> al final de tu HTML</li>
                            <li>Pega el siguiente código justo antes de esa etiqueta:</li>
                          </ol>
                        </div>
                        <div className="relative mt-4">
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
                        <div className="mt-6 flex justify-between">
                          <button
                            onClick={() => setCurrentStep(1)}
                            className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                          >
                            Anterior
                          </button>
                          <button
                            onClick={() => setCurrentStep(3)}
                            className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                          >
                            Siguiente: Configurar Hotmart
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {currentStep === 3 && (
                  <div className="space-y-6">
                    <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
                      <div className="p-6">
                        <h4 className="text-lg font-medium text-gray-900 flex items-center">
                          <Webhook className="h-5 w-5 mr-2 text-indigo-500" />
                          Configurar Webhook en Hotmart
                        </h4>
                        <div className="mt-2 text-sm text-gray-500">
                          <p className="mb-4">Para recibir notificaciones de ventas en tiempo real, configura el webhook en Hotmart:</p>
                          <ol className="list-decimal list-inside space-y-3">
                            <li>Accede a tu <a href="https://app-vlc.hotmart.com/" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:text-indigo-500">Panel de Hotmart <ExternalLink className="h-3 w-3 inline" /></a></li>
                            <li>Ve a la configuración de tu producto</li>
                            <li>Busca la sección de "Notificaciones" o "Webhooks"</li>
                            <li>Agrega esta URL como nuevo webhook:</li>
                          </ol>
                        </div>
                        <div className="mt-4">
                          <div className="flex items-center space-x-2">
                            <code className="bg-gray-100 px-3 py-2 rounded-md flex-grow text-sm">{getWebhookUrl()}</code>
                            <button
                              onClick={() => copyToClipboard(getWebhookUrl(), 'webhook')}
                              className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                            >
                              {copied === 'webhook' ? (
                                <>
                                  <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
                                  ¡Copiado!
                                </>
                              ) : (
                                <>
                                  <Copy className="h-4 w-4 text-gray-500 mr-2" />
                                  Copiar URL
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                        <div className="mt-6 flex justify-between">
                          <button
                            onClick={() => setCurrentStep(2)}
                            className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                          >
                            Anterior
                          </button>
                          <button
                            onClick={() => setActiveTab('analytics')}
                            className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                          >
                            Ver Analytics
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <AnalyticsDashboard productId={product.id} />
        )}
      </div>
    </div>
  );
}