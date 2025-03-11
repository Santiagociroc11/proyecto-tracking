import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { AlertTriangle, Package } from 'lucide-react';
import { diagnostics } from '../lib/diagnostics';

export default function CreateProduct() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [productCount, setProductCount] = useState(0);
  const [maxProducts, setMaxProducts] = useState(1);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    // Get the first active user from the database
    async function getFirstUser() {
      try {
        const { data, error } = await supabase
          .from('users')
          .select('id')
          .eq('active', true)
          .limit(1)
          .single();

        if (error) {
          diagnostics.error('CreateProduct', 'Error fetching first user', error);
          return;
        }

        if (data) {
          setUserId(data.id);
          diagnostics.info('CreateProduct', 'User ID set', { userId: data.id });
          loadProductLimits(data.id);
        }
      } catch (err) {
        diagnostics.error('CreateProduct', 'Error in getFirstUser', err);
      }
    }

    getFirstUser();
  }, []);

  async function loadProductLimits(currentUserId: string) {
    if (!currentUserId) {
      diagnostics.warn('CreateProduct', 'No user ID available');
      return;
    }

    diagnostics.info('CreateProduct', 'Loading product limits', { userId: currentUserId });
    try {
      // Get the user's max products limit
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('max_products')
        .eq('id', currentUserId)
        .single();

      if (userError) {
        diagnostics.error('CreateProduct', 'Error fetching user data', userError);
        throw userError;
      }

      diagnostics.info('CreateProduct', 'User data fetched', { userData });

      if (userData) {
        setMaxProducts(userData.max_products);
        diagnostics.info('CreateProduct', 'Max products set', { maxProducts: userData.max_products });
      }

      // Get the actual count of products
      const { count, error: countError } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', currentUserId);

      if (countError) {
        diagnostics.error('CreateProduct', 'Error counting products', countError);
        throw countError;
      }

      const finalCount = count || 0;
      diagnostics.info('CreateProduct', 'Product count fetched', { 
        count: finalCount,
        maxProducts: userData?.max_products,
        remaining: userData ? userData.max_products - finalCount : 0
      });

      setProductCount(finalCount);
    } catch (err) {
      diagnostics.error('CreateProduct', 'Error in loadProductLimits', err);
      console.error('Error loading product limits:', err);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!userId) {
      diagnostics.error('CreateProduct', 'No user ID available for product creation');
      setError('Error: Usuario no disponible');
      return;
    }

    diagnostics.info('CreateProduct', 'Starting product creation', { productName: name });
    setLoading(true);
    setError('');

    try {
      // Get current product count
      const { count: currentCount, error: countError } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);

      if (countError) {
        diagnostics.error('CreateProduct', 'Error counting products during creation', countError);
        throw countError;
      }

      diagnostics.info('CreateProduct', 'Current product count', { count: currentCount });

      // Get user's max products limit
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('max_products')
        .eq('id', userId)
        .single();

      if (userError || !userData) {
        diagnostics.error('CreateProduct', 'Error fetching user limits', { error: userError });
        throw new Error('Error verificando límites de productos');
      }

      diagnostics.info('CreateProduct', 'User limits fetched', { 
        maxProducts: userData.max_products,
        currentCount: currentCount
      });

      if ((currentCount || 0) >= userData.max_products) {
        diagnostics.warn('CreateProduct', 'Product limit reached', {
          current: currentCount,
          max: userData.max_products
        });
        throw new Error('Has alcanzado el límite de productos permitidos');
      }

      // Create product if within limits
      const trackingId = crypto.randomUUID();
      diagnostics.info('CreateProduct', 'Creating new product', { 
        name,
        trackingId,
        userId
      });

      const { data, error: insertError } = await supabase
        .from('products')
        .insert([
          {
            name,
            tracking_id: trackingId,
            user_id: userId
          },
        ])
        .select()
        .single();

      if (insertError) {
        diagnostics.error('CreateProduct', 'Error inserting product', insertError);
        throw insertError;
      }

      diagnostics.info('CreateProduct', 'Product created successfully', { 
        productId: data.id,
        name: data.name
      });
      
      navigate(`/products/${data.id}`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error al crear el producto';
      diagnostics.error('CreateProduct', 'Product creation failed', { 
        error: err,
        message: errorMessage
      });
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }

  const remainingProducts = maxProducts - productCount;
  const usagePercentage = (productCount / maxProducts) * 100;

  // Log state changes
  useEffect(() => {
    diagnostics.info('CreateProduct', 'State updated', {
      productCount,
      maxProducts,
      remainingProducts,
      usagePercentage
    });
  }, [productCount, maxProducts]);

  if (!userId) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="max-w-md mx-auto">
          <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
            <div className="flex">
              <AlertTriangle className="h-5 w-5 text-yellow-400" />
              <div className="ml-3">
                <p className="text-sm text-yellow-700">
                  Cargando datos del usuario...
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="max-w-md mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Crear Nuevo Producto</h1>

        {/* Product Limits Info */}
        <div className="mb-8 bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-medium text-gray-900">Límite de Productos</h2>
            <Package className="h-5 w-5 text-gray-400" />
          </div>
          
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm font-medium text-gray-900 mb-1">
                <span>Productos Creados: {productCount} de {maxProducts}</span>
                <span>{Math.round(usagePercentage)}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2.5">
                <div 
                  className={`h-2.5 rounded-full transition-all duration-300 ${
                    remainingProducts <= 0
                      ? 'bg-red-600'
                      : remainingProducts === 1
                        ? 'bg-yellow-400'
                        : 'bg-green-600'
                  }`}
                  style={{ width: `${Math.min(usagePercentage, 100)}%` }}
                ></div>
              </div>
            </div>

            {remainingProducts <= 1 && remainingProducts > 0 && (
              <div className="p-4 rounded-md bg-yellow-50">
                <div className="flex">
                  <AlertTriangle className="h-5 w-5 text-yellow-400" />
                  <div className="ml-3">
                    <p className="text-sm text-yellow-700">
                      Solo te queda 1 producto disponible. Considera contactar con soporte para aumentar tu límite.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {remainingProducts <= 0 && (
              <div className="p-4 rounded-md bg-red-50">
                <div className="flex">
                  <AlertTriangle className="h-5 w-5 text-red-400" />
                  <div className="ml-3">
                    <p className="text-sm text-red-700">
                      Has alcanzado el límite de productos permitidos. Contacta con soporte para aumentar tu límite.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="mb-6 bg-red-50 border-l-4 border-red-400 p-4">
            <div className="flex">
              <AlertTriangle className="h-5 w-5 text-red-400" />
              <div className="ml-3">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="bg-white shadow-sm rounded-lg p-6 space-y-6">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700">
              Nombre del Producto
            </label>
            <div className="mt-1">
              <input
                type="text"
                id="name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                placeholder="Ej: Curso de Marketing Digital"
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading || remainingProducts <= 0}
              className={`w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white ${
                remainingProducts <= 0
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500'
              }`}
            >
              {loading ? 'Creando...' : 'Crear Producto'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}