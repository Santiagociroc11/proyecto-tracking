import React, { useState, useEffect, useCallback } from 'react';
import { XCircle, ArrowUp, ArrowDown, Activity, DollarSign, TrendingUp, BarChart2, Calendar, Users, Layers, Eye, Loader2 } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine, ComposedChart, Area, AreaChart } from 'recharts';
import { supabase } from '../lib/supabase';

interface DailyData {
  date: string;
  roas: number;
  profit: number;
  spend: number;
  sales: number;
  revenue: number;
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
    if (!ad || ad.dailyData.length === 0) {
      return {
        text: "Datos insuficientes para una recomendación.",
        type: "warning" as const
      };
    }

    const trends = calculateTrends();
    if (!trends) {
      return {
        text: "Datos insuficientes para una recomendación.",
        type: "warning" as const
      };
    }

    const avgRoas = ad.avgRoas;
    const totalProfit = ad.totalProfit;

    if (avgRoas < 0.8) {
      return {
        text: "ROAS crítico. Pausa inmediata y revisa la estrategia completa.",
        type: "danger" as const
      };
    }
    
    if (avgRoas < 1.2 && totalProfit < 0) {
      return {
        text: "ROAS bajo y pérdidas. Evalúa pausar o cambiar completamente la estrategia.",
        type: "danger" as const
      };
    }

    if (avgRoas >= 2.0 && trends.spendChange < 50) {
      return {
        text: "¡Excelente ROAS! Considera escalar el presupuesto gradualmente.",
        type: "success" as const
      };
    }

    if (avgRoas >= 1.2 && avgRoas < 2.0) {
      return {
        text: "ROAS aceptable. Optimiza creativos y audiencias para mejorar.",
        type: "info" as const
      };
    }

