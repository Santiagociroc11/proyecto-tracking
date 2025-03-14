import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import {
  BarChart as BarChartIcon,
  LineChart as LineChartIcon,
  ArrowUpRight,
  ArrowDownRight,
  DollarSign,
  Users,
  Calendar,
  Download,
  RefreshCw,
  ArrowUpDown,
  Search,
  ToggleLeft,
  TrendingUp,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
} from 'recharts';
import { useTimezone } from '../hooks/useTimezone';
import { formatDateToTimezone, getDateInTimezone, getStartEndDatesInUTC } from '../utils/date';
import { useAuth } from '../contexts/AuthContext';
import * as XLSX from 'xlsx';
import { Resizable } from 'react-resizable';
import 'react-resizable/css/styles.css';
import Skeleton from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';
import { uniqBy } from 'lodash';

interface AnalyticsData {
  total_visits: number;
  unique_visits: number;
  total_clicks: number;
  unique_clicks: number;
  total_purchases: number;
  conversion_rate: number; // Compras / visitas
  unique_conversion_rate: number; // Compras / visitas únicas
  persuasion_rate: number; // Hotmart clicks / visitas
  unique_persuasion_rate: number; // Unique clicks / unique visits
  utm_stats: {
    source: string;
    medium: string;
    campaign: string;
    content: string;
    term: string;
    visits: number;
    unique_visits: number;
    clicks: number;
    unique_clicks: number;
    purchases: number;
    conversion_rate: number;
    unique_conversion_rate: number;
    persuasion_rate: number;
    unique_persuasion_rate: number;
  }[];
  daily_stats: {
    date: string;
    visits: number;
    unique_visits: number;
    clicks: number;
    unique_clicks: number;
    purchases: number;
  }[];
  top_sources: {
    source: string;
    visits: number;
    unique_visits: number;
    clicks: number;
    unique_clicks: number;
  }[];
}

interface Props {
  productId: string;
}

type SortField =
  | 'campaign'
  | 'medium'
  | 'content'
  | 'source'
  | 'visits'
  | 'clicks'
  | 'purchases'
  | 'conversion_rate'
  | 'persuasion_rate';
type SortDirection = 'asc' | 'desc';

interface ResizableHeaderProps {
  width: number;
  onResize: (width: number) => void;
  children: React.ReactNode;
}

const ResizableHeader: React.FC<ResizableHeaderProps> = ({ width, onResize, children }) => {
  const [currentWidth, setCurrentWidth] = useState(width);
  const handleRef = useRef<HTMLDivElement>(null);

  const handleResize = (e: React.SyntheticEvent, { size }: { size: { width: number } }) => {
    setCurrentWidth(size.width);
    onResize(size.width);
  };

  return (
    <div className="relative">
      <Resizable
        width={currentWidth}
        height={0}
        onResize={handleResize}
        draggableOpts={{ enableUserSelectHack: false }}
        handle={
          <div
            className="absolute right-0 top-0 h-full w-6 cursor-col-resize flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
            ref={handleRef}
          >
            <div className="w-1 h-8 bg-gray-400 opacity-50" />
          </div>
        }
      >
        <div style={{ width: currentWidth, userSelect: 'none' }} className="pr-6">
          {children}
        </div>
      </Resizable>
      <div
        className="absolute top-0 bottom-0 right-0 w-2 cursor-col-resize"
        style={{ zIndex: 1 }}
        onMouseEnter={() => handleRef.current?.classList.add('opacity-100')}
        onMouseLeave={() => handleRef.current?.classList.remove('opacity-100')}
      />
    </div>
  );
};

interface ColumnWidth {
  campaign: number;
  medium: number;
  content: number;
  source: number;
  visits: number;
  clicks: number;
  purchases: number;
  conversion: number;
}

const TIMEFRAME_OPTIONS = [
  { label: 'Hoy', value: 'day' },
  { label: 'Última Semana', value: 'week' },
  { label: 'Último Mes', value: 'month' },
  { label: 'Últimos 3 Meses', value: 'quarter' },
  { label: 'Personalizado', value: 'custom' },
];

const LOCAL_STORAGE_COLUMN_WIDTHS_KEY = 'columnWidths';

