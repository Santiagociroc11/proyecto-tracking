import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Copy, CheckCircle, ArrowLeft, Code2, Globe, Webhook, Facebook, AlertTriangle, ExternalLink, Info, Edit2, Trash2, Unlink } from 'lucide-react';
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

interface MetaIntegration {
  id: string;
  meta_ad_account_id: string | null;
  meta_business_id: string | null;
  status: string;
  created_at: string;
}

export default function ProductDetails() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const navigate = useNavigate();
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
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  
  // Estados para la integración con Meta
  const [metaIntegration, setMetaIntegration] = useState<MetaIntegration | null>(null);
  const [connectingMeta, setConnectingMeta] = useState(false);

  useEffect(() => {
    // Set initial active tab based on URL parameter
    const tab = searchParams.get('tab');
    if (tab === 'analytics') {
      setActiveTab('analytics');
    }
  }, [searchParams]);

  useEffect(() => {
    if (user && id) {
      loadProduct();
      loadMetaIntegration();
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
      setEditedName(product.name);
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

  async function loadMetaIntegration() {
    if (!id || !user) return;

    try {
      const { data: integration, error } = await supabase
        .from('product_integrations')
        .select('*')
        .eq('product_id', id)
        .eq('provider', 'meta')
        .eq('status', 'active')
        .single();

      if (!error && integration) {
        setMetaIntegration(integration);
      }
    } catch (err) {
      console.error('Error loading Meta integration:', err);
    }
  }

  async function handleSaveName() {
    if (!id || !user || !editedName.trim()) return;

    setSaving(true);
    setError('');

    try {
      const { error } = await supabase
        .from('products')
        .update({ name: editedName.trim() })
        .eq('id', id)
        .eq('user_id', user.id);

      if (error) throw error;

      await loadProduct();
      setIsEditing(false);
    } catch (err) {
      console.error('Error updating product name:', err);
      setError('Error al actualizar el nombre del producto');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteProduct() {
    if (!id || !user) return;

    setSaving(true);
    setError('');

    try {
      // Primero eliminamos los datos de tracking_events
      const { error: trackingEventsError } = await supabase
        .from('tracking_events')
        .delete()
        .eq('product_id', id);

      if (trackingEventsError) {
        console.error('Error deleting tracking events:', trackingEventsError);
      }

      // Eliminamos los datos de hotmart_clicks
      const { error: hotmartClicksError } = await supabase
        .from('hotmart_clicks')
        .delete()
        .eq('product_id', id);

      if (hotmartClicksError) {
        console.error('Error deleting hotmart clicks:', hotmartClicksError);
      }

      // Ahora podemos eliminar el producto
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);

      if (error) throw error;

      navigate('/');
    } catch (err) {
      console.error('Error deleting product:', err);
      let errorMessage = 'Error al eliminar el producto';
      if (err instanceof Error) {
        // Intentamos dar un mensaje más descriptivo para los errores comunes
        if (err.message.includes('foreign key constraint')) {
          errorMessage = 'No se puede eliminar el producto porque tiene datos asociados. Contacte al soporte técnico.';
        } else {
          errorMessage = err.message;
        }
      }
      setError(errorMessage);
      setSaving(false);
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
      setCurrentStep(2);
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

  async function handleConnectMeta() {
    if (!id || !user) return;

    setConnectingMeta(true);
    try {
      // Variables de entorno que necesitarás configurar
      const META_APP_ID = import.meta.env.VITE_META_APP_ID;
      const REDIRECT_URI = `${window.location.origin}/api/auth/meta/callback`;

      if (!META_APP_ID) {
        throw new Error('Meta App ID no configurado');
      }

      // Generar state para seguridad CSRF
      const state = Math.random().toString(36).substring(2);
      localStorage.setItem('oauth_state', state);
      localStorage.setItem('oauth_product_id', id);

      // Permisos necesarios para obtener datos de ads
      const scopes = 'public_profile,email';

      // URL de autorización de Meta
      const authUrl = `https://www.facebook.com/v19.0/dialog/oauth?client_id=${META_APP_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&state=${state}&scope=${scopes}&response_type=code`;

      // Abrir popup en lugar de redirigir
      const popup = window.open(
        authUrl,
        'MetaAuth',
        'width=600,height=700,scrollbars=yes,resizable=yes,status=yes,location=yes,toolbar=no,menubar=no'
      );

      if (!popup) {
        throw new Error('No se pudo abrir el popup. Verifica que no esté bloqueado por el navegador.');
      }

      // Monitorear el popup para detectar cuando se cierre o complete
      const checkClosed = setInterval(() => {
        if (popup.closed) {
          clearInterval(checkClosed);
          setConnectingMeta(false);
          
          // Verificar si la conexión fue exitosa
          const urlParams = new URLSearchParams(window.location.search);
          if (urlParams.get('meta_auth_success') === 'true') {
            // Recargar la integración para mostrar el estado actualizado
            loadMetaIntegration();
            
            // Limpiar los parámetros de la URL
            const newUrl = window.location.pathname;
            window.history.replaceState({}, document.title, newUrl);
            
            // La integración será recargada automáticamente
            console.log('Meta conectado exitosamente');
          }
        }
      }, 1000);

      // También escuchar mensajes del popup (método alternativo más elegante)
      const handleMessage = (event: MessageEvent) => {
        if (event.origin !== window.location.origin) return;
        
        if (event.data.type === 'META_AUTH_SUCCESS') {
          clearInterval(checkClosed);
          popup.close();
          setConnectingMeta(false);
          loadMetaIntegration();
          
                      // Mostrar mensaje de éxito - en un futuro podrías usar un toast
            console.log('¡Meta conectado exitosamente!');
          window.removeEventListener('message', handleMessage);
        } else if (event.data.type === 'META_AUTH_ERROR') {
          clearInterval(checkClosed);
          popup.close();
          setConnectingMeta(false);
          setError('Error conectando con Meta: ' + event.data.error);
          window.removeEventListener('message', handleMessage);
        }
      };

      window.addEventListener('message', handleMessage);

      // Timeout de seguridad (cerrar después de 5 minutos)
      setTimeout(() => {
        if (!popup.closed) {
          popup.close();
          clearInterval(checkClosed);
          setConnectingMeta(false);
          window.removeEventListener('message', handleMessage);
        }
      }, 5 * 60 * 1000);

    } catch (err) {
      console.error('Error connecting to Meta:', err);
      setError(err instanceof Error ? err.message : 'Error conectando con Meta');
      setConnectingMeta(false);
    }
  }

  async function handleDisconnectMeta() {
    if (!id || !user || !metaIntegration) return;

    const confirmDisconnect = confirm('¿Estás seguro que quieres desconectar la integración con Meta? Esto detendrá la sincronización de datos de gasto publicitario.');
    
    if (!confirmDisconnect) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('product_integrations')
        .update({ status: 'revoked' })
        .eq('id', metaIntegration.id);

      if (error) throw error;

      setMetaIntegration(null);
    } catch (err) {
      console.error('Error disconnecting Meta:', err);
      setError('Error al desconectar la integración con Meta');
    } finally {
      setSaving(false);
    }
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
    <div className="max-w-8xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6 flex items-center justify-between">
        <Link
          to="/"
          className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Volver al Dashboard
        </Link>
        <div className="flex items-center space-x-4">
          {isEditing ? (
            <div className="flex items-center space-x-2">
              <input
                type="text"
                value={editedName}
                onChange={(e) => setEditedName(e.target.value)}
                className="border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              />
              <button
                onClick={handleSaveName}
                disabled={saving}
                className="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700"
              >
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
              <button
                onClick={() => {
                  setIsEditing(false);
                  setEditedName(product.name);
                }}
                className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <div className="flex items-center">
              <h1 className="text-2xl font-bold text-gray-900 mr-3">{product.name}</h1>
              <button
                onClick={() => setIsEditing(true)}
                className="p-1 text-gray-400 hover:text-gray-600"
                title="Editar nombre"
              >
                <Edit2 className="h-4 w-4" />
              </button>
            </div>
          )}
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${product.active
            ? 'bg-green-100 text-green-800'
            : 'bg-red-100 text-red-800'
            }`}>
            {product.active ? 'Activo' : 'Inactivo'}
          </span>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="inline-flex items-center px-4 py-2 border border-red-300 rounded-md shadow-sm text-sm font-medium text-red-700 bg-white hover:bg-red-50"
            title="Eliminar producto"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-medium text-gray-900 mb-4">
              ¿Estás seguro de que quieres eliminar este producto?
            </h3>
            <p className="text-sm text-gray-500 mb-6">
              Esta acción no se puede deshacer. Se eliminarán todos los datos asociados al producto (eventos de tracking, clicks de Hotmart, etc.).
            </p>
            <div className="flex justify-end space-x-4">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleDeleteProduct}
                disabled={saving}
                className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700"
              >
                {saving ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex" aria-label="Tabs">
            <button
              onClick={() => setActiveTab('setup')}
              className={`${activeTab === 'setup'
                ? 'border-indigo-500 text-indigo-600 bg-indigo-50'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                } w-1/2 py-4 px-1 text-center border-b-2 font-medium text-sm flex items-center justify-center`}
            >
              <Code2 className="h-4 w-4 mr-2" />
              Guía de Instalación
            </button>
            <button
              onClick={() => setActiveTab('analytics')}
              className={`${activeTab === 'analytics'
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
                    { step: 3, title: 'Hotmart', icon: <Webhook className="h-4 w-4" /> },
                    { step: 4, title: 'UTMs', icon: <Info className="h-4 w-4" /> }
                  ].map(({ step, title, icon }) => (
                    <button
                      key={step}
                      onClick={() => setCurrentStep(step)}
                      className={`${currentStep === step
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
                                Código de TEST EVENT (opcional)
                              </label>
                              
                              <input
                                type="text"
                                id="fbTestEventCode"
                                value={fbTestEventCode}
                                onChange={(e) => setFbTestEventCode(e.target.value)}
                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                                placeholder="Ej: TEST123"
                              />
                              <div className="mt-2 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                                <div className="flex items-center text-yellow-800">
                                  <AlertTriangle className="h-5 w-5 mr-2 text-yellow-600" />
                                  <p className="text-xs">
                                    Este TEST EVENT es temporal y sirve únicamente para verificar la correcta llegada de eventos API al pixel.
                                    <span className="ml-1 font-bold text-red-600">
                                      Debes eliminarlo antes de comenzar a recibir ventas reales.
                                    </span>
                                  </p>
                                </div>
                              </div>
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
                          <ol className="space-y-4">
                            <li className="flex items-start">
                              <span className="bg-indigo-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm mr-3 flex-shrink-0">1</span>
                              <span className="text-gray-700">Accede al editor de tu página de venta</span>
                            </li>
                            <li className="flex items-start">
                              <span className="bg-indigo-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm mr-3 flex-shrink-0">2</span>
                              <div className="text-gray-700">
                                Debes instalar este script en el <code className="bg-gray-100 px-2 py-0.5 rounded text-indigo-600 font-mono">&lt;/HEAD&gt;</code> de la página
                                <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg p-4 text-amber-800">
                                  <div className="flex items-center">
                                    <AlertTriangle className="h-5 w-5 mr-2 text-amber-500" />
                                    <span className="font-semibold">IMPORTANTE</span>
                                  </div>
                                  <p className="mt-1">Asegúrate de borrar cualquier script de trackeo anterior relacionado con Hotmart. También quita el pixel de Facebook de la página, nuestro script lo dispara automáticamente.</p>
                                </div>
                              </div>
                            </li>
                            <li className="flex items-start">
                              <span className="bg-indigo-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm mr-3 flex-shrink-0">3</span>
                              <div className="text-gray-700">
                                Pega el siguiente código justo antes de esa etiqueta
                                <div className="mt-2 bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">
                                  <div className="flex items-center">
                                    <AlertTriangle className="h-5 w-5 mr-2 text-red-500" />
                                    <span className="font-semibold">¡ATENCIÓN!</span>
                                  </div>
                                  <p className="mt-1">Si cambias el pixel por algún motivo, deberás volver a esta pantalla, copiar e instalar nuevamente EL SCRIPT COMPLETO en tu página de venta.</p>
                                </div>
                              </div>
                            </li>
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

                        {/* Nueva sección: Integración con Meta */}
                        <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
                          <div className="p-6">
                            <h4 className="text-lg font-medium text-gray-900 flex items-center">
                              <Facebook className="h-5 w-5 mr-2 text-blue-600" />
                              Integración con Meta (Opcional)
                            </h4>
                            <div className="mt-2 text-sm text-gray-500">
                              <p className="mb-4">
                                Conecta tu cuenta publicitaria de Meta para sincronizar automáticamente el gasto de tus campañas 
                                y obtener métricas avanzadas de ROAS (Return on Ad Spend).
                              </p>
                            </div>

                            {metaIntegration ? (
                              // Usuario ya tiene Meta conectado
                              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                                <div className="flex items-start">
                                  <CheckCircle className="h-5 w-5 text-green-400 mt-0.5" />
                                  <div className="ml-3 flex-1">
                                    <h3 className="text-sm font-medium text-green-800">
                                      ¡Meta conectado exitosamente!
                                    </h3>
                                    <div className="mt-2 text-sm text-green-700">
                                      <p>Tu cuenta de Meta está conectada y sincronizando datos.</p>
                                      {metaIntegration.meta_ad_account_id && (
                                        <p className="mt-1">
                                          <span className="font-medium">Cuenta publicitaria:</span> {metaIntegration.meta_ad_account_id}
                                        </p>
                                      )}
                                      <p className="mt-1">
                                        <span className="font-medium">Conectado desde:</span> {new Date(metaIntegration.created_at).toLocaleDateString()}
                                      </p>
                                    </div>
                                    <div className="mt-4">
                                      <button
                                        onClick={handleDisconnectMeta}
                                        disabled={saving}
                                        className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-red-700 bg-red-100 hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50"
                                      >
                                        <Unlink className="h-4 w-4 mr-2" />
                                        {saving ? 'Desconectando...' : 'Desconectar Meta'}
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              // Usuario no tiene Meta conectado
                              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                <div className="flex items-start">
                                  <Info className="h-5 w-5 text-blue-400 mt-0.5" />
                                  <div className="ml-3 flex-1">
                                    <h3 className="text-sm font-medium text-blue-800">
                                      Conecta tu cuenta de Meta
                                    </h3>
                                    <div className="mt-2 text-sm text-blue-700">
                                      <p>Al conectar Meta podrás:</p>
                                      <ul className="list-disc list-inside mt-2 space-y-1">
                                        <li>Ver el gasto publicitario automáticamente en tu dashboard</li>
                                        <li>Calcular el ROAS (Return on Ad Spend) en tiempo real</li>
                                        <li>Optimizar tus campañas con datos precisos</li>
                                        <li>Generar reportes completos de rendimiento</li>
                                      </ul>
                                    </div>
                                    <div className="mt-4">
                                      <button
                                        onClick={handleConnectMeta}
                                        disabled={connectingMeta}
                                        className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                                      >
                                        {connectingMeta ? (
                                          <>
                                            <svg className="animate-spin -ml-1 mr-3 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                            </svg>
                                            Abriendo popup...
                                          </>
                                        ) : (
                                          <>
                                            <Facebook className="h-4 w-4 mr-2" />
                                            Conectar con Meta
                                          </>
                                        )}
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Botones de navegación */}
                        <div className="flex justify-between">
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
                            <li>Agrega esta URL como nuevo webhook:
                              <div className="mt-2 rounded-lg border border-red-200 bg-red-50 p-4">
                                <div className="flex">
                                  <div className="flex-shrink-0">
                                    <AlertTriangle className="h-5 w-5 text-red-400" />
                                  </div>
                                  <div className="ml-3">
                                    <h3 className="text-sm font-medium text-red-800">¡Aviso Importante!</h3>
                                    <div className="mt-2 text-sm text-red-700">
                                      Elimina el pixel del producto en Hotmart. Nuestro sistema lo dispara automáticamente en pagos iniciados y compras.
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </li>
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
                        <div className="mt-6 text-sm text-gray-500">
                          <p className="mb-2"><strong>Configuración del webhook:</strong></p>
                          <ul className="list-disc list-inside space-y-2">
                            <li><strong>Evento:</strong> Selecciona el evento "PURCHASE_APPROVED" para recibir notificaciones solo cuando las compras sean aprobadas.</li>
                            <li><strong>Versión: 2</strong></li>
                          </ul>
                        </div>
                        <div className="mt-6 flex justify-between">
                          <button
                            onClick={() => setCurrentStep(2)}
                            className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                          >
                            Anterior
                          </button>
                          <button
                            onClick={() => setCurrentStep(4)}
                            className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                          >
                            Siguiente: Configurar UTM
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {currentStep === 4 && (
                  <div className="space-y-6">
                    <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
                      <div className="p-6">
                        <h4 className="text-lg font-medium text-gray-900 flex items-center">
                          <Info className="h-5 w-5 mr-2 text-indigo-500" />
                          Configuración de UTMs en los Links de Facebook Ads
                        </h4>
                        <div className="mt-2 text-sm text-gray-500">
                          <p className="mb-4">
                            Para rastrear correctamente las conversiones provenientes de Facebook Ads, es esencial que todos los enlaces a tu página de ventas contengan los parámetros UTM.
                          </p>
                          <p className="mb-4">
                            Facebook Ads ofrece parámetros dinámicos que facilitan la asignación automática de nombres a las UTMs basándose en la información de tu anuncio.
                          </p>
                          <h5 className="text-md font-medium text-gray-700 mb-2">Cómo Configurar:</h5>
                          <ol className="list-decimal list-inside space-y-3">
                            <li>Accede a tu cuenta de Facebook Ads y selecciona los anuncios deseados.</li>
                            <li>Haz clic en "Editar" y localiza el campo "URL del sitio web" y pon esto al final:</li>
                          </ol>
                        </div>
                        <div className="mt-4">
                          <div className="flex items-center space-x-2">
                            <code className="bg-gray-100 px-3 py-2 rounded-md flex-grow text-sm">
                              {`?utm_campaign={{campaign.name}}&utm_source={{placement}}&utm_medium={{adset.name}}&utm_content={{ad.name}}&utm_term={{site_source_name}}`}
                            </code>
                            <button
                              onClick={() => copyToClipboard(`?utm_campaign={{campaign.name}}&utm_source={{placement}}&utm_medium={{adset.name}}&utm_content={{ad.name}}&utm_term={{site_source_name}}`, 'utm')}
                              className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                            >
                              {copied === 'utm' ? (
                                <>
                                  <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
                                  ¡Copiado!
                                </>
                              ) : (
                                <>
                                  <Copy className="h-4 w-4 text-gray-500 mr-2" />
                                  Copiar UTMs
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                        <div className="mt-6 text-sm text-gray-500">
                          <p className="mb-2"><strong>Consejo:</strong></p>
                          <h5 className="text-md font-medium text-gray-700 mt-4">Entiende los Parámetros Dinámicos:</h5>
                          <ul className="list-disc list-inside space-y-2">
                            <li>
                              <code className="inline-block bg-gray-100 px-2 py-1 rounded-md text-sm">
                                {`{{ placement }}`}
                              </code>
                              : Posicionamiento del anuncio (Facebook_Feed, Instagram_Stories, etc.)
                            </li>
                            <li>
                              <code className="inline-block bg-gray-100 px-2 py-1 rounded-md text-sm">
                                {`{{ ad.name }}`}
                              </code>
                              : Nombre del anuncio
                            </li>
                            <li>
                              <code className="inline-block bg-gray-100 px-2 py-1 rounded-md text-sm">
                                {`{{ adset.name }}`}
                              </code>
                              : Nombre del conjunto de anuncios
                            </li>
                            <li>
                              <code className="inline-block bg-gray-100 px-2 py-1 rounded-md text-sm">
                                {`{{ site_source_name }}`}
                              </code>
                              : Red social (Fb, Ig, Msg, An)
                            </li>
                            <li>
                              <code className="inline-block bg-gray-100 px-2 py-1 rounded-md text-sm">
                                {`{{ campaign.name }}`}
                              </code>
                              : Nombre de la campaña
                            </li>
                          </ul>
                          <p className="mt-4">
                            Para más información, consulta la <a href="https://www.facebook.com/business/help/952192354843755" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:text-indigo-500">documentación de Facebook Ads <ExternalLink className="h-3 w-3 inline" /></a>.
                          </p>
                        </div>
                        <div className="mt-6 flex justify-between">
                          <button
                            onClick={() => setCurrentStep(3)}
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