    return {
      text: "Datos insuficientes para una recomendación.",
      type: "warning" as const
    };
  };

  const chartData = ad.dailyData.map(day => ({
    ...day,
    // [y1, y2] para el área entre curvas
    profitArea: day.profit >= 0 ? [day.spend, day.revenue] : [day.revenue, day.revenue],
    lossArea: day.profit < 0 ? [day.revenue, day.spend] : [day.spend, day.spend],
  }));

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || !payload.length) return null;
    
    const data = payload[0].payload;
    
    return (
      <div className="bg-white p-4 rounded-lg shadow-xl border border-gray-200 text-sm max-w-xs">
        <div className="font-bold text-gray-900 mb-3 border-b pb-2">{label}</div>
        
        <div className="space-y-2">
          {/* Ventas */}
          <div className="flex justify-between items-center">
            <span className="text-gray-600">🛒 Ventas:</span>
            <span className="font-bold text-blue-700">{data.sales}</span>
          </div>
          
          {/* Ingresos */}
          <div className="flex justify-between items-center">
            <span className="text-gray-600">💰 Ingresos:</span>
            <span className="font-bold text-emerald-600">
              ${(data.revenue || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          
          {/* Gasto */}
          <div className="flex justify-between items-center">
            <span className="text-gray-600">📈 Gasto:</span>
            <span className="font-bold text-red-600">
              ${(data.spend || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          
          {/* Beneficio */}
          <div className="flex justify-between items-center border-t pt-2">
            <span className="text-gray-600">💸 Beneficio:</span>
            <span className={`font-bold ${data.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {data.profit >= 0 ? '+' : ''}${(data.profit || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          
          {/* ROAS */}
          <div className="flex justify-between items-center">
            <span className="text-gray-600">🎯 ROAS:</span>
            <span className={`font-bold px-2 py-1 rounded text-xs ${
              data.roas >= 2.0 ? 'bg-green-100 text-green-800' : 
              data.roas >= 1.2 ? 'bg-yellow-100 text-yellow-800' : 
              'bg-red-100 text-red-800'
            }`}>
              {(data.roas || 0).toFixed(2)}x
            </span>
          </div>
          
          {/* CPA (si hay ventas) */}
          {data.sales > 0 && (
            <div className="flex justify-between items-center">
              <span className="text-gray-600">🎪 CPA:</span>
              <span className="font-medium text-purple-600">
                ${((data.spend || 0) / data.sales).toFixed(2)}
              </span>
            </div>
          )}
          
          {/* AOV (si hay ventas) */}
          {data.sales > 0 && (
            <div className="flex justify-between items-center">
              <span className="text-gray-600">💳 AOV:</span>
              <span className="font-medium text-indigo-600">
                ${((data.revenue || 0) / data.sales).toFixed(2)}
              </span>
            </div>
          )}
        </div>
      </div>
    );
  };

  const formatDateRange = () => {
    if (!ad || ad.dailyData.length === 0) return "";
    
    const dates = ad.dailyData.map(d => d.date).sort();
    const startDate = dates[0];
    const endDate = dates[dates.length - 1];
    
    if (startDate === endDate) {
      return startDate;
    }
    
    return `${startDate} - ${endDate}`;
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

          {/* Gráfico mejorado */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Análisis de Rentabilidad</h3>
              <span className="text-sm text-gray-500">{formatDateRange()}</span>
            </div>
            
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <defs>
                    <linearGradient id="profitGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10B981" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="#10B981" stopOpacity={0.05}/>
                    </linearGradient>
                    <linearGradient id="lossGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#EF4444" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="#EF4444" stopOpacity={0.05}/>
                    </linearGradient>
                  </defs>
                  
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis 
                    dataKey="date" 
                    tick={{ fontSize: 12, fill: '#6b7280' }}
                    tickLine={{ stroke: '#d1d5db' }}
                    axisLine={{ stroke: '#d1d5db' }}
                  />
                  
                  <YAxis 
                    yAxisId="money" 
                    orientation="right"
                    tick={{ fontSize: 12, fill: '#6b7280' }}
                    tickLine={{ stroke: '#d1d5db' }}
                    axisLine={{ stroke: '#d1d5db' }}
                    tickFormatter={(value) => `$${value.toLocaleString('es-ES', { maximumFractionDigits: 0 })}`}
                    label={{ value: 'Dinero ($)', angle: 90, position: 'insideRight', style: { textAnchor: 'middle', fill: '#6b7280' } }}
                  />
                  
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ paddingTop: '20px' }} />
                  
                  {/* Área de Beneficio (verde) */}
                  <Area 
                    yAxisId="money" 
                    type="monotone" 
                    dataKey="profitArea" 
                    name="Beneficio"
                    stroke="none" 
                    fill="url(#profitGradient)"
                    connectNulls
                  />

                  {/* Área de Pérdida (rojo) */}
                  <Area 
                    yAxisId="money" 
                    type="monotone" 
                    dataKey="lossArea" 
                    name="Pérdida"
                    stroke="none" 
                    fill="url(#lossGradient)"
                    connectNulls
                  />
                  
                  {/* Líneas de Ingresos y Gasto */}
                  <Line 
                    yAxisId="money" 
                    type="monotone" 
                    dataKey="revenue" 
                    name="Ingresos"
                    stroke="#10B981" 
                    strokeWidth={3}
                    dot={false}
                  />
                  <Line 
                    yAxisId="money" 
                    type="monotone" 
                    dataKey="spend" 
                    name="Gasto"
                    stroke="#EF4444" 
                    strokeWidth={3}
                    dot={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* Minigráfico de ROAS */}
            <div className="mt-6">
              <h4 className="text-md font-semibold text-gray-800 mb-2">Evolución del ROAS</h4>
              <div className="h-24">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={ad.dailyData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                    <defs>
                      <linearGradient id="roasGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.4}/>
                        <stop offset="95%" stopColor="#3B82F6" stopOpacity={0.05}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                    <Tooltip 
                      content={({ active, payload, label }) => {
                        if (active && payload && payload.length) {
                          const value = payload[0].value as number;
                          return (
                            <div className="bg-white p-2 rounded shadow border text-sm">
                              <p>{label}</p>
                              <p className="font-bold text-blue-600">ROAS: {value?.toFixed(2)}x</p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <YAxis
                      domain={[0, 'dataMax + 0.5']}
                      tick={{ fontSize: 10, fill: '#6b7280' }}
                      tickLine={false}
                      axisLine={false}
                      width={40}
                    />
                    <ReferenceLine 
                      y={1.2} 
                      stroke="#f59e0b" 
                      strokeDasharray="3 3"
                      label={{ value: "1.2x", position: "insideTopLeft", fill: "#f59e0b", fontSize: 10 }}
                    />
                     <Area 
                      type="monotone" 
                      dataKey="roas" 
                      name="ROAS"
                      stroke="#3B82F6" 
                      strokeWidth={3}
                      fill="url(#roasGradient)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Tabla comparativa */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Comparativa: Últimos 7 días vs 7 días anteriores
            </h3>
            
              <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="text-left">
                    <th className="px-4 py-2 text-sm font-medium text-gray-500">PERÍODO</th>
                    <th className="px-4 py-2 text-sm font-medium text-gray-500">VENTAS</th>
                    <th className="px-4 py-2 text-sm font-medium text-gray-500">GASTO</th>
                    <th className="px-4 py-2 text-sm font-medium text-gray-500">ROAS</th>
                    <th className="px-4 py-2 text-sm font-medium text-gray-500">BENEFICIO</th>
                    </tr>
                  </thead>
                <tbody className="divide-y divide-gray-200">
                    <tr>
                    <td className="px-4 py-3 text-sm text-gray-900">Últimos 7 días</td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {ad.dailyData.slice(-7).reduce((sum, d) => sum + d.sales, 0)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {formatCurrency(ad.dailyData.slice(-7).reduce((sum, d) => sum + d.spend, 0))}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {calculateTrends()?.last7Days?.roas?.toFixed(2) || '0.00'}x
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {formatCurrency(ad.dailyData.slice(-7).reduce((sum, d) => sum + d.profit, 0))}
                    </td>
                    </tr>
                    <tr>
                    <td className="px-4 py-3 text-sm text-gray-900">7 días anteriores</td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {ad.dailyData.slice(-14, -7).reduce((sum, d) => sum + d.sales, 0)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {formatCurrency(ad.dailyData.slice(-14, -7).reduce((sum, d) => sum + d.spend, 0))}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {calculateTrends()?.previous7Days?.roas?.toFixed(2) || '0.00'}x
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {formatCurrency(ad.dailyData.slice(-14, -7).reduce((sum, d) => sum + d.profit, 0))}
                      </td>
                  </tr>
                  <tr className="bg-white">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">Variación</td>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex items-center">
                        {calculateTrends() && calculateTrends()!.salesChange >= 0 ? (
                          <ArrowUp className="h-4 w-4 text-green-500 mr-1" />
                        ) : (
                          <ArrowDown className="h-4 w-4 text-red-500 mr-1" />
                        )}
                        <span className={`font-medium ${
                          calculateTrends() && calculateTrends()!.salesChange >= 0 ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {calculateTrends() && (calculateTrends()!.salesChange >= 0 ? '+' : '')}{calculateTrends()?.salesChange?.toFixed(1) || '0.0'}%
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex items-center">
                        {calculateTrends() && calculateTrends()!.spendChange >= 0 ? (
                          <ArrowUp className="h-4 w-4 text-red-500 mr-1" />
                        ) : (
                          <ArrowDown className="h-4 w-4 text-green-500 mr-1" />
                        )}
                        <span className={`font-medium ${
                          calculateTrends() && calculateTrends()!.spendChange >= 0 ? 'text-red-600' : 'text-green-600'
                        }`}>
                          {calculateTrends() && (calculateTrends()!.spendChange >= 0 ? '+' : '')}{calculateTrends()?.spendChange?.toFixed(1) || '0.0'}%
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex items-center">
                        {calculateTrends() && calculateTrends()!.roasChange >= 0 ? (
                          <ArrowUp className="h-4 w-4 text-green-500 mr-1" />
                        ) : (
                          <ArrowDown className="h-4 w-4 text-red-500 mr-1" />
                        )}
                        <span className={`font-medium ${
                          calculateTrends() && calculateTrends()!.roasChange >= 0 ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {calculateTrends() && (calculateTrends()!.roasChange >= 0 ? '+' : '')}{calculateTrends()?.roasChange?.toFixed(1) || '0.0'}%
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex items-center">
                        {calculateTrends() && calculateTrends()!.profitChange >= 0 ? (
                          <ArrowUp className="h-4 w-4 text-green-500 mr-1" />
                        ) : (
                          <ArrowDown className="h-4 w-4 text-red-500 mr-1" />
                        )}
                        <span className={`font-medium ${
                          calculateTrends() && calculateTrends()!.profitChange >= 0 ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {calculateTrends() && (calculateTrends()!.profitChange >= 0 ? '+' : '')}{calculateTrends()?.profitChange?.toFixed(1) || '0.0'}%
                        </span>
                      </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

          {/* Recomendación */}
          <div className={`p-4 rounded-lg border-l-4 ${
            getRecommendation().type === 'success' ? 'bg-green-50 border-green-400' :
            getRecommendation().type === 'danger' ? 'bg-red-50 border-red-400' :
            getRecommendation().type === 'info' ? 'bg-blue-50 border-blue-400' :
            'bg-yellow-50 border-yellow-400'
          }`}>
            <h3 className={`text-lg font-semibold mb-2 ${
              getRecommendation().type === 'success' ? 'text-green-800' :
              getRecommendation().type === 'danger' ? 'text-red-800' :
              getRecommendation().type === 'info' ? 'text-blue-800' :
              'text-yellow-800'
            }`}>
              💡 Recomendación basada en datos
            </h3>
            <p className={
              getRecommendation().type === 'success' ? 'text-green-800' :
              getRecommendation().type === 'danger' ? 'text-red-800' :
              getRecommendation().type === 'info' ? 'text-blue-800' :
              'text-yellow-800'
            }>
              {getRecommendation().text}
            </p>
          </div>

          {/* Datos diarios detallados */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 border-b">
              <h3 className="text-lg font-semibold text-gray-900">Datos diarios detallados</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">FECHA</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">VENTAS</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">GASTO</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">ROAS</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">BENEFICIO</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {ad.dailyData.map((day, index) => (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{day.date}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{day.sales}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{formatCurrency(day.spend)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          day.roas >= 2.0 ? 'bg-green-100 text-green-800' :
                          day.roas >= 1.2 ? 'bg-yellow-100 text-yellow-800' :
                          'bg-red-100 text-red-800'
                      }`}>
                        {day.roas.toFixed(2)}x
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span className={`font-medium ${day.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatCurrency(day.profit)}
                        </span>
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