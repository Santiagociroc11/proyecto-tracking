import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { AlertCircle, CheckCircle } from 'lucide-react';

export default function AdminCreateUser() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [maxMonthlyEvents, setMaxMonthlyEvents] = useState(10000);
  const [maxProducts, setMaxProducts] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess(false);

    try {
      // First create the auth user
      const { data: authData, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
      });

      if (signUpError) throw signUpError;
      if (!authData.user) throw new Error('Error creating user');

      // Then create the user record with limits
      const { error: insertError } = await supabase
        .from('users')
        .insert([{
          id: authData.user.id,
          active: true,
          max_monthly_events: maxMonthlyEvents,
          max_products: maxProducts,
          events_count: 0,
          role: 'user'
        }]);

      if (insertError) {
        // Cleanup auth user if db insert fails
        await supabase.auth.admin.deleteUser(authData.user.id);
        throw insertError;
      }

      setSuccess(true);
      setEmail('');
      setPassword('');
      setMaxMonthlyEvents(10000);
      setMaxProducts(1);
    } catch (err) {
      console.error('Error creating user:', err);
      setError(err instanceof Error ? err.message : 'Error al crear el usuario');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="bg-white shadow-lg rounded-lg p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Crear Usuario con Plan</h1>

        {error && (
          <div className="mb-4 bg-red-50 border-l-4 border-red-400 p-4">
            <div className="flex">
              <AlertCircle className="h-5 w-5 text-red-400" />
              <div className="ml-3">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            </div>
          </div>
        )}

        {success && (
          <div className="mb-4 bg-green-50 border-l-4 border-green-400 p-4">
            <div className="flex">
              <CheckCircle className="h-5 w-5 text-green-400" />
              <div className="ml-3">
                <p className="text-sm text-green-700">Usuario creado exitosamente</p>
              </div>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700">
              Correo Electrónico
            </label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700">
              Contraseña
            </label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            />
          </div>

          <div>
            <label htmlFor="maxEvents" className="block text-sm font-medium text-gray-700">
              Eventos Mensuales Máximos
            </label>
            <input
              type="number"
              id="maxEvents"
              value={maxMonthlyEvents}
              onChange={(e) => setMaxMonthlyEvents(parseInt(e.target.value))}
              required
              min={1000}
              step={1000}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            />
            <p className="mt-1 text-sm text-gray-500">
              Número máximo de eventos que el usuario puede registrar por mes
            </p>
          </div>

          <div>
            <label htmlFor="maxProducts" className="block text-sm font-medium text-gray-700">
              Productos Máximos
            </label>
            <input
              type="number"
              id="maxProducts"
              value={maxProducts}
              onChange={(e) => setMaxProducts(parseInt(e.target.value))}
              required
              min={1}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            />
            <p className="mt-1 text-sm text-gray-500">
              Número máximo de productos que el usuario puede crear
            </p>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={loading}
              className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              {loading ? 'Creando...' : 'Crear Usuario'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}