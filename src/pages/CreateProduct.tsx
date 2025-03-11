import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { AlertTriangle, Package } from 'lucide-react';
import { diagnostics } from '../lib/diagnostics';

export default function CreateProduct() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [productCount, setProductCount] = useState(0);
  const [maxProducts, setMaxProducts] = useState(1);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    loadUserAndLimits();
  }, []);

  async function loadUserAndLimits() {
    try {
      diagnostics.info('CreateProduct', 'Loading user and limits');
      
      // Get user data from localStorage
      const storedUser = localStorage.getItem('user');
      if (!storedUser) {
        throw new Error('No se encontró información del usuario');
      }

      const userData = JSON.parse(storedUser);
      if (!userData.id) {
        throw new Error('Información de usuario inválida');
      }

      // Verify user exists and is active
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('id, max_products, active')
        .eq('id', userData.id)
        .single();

      if (userError || !user) {
        throw new Error('Usuario no encontrado');
      }

      if (!user.active) {
        throw new Error('Usuario inactivo');
      }

      setUserId(user.id);
      setMaxProducts(user.max_products);
      
      diagnostics.info('CreateProduct', 'User data loaded', { 
        userId: user.id,
        maxProducts: user.max_products 
      });

      // Get product count for this specific user
      const { count, error: countError } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id);

      if (countError) {
        diagnostics.error('CreateProduct', 'Error fetching product count', countError);
        throw countError;
      }

      const actualCount = count || 0;
      setProductCount(actualCount);

      diagnostics.info('CreateProduct', 'Product count loaded', { 
        count: actualCount,
        maxAllowed: user.max_products
      });

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error cargando datos del usuario';
      diagnostics.error('CreateProduct', 'Error in loadUserAndLimits', err);
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!userId) {
      diagnostics.error('CreateProduct', 'No user ID available for product creation');
      setError('Error: Usuario no disponible');
      return;
    }

    diagnostics.info('CreateProduct', 'Starting product creation', { 
      productName: name,
      userId 
    });

    setLoading(true);
    setError('');

    try {
      // Verify current limits
      const { count: currentCount, error: countError } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);

      if (countError) {
        throw countError;
      }

      if ((currentCount || 0) >= maxProducts) {
        diagnostics.warn('CreateProduct', 'Product limit reached', {
          current: currentCount,
          max: maxProducts
        });
        throw new Error('Has alcanzado el límite de productos permitidos');
      }

      // Create product
      const trackingId = crypto.randomUUID();
      const { data: newProduct, error: insertError } = await supabase
        .from('products')
        .insert([{
          name,
          tracking_id: trackingId,
          user_id: userId,
          active: true
        }])
        .select()
        .single();

      if (insertError || !newProduct) {
        diagnostics.error('CreateProduct', 'Error creating product', insertError);
        throw new Error('Error al crear el producto');
      }

      diagnostics.info('CreateProduct', 'Product created successfully', {
        productId: newProduct.id,
        name: newProduct.name
      });

      navigate(`/products/${newProduct.id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al crear el producto';
      diagnostics.error('CreateProduct', 'Product creation failed', {
        error: err,
        message
      });
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  const remainingProducts = maxProducts - productCount;
  const usagePercentage = (productCount / maxProducts) * 100;

  if (loading) {
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

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="max-w-md mx-auto">
          <div className="bg-red-50 border-l-4 border-red-400 p-4">
            <div className="flex">
              <AlertTriangle className="h-5 w-5 text-red-400" />
              <div className="ml-3">
                <p className="text-sm text-red-700">{error}</p>
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