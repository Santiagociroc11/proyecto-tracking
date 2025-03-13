import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Settings as SettingsIcon, Bell, Globe } from 'lucide-react';
import { requestNotificationPermission, subscribeUserToPush, unsubscribeFromPush } from '../lib/notifications';

interface UserSettings {
  timezone: string;
  push_enabled: boolean;
}

export default function Settings() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [timezone, setTimezone] = useState('UTC');
  const [pushEnabled, setPushEnabled] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [notificationStatus, setNotificationStatus] = useState<'denied' | 'granted' | 'default'>('default');

  useEffect(() => {
    if (user) {
      loadSettings();
      checkNotificationStatus();
    }
  }, [user]);

  async function checkNotificationStatus() {
    if ('Notification' in window) {
      setNotificationStatus(Notification.permission as 'denied' | 'granted' | 'default');
    }
  }

  async function loadSettings() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('user_settings')
        .select('timezone, push_enabled')
        .eq('user_id', user?.id)
        .maybeSingle();

      if (!error && data) {
        setTimezone(data.timezone);
        setPushEnabled(data.push_enabled || false);
      }
    } catch (err) {
      console.error('Error loading settings:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handlePushToggle() {
    if (!user) return;

    try {
      setSaving(true);
      setError('');

      if (!pushEnabled) {
        // Enable push notifications
        const permissionGranted = await requestNotificationPermission();
        if (!permissionGranted) {
          setError('Permiso de notificaciones denegado');
          return;
        }

        const subscribed = await subscribeUserToPush(user.id);
        if (!subscribed) {
          setError('Error al suscribirse a notificaciones');
          return;
        }

        setPushEnabled(true);
        await updateSettings({ push_enabled: true });
      } else {
        // Disable push notifications
        const unsubscribed = await unsubscribeFromPush(user.id);
        if (!unsubscribed) {
          setError('Error al cancelar suscripción');
          return;
        }

        setPushEnabled(false);
        await updateSettings({ push_enabled: false });
      }

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      console.error('Error toggling push notifications:', err);
      setError('Error al actualizar las notificaciones');
    } finally {
      setSaving(false);
    }
  }

  async function updateSettings(settings: Partial<UserSettings>) {
    if (!user) return;

    const { error } = await supabase
      .from('user_settings')
      .upsert({
        user_id: user.id,
        ...settings
      }, {
        onConflict: 'user_id'
      });

    if (error) throw error;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    
    setSaving(true);
    setSuccess(false);
    setError('');

    try {
      await updateSettings({ timezone });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
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

            <div className="space-y-6">
              {/* Timezone Settings */}
              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label className="text-base font-medium text-gray-900 flex items-center">
                    <Globe className="h-5 w-5 mr-2" />
                    Zona Horaria
                  </label>
                  <select
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
                    {saving ? 'Guardando...' : 'Guardar Zona Horaria'}
                  </button>
                </div>
              </form>

              {/* Push Notifications Settings */}
              <div className="border-t border-gray-200 pt-6">
                <div>
                  <label className="text-base font-medium text-gray-900 flex items-center">
                    <Bell className="h-5 w-5 mr-2" />
                    Notificaciones Push
                  </label>
                  <p className="mt-2 text-sm text-gray-500">
                    Recibe notificaciones importantes directamente en tu dispositivo.
                  </p>
                </div>

                <div className="mt-4">
                  {notificationStatus === 'denied' ? (
                    <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
                      <div className="flex">
                        <div className="flex-shrink-0">
                          <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                          </svg>
                        </div>
                        <div className="ml-3">
                          <p className="text-sm text-yellow-700">
                            Las notificaciones están bloqueadas. Por favor, habilítalas en la configuración de tu navegador.
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={handlePushToggle}
                      disabled={saving || notificationStatus === 'denied'}
                      className={`inline-flex items-center px-4 py-2 border ${
                        pushEnabled
                          ? 'border-red-300 text-red-700 bg-red-50 hover:bg-red-100'
                          : 'border-green-300 text-green-700 bg-green-50 hover:bg-green-100'
                      } rounded-md shadow-sm text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50`}
                    >
                      {saving ? (
                        'Procesando...'
                      ) : pushEnabled ? (
                        'Desactivar Notificaciones'
                      ) : (
                        'Activar Notificaciones'
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}