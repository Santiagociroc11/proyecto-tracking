import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Settings as SettingsIcon, BellRing, ExternalLink, ArrowLeft, ChevronDown, ChevronUp, Users, MessageCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom'; // Import useNavigate

interface UserSettings {
  timezone: string;
  telegram_chat_id?: string;
  telegram_thread_id?: string;
  telegram_notification_type?: 'private' | 'group' | 'group_topic';
}

export default function Settings() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [timezone, setTimezone] = useState('UTC');
  const [telegramChatId, setTelegramChatId] = useState('');
  const [telegramThreadId, setTelegramThreadId] = useState('');
  const [telegramNotificationType, setTelegramNotificationType] = useState<'private' | 'group' | 'group_topic'>('private');
  const [advancedMode, setAdvancedMode] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [testingTelegram, setTestingTelegram] = useState(false);
  const [testSuccess, setTestSuccess] = useState(false);
  const [testError, setTestError] = useState('');
  const navigate = useNavigate(); // Initialize useNavigate

  useEffect(() => {
    if (user) {
      loadSettings();
    }
  }, [user]);

  async function loadSettings() {
    try {
      setLoading(true);

      if (!user) return;

      const { data, error } = await supabase
        .from('user_settings')
        .select('timezone, telegram_chat_id, telegram_thread_id, telegram_notification_type')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!error && data) {
        setTimezone(data.timezone);
        setTelegramChatId(data.telegram_chat_id || '');
        setTelegramThreadId(data.telegram_thread_id || '');
        setTelegramNotificationType(data.telegram_notification_type || 'private');
        setAdvancedMode(data.telegram_notification_type !== 'private' || !!data.telegram_thread_id);
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
          timezone,
          telegram_chat_id: telegramChatId || null,
          telegram_thread_id: telegramThreadId || null,
          telegram_notification_type: telegramNotificationType
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

  const handleGoBack = () => {
    navigate('/dashboard'); // Navigate to the dashboard route
  };

  async function testTelegramNotification() {
    if (!telegramChatId.trim()) {
      setTestError('Por favor ingresa un Chat ID válido antes de probar');
      return;
    }

    setTestingTelegram(true);
    setTestSuccess(false);
    setTestError('');

    try {
      const response = await fetch('/api/telegram/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chatId: telegramChatId,
          threadId: telegramThreadId || null,
          userId: user?.id
        })
      });

      const result = await response.json();

      if (response.ok && result.success) {
        setTestSuccess(true);
        setTestError('');
      } else {
        setTestError(result.error || 'Error al enviar la notificación de prueba');
        setTestSuccess(false);
      }
    } catch (err) {
      console.error('Error testing Telegram notification:', err);
      setTestError('Error de conexión al probar la notificación');
      setTestSuccess(false);
    } finally {
      setTestingTelegram(false);
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
            <div className="flex items-center justify-between mb-6"> {/* Added justify-between */}
              <div className="flex items-center">
                <SettingsIcon className="h-6 w-6 text-gray-400" />
                <h3 className="ml-2 text-lg leading-6 font-medium text-gray-900">
                  Configuración
                </h3>
              </div>
              <button // Added button to go back
                onClick={handleGoBack}
                className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Volver
              </button>
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

              <div className="border-t border-gray-200 pt-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center">
                    <BellRing className="h-5 w-5 text-gray-400" />
                    <h4 className="ml-2 text-lg font-medium text-gray-900">
                      Notificaciones de Telegram
                    </h4>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAdvancedMode(!advancedMode)}
                    className="inline-flex items-center px-3 py-1 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                  >
                    {advancedMode ? (
                      <>
                        <MessageCircle className="h-4 w-4 mr-1" />
                        Modo Simple
                        <ChevronUp className="h-4 w-4 ml-1" />
                      </>
                    ) : (
                      <>
                        <Users className="h-4 w-4 mr-1" />
                        Modo Avanzado
                        <ChevronDown className="h-4 w-4 ml-1" />
                      </>
                    )}
                  </button>
                </div>

                {/* Simple Mode - Default */}
                {!advancedMode && (
                  <div className="space-y-4">
                    <div className="bg-blue-50 p-4 rounded-md border border-blue-200">
                      <div className="flex items-center mb-2">
                        <MessageCircle className="h-5 w-5 text-blue-600" />
                        <h5 className="ml-2 text-sm font-medium text-blue-900">
                          💬 Configuración Simple (Recomendada)
                        </h5>
                      </div>
                      <p className="text-sm text-blue-700 mb-3">
                        Perfecta para recibir notificaciones directamente en tu chat privado con el bot.
                      </p>
                      <div className="bg-white p-3 rounded border">
                        <h6 className="text-xs font-semibold text-gray-900 mb-2">PASOS RÁPIDOS:</h6>
                        <ol className="list-decimal list-inside space-y-1 text-xs text-gray-600">
                          <li>
                            Abre:{' '}
                            <a
                              href="https://t.me/HotApi_bot"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center text-indigo-600 hover:text-indigo-500 font-medium"
                            >
                              @HotApi_bot
                              <ExternalLink className="h-3 w-3 ml-1" />
                            </a>
                          </li>
                          <li>Envía <code className="bg-gray-200 px-1 py-0.5 rounded text-xs">/start</code></li>
                          <li>Copia tu Chat ID</li>
                          <li>Pégalo abajo</li>
                        </ol>
                      </div>
                    </div>

                    <div>
                      <label htmlFor="telegram-chat-id-simple" className="block text-sm font-medium text-gray-700">
                        Tu Chat ID
                      </label>
                      <div className="mt-1 flex rounded-md shadow-sm">
                        <input
                          type="text"
                          id="telegram-chat-id-simple"
                          value={telegramChatId}
                          onChange={(e) => {
                            setTelegramChatId(e.target.value);
                            setTelegramNotificationType('private');
                            setTelegramThreadId('');
                            setTestSuccess(false);
                            setTestError('');
                          }}
                          placeholder="Ej: 123456789"
                          className="flex-1 block w-full border-gray-300 rounded-l-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                        />
                        <button
                          type="button"
                          onClick={testTelegramNotification}
                          disabled={testingTelegram || !telegramChatId.trim()}
                          className="inline-flex items-center px-4 py-2 border border-l-0 border-gray-300 rounded-r-md bg-gray-50 text-gray-700 text-sm font-medium hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {testingTelegram ? (
                            <>
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600 mr-2"></div>
                              Probando...
                            </>
                          ) : (
                            <>
                              <BellRing className="h-4 w-4 mr-2" />
                              Probar
                            </>
                          )}
                        </button>
                      </div>
                      <p className="mt-1 text-xs text-gray-500">
                        ✨ Fácil y directo - las notificaciones llegarán a tu chat privado
                      </p>
                    </div>
                  </div>
                )}

                {/* Advanced Mode */}
                {advancedMode && (
                  <div className="space-y-6">
                    <div className="bg-amber-50 p-4 rounded-md border border-amber-200">
                      <div className="flex items-center mb-2">
                        <Users className="h-5 w-5 text-amber-600" />
                        <h5 className="ml-2 text-sm font-medium text-amber-900">
                          ⚙️ Configuración Avanzada
                        </h5>
                      </div>
                      <p className="text-sm text-amber-700">
                        Para notificaciones en grupos de Telegram o temas específicos dentro de grupos.
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-3">
                        Tipo de Notificación
                      </label>
                      <div className="space-y-3">
                        <div className="flex items-center">
                          <input
                            id="notification-private"
                            name="notification-type"
                            type="radio"
                            checked={telegramNotificationType === 'private'}
                            onChange={() => {
                              setTelegramNotificationType('private');
                              setTelegramThreadId('');
                            }}
                            className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300"
                          />
                          <label htmlFor="notification-private" className="ml-3 flex items-center">
                            <MessageCircle className="h-4 w-4 text-blue-500 mr-2" />
                            <span className="text-sm font-medium text-gray-700">Chat Privado</span>
                            <span className="ml-2 text-xs text-gray-500">(Recomendado)</span>
                          </label>
                        </div>
                        <div className="flex items-center">
                          <input
                            id="notification-group"
                            name="notification-type"
                            type="radio"
                            checked={telegramNotificationType === 'group'}
                            onChange={() => {
                              setTelegramNotificationType('group');
                              setTelegramThreadId('');
                            }}
                            className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300"
                          />
                          <label htmlFor="notification-group" className="ml-3 flex items-center">
                            <Users className="h-4 w-4 text-green-500 mr-2" />
                            <span className="text-sm font-medium text-gray-700">Grupo General</span>
                          </label>
                        </div>
                        <div className="flex items-center">
                          <input
                            id="notification-group-topic"
                            name="notification-type"
                            type="radio"
                            checked={telegramNotificationType === 'group_topic'}
                            onChange={() => setTelegramNotificationType('group_topic')}
                            className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300"
                          />
                          <label htmlFor="notification-group-topic" className="ml-3 flex items-center">
                            <Users className="h-4 w-4 text-purple-500 mr-2" />
                            <span className="text-sm font-medium text-gray-700">Tema Específico del Grupo</span>
                          </label>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <label htmlFor="telegram-chat-id-advanced" className="block text-sm font-medium text-gray-700">
                          {telegramNotificationType === 'private' ? 'Tu Chat ID' : 'Chat ID del Grupo'}
                        </label>
                        <input
                          type="text"
                          id="telegram-chat-id-advanced"
                          value={telegramChatId}
                          onChange={(e) => {
                            setTelegramChatId(e.target.value);
                            setTestSuccess(false);
                            setTestError('');
                          }}
                          placeholder={telegramNotificationType === 'private' ? "Ej: 123456789" : "Ej: -1001234567890"}
                          className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                        />
                      </div>

                      {telegramNotificationType === 'group_topic' && (
                        <div>
                          <label htmlFor="telegram-thread-id" className="block text-sm font-medium text-gray-700">
                            Thread ID del Tema
                          </label>
                          <input
                            type="text"
                            id="telegram-thread-id"
                            value={telegramThreadId}
                            onChange={(e) => {
                              setTelegramThreadId(e.target.value);
                              setTestSuccess(false);
                              setTestError('');
                            }}
                            placeholder="Ej: 12345"
                            className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                          />
                          <p className="mt-1 text-xs text-gray-500">
                            💡 Usa el comando /info dentro del tema específico para obtener este ID
                          </p>
                        </div>
                      )}

                      <div className="bg-gray-50 p-3 rounded-md">
                        <h6 className="text-xs font-semibold text-gray-900 mb-2">
                          📋 CÓMO OBTENER LOS IDs:
                        </h6>
                        <ol className="list-decimal list-inside space-y-1 text-xs text-gray-600">
                          <li>
                            Agrega el bot a tu {telegramNotificationType === 'private' ? 'chat' : 'grupo'}:{' '}
                            <a
                              href="https://t.me/HotApi_bot"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center text-indigo-600 hover:text-indigo-500 font-medium"
                            >
                              @HotApi_bot
                              <ExternalLink className="h-3 w-3 ml-1" />
                            </a>
                          </li>
                          {telegramNotificationType !== 'private' && (
                            <li>Asegúrate de que el bot tenga permisos para enviar mensajes</li>
                          )}
                          <li>
                            {telegramNotificationType === 'group_topic' 
                              ? 'Ve al tema específico y envía'
                              : 'Envía'
                            } <code className="bg-gray-200 px-1 py-0.5 rounded text-xs">/info</code>
                          </li>
                          <li>Copia los IDs que te proporcione</li>
                        </ol>
                      </div>

                      <div className="flex space-x-2">
                        <button
                          type="button"
                          onClick={testTelegramNotification}
                          disabled={testingTelegram || !telegramChatId.trim() || (telegramNotificationType === 'group_topic' && !telegramThreadId.trim())}
                          className="flex-1 inline-flex justify-center items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {testingTelegram ? (
                            <>
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                              Probando...
                            </>
                          ) : (
                            <>
                              <BellRing className="h-4 w-4 mr-2" />
                              Probar Configuración
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Test Results */}
                {testSuccess && (
                  <div className="mt-4 bg-green-50 border-l-4 border-green-400 p-3">
                    <div className="flex">
                      <div className="flex-shrink-0">
                        <svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <div className="ml-3">
                        <p className="text-sm text-green-700">
                          ✅ ¡Notificación enviada con éxito! Revisa tu Telegram.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {testError && (
                  <div className="mt-4 bg-red-50 border-l-4 border-red-400 p-3">
                    <div className="flex">
                      <div className="flex-shrink-0">
                                                 <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                           <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                         </svg>
                      </div>
                      <div className="ml-3">
                        <p className="text-sm text-red-700">❌ {testError}</p>
                      </div>
                    </div>
                  </div>
                )}
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