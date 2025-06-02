import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { diagnostics } from '../lib/diagnostics';
import { Plus, LogOut, Activity, AlertTriangle, Package, Settings, BarChart, Users, DollarSign, TrendingUp, Eye } from 'lucide-react';

interface Product {
  id: string;
  name: string;
  tracking_id: string;
  active: boolean;
  created_at: string;
}

interface UsageStats {
  eventsCount: number;
  maxMonthlyEvents: number;
  productsCount: number;
  maxProducts: number;
}

interface TrackingMetrics {
  totalVisits: number;
  uniqueVisits: number;
  totalClicks: number;
  uniqueClicks: number;
  totalPurchases: number;
  conversionRate: number;
  uniqueConversionRate: number;
  persuasionRate: number;
  uniquePersuasionRate: number;
}

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [usage, setUsage] = useState<UsageStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // New states for tracking metrics
  const [trackingMetrics, setTrackingMetrics] = useState<TrackingMetrics | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<'today' | '3days' | '7days'>('today');
  const [showUnique, setShowUnique] = useState(false);

  useEffect(() => {
    if (user?.id) {
      loadData();
      loadTrackingMetrics();
    }
  }, [user?.id, selectedPeriod]);

  async function loadTrackingMetrics() {
    try {
      setMetricsLoading(true);
      
      if (!user?.id) {
        return;
      }

      // Calculate date range based on selected period
      const now = new Date();
      let startDate: Date;
      
      switch (selectedPeriod) {
        case 'today':
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
          break;
        case '3days':
          startDate = new Date(now);
          startDate.setDate(now.getDate() - 3);
          startDate.setHours(0, 0, 0, 0);
          break;
        case '7days':
          startDate = new Date(now);
          startDate.setDate(now.getDate() - 7);
          startDate.setHours(0, 0, 0, 0);
          break;
      }

      const endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      
      // Check user role to determine which products to include
      const { data: userData } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single();

      // Get user's products or all products if admin
      let productIds: string[] = [];
      if (userData?.role === 'admin') {
        const { data: allProducts } = await supabase
          .from('products')
          .select('id');
        productIds = allProducts?.map(p => p.id) || [];
      } else {
        const { data: userProducts } = await supabase
          .from('products')
          .select('id')
          .eq('user_id', user.id);
        productIds = userProducts?.map(p => p.id) || [];
      }

      if (productIds.length === 0) {
        setTrackingMetrics({
          totalVisits: 0,
          uniqueVisits: 0,
          totalClicks: 0,
          uniqueClicks: 0,
          totalPurchases: 0,
          conversionRate: 0,
          uniqueConversionRate: 0,
          persuasionRate: 0,
          uniquePersuasionRate: 0,
        });
        return;
      }

      // Fetch tracking events for the date range and user's products
      const { data: events, error: eventsError } = await supabase
        .from('tracking_events')
        .select('id, event_type, visitor_id, session_id, created_at, product_id')
        .in('product_id', productIds)
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString())
        .order('created_at', { ascending: true });

      if (eventsError) {
        console.error('Error fetching tracking events:', eventsError);
        return;
      }

      if (!events || events.length === 0) {
        setTrackingMetrics({
          totalVisits: 0,
          uniqueVisits: 0,
          totalClicks: 0,
          uniqueClicks: 0,
          totalPurchases: 0,
          conversionRate: 0,
          uniqueConversionRate: 0,
          persuasionRate: 0,
          uniquePersuasionRate: 0,
        });
        return;
      }

      // Process events to calculate metrics
      const uniqueVisitors = new Set<string>();
      const uniqueClicks = new Set<string>();
      let totalVisits = 0;
      let totalClicks = 0;
      let totalPurchases = 0;

      events.forEach((event) => {
        switch (event.event_type) {
          case 'pageview':
            totalVisits++;
            uniqueVisitors.add(event.visitor_id);
            break;
          case 'hotmart_click':
            totalClicks++;
            uniqueClicks.add(event.visitor_id);
            break;
          case 'compra_hotmart':
            totalPurchases++;
            break;
        }
      });

      const conversionRate = totalVisits > 0 ? (totalPurchases / totalVisits) * 100 : 0;
      const uniqueConversionRate = uniqueVisitors.size > 0 ? (totalPurchases / uniqueVisitors.size) * 100 : 0;
      const persuasionRate = totalVisits > 0 ? (totalClicks / totalVisits) * 100 : 0;
      const uniquePersuasionRate = uniqueVisitors.size > 0 ? (uniqueClicks.size / uniqueVisitors.size) * 100 : 0;

      setTrackingMetrics({
        totalVisits,
        uniqueVisits: uniqueVisitors.size,
        totalClicks,
        uniqueClicks: uniqueClicks.size,
        totalPurchases,
        conversionRate,
        uniqueConversionRate,
        persuasionRate,
        uniquePersuasionRate,
      });

    } catch (error) {
      console.error('Error loading tracking metrics:', error);
    } finally {
      setMetricsLoading(false);
    }
  }

  async function loadData() {
    try {
      diagnostics.info('Dashboard', 'Loading dashboard data', { userId: user?.id });
      setLoading(true);
      setError(null);
      
      if (!user?.id) {
        throw new Error('Usuario no autenticado');
      }

      // Load user's usage stats and products
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select(`
          events_count,
          max_monthly_events,
          max_products,
          role,
          products:products(count)
        `)
        .eq('id', user.id)
        .single();

      if (userError) {
        diagnostics.error('Dashboard', 'Error loading usage stats', userError);
        throw new Error('Error cargando estadísticas de uso');
      }

      diagnostics.info('Dashboard', 'Usage stats loaded', userData);
      setUsage({
        eventsCount: userData.events_count,
        maxMonthlyEvents: userData.max_monthly_events,
        productsCount: userData.products[0].count,
        maxProducts: userData.max_products
      });

      // Load products based on user role
      const query = supabase
        .from('products')
        .select('*')
        .order('created_at', { ascending: false });

      // If not admin, only show user's products
      if (userData.role !== 'admin') {
        query.eq('user_id', user.id);
      }

      const { data: productsData, error: productsError } = await query;

      if (productsError) {
        diagnostics.error('Dashboard', 'Error loading products', productsError);
        throw new Error('Error cargando productos');
      }

      diagnostics.info('Dashboard', 'Products loaded', { count: productsData?.length });
      setProducts(productsData || []);
    } catch (error) {
      diagnostics.error('Dashboard', 'Error in loadData', error);
      setError(error instanceof Error ? error.message : 'Error cargando el dashboard');
    } finally {
      setLoading(false);
    }
  }

  const getPeriodLabel = (period: string) => {
    switch (period) {
      case 'today': return 'Hoy';
      case '3days': return 'Últimos 3 días';
      case '7days': return 'Últimos 7 días';
      default: return 'Hoy';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-red-50 border-l-4 border-red-400 p-4">
          <div className="flex">
            <AlertTriangle className="h-5 w-5 text-red-400" />
            <div className="ml-3">
              <p className="text-sm text-red-700">{error}</p>
              <button 
                onClick={loadData} 
                className="mt-2 text-sm text-red-700 underline hover:text-red-800"
              >
                Intentar nuevamente
              </button>
            </div>
          </div>
        </div>
        <div className="mt-4">
          <button
            onClick={() => {
              diagnostics.info('Dashboard', 'Downloading diagnostic report');
              const report = diagnostics.getDiagnosticReport();
              const blob = new Blob([report], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = 'diagnostic-report.json';
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
            }}
            className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
          >
            Descargar Reporte de Diagnóstico
          </button>
        </div>
      </div>
    );
  }

  const usagePercentage = usage ? (usage.eventsCount / usage.maxMonthlyEvents) * 100 : 0;
  const productsPercentage = usage ? (usage.productsCount / usage.maxProducts) * 100 : 0;
  const isNearLimit = usagePercentage >= 80;
  const hasReachedLimit = usagePercentage >= 100;
  const hasReachedProductLimit = usage ? usage.productsCount >= usage.maxProducts : false;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Tracking Metrics Section */}
      <div className="mb-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Métricas de Tracking</h2>
          <div className="flex items-center gap-4">
            {/* Period Filter */}
            <div className="flex space-x-2">
              {(['today', '3days', '7days'] as const).map((period) => (
                <button
                  key={period}
                  onClick={() => setSelectedPeriod(period)}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    selectedPeriod === period
                      ? 'bg-indigo-600 text-white'
                      : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
                  }`}
                >
                  {getPeriodLabel(period)}
                </button>
              ))}
            </div>
            
            {/* Unique/Total Switch */}
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={showUnique}
                onChange={() => setShowUnique(!showUnique)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 
                peer-checked:after:translate-x-5 peer-checked:after:border-white after:content-[''] 
                after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 
                after:border after:rounded-full after:h-5 after:w-5 after:transition-all 
                peer-checked:bg-indigo-600"></div>
              <span className="ml-3 text-sm font-medium text-gray-900">
                {showUnique ? 'Únicos' : 'Totales'}
              </span>
            </label>
          </div>
        </div>

        {/* Tracking Metrics Cards */}
        {metricsLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[...Array(3)].map((_, index) => (
              <div key={index} className="bg-white rounded-lg shadow p-6">
                <div className="animate-pulse">
                  <div className="h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
                  <div className="h-8 bg-gray-200 rounded w-3/4 mb-2"></div>
                  <div className="h-3 bg-gray-200 rounded w-1/3"></div>
                </div>
              </div>
            ))}
          </div>
        ) : trackingMetrics ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Visitas Card */}
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center">
                <div className="p-2 bg-blue-100 rounded">
                  <Eye className="h-6 w-6 text-blue-600" />
                </div>
                <div className="ml-4 flex-1">
                  <p className="text-sm font-medium text-gray-500">
                    Visitas {showUnique ? 'Únicas' : 'Totales'}
                  </p>
                  <h3 className="text-2xl font-bold text-gray-900">
                    {showUnique ? trackingMetrics.uniqueVisits.toLocaleString() : trackingMetrics.totalVisits.toLocaleString()}
                  </h3>
                  <p className="text-xs text-gray-500 mt-1">
                    Tasa base de tráfico
                  </p>
                </div>
              </div>
            </div>

            {/* Pagos Iniciados Card */}
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center">
                <div className="p-2 bg-green-100 rounded">
                  <TrendingUp className="h-6 w-6 text-green-600" />
                </div>
                <div className="ml-4 flex-1">
                  <p className="text-sm font-medium text-gray-500">
                    Pagos Iniciados {showUnique ? 'Únicos' : 'Totales'}
                  </p>
                  <h3 className="text-2xl font-bold text-gray-900">
                    {showUnique ? trackingMetrics.uniqueClicks.toLocaleString() : trackingMetrics.totalClicks.toLocaleString()}
                  </h3>
                  <p className="text-xs text-green-600 mt-1 font-medium">
                    {(showUnique ? trackingMetrics.uniquePersuasionRate : trackingMetrics.persuasionRate).toFixed(2)}% tasa de persuasión
                  </p>
                </div>
              </div>
            </div>

            {/* Compras Card */}
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center">
                <div className="p-2 bg-purple-100 rounded">
                  <DollarSign className="h-6 w-6 text-purple-600" />
                </div>
                <div className="ml-4 flex-1">
                  <p className="text-sm font-medium text-gray-500">Compras Completadas</p>
                  <h3 className="text-2xl font-bold text-gray-900">
                    {trackingMetrics.totalPurchases.toLocaleString()}
                  </h3>
                  <p className="text-xs text-purple-600 mt-1 font-medium">
                    {(showUnique ? trackingMetrics.uniqueConversionRate : trackingMetrics.conversionRate).toFixed(2)}% tasa de conversión
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-gray-50 rounded-lg p-8 text-center">
            <p className="text-gray-500">No hay datos de tracking disponibles para el período seleccionado</p>
          </div>
        )}
      </div>

      {/* Usage Stats */}
      {usage && (
        <div className="mb-8 grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Events Usage Card */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-medium text-gray-900">Uso de Eventos</h2>
              <Activity className="h-5 w-5 text-gray-400" />
            </div>
            
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm font-medium text-gray-900 mb-1">
                  <span>{usage.eventsCount.toLocaleString()} de {usage.maxMonthlyEvents.toLocaleString()} eventos</span>
                  <span>{Math.round(usagePercentage)}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2.5">
                  <div 
                    className={`h-2.5 rounded-full ${
                      hasReachedLimit 
                        ? 'bg-red-600' 
                        : isNearLimit 
                          ? 'bg-yellow-400' 
                          : 'bg-green-600'
                    }`}
                    style={{ width: `${Math.min(usagePercentage, 100)}%` }}
                  ></div>
                </div>
              </div>

              {(isNearLimit || hasReachedLimit) && (
                <div className={`p-4 rounded-md ${hasReachedLimit ? 'bg-red-50' : 'bg-yellow-50'}`}>
                  <div className="flex">
                    <AlertTriangle className={`h-5 w-5 ${hasReachedLimit ? 'text-red-400' : 'text-yellow-400'}`} />
                    <div className="ml-3">
                      <h3 className={`text-sm font-medium ${hasReachedLimit ? 'text-red-800' : 'text-yellow-800'}`}>
                        {hasReachedLimit 
                          ? 'Has alcanzado el límite de eventos mensuales' 
                          : 'Estás cerca de alcanzar el límite de eventos mensuales'}
                      </h3>
                      <div className={`mt-2 text-sm ${hasReachedLimit ? 'text-red-700' : 'text-yellow-700'}`}>
                        <p>
                          {hasReachedLimit 
                            ? 'Contacta con soporte para aumentar tu límite de eventos.' 
                            : 'Considera contactar con soporte para aumentar tu límite antes de alcanzarlo.'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Products Usage Card */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-medium text-gray-900">Uso de Productos</h2>
              <Package className="h-5 w-5 text-gray-400" />
            </div>
            
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm font-medium text-gray-900 mb-1">
                  <span>{usage.productsCount} de {usage.maxProducts} productos</span>
                  <span>{Math.round(productsPercentage)}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2.5">
                  <div 
                    className={`h-2.5 rounded-full ${
                      hasReachedProductLimit
                        ? 'bg-red-600'
                        : productsPercentage >= 80
                          ? 'bg-yellow-400'
                          : 'bg-green-600'
                    }`}
                    style={{ width: `${Math.min(productsPercentage, 100)}%` }}
                  ></div>
                </div>
              </div>

              {hasReachedProductLimit && (
                <div className="p-4 rounded-md bg-red-50">
                  <div className="flex">
                    <AlertTriangle className="h-5 w-5 text-red-400" />
                    <div className="ml-3">
                      <h3 className="text-sm font-medium text-red-800">
                        Has alcanzado el límite de productos
                      </h3>
                      <div className="mt-2 text-sm text-red-700">
                        <p>
                          Contacta con soporte para aumentar tu límite de productos.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Mis Productos</h1>
        <div className="flex gap-4">
          <Link
            to="/products/new"
            className={`inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white ${
              hasReachedProductLimit
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-indigo-600 hover:bg-indigo-700'
            }`}
            onClick={(e) => {
              if (hasReachedProductLimit) {
                e.preventDefault();
              }
            }}
          >
            <Plus className="h-5 w-5 mr-2" />
            Nuevo Producto
          </Link>
          <button
            onClick={() => signOut()}
            className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
          >
            <LogOut className="h-5 w-5 mr-2" />
            Cerrar Sesión
          </button>
        </div>
      </div>

      <div className="bg-white shadow overflow-hidden sm:rounded-md">
        <ul className="divide-y divide-gray-200">
          {products.map((product) => (
            <li key={product.id}>
              <div className="px-4 py-4 sm:px-6 flex items-center justify-between">
                <div className="flex items-center">
                  <p className="text-sm font-medium text-indigo-600 truncate">{product.name}</p>
                  <span className={`ml-2 px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                    product.active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                  }`}>
                    {product.active ? 'Activo' : 'Inactivo'}
                  </span>
                  <p className="ml-4 text-sm text-gray-500">
                    Creado el {new Date(product.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex space-x-3">
                  <Link
                    to={`/products/${product.id}`}
                    className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                  >
                    <Settings className="h-4 w-4 mr-2" />
                    Configurar
                  </Link>
                  <Link
                    to={`/products/${product.id}?tab=analytics`}
                    className="inline-flex items-center px-3 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700"
                  >
                    <BarChart className="h-4 w-4 mr-2" />
                    Analytics
                  </Link>
                </div>
              </div>
            </li>
          ))}
          {products.length === 0 && (
            <li className="px-4 py-8 text-center text-gray-500">
              No hay productos aún. ¡Crea tu primer producto para comenzar el seguimiento!
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}