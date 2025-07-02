import React, { useState, useEffect, useCallback } from 'react';
import { XCircle, ArrowUp, ArrowDown, Activity, DollarSign, TrendingUp, BarChart2, Calendar, Users, Layers, Eye, Loader2 } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine, ComposedChart, Area, AreaChart, LabelList } from 'recharts';
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

  const formatCurrency = (value: number, includeDecimals = true) => {
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: includeDecimals ? 2 : 0,
      maximumFractionDigits: includeDecimals ? 2 : 0
    }).format(value);
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
            </div>

            <div className="bg-blue-50 rounded-lg p-4">
              <div className="text-blue-700 text-xs font-medium mb-1 flex items-center">
                <DollarSign className="h-3 w-3 mr-1" /> Gasto
              </div>
              <div className="text-xl font-bold text-blue-900">
                {formatCurrency(ad.totalSpend)}
              </div>
            </div>

            <div className="bg-violet-50 rounded-lg p-4">
              <div className="text-violet-700 text-xs font-medium mb-1 flex items-center">
                <Users className="h-3 w-3 mr-1" /> Ventas
              </div>
              <div className="text-xl font-bold text-violet-900">
                {ad.totalSales}
              </div>
            </div>

            <div className={`${ad.totalProfit >= 0 ? 'bg-green-50' : 'bg-red-50'} rounded-lg p-4`}>
              <div className={`${ad.totalProfit >= 0 ? 'text-green-700' : 'text-red-700'} text-xs font-medium mb-1 flex items-center`}>
                <Activity className="h-3 w-3 mr-1" /> Beneficio
              </div>
              <div className={`text-xl font-bold ${ad.totalProfit >= 0 ? 'text-green-900' : 'text-red-900'}`}>
                {formatCurrency(ad.totalProfit)}
              </div>
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
                <ComposedChart 
                  data={chartData} 
                  margin={{ top: 5, right: 30, left: 30, bottom: 0 }}
                  syncId="finance"
                >
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
                    hide={true}
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
                    dot={{ r: 3, strokeWidth: 2, fill: '#fff', stroke: '#10B981' }}
                    activeDot={{ r: 5, strokeWidth: 2 }}
                  >
                    <LabelList 
                      dataKey="revenue" 
                      position="top" 
                      style={{ fontSize: '10px', fill: '#374151' }} 
                      formatter={(value: number) => `$${Math.round(value)}`} 
                      offset={8} 
                    />
                  </Line>
                  <Line 
                    yAxisId="money" 
                    type="monotone" 
                    dataKey="spend" 
                    name="Gasto"
                    stroke="#EF4444" 
                    strokeWidth={3}
                    dot={{ r: 3, strokeWidth: 2, fill: '#fff', stroke: '#EF4444' }}
                    activeDot={{ r: 5, strokeWidth: 2 }}
                  >
                    <LabelList 
                      dataKey="spend" 
                      position="bottom" 
                      style={{ fontSize: '10px', fill: '#374151' }} 
                      formatter={(value: number) => `$${Math.round(value)}`} 
                      offset={8} 
                    />
                  </Line>
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* Minigráfico de ROAS */}
            <div className="mt-0">
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart 
                    data={ad.dailyData} 
                    margin={{ top: 10, right: 95, left: 30, bottom: 20 }}
                    syncId="finance"
                  >
                    <defs>
                      <linearGradient id="roasGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.4}/>
                        <stop offset="95%" stopColor="#3B82F6" stopOpacity={0.05}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                    <XAxis 
                      dataKey="date" 
                      tick={{ fontSize: 12, fill: '#6b7280' }}
                    />
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
                      hide={true}
                      domain={[0, 'dataMax + 0.5']}
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
                      dot={{ r: 3, strokeWidth: 2, fill: '#fff', stroke: '#3B82F6' }}
                      activeDot={{ r: 5, strokeWidth: 2 }}
                    >
                      <LabelList 
                        dataKey="roas" 
                        position="top" 
                        style={{ fontSize: '10px', fill: '#374151' }} 
                        formatter={(value: number) => `${value.toFixed(1)}x`} 
                        offset={8} 
                      />
                    </Area>
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="h-8"></div>

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