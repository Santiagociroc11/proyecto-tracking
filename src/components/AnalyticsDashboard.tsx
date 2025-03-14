import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { BarChart as BarChartIcon, LineChart as LineChartIcon, ArrowUpRight, ArrowDownRight, DollarSign, Users, Calendar, Download, RefreshCw, ArrowUpDown } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useTimezone } from '../hooks/useTimezone';
import { formatDateToTimezone } from '../utils/date';
import { useAuth } from '../contexts/AuthContext';
import * as XLSX from 'xlsx';

interface AnalyticsData {
  total_visits: number;
  total_clicks: number;
  total_purchases: number;
  conversion_rate: number;
  utm_stats: {
    source: string;
    medium: string;
    campaign: string;
    content: string;
    term: string;
    visits: number;
    clicks: number;
    purchases: number;
    conversion_rate: number;
  }[];
  daily_stats: {
    date: string;
    visits: number;
    clicks: number;
    purchases: number;
  }[];
  top_sources: {
    source: string;
    visits: number;
    clicks: number;
  }[];
}

interface Props {
  productId: string;
}

type SortField = 'campaign' | 'medium' | 'content' | 'source' | 'visits' | 'clicks' | 'purchases' | 'conversion_rate';
type SortDirection = 'asc' | 'desc';

interface Column {
  id: SortField;
  label: string;
  width: number;
  minWidth: number;
}

