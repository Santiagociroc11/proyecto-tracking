import React, { useState, useEffect, useCallback } from 'react';
import { XCircle, ArrowUp, ArrowDown, Activity, DollarSign, TrendingUp, BarChart2, Calendar, Users, Layers, Eye, Loader2 } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine, ComposedChart, Area } from 'recharts';
import { supabase } from '../lib/supabase';

interface DailyData {
  date: string;
  roas: number;
  profit: number;
  spend: number;
  sales: number;
}

interface ModalItem {
  id: string;
  name: string;
  parentName?: string;
  grandParentName?: string;
  type: 'campaign' | 'adset' | 'ad';
  totalSales: number;
  avgRoas: number;
  lastWeekRoas: number;
  maxRoas: number;
  minRoas: number;
  totalSpend: number;
  totalProfit: number;
  status: string; // 'ACTIVE', 'PAUSED', etc.
  dailyData: DailyData[];
}

interface AdDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: ModalItem | null;
}

export function AdDetailsModal({ isOpen, onClose, item: ad }: AdDetailsModalProps) {
  const [activeTab, setActiveTab] = useState<"metrics" | "preview">("metrics");
  const [adPreview, setAdPreview] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const fetchAdPreview = useCallback(async () => {
    if (!ad || ad.type !== 'ad') return;
    
    try {
      setLoadingPreview(true);

      const { data: configData, error: configError } = await supabase
        .from("facebook_config")
        .select("*")
        .single();

      if (configError) throw configError;
      if (!configData?.access_token) {
        throw new Error("Facebook configuration is missing");
      }

      const baseUrl = "https://graph.facebook.com";
      const version = "v22.0";
      const url = `${baseUrl}/${version}/${ad.id}/previews`;

      const params = new URLSearchParams({
        access_token: configData.access_token,
        ad_format: "DESKTOP_FEED_STANDARD",
      });

      const response = await fetch(`${url}?${params.toString()}`);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Facebook API error (${response.status}): ${errorText}`);
      }

      const previewData = await response.json();

      if (previewData.error) {
        throw new Error(`Facebook API error: ${previewData.error.message}`);
      }

      if (previewData.data && previewData.data.length > 0) {
        setAdPreview(previewData.data[0].body);
      } else {
        setAdPreview('<div class="p-4 text-gray-500">No hay vista previa disponible para este anuncio.</div>');
      }
    } catch (error) {
      console.error("Error fetching ad preview:", error);
      setAdPreview('<div class="p-4 text-red-500">Error al cargar la vista previa. Por favor, inténtalo de nuevo.</div>');
    } finally {
      setLoadingPreview(false);
    }
  }, [ad]);

  // Fetch preview when preview tab is activated
  useEffect(() => {
    if (isOpen && activeTab === "preview" && !adPreview && ad?.type === 'ad') {
      fetchAdPreview();
    }
  }, [isOpen, activeTab, adPreview, fetchAdPreview, ad]);

  // Reset preview when modal closes
  useEffect(() => {
    if (!isOpen) {
      setAdPreview(null);
      setActiveTab("metrics");
    }
  }, [isOpen]);

  if (!isOpen || !ad) return null;

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };

  // Calcular las tendencias (últimos 7 días vs 7 días anteriores)
  const calculateTrends = () => {
    if (ad.dailyData.length <= 7) return null;

    const sortedData = [...ad.dailyData].sort((a, b) => 
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    // Últimos 7 días
    const last7Days = sortedData.slice(-7);
    // 7 días anteriores a los últimos 7
    const previous7Days = sortedData.slice(-14, -7);

    const last7DaysSpend = last7Days.reduce((sum, day) => sum + day.spend, 0);
    const previous7DaysSpend = previous7Days.reduce((sum, day) => sum + day.spend, 0);
    
    const last7DaysSales = last7Days.reduce((sum, day) => sum + day.sales, 0);
    const previous7DaysSales = previous7Days.reduce((sum, day) => sum + day.sales, 0);
    
    const last7DaysProfit = last7Days.reduce((sum, day) => sum + day.profit, 0);
    const previous7DaysProfit = previous7Days.reduce((sum, day) => sum + day.profit, 0);

    // Cálculo de porcentajes de cambio
    const spendChange = previous7DaysSpend !== 0 
      ? ((last7DaysSpend - previous7DaysSpend) / previous7DaysSpend) * 100 
      : 0;
    
    const salesChange = previous7DaysSales !== 0 
      ? ((last7DaysSales - previous7DaysSales) / previous7DaysSales) * 100 
      : 0;
    
    const profitChange = previous7DaysProfit !== 0 
      ? ((last7DaysProfit - previous7DaysProfit) / previous7DaysProfit) * 100 
      : 0;

    const roasLast7 = last7DaysSpend > 0 ? last7Days.reduce((sum, day) => sum + (day.sales > 0 ? day.profit + day.spend : 0), 0) / last7DaysSpend : 0;
    const roasPrevious7 = previous7DaysSpend > 0 ? previous7Days.reduce((sum, day) => sum + (day.sales > 0 ? day.profit + day.spend : 0), 0) / previous7DaysSpend : 0;
    const roasChange = roasPrevious7 !== 0 
      ? ((roasLast7 - roasPrevious7) / roasPrevious7) * 100 
      : 0;

    return {
      spendChange,
      salesChange,
      profitChange,
      roasChange,
      last7Days: {
        spend: last7DaysSpend,
        sales: last7DaysSales,
        profit: last7DaysProfit,
        roas: roasLast7
      },
      previous7Days: {
        spend: previous7DaysSpend,
        sales: previous7DaysSales,
        profit: previous7DaysProfit,
        roas: roasPrevious7
      }
    };
  };

  const trends = calculateTrends();

  // Preparar datos para el gráfico de rendimiento diario
  const dailyChartData = [...ad.dailyData]
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .map(day => ({
      ...day,
      formattedDate: new Date(day.date).toLocaleDateString('es-ES', {
        day: '2-digit',
        month: '2-digit'
      })
    }));

  // Determinar la recomendación basada en el rendimiento
  const getRecommendation = () => {
    if (!trends) return "Datos insuficientes para una recomendación.";

    if (ad.avgRoas >= 1.5) {
      if (trends.roasChange > 10) {
        return "Incrementar el presupuesto: Excelente ROAS con tendencia positiva. Escalar gradualmente (10-15% más).";
      } else if (trends.roasChange >= -5) {
        return "Mantener: Buen rendimiento estable. Continuar monitoreando.";
      } else {
        return "Vigilar: Buen ROAS pero tendencia descendente. Revisar cambios recientes.";
      }
    } else if (ad.avgRoas >= 1.2) {
      if (trends.roasChange > 10) {
        return "Optimizar: ROAS aceptable con tendencia positiva. Considerar pequeños incrementos (5-10%).";
      } else if (trends.roasChange >= -10) {
        return "Mantener: Rendimiento adecuado. Buscar oportunidades de optimización.";
      } else {
        return "Precaución: ROAS aceptable pero tendencia negativa. Evaluar audiencia y creatividad.";
      }
    } else if (ad.avgRoas >= 0.8) {
      if (trends.roasChange > 15) {
        return "Prueba controlada: ROAS bajo pero mejorando rápidamente. Esperar más datos antes de decidir.";
      } else {
        return "Ajustar: ROAS por debajo del objetivo. Reducir presupuesto o pausar temporalmente.";
      }
    } else {
      return "Reconsiderar: ROAS significativamente bajo. Evaluar pausar el anuncio o cambiar completamente la estrategia.";
    }
  };

  // Formatear fecha para mostrar periodo
  const formatDateRange = () => {
    if (ad.dailyData.length < 2) return "Datos insuficientes";
    
    const dates = ad.dailyData.map(d => new Date(d.date));
    const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
    const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));
    
    const formatOptions: Intl.DateTimeFormatOptions = { 
      day: 'numeric', 
      month: 'short', 
      year: 'numeric' 
    };
    
    return `${minDate.toLocaleDateString('es-ES', formatOptions)} - ${maxDate.toLocaleDateString('es-ES', formatOptions)}`;
  };

  const hasEnoughDataForTrends = ad.dailyData.length > 7;

  return (
    <div className="fixed inset-0 bg-gray-900 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center">
      <div className="relative bg-white rounded-lg shadow-xl max-w-6xl w-full m-4 max-h-[90vh] overflow-auto">
        <div className="sticky top-0 bg-white p-4 border-b border-gray-200 flex justify-between items-center z-10">
          <div>
            {/* Breadcrumbs: Campaña > Conjunto > Anuncio */}
            <div className="flex items-center mb-1 text-sm">
              {ad.type === 'campaign' && (
                <span className="font-medium text-indigo-600 flex items-center"><Layers className="h-4 w-4 mr-1" />{ad.name}</span>
              )}
              {ad.type === 'adset' && (
                <>
                  <span className="text-gray-500">{ad.parentName}</span>
                  <span className="mx-2 text-gray-400">/</span>
                  <span className="font-medium text-indigo-600 flex items-center"><Layers className="h-4 w-4 mr-1" />{ad.name}</span>
                </>
              )}
              {ad.type === 'ad' && (
                <>
                  <span className="text-gray-500 truncate max-w-[200px]" title={ad.grandParentName}>{ad.grandParentName}</span>
                  <span className="mx-2 text-gray-400">/</span>
                  <span className="text-gray-500 truncate max-w-[200px]" title={ad.parentName}>{ad.parentName}</span>
                   <span className="mx-2 text-gray-400">/</span>
                  <span className="font-medium text-indigo-600 flex items-center"><Layers className="h-4 w-4 mr-1" />{ad.name}</span>
                </>
              )}
            </div>
            
            {/* Nombre del elemento */}
            <h2 className="text-lg sm:text-xl font-bold text-gray-900 flex items-center">
              {ad.status === 'ACTIVE' && <span className="w-2 h-2 rounded-full bg-green-500 mr-2"></span>}
              {ad.status === 'PAUSED' && <span className="w-2 h-2 rounded-full bg-yellow-500 mr-2"></span>}
              {ad.name}
            </h2>
            <p className="text-xs text-gray-500">{ad.id}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 focus:outline-none"
          >
            <XCircle className="h-6 w-6" />
          </button>
        </div>

        {/* Tabs de navegación */}
        <div className="border-b border-gray-200">
          <nav className="flex -mb-px">
            <button 
              onClick={() => setActiveTab("metrics")} 
              className={`py-3 px-4 font-medium text-sm border-b-2 ${
                activeTab === "metrics" 
                  ? "border-indigo-500 text-indigo-600" 
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              Métricas y Análisis
            </button>
            {ad.type === 'ad' && (
            <button 
              onClick={() => setActiveTab("preview")} 
              className={`py-3 px-4 font-medium text-sm border-b-2 flex items-center gap-1 ${
                activeTab === "preview" 
                  ? "border-indigo-500 text-indigo-600" 
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              <Eye className="h-4 w-4" />
              Vista previa
            </button>
            )}
          </nav>
        </div>

        {/* Contenido de la pestaña de Métricas */}
        {activeTab === "metrics" && (
        <div className="p-4 sm:p-6">
          {/* Periodo de datos */}
          <div className="mb-6 flex items-center text-sm text-gray-600">
            <Calendar className="mr-2 h-4 w-4" />
            <span>Periodo: {formatDateRange()}</span>
          </div>

          {/* Métricas principales */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            <div className="bg-indigo-50 rounded-lg p-4">
              <div className="text-indigo-700 text-xs font-medium mb-1 flex items-center">
                <TrendingUp className="h-3 w-3 mr-1" /> ROAS
              </div>
              <div className="text-xl font-bold text-indigo-900">
                {ad.avgRoas.toFixed(2)}x
              </div>
              {trends && (
                <div className={`text-xs mt-1 flex items-center ${trends.roasChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {trends.roasChange >= 0 ? <ArrowUp className="h-3 w-3 mr-1" /> : <ArrowDown className="h-3 w-3 mr-1" />}
                  {Math.abs(trends.roasChange).toFixed(1)}%
                </div>
              )}
            </div>

            <div className="bg-blue-50 rounded-lg p-4">
              <div className="text-blue-700 text-xs font-medium mb-1 flex items-center">
                <DollarSign className="h-3 w-3 mr-1" /> Gasto
              </div>
              <div className="text-xl font-bold text-blue-900">
                {formatCurrency(ad.totalSpend)}
              </div>
              {trends && (
                <div className={`text-xs mt-1 flex items-center ${trends.spendChange >= 0 ? 'text-blue-600' : 'text-blue-600'}`}>
                  {trends.spendChange >= 0 ? <ArrowUp className="h-3 w-3 mr-1" /> : <ArrowDown className="h-3 w-3 mr-1" />}
                  {Math.abs(trends.spendChange).toFixed(1)}%
                </div>
              )}
            </div>

            <div className="bg-violet-50 rounded-lg p-4">
              <div className="text-violet-700 text-xs font-medium mb-1 flex items-center">
                <Users className="h-3 w-3 mr-1" /> Ventas
              </div>
              <div className="text-xl font-bold text-violet-900">
                {ad.totalSales}
              </div>
              {trends && (
                <div className={`text-xs mt-1 flex items-center ${trends.salesChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {trends.salesChange >= 0 ? <ArrowUp className="h-3 w-3 mr-1" /> : <ArrowDown className="h-3 w-3 mr-1" />}
                  {Math.abs(trends.salesChange).toFixed(1)}%
                </div>
              )}
            </div>

            <div className={`${ad.totalProfit >= 0 ? 'bg-green-50' : 'bg-red-50'} rounded-lg p-4`}>
              <div className={`${ad.totalProfit >= 0 ? 'text-green-700' : 'text-red-700'} text-xs font-medium mb-1 flex items-center`}>
                <Activity className="h-3 w-3 mr-1" /> Beneficio
              </div>
              <div className={`text-xl font-bold ${ad.totalProfit >= 0 ? 'text-green-900' : 'text-red-900'}`}>
                {formatCurrency(ad.totalProfit)}
              </div>
              {trends && (
                <div className={`text-xs mt-1 flex items-center ${trends.profitChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {trends.profitChange >= 0 ? <ArrowUp className="h-3 w-3 mr-1" /> : <ArrowDown className="h-3 w-3 mr-1" />}
                  {Math.abs(trends.profitChange).toFixed(1)}%
                </div>
              )}
            </div>
          </div>

          {/* Gráfico de rendimiento */}
          <div className="bg-gray-50 p-4 rounded-lg mb-6">
            <h3 className="text-sm font-medium text-gray-700 mb-4">Evolución de ROAS y Gasto</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={dailyChartData}
                  margin={{ top: 5, right: 30, left: 20, bottom: 25 }}
                >
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis 
                    dataKey="formattedDate" 
                    angle={-45}
                    textAnchor="end"
                    height={60}
                    tick={{ fontSize: 10 }}
                  />
                  <YAxis 
                    yAxisId="left"
                    orientation="left"
                    tickFormatter={(value) => `${value.toFixed(1)}x`}
                    domain={[0, Math.max(2, ad.maxRoas * 1.1)]}
                  />
                  <YAxis 
                    yAxisId="right"
                    orientation="right"
                    tickFormatter={(value) => `$${value}`}
                    domain={[0, 'auto']}
                  />
                  <Tooltip 
                    formatter={(value, name) => {
                      if (name === 'roas') return [`${Number(value).toFixed(2)}x`, 'ROAS'];
                      if (name === 'spend') return [formatCurrency(Number(value)), 'Gasto'];
                      if (name === 'sales') return [value, 'Ventas'];
                      return [value, name];
                    }}
                    labelFormatter={(label) => `Fecha: ${label}`}
                  />
                  <Legend />
                  <Line 
                    yAxisId="left"
                    type="monotone" 
                    dataKey="roas" 
                    stroke="#4F46E5" 
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    name="ROAS"
                  />
                  <Area
                    yAxisId="right"
                    type="monotone"
                    dataKey="spend"
                    fill="#93C5FD"
                    stroke="#3B82F6"
                    name="Gasto"
                  />
                  <ReferenceLine y={1.2} yAxisId="left" stroke="#9CA3AF" strokeDasharray="3 3" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Análisis comparativo últimos 7 días vs anteriores */}
          {hasEnoughDataForTrends && trends && (
            <div className="mb-6">
              <h3 className="text-sm font-medium text-gray-700 mb-3">Comparativa: Últimos 7 días vs 7 días anteriores</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Periodo</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ventas</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Gasto</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ROAS</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Beneficio</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    <tr>
                      <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900 font-medium">Últimos 7 días</td>
                      <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-700">{trends.last7Days.sales}</td>
                      <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-700">{formatCurrency(trends.last7Days.spend)}</td>
                      <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-700">{trends.last7Days.roas.toFixed(2)}x</td>
                      <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-700">{formatCurrency(trends.last7Days.profit)}</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900 font-medium">7 días anteriores</td>
                      <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-700">{trends.previous7Days.sales}</td>
                      <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-700">{formatCurrency(trends.previous7Days.spend)}</td>
                      <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-700">{trends.previous7Days.roas.toFixed(2)}x</td>
                      <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-700">{formatCurrency(trends.previous7Days.profit)}</td>
                    </tr>
                    <tr className="bg-gray-50">
                      <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900 font-medium">Variación</td>
                      <td className={`px-4 py-2 whitespace-nowrap text-sm ${trends.salesChange >= 0 ? 'text-green-600' : 'text-red-600'} font-medium`}>
                        {trends.salesChange >= 0 ? '+' : ''}{trends.salesChange.toFixed(1)}%
                      </td>
                      <td className={`px-4 py-2 whitespace-nowrap text-sm font-medium ${Math.abs(trends.spendChange) < 5 ? 'text-gray-600' : trends.spendChange > 0 ? 'text-blue-600' : 'text-blue-600'}`}>
                        {trends.spendChange >= 0 ? '+' : ''}{trends.spendChange.toFixed(1)}%
                      </td>
                      <td className={`px-4 py-2 whitespace-nowrap text-sm ${trends.roasChange >= 0 ? 'text-green-600' : 'text-red-600'} font-medium`}>
                        {trends.roasChange >= 0 ? '+' : ''}{trends.roasChange.toFixed(1)}%
                      </td>
                      <td className={`px-4 py-2 whitespace-nowrap text-sm ${trends.profitChange >= 0 ? 'text-green-600' : 'text-red-600'} font-medium`}>
                        {trends.profitChange >= 0 ? '+' : ''}{trends.profitChange.toFixed(1)}%
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Recomendaciones */}
          <div className="bg-amber-50 p-4 rounded-lg mb-6">
            <h3 className="text-sm font-medium text-amber-700 mb-2 flex items-center">
              <BarChart2 className="h-4 w-4 mr-1" /> Recomendación basada en datos
            </h3>
            <p className="text-amber-800">
              {getRecommendation()}
            </p>
          </div>

          {/* Tabla de datos diarios */}
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-3">Datos diarios detallados</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fecha</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ventas</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Gasto</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ROAS</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Beneficio</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {dailyChartData.map((day, index) => (
                    <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900">
                        {new Date(day.date).toLocaleDateString('es-ES', { 
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric'
                        })}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-700">{day.sales}</td>
                      <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-700">{formatCurrency(day.spend)}</td>
                      <td className={`px-4 py-2 whitespace-nowrap text-sm ${
                        day.roas >= 1.2 ? 'text-green-600' : day.roas >= 0.8 ? 'text-yellow-600' : 'text-red-600'
                      }`}>
                        {day.roas.toFixed(2)}x
                      </td>
                      <td className={`px-4 py-2 whitespace-nowrap text-sm ${
                        day.profit >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {formatCurrency(day.profit)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        )}

        {/* Contenido de la pestaña de Vista Previa */}
        {activeTab === "preview" && ad.type === 'ad' && (
          <div className="p-4 sm:p-6">
            <div className="bg-white border border-gray-200 rounded-lg">
              <div className="p-4 border-b border-gray-200 flex justify-between items-center">
                <h3 className="text-sm font-medium text-gray-900">Vista previa del anuncio</h3>
                <button 
                  onClick={fetchAdPreview} 
                  className="text-sm text-indigo-600 hover:text-indigo-800" 
                  disabled={loadingPreview}
                >
                  {loadingPreview ? (
                    <span className="flex items-center">
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      Cargando...
                    </span>
                  ) : (
                    "Actualizar"
                  )}
                </button>
              </div>

              <div className="p-4">
                {loadingPreview ? (
                  <div className="h-96 flex items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
                  </div>
                ) : adPreview ? (
                  <div className="flex justify-center">
                    <div dangerouslySetInnerHTML={{ __html: adPreview }} className="ad-preview-container" />
                  </div>
                ) : (
                  <div className="h-96 flex items-center justify-center text-gray-500">
                    Haz clic en "Actualizar" para cargar la vista previa del anuncio.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 