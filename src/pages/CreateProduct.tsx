import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { AlertTriangle, Package } from 'lucide-react';

export default function CreateProduct() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [productCount, setProductCount] = useState(0);
  const [maxProducts, setMaxProducts] = useState(1);

  useEffect(() => {
    loadProductLimits();
  }, []);

  async function loadProductLimits() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get user's product limits and current count in a single query
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select(`
          max_products,
          products:products(count)
        `)
        .eq('id', user.id)
        .single();

      if (userError) throw userError;

      setMaxProducts(userData.max_products);
      setProductCount(userData.products[0].count);
    } catch (err) {
      console.error('Error loading product limits:', err);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error('Usuario no autenticado');
      }

      // Check product limit before inserting
      const { data: userData } = await supabase
        .from('users')
        .select(`
          max_products,
          products:products(count)
        `)
        .eq('id', user.id)
        .single();

      if (!userData) {
        throw new Error('Error verificando límites de productos');
      }

      const currentCount = userData.products[0].count;
      if (currentCount >= userData.max_products) {
        throw new Error('Has alcanzado el límite de productos permitidos');
      }

      // Create product if within limits
      const { data, error: insertError } = await supabase
        .from('products')
        .insert([
          {
            name,
            tracking_id: crypto.randomUUID(),
            user_id: user.id
          },
        ])
        .select()
        .single();

      if (insertError) throw insertError;
      
      navigate(`/products/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear el producto');
      console.error('Error creating product:', err);
    } finally {
      setLoading(false);
    }
  }

  const remainingProducts = maxProducts - productCount;
  const usagePercentage = (productCount / maxProducts) * 100;

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

            {remainingProducts <= 1 && (
              <div className={`p-4 rounded-md ${remainingProducts <= 0 ? 'bg-red-50' : 'bg-yellow-50'}`}>
                <div className="flex">
                  <AlertTriangle className={`h-5 w-5 ${remainingProducts <= 0 ? 'text-red-400' : 'text-yellow-400'}`} />
                  <div className="ml-3">
                    <p className={`text-sm ${remainingProducts <= 0 ? 'text-red-700' : 'text-yellow-700'}`}>
                      {remainingProducts <= 0
                        ? 'Has alcanzado el límite de productos permitidos. Contacta con soporte para aumentar tu límite.'
                        : 'Solo te queda 1 producto disponible. Considera contactar con soporte para aumentar tu límite.'}
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