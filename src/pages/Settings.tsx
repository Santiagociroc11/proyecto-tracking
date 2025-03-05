import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Settings as SettingsIcon } from 'lucide-react';

interface UserSettings {
  timezone: string;
}

export default function Settings() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [timezone, setTimezone] = useState('UTC');
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (user) {
      loadSettings();
    }
  }, [user]);

  async function loadSettings() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('user_settings')
        .select('timezone')
        .eq('user_id', user?.id)
        .maybeSingle(); // Use maybeSingle instead of single to handle no results

      if (!error && data) {
        setTimezone(data.timezone);
      }
    } catch (err) {
      console.error('Error loading settings:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    
    setSaving(true);
    setSuccess(false);
    setError('');

    try {
      const { error } = await supabase
        .from('user_settings')
        .upsert({
          user_id: user.id,
          timezone
        }, {
          onConflict: 'user_id'
        });

      if (error) throw error;
      setSuccess(true);
      
      // Reload settings to confirm changes
      await loadSettings();
    } catch (err) {
      console.error('Error saving settings:', err);
      setError('Error al guardar la configuración');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="max-w-3xl mx-auto">
        <div className="bg-white shadow sm:rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <div className="flex items-center mb-6">
              <SettingsIcon className="h-6 w-6 text-gray-400" />
              <h3 className="ml-2 text-lg leading-6 font-medium text-gray-900">
                Configuración
              </h3>
            </div>

            {success && (
              <div className="mb-4 bg-green-50 border-l-4 border-green-400 p-4">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <p className="text-sm text-green-700">
                      Configuración guardada exitosamente
                    </p>
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div className="mb-4 bg-red-50 border-l-4 border-red-400 p-4">
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

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label htmlFor="timezone" className="block text-sm font-medium text-gray-700">
                  Zona Horaria
                </label>
                <select
                  id="timezone"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
                >
                  <option value="UTC">UTC</option>
                  <option value="America/Bogota">America/Bogota</option>
                  <option value="America/Mexico_City">America/Mexico City</option>
                  <option value="America/Lima">America/Lima</option>
                  <option value="America/Santiago">America/Santiago</option>
                  <option value="America/Buenos_Aires">America/Buenos Aires</option>
                  <option value="America/Caracas">America/Caracas</option>
                  <option value="America/La_Paz">America/La Paz</option>
                  <option value="America/Asuncion">America/Asuncion</option>
                  <option value="America/Montevideo">America/Montevideo</option>
                  <option value="America/Guayaquil">America/Guayaquil</option>
                </select>
                <p className="mt-2 text-sm text-gray-500">
                  Esta configuración afectará cómo se muestran las fechas y horas en tus reportes.
                </p>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                >
                  {saving ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}