export default function AnalyticsDashboard({ productId }: Props) {
  const { user } = useAuth();
  const { timezone } = useTimezone();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [timeframe, setTimeframe] = useState<'day' | 'week' | 'month' | 'custom' | 'quarter'>('month');
  const [startDate, setStartDate] = useState<string>(
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  const [endDate, setEndDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [dateError, setDateError] = useState<string>('');
  const [sortField, setSortField] = useState<SortField>('visits');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [error, setError] = useState<string>('');
  const [columnWidths, setColumnWidths] = useState<ColumnWidth>(() => {
    const storedWidths = localStorage.getItem(LOCAL_STORAGE_COLUMN_WIDTHS_KEY);
    return storedWidths
      ? JSON.parse(storedWidths)
      : {
          campaign: 200,
          medium: 150,
          content: 200,
          source: 150,
          visits: 100,
          clicks: 120,
          purchases: 120,
          conversion: 120,
        };
  });
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [utmFilters, setUtmFilters] = useState<{ campaign: string; medium: string; content: string; source: string }>({
    campaign: '',
    medium: '',
    content: '',
    source: '',
  });
  const [showUnique, setShowUnique] = useState(false);

  useEffect(() => {
    localStorage.setItem(LOCAL_STORAGE_COLUMN_WIDTHS_KEY, JSON.stringify(columnWidths));
  }, [columnWidths]);

  const toggleRowExpansion = (index: number) => {
    const newExpandedRows = new Set(expandedRows);
    if (expandedRows.has(index)) {
      newExpandedRows.delete(index);
    } else {
      newExpandedRows.add(index);
    }
    setExpandedRows(newExpandedRows);
  };

  const handleColumnResize = (column: keyof ColumnWidth, width: number) => {
    setColumnWidths((prev) => ({
      ...prev,
      [column]: width,
    }));
  };

  useEffect(() => {
    if (user) {
      loadAnalytics();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId, timeframe, startDate, endDate, timezone, user]);

  const validateDateRange = (start: string, end: string): boolean => {
    const startTime = new Date(start).getTime();
    const endTime = new Date(end).getTime();
    const maxRange = 365 * 24 * 60 * 60 * 1000; // 1 año

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

  const setPresetTimeframe = (newTimeframe: 'day' | 'week' | 'month' | 'quarter') => {
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
      case 'quarter':
        start = new Date(now.setMonth(now.getMonth() - 3));
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

      // Verificar acceso al producto
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

      const { start, end } = getStartEndDatesInUTC(startDate, endDate, timezone);

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
        .gte('created_at', start)
        .lte('created_at', end)
        .order('created_at', { ascending: true });

      if (eventsError) throw eventsError;

      // Inicializamos mapas y sets para estadísticas
      const utmStats = new Map();
      const dailyStats = new Map();
      let totalVisits = 0;
      let totalClicks = 0;
      let totalPurchases = 0;
      const uniqueVisitors = new Set();
      const uniqueClicks = new Set();
      const dailyUniqueVisitors = new Map<string, Set<any>>();
      const dailyUniqueClicks = new Map<string, Set<any>>();

      events.forEach((event) => {
        const date = getDateInTimezone(event.created_at, timezone);

        // Inicializar estadísticas diarias
        if (!dailyStats.has(date)) {
          dailyStats.set(date, {
            date,
            visits: 0,
            unique_visits: 0,
            clicks: 0,
            unique_clicks: 0,
            purchases: 0,
          });
          dailyUniqueVisitors.set(date, new Set());
          dailyUniqueClicks.set(date, new Set());
        }
        const dayStats = dailyStats.get(date);
        const dayUniqueVisitors = dailyUniqueVisitors.get(date);
        const dayUniqueClicks = dailyUniqueClicks.get(date);

        const utmData = event.event_data?.utm_data || {};
        const utmKey = JSON.stringify({
          source: utmData.utm_source || 'direct',
          medium: utmData.utm_medium || 'none',
          campaign: utmData.utm_campaign || 'none',
          content: utmData.utm_content || 'none',
          term: utmData.utm_term || 'none',
        });

        if (!utmStats.has(utmKey)) {
          utmStats.set(utmKey, {
            source: utmData.utm_source || 'direct',
            medium: utmData.utm_medium || 'none',
            campaign: utmData.utm_campaign || 'none',
            content: utmData.utm_content || 'none',
            term: utmData.utm_term || 'none',
            visits: 0,
            unique_visits: 0,
            clicks: 0,
            unique_clicks: 0,
            purchases: 0,
            visitorSet: new Set(), // Para visitas únicas
            clickSet: new Set(),   // Para clics únicos
          });
        }
        const stats = utmStats.get(utmKey);

        switch (event.event_type) {
          case 'pageview':
            stats.visits++;
            dayStats.visits++;
            uniqueVisitors.add(event.visitor_id);
            dayUniqueVisitors.add(event.visitor_id);
            stats.visitorSet.add(event.visitor_id);
            totalVisits++;
            break;
          case 'hotmart_click':
            stats.clicks++;
            dayStats.clicks++;
            uniqueClicks.add(event.visitor_id);
            dayUniqueClicks.add(event.visitor_id);
            stats.clickSet.add(event.visitor_id);
            totalClicks++;
            break;
          case 'compra_hotmart':
            stats.purchases++;
            dayStats.purchases++;
            totalPurchases++;
            break;
        }

        dayStats.unique_visits = dayUniqueVisitors.size;
        dayStats.unique_clicks = dayUniqueClicks.size;
        stats.unique_visits = stats.visitorSet.size;
        stats.unique_clicks = stats.clickSet.size;
        utmStats.set(utmKey, stats);
        dailyStats.set(date, dayStats);
      });

      const utmStatsArray = Array.from(utmStats.values())
        .map((stat) => ({
          ...stat,
          conversion_rate: stat.visits > 0 ? (stat.purchases / stat.visits) * 100 : 0,
          unique_conversion_rate: stat.unique_visits > 0 ? (stat.purchases / stat.unique_visits) * 100 : 0,
          persuasion_rate: stat.visits > 0 ? (stat.clicks / stat.visits) * 100 : 0,
          unique_persuasion_rate: stat.unique_visits > 0 ? (stat.unique_clicks / stat.unique_visits) * 100 : 0,
        }))
        .sort((a, b) => b.visits - a.visits);

      const dailyStatsArray = Array.from(dailyStats.values()).sort((a, b) =>
        a.date.localeCompare(b.date)
      );

      // Reducir estadísticas por fuente a partir de las UTMs
      const sourceStatsArray = Object.values(
        Array.from(utmStats.values()).reduce((acc, curr) => {
          const source = curr.source;
          if (!acc[source]) {
            acc[source] = {
              source,
              visits: 0,
              unique_visits: 0,
              clicks: 0,
              unique_clicks: 0,
            };
          }
          acc[source].visits += curr.visits;
          acc[source].unique_visits = Math.max(acc[source].unique_visits, curr.unique_visits);
          acc[source].clicks += curr.clicks;
          acc[source].unique_clicks = Math.max(acc[source].unique_clicks, curr.unique_clicks);
          return acc;
        }, {} as Record<string, any>)
      )
        .sort((a, b) => b.visits - a.visits)
        .slice(0, 5);

      setData({
        total_visits: totalVisits,
        unique_visits: uniqueVisitors.size,
        total_clicks: totalClicks,
        unique_clicks: uniqueClicks.size,
        total_purchases: totalPurchases,
        conversion_rate: totalVisits > 0 ? (totalPurchases / totalVisits) * 100 : 0,
        unique_conversion_rate: uniqueVisitors.size > 0 ? (totalPurchases / uniqueVisitors.size) * 100 : 0,
        persuasion_rate: totalVisits > 0 ? (totalClicks / totalVisits) * 100 : 0,
        unique_persuasion_rate: uniqueVisitors.size > 0 ? (uniqueClicks.size / uniqueVisitors.size) * 100 : 0,
        utm_stats: utmStatsArray,
        daily_stats: dailyStatsArray,
        top_sources: sourceStatsArray,
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

    const utmData = data.utm_stats.map((utm) => ({
      'Campaña': utm.campaign,
      'Segmentación': utm.medium,
      'Anuncio': utm.content,
      'Fuente': utm.source,
      'Visitas': showUnique ? utm.unique_visits : utm.visits,
      'Pagos Iniciados': showUnique ? utm.unique_clicks : utm.clicks,
      'Conversión (%)': (showUnique ? utm.unique_conversion_rate : utm.conversion_rate).toFixed(2),
      'Persuasión (%)': (showUnique ? utm.unique_persuasion_rate : utm.persuasion_rate).toFixed(2),
    }));
    const utmSheet = XLSX.utils.json_to_sheet(utmData);
    XLSX.utils.book_append_sheet(workbook, utmSheet, 'UTMs');

    const dailyData = data.daily_stats.map((day) => ({
      'Fecha': day.date,
      'Visitas': showUnique ? day.unique_visits : day.visits,
      'Pagos Iniciados': showUnique ? day.unique_clicks : day.clicks,
      'Compras': day.purchases,
    }));
    const dailySheet = XLSX.utils.json_to_sheet(dailyData);
    XLSX.utils.book_append_sheet(workbook, dailySheet, 'Estadísticas Diarias');

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

  const getSortedUtmStats = useMemo(() => {
    if (!data) return [];
    return [...data.utm_stats]
      .filter(
        (utm) =>
          utm.campaign.toLowerCase().includes(utmFilters.campaign.toLowerCase()) &&
          utm.medium.toLowerCase().includes(utmFilters.medium.toLowerCase()) &&
          utm.content.toLowerCase().includes(utmFilters.content.toLowerCase()) &&
          utm.source.toLowerCase().includes(utmFilters.source.toLowerCase())
      )
      .sort((a, b) => {
        const multiplier = sortDirection === 'asc' ? 1 : -1;
        if (sortField === 'conversion_rate') {
          const aRate = showUnique ? a.unique_conversion_rate : a.conversion_rate;
          const bRate = showUnique ? b.unique_conversion_rate : b.conversion_rate;
          return (aRate - bRate) * multiplier;
        }
        if (sortField === 'persuasion_rate') {
          const aRate = showUnique ? a.unique_persuasion_rate : a.persuasion_rate;
          const bRate = showUnique ? b.unique_persuasion_rate : b.persuasion_rate;
          return (aRate - bRate) * multiplier;
        }
        const aValue = a[sortField];
        const bValue = b[sortField];
        if (typeof aValue === 'number' && typeof bValue === 'number') {
          return (aValue - bValue) * multiplier;
        }
        return String(aValue).localeCompare(String(bValue)) * multiplier;
      });
  }, [data, sortField, sortDirection, utmFilters, showUnique]);

  const SortButton = ({ field, label }: { field: SortField; label: string }) => (
    <button
      onClick={() => handleSort(field)}
      className="group inline-flex items-center space-x-1 text-xs font-medium text-gray-500 uppercase tracking-wider hover:text-gray-900"
    >
      <span>{label}</span>
      <ArrowUpDown
        className={`h-4 w-4 ${
          sortField === field ? 'text-gray-900' : 'text-gray-400 group-hover:text-gray-500'
        }`}
      />
    </button>
  );

  const handleUtmFilterChange = useCallback((field: keyof typeof utmFilters, value: string) => {
    setUtmFilters((prevFilters) => ({
      ...prevFilters,
      [field]: value,
    }));
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
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
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                    readOnly
                  />
                </div>
                <div>
                  <label htmlFor="end-date" className="block text-sm font-medium text-gray-700">
                    Fecha final
                  </label>
                  <input
                    type="date"
                    id="end-date"
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                    readOnly
                  />
                </div>
                <button className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white" disabled>
                  <RefreshCw className="h-4 w-4" />
                </button>
              </div>
              {dateError && <div className="text-sm text-red-600">{dateError}</div>}
              <div className="flex flex-wrap gap-2">
                {TIMEFRAME_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    className={`px-4 py-2 rounded-md text-sm font-medium transition-colors bg-gray-100 text-gray-500 border border-gray-200 cursor-not-allowed`}
                    disabled
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            <button className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-gray-400 cursor-not-allowed" disabled>
              <Download className="h-4 w-4 mr-2" />
              Exportar
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, index) => (
            <div key={index} className="bg-white p-6 rounded-lg shadow">
              <Skeleton height={20} width={150} />
              <Skeleton height={40} className="mt-2" />
            </div>
          ))}
        </div>

        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            <Skeleton width={200} />
          </h3>
          <div className="h-80">
            <Skeleton height="100%" />
          </div>
        </div>

        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="px-4 py-5 sm:px-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900">
              <Skeleton width={250} />
            </h3>
          </div>
          <div className="border-t border-gray-200">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    {['Campaña', 'Segmentación', 'Anuncio', 'Fuente', 'Visitas', 'Pagos Iniciados', 'Compras', 'Conversión', 'Persuasión'].map(
                      (header, index) => (
                        <th key={index} scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          <Skeleton width={header.length * 8} />
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <tr key={index}>
                      {Array.from({ length: 9 }).map((_, i) => (
                        <td key={i} className="px-6 py-4 whitespace-nowrap">
                          <Skeleton />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
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
      {/* Filtros y Exportación */}
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
            {dateError && <div className="text-sm text-red-600">{dateError}</div>}
            <div className="flex flex-wrap gap-2">
              {TIMEFRAME_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() =>
                    option.value === 'custom'
                      ? setTimeframe('custom')
                      : setPresetTimeframe(option.value as 'day' | 'week' | 'month' | 'quarter')
                  }
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    timeframe === option.value ? 'bg-indigo-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <label className="relative inline-flex items-center cursor-pointer">
  <input
    type="checkbox"
    checked={showUnique}
    onChange={() => setShowUnique(!showUnique)}
    className="sr-only peer"
  />
  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 
              peer-checked:after:translate-x-5 peer-checked:after:border-white after:content-[''] 
              after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 
              after:border after:rounded-full after:h-5 after:w-5 after:transition-all 
              peer-checked:bg-indigo-600"></div>
  <span className="ml-3 text-sm font-medium text-gray-900">
    {showUnique ? 'Únicos' : 'Totales'}
  </span>
</label>

          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center">
            <div className="p-2 bg-blue-100 rounded">
              <Users className="h-6 w-6 text-blue-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Visitas {showUnique ? 'Únicas' : 'Totales'}</p>
              <h3 className="text-2xl font-bold text-gray-900">{showUnique ? data.unique_visits : data.total_visits}</h3>
            </div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center">
            <div className="p-2 bg-green-100 rounded">
              <BarChartIcon className="h-6 w-6 text-green-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">
                Pagos Iniciados {showUnique ? 'Únicos' : 'Totales'}
              </p>
              <h3 className="text-2xl font-bold text-gray-900">
                {showUnique ? data.unique_clicks : data.total_clicks}
              </h3>
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
                {(showUnique ? data.unique_conversion_rate : data.conversion_rate).toFixed(2)}%
              </h3>
            </div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center">
            <div className="p-2 bg-indigo-100 rounded">
              <TrendingUp className="h-6 w-6 text-indigo-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Tasa de Persuasión</p>
              <h3 className="text-2xl font-bold text-gray-900">
                {(showUnique ? data.unique_persuasion_rate : data.persuasion_rate).toFixed(2)}%
              </h3>
            </div>
          </div>
        </div>
      </div>

      {/* Gráfica de Tendencias Diarias */}
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
              <Line
                type="monotone"
                dataKey={showUnique ? 'unique_visits' : 'visits'}
                stroke="#3B82F6"
                name={`Visitas ${showUnique ? 'Únicas' : 'Totales'}`}
              />
              <Line
                type="monotone"
                dataKey={showUnique ? 'unique_clicks' : 'clicks'}
                stroke="#10B981"
                name={`Pagos Iniciados ${showUnique ? 'Únicos' : 'Totales'}`}
              />
              <Line type="monotone" dataKey="purchases" stroke="#8B5CF6" name="Compras" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Tabla de UTMs */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="px-4 py-5 sm:px-6 flex items-center justify-between">
          <h3 className="text-lg leading-6 font-medium text-gray-900">Rendimiento por UTM</h3>
        </div>
        <div className="border-t border-gray-200">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left relative">
                    <ResizableHeader width={columnWidths.campaign} onResize={(w) => handleColumnResize('campaign', w)}>
                      <div className="flex items-center justify-between">
                        <SortButton field="campaign" label="Campaña" />
                      </div>
                    </ResizableHeader>
                    <input
                      type="text"
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                      placeholder="Filtrar"
                      value={utmFilters.campaign}
                      onChange={(e) => handleUtmFilterChange('campaign', e.target.value)}
                    />
                  </th>
                  <th scope="col" className="px-6 py-3 text-left relative">
                    <ResizableHeader width={columnWidths.medium} onResize={(w) => handleColumnResize('medium', w)}>
                      <div className="flex items-center justify-between">
                        <SortButton field="medium" label="Segmentación" />
                      </div>
                    </ResizableHeader>
                    <input
                      type="text"
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                      placeholder="Filtrar"
                      value={utmFilters.medium}
                      onChange={(e) => handleUtmFilterChange('medium', e.target.value)}
                    />
                  </th>
                  <th scope="col" className="px-6 py-3 text-left relative">
                    <ResizableHeader width={columnWidths.content} onResize={(w) => handleColumnResize('content', w)}>
                      <div className="flex items-center justify-between">
                        <SortButton field="content" label="Anuncio" />
                      </div>
                    </ResizableHeader>
                    <input
                      type="text"
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                      placeholder="Filtrar"
                      value={utmFilters.content}
                      onChange={(e) => handleUtmFilterChange('content', e.target.value)}
                    />
                  </th>
                  <th scope="col" className="px-6 py-3 text-left relative">
                    <ResizableHeader width={columnWidths.source} onResize={(w) => handleColumnResize('source', w)}>
                      <div className="flex items-center justify-between">
                        <SortButton field="source" label="Fuente" />
                      </div>
                    </ResizableHeader>
                    <input
                      type="text"
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                      placeholder="Filtrar"
                      value={utmFilters.source}
                      onChange={(e) => handleUtmFilterChange('source', e.target.value)}
                    />
                  </th>
                  <th scope="col" className="px-6 py-3 text-right relative">
                    <ResizableHeader width={columnWidths.visits} onResize={(w) => handleColumnResize('visits', w)}>
                      <SortButton field="visits" label="Visitas" />
                    </ResizableHeader>
                  </th>
                  <th scope="col" className="px-6 py-3 text-right relative">
                    <ResizableHeader width={columnWidths.clicks} onResize={(w) => handleColumnResize('clicks', w)}>
                      <SortButton field="clicks" label="Pagos Iniciados" />
                    </ResizableHeader>
                  </th>
                  <th scope="col" className="px-6 py-3 text-right relative">
                    <ResizableHeader width={columnWidths.clicks} onResize={(w) => handleColumnResize('purchases', w)}>
                      <SortButton field="purchases" label="Compras" />
                    </ResizableHeader>
                  </th>
                  <th scope="col" className="px-6 py-3 text-right relative">
                    <ResizableHeader width={columnWidths.conversion} onResize={(w) => handleColumnResize('conversion', w)}>
                      <SortButton field="conversion_rate" label="Conversión" />
                    </ResizableHeader>
                  </th>
                  <th scope="col" className="px-6 py-3 text-right relative">
                    <div className="flex items-center justify-end">
                      <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Persuasión</span>
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {getSortedUtmStats.map((utm, index) => {
                  const currentConversion = showUnique ? utm.unique_conversion_rate : utm.conversion_rate;
                  const currentPersuasion = showUnique ? utm.unique_persuasion_rate : utm.persuasion_rate;
                  const globalConversion = showUnique ? data.unique_conversion_rate : data.conversion_rate;
                  const isPositive = currentConversion > globalConversion;
                  const isExpanded = expandedRows.has(index);
                  return (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center cursor-pointer" onClick={() => toggleRowExpansion(index)}>
                          <div style={{ width: columnWidths.campaign - 40 }} className={`${isExpanded ? '' : 'truncate'}`}>
                            {utm.campaign}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div style={{ width: columnWidths.medium - 40 }} className={`${isExpanded ? '' : 'truncate'}`}>
                          {utm.medium}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div style={{ width: columnWidths.content - 40 }} className={`${isExpanded ? '' : 'truncate'}`}>
                          {utm.content}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div style={{ width: columnWidths.source - 40 }} className={`${isExpanded ? '' : 'truncate'}`}>
                          {utm.source}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        {showUnique ? utm.unique_visits : utm.visits}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {showUnique ? utm.unique_clicks : utm.clicks}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                        {utm.purchases}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end space-x-1">
                          <span className={`text-sm ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                            {(currentConversion ?? 0).toFixed(2)}%
                          </span>
                          {isPositive ? (
                            <ArrowUpRight className="h-4 w-4 text-green-600" />
                          ) : (
                            <ArrowDownRight className="h-4 w-4 text-red-600" />
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <span className="text-sm text-gray-900">
                          {currentPersuasion.toFixed(2)}%
                        </span>
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
