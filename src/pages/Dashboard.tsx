import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Plus, LogOut, Activity, AlertTriangle } from 'lucide-react';

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
}

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [usage, setUsage] = useState<UsageStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user]);

  async function loadData() {
    try {
      setLoading(true);
      
      if (!user) return;

      // Load user's usage stats
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('events_count, max_monthly_events, role')
        .eq('id', user.id)
        .single();

      if (userError) {
        console.error('Error loading usage stats:', userError);
      } else {
        setUsage({
          eventsCount: userData.events_count,
          maxMonthlyEvents: userData.max_monthly_events
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
          console.error('Error loading products:', productsError);
          return;
        }

        setProducts(productsData || []);
      }
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  const usagePercentage = usage ? (usage.eventsCount / usage.maxMonthlyEvents) * 100 : 0;
  const isNearLimit = usagePercentage >= 80;
  const hasReachedLimit = usagePercentage >= 100;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Usage Stats */}
      {usage && (
        <div className="mb-8 bg-white rounded-lg shadow p-6">
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
      )}

      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Mis Productos</h1>
        <div className="flex gap-4">
          <Link
            to="/products/new"
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700"
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
              <Link to={`/products/${product.id}`} className="block hover:bg-gray-50">
                <div className="px-4 py-4 sm:px-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <p className="text-sm font-medium text-indigo-600 truncate">{product.name}</p>
                      <span className={`ml-2 px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        product.active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {product.active ? 'Activo' : 'Inactivo'}
                      </span>
                    </div>
                    <div className="ml-2 flex-shrink-0 flex">
                      <p className="text-sm text-gray-500">
                        Creado el {new Date(product.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="mt-2">
                    <p className="text-sm text-gray-500">
                      ID de Seguimiento: {product.tracking_id}
                    </p>
                  </div>
                </div>
              </Link>
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