export default function AnalyticsDashboard({ productId }: Props) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [timeframe, setTimeframe] = useState<'day' | 'week' | 'month' | 'custom'>('month');
  const [startDate, setStartDate] = useState<string>(
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  const [endDate, setEndDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [dateError, setDateError] = useState<string>('');
  const { timezone } = useTimezone();
  const [sortField, setSortField] = useState<SortField>('visits');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [error, setError] = useState<string>('');
  const [resizing, setResizing] = useState(false);
  const [startX, setStartX] = useState(0);
  const [currentColumn, setCurrentColumn] = useState<Column | null>(null);

  const [columns, setColumns] = useState<Column[]>([
    { id: 'campaign', label: 'Campaña', width: 200, minWidth: 100 },
    { id: 'medium', label: 'Segmentación', width: 150, minWidth: 80 },
    { id: 'content', label: 'Anuncio', width: 200, minWidth: 100 },
    { id: 'source', label: 'Fuente', width: 150, minWidth: 80 },
    { id: 'visits', label: 'Visitas', width: 100, minWidth: 60 },
    { id: 'clicks', label: 'Pagos Iniciados', width: 120, minWidth: 80 },
    { id: 'purchases', label: 'Compras', width: 100, minWidth: 60 },
    { id: 'conversion_rate', label: 'Conversión', width: 120, minWidth: 80 }
  ]);

  const tableRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = (e: React.MouseEvent, column: Column) => {
    e.preventDefault();
    e.stopPropagation();
    
    const startX = e.pageX;
    const startWidth = column.width;
    
    const handleMouseMove = (moveEvent: MouseEvent) => {
      moveEvent.preventDefault();
      const diff = moveEvent.pageX - startX;
      const newWidth = Math.max(column.minWidth, startWidth + diff);
      
      setColumns(prevColumns => 
        prevColumns.map(col => 
          col.id === column.id ? { ...col, width: newWidth } : col
        )
      );

      // Add class to body during resize for better cursor handling
      document.body.classList.add('table-resizing');
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.classList.remove('table-resizing');
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  useEffect(() => {
    if (user) {
      loadAnalytics();
    }
  }, [productId, timeframe, startDate, endDate, timezone, user]);

  const validateDateRange = (start: string, end: string): boolean => {
    const startTime = new Date(start).getTime();
    const endTime = new Date(end).getTime();
    const maxRange = 365 * 24 * 60 * 60 * 1000; // 1 year in milliseconds

    if (startTime > endTime) {
      setDateError('La fecha inicial no puede ser posterior a la fecha final');
      return false;
    }

    if (endTime - startTime > maxRange) {
      setDateError('El rango máximo permitido es de 1 año');
      return false;
    }

    if (endTime > Date.now()) {
      setDateError('La fecha final no puede ser futura');
      return false;
    }

    setDateError('');
    return true;
  };

  const handleDateChange = (type: 'start' | 'end', value: string) => {
    const newStartDate = type === 'start' ? value : startDate;
    const newEndDate = type === 'end' ? value : endDate;

    if (validateDateRange(newStartDate, newEndDate)) {
      setTimeframe('custom');
      if (type === 'start') setStartDate(value);
      if (type === 'end') setEndDate(value);
    }
  };

  const setPresetTimeframe = (newTimeframe: 'day' | 'week' | 'month') => {
    const now = new Date();
    let start: Date;

    switch (newTimeframe) {
      case 'day':
        start = new Date(now.setHours(0, 0, 0, 0));
        break;
      case 'week':
        start = new Date(now.setDate(now.getDate() - 7));
        break;
      case 'month':
        start = new Date(now.setMonth(now.getMonth() - 1));
        break;
      default:
        return;
    }

    setTimeframe(newTimeframe);
    setStartDate(start.toISOString().split('T')[0]);
    setEndDate(new Date().toISOString().split('T')[0]);
    setDateError('');
  };

  const resetDateFilter = () => {
    setPresetTimeframe('month');
  };

  async function loadAnalytics() {
    try {
      setLoading(true);
      setError('');

      if (!user) {
        setError('Usuario no autenticado');
        return;
      }

      // First verify access to the product
      const { data: userData } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single();

      const { data: product } = await supabase
        .from('products')
        .select('user_id')
        .eq('id', productId)
        .single();

      if (!product || (product.user_id !== user.id && userData?.role !== 'admin')) {
        setError('No tienes acceso a estas analíticas');
        return;
      }

      const { data: events, error: eventsError } = await supabase
        .from('tracking_events')
        .select(`
          id,
          event_type,
          event_data,
          created_at,
          visitor_id,
          url
        `)
        .eq('product_id', productId)
        .gte('created_at', `${startDate}T00:00:00`)
        .lte('created_at', `${endDate}T23:59:59`)
        .order('created_at', { ascending: true });

      if (eventsError) throw eventsError;

      // Process data
      const utmStats = new Map();
      const dailyStats = new Map();
      const sourceStats = new Map();
      let totalVisits = 0;
      let totalClicks = 0;
      let totalPurchases = 0;

      events.forEach(event => {
        const date = formatDateToTimezone(event.created_at, timezone).split(' ')[0];
        if (!dailyStats.has(date)) {
          dailyStats.set(date, { date, visits: 0, clicks: 0, purchases: 0 });
        }
        const dayStats = dailyStats.get(date);

        const utmData = event.event_data?.utm_data || {};
        const utmKey = JSON.stringify({
          source: utmData.utm_source || 'direct',
          medium: utmData.utm_medium || 'none',
          campaign: utmData.utm_campaign || 'none',
          content: utmData.utm_content || 'none',
          term: utmData.utm_term || 'none'
        });

        const source = utmData.utm_source || 'direct';
        if (!sourceStats.has(source)) {
          sourceStats.set(source, { source, visits: 0, clicks: 0 });
        }
        const sourceData = sourceStats.get(source);

        if (!utmStats.has(utmKey)) {
          utmStats.set(utmKey, {
            source: utmData.utm_source || 'direct',
            medium: utmData.utm_medium || 'none',
            campaign: utmData.utm_campaign || 'none',
            content: utmData.utm_content || 'none',
            term: utmData.utm_term || 'none',
            visits: 0,
            clicks: 0,
            purchases: 0
          });
        }

        const stats = utmStats.get(utmKey);

        switch (event.event_type) {
          case 'pageview':
            stats.visits++;
            dayStats.visits++;
            sourceData.visits++;
            totalVisits++;
            break;
          case 'hotmart_click':
            stats.clicks++;
            dayStats.clicks++;
            sourceData.clicks++;
            totalClicks++;
            break;
          case 'compra_hotmart':
            stats.purchases++;
            dayStats.purchases++;
            totalPurchases++;
            break;
        }

        utmStats.set(utmKey, stats);
        dailyStats.set(date, dayStats);
        sourceStats.set(source, sourceData);
      });

      const utmStatsArray = Array.from(utmStats.values())
        .map(stat => ({
          ...stat,
          conversion_rate: stat.clicks > 0 ? (stat.purchases / stat.clicks) * 100 : 0
        }))
        .sort((a, b) => b.visits - a.visits);

      const dailyStatsArray = Array.from(dailyStats.values())
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      const topSources = Array.from(sourceStats.values())
        .sort((a, b) => b.visits - a.visits)
        .slice(0, 5);

      setData({
        total_visits: totalVisits,
        total_clicks: totalClicks,
        total_purchases: totalPurchases,
        conversion_rate: totalClicks > 0 ? (totalPurchases / totalClicks) * 100 : 0,
        utm_stats: utmStatsArray,
        daily_stats: dailyStatsArray,
        top_sources: topSources
      });

    } catch (error) {
      console.error('Error loading analytics:', error);
      setError('Error cargando las analíticas');
    } finally {
      setLoading(false);
    }
  }

  const exportToExcel = () => {
    if (!data) return;

    const workbook = XLSX.utils.book_new();

    // UTMs sheet
    const utmData = data.utm_stats.map(utm => ({
      'Campaña': utm.campaign,
      'Segmentación': utm.medium,
      'Anuncio': utm.content,
      'Fuente': utm.source,
      'Visitas': utm.visits,
      'Pagos Iniciados': utm.clicks,
      'Conversión (%)': utm.conversion_rate.toFixed(2)
    }));
    const utmSheet = XLSX.utils.json_to_sheet(utmData);
    XLSX.utils.book_append_sheet(workbook, utmSheet, 'UTMs');

    // Daily stats sheet
    const dailyData = data.daily_stats.map(day => ({
      'Fecha': day.date,
      'Visitas': day.visits,
      'Pagos Iniciados': day.clicks,
      'Compras': day.purchases
    }));
    const dailySheet = XLSX.utils.json_to_sheet(dailyData);
    XLSX.utils.book_append_sheet(workbook, dailySheet, 'Estadísticas Diarias');

    // Export
    XLSX.writeFile(workbook, 'analytics.xlsx');
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const getSortedUtmStats = () => {
    if (!data) return [];

    return [...data.utm_stats].sort((a, b) => {
      const multiplier = sortDirection === 'asc' ? 1 : -1;

      if (sortField === 'conversion_rate') {
        return (a.conversion_rate - b.conversion_rate) * multiplier;
      }

      const aValue = a[sortField];
      const bValue = b[sortField];

      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return (aValue - bValue) * multiplier;
      }

      return String(aValue).localeCompare(String(bValue)) * multiplier;
    });
  };

  const SortButton = ({ field, label }: { field: SortField; label: string }) => (
    <button
      onClick={() => handleSort(field)}
      className="group inline-flex items-center space-x-1 text-xs font-medium text-gray-500 uppercase tracking-wider hover:text-gray-900"
    >
      <span>{label}</span>
      <ArrowUpDown className={`h-4 w-4 ${sortField === field
        ? 'text-gray-900'
        : 'text-gray-400 group-hover:text-gray-500'
        }`} />
    </button>
  );

  if (loading) {
    return (
      <div className="min-h-[400px] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-[400px] flex items-center justify-center">
        <p className="text-red-500">{error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-[400px] flex items-center justify-center">
        <p className="text-gray-500">No hay datos disponibles</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filters and Export */}
      <div className="bg-white p-4 rounded-lg shadow">
        <div className="flex flex-wrap gap-4 items-start justify-between">
          <div className="space-y-4 w-full lg:w-auto">
            <div className="flex flex-wrap gap-4 items-end">
              <div>
                <label htmlFor="start-date" className="block text-sm font-medium text-gray-700">
                  Fecha inicial
                </label>
                <input
                  type="date"
                  id="start-date"
                  value={startDate}
                  max={endDate}
                  onChange={(e) => handleDateChange('start', e.target.value)}
                  className="mt-1 block rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                />
              </div>
              <div>
                <label htmlFor="end-date" className="block text-sm font-medium text-gray-700">
                  Fecha final
                </label>
                <input
                  type="date"
                  id="end-date"
                  value={endDate}
                  min={startDate}
                  max={new Date().toISOString().split('T')[0]}
                  onChange={(e) => handleDateChange('end', e.target.value)}
                  className="mt-1 block rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                />
              </div>
              <button
                onClick={resetDateFilter}
                className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                title="Restablecer filtros"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>

            {dateError && (
              <div className="text-sm text-red-600">
                {dateError}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setPresetTimeframe('day')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${timeframe === 'day'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
                  }`}
              >
                Hoy
              </button>
              <button
                onClick={() => setPresetTimeframe('week')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${timeframe === 'week'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
                  }`}
              >
                Última Semana
              </button>
              <button
                onClick={() => setPresetTimeframe('month')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${timeframe === 'month'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
                  }`}
              >
                Último Mes
              </button>
            </div>
          </div>

          <button
            onClick={exportToExcel}
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700"
          >
            <Download className="h-4 w-4 mr-2" />
            Exportar
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center">
            <div className="p-2 bg-blue-100 rounded">
              <Users className="h-6 w-6 text-blue-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Visitas Totales</p>
              <h3 className="text-2xl font-bold text-gray-900">{data.total_visits}</h3>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center">
            <div className="p-2 bg-green-100 rounded">
              <BarChartIcon className="h-6 w-6 text-green-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Pagos Iniciados</p>
              <h3 className="text-2xl font-bold text-gray-900">{data.total_clicks}</h3>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center">
            <div className="p-2 bg-purple-100 rounded">
              <DollarSign className="h-6 w-6 text-purple-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Compras</p>
              <h3 className="text-2xl font-bold text-gray-900">{data.total_purchases}</h3>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center">
            <div className="p-2 bg-yellow-100 rounded">
              <LineChartIcon className="h-6 w-6 text-yellow-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Tasa de Conversión</p>
              <h3 className="text-2xl font-bold text-gray-900">
                {data.conversion_rate.toFixed(2)}%
              </h3>
            </div>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="bg-white p-4 rounded-lg shadow">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Tendencias Diarias</h3>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.daily_stats}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="visits" stroke="#3B82F6" name="Visitas" />
              <Line type="monotone" dataKey="clicks" stroke="#10B981" name="Pagos Iniciados" />
              <Line type="monotone" dataKey="purchases" stroke="#8B5CF6" name="Compras" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* UTMs Table */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="px-4 py-5 sm:px-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900">
            Rendimiento por UTM
          </h3>
        </div>
        <div className="border-t border-gray-200">
          <div className="overflow-x-auto" ref={tableRef}>
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {columns.map(column => (
                    <th
                      key={column.id}
                      className="relative group"
                      style={{ width: column.width }}
                    >
                      <div className="px-6 py-3 text-left">
                        <SortButton field={column.id} label={column.label} />
                      </div>
                      <div
                        className="absolute top-0 right-0 h-full w-3 cursor-col-resize group-hover:bg-indigo-200 hover:bg-indigo-300"
                        onMouseDown={(e) => handleMouseDown(e, column)}
                        style={{
                          transform: 'translateX(50%)',
                          zIndex: 1
                        }}
                      />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {getSortedUtmStats().map((utm, index) => {
                  const isPositive = utm.conversion_rate > (data?.conversion_rate || 0);

                  return (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className="px-6 py-4" style={{ width: columns[0].width }}>
                        <div className="truncate text-sm">{utm.campaign}</div>
                      </td>
                      <td className="px-6 py-4" style={{ width: columns[1].width }}>
                        <div className="truncate text-sm">{utm.medium}</div>
                      </td>
                      <td className="px-6 py-4" style={{ width: columns[2].width }}>
                        <div className="truncate text-sm">{utm.content}</div>
                      </td>
                      <td className="px-6 py-4" style={{ width: columns[3].width }}>
                        <div className="truncate text-sm">{utm.source}</div>
                      </td>
                      <td className="px-6 py-4 text-right" style={{ width: columns[4].width }}>
                        <div className="text-sm">{utm.visits}</div>
                      </td>
                      <td className="px-6 py-4 text-right" style={{ width: columns[5].width }}>
                        <div className="text-sm">{utm.clicks}</div>
                      </td>
                      <td className="px-6 py-4 text-right" style={{ width: columns[6].width }}>
                        <div className="text-sm">{utm.purchases}</div>
                      </td>
                      <td className="px-6 py-4 text-right" style={{ width: columns[7].width }}>
                        <div className="flex items-center justify-end space-x-1">
                          <span className={`text-sm ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                            {utm.conversion_rate.toFixed(2)}%
                          </span>
                          {isPositive ? (
                            <ArrowUpRight className="h-4 w-4 text-green-600" />
                          ) : (
                            <ArrowDownRight className="h-4 w-4 text-red-600" />
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}