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
  conversion_rate: number;
  unique_conversion_rate: number;
  persuasion_rate: number;
  unique_persuasion_rate: number;
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
  const [timeframe, setTimeframe] = useState<'day' | 'week' | 'month' | 'custom' | 'quarter'>('day');
  
  // Helper function to format date in user's timezone
  const formatLocalDate = (date: Date) => {
    return formatDateToTimezone(date, timezone);
  };
  
  const today = new Date();
  const todayFormatted = formatLocalDate(today);
  
  const [startDate, setStartDate] = useState<string>(todayFormatted);
  const [endDate, setEndDate] = useState<string>(todayFormatted);
  const [dateError, setDateError] = useState<string>('');
  const [sortField, setSortField] = useState<SortField>('visits');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [error, setError] = useState<string | null>(null);
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
  // Estado para controlar la pestaña activa: "resumen" o "detalle"
  const [activeTab, setActiveTab] = useState<'resumen' | 'detalle'>('resumen');
  // Estado para seleccionar la métrica del resumen
  const [selectedSummaryMetric, setSelectedSummaryMetric] = useState<'conversion' | 'persuasion'>('conversion');
  // Estado para seleccionar la categoría de UTM a analizar
  const [selectedUtmCategory, setSelectedUtmCategory] = useState<'campaign' | 'medium' | 'content' | 'source'>('campaign');

  useEffect(() => {
    localStorage.setItem(LOCAL_STORAGE_COLUMN_WIDTHS_KEY, JSON.stringify(columnWidths));
  }, [columnWidths]);

  // Initialize to today's date in user's timezone when component mounts
  useEffect(() => {
    // Set to today when component first loads
    const today = new Date();
    const todayFormatted = formatLocalDate(today);
    console.log(`Initializing dates to today: ${todayFormatted} in timezone: ${timezone}`);
    setStartDate(todayFormatted);
    setEndDate(todayFormatted);
  }, [timezone]);

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
    // Get current date in user's timezone
    const today = new Date();
    let start: Date;
    
    const todayFormatted = formatLocalDate(today);
    console.log(`Setting preset timeframe: ${newTimeframe}, today: ${todayFormatted}`);
    
    switch (newTimeframe) {
      case 'day':
        setStartDate(todayFormatted);
        setEndDate(todayFormatted);
        break;
      case 'week':
        start = new Date(today);
        start.setDate(today.getDate() - 7);
        setStartDate(formatLocalDate(start));
        setEndDate(todayFormatted);
        break;
      case 'month':
        start = new Date(today);
        start.setMonth(today.getMonth() - 1);
        setStartDate(formatLocalDate(start));
        setEndDate(todayFormatted);
        break;
      case 'quarter':
        start = new Date(today);
        start.setMonth(today.getMonth() - 3);
        setStartDate(formatLocalDate(start));
        setEndDate(todayFormatted);
        break;
    }
    
    setTimeframe(newTimeframe);
  };

  const resetDateFilter = () => {
    const today = new Date();
    const formattedToday = formatLocalDate(today);
    setStartDate(formattedToday);
    setEndDate(formattedToday);
    setTimeframe('day');
  };

  async function loadAnalytics() {
    try {
      setLoading(true);
      setError(null);

      if (!user) {
        setError('Debes iniciar sesión para ver las estadísticas.');
        setLoading(false);
        return;
      }

      // Validate date format first
      if (!startDate.match(/^\d{4}-\d{2}-\d{2}$/) || !endDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
        setError('Formato de fecha inválido. Se espera YYYY-MM-DD');
        setLoading(false);
        return;
      }

      // Parse the date parts
      const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
      const [endYear, endMonth, endDay] = endDate.split('-').map(Number);
      
      // Create Date objects with time at start/end of day in local timezone
      const startLocalDate = new Date(startYear, startMonth - 1, startDay, 0, 0, 0);
      const endLocalDate = new Date(endYear, endMonth - 1, endDay, 23, 59, 59, 999);
      
      // Convert to UTC ISO strings for database query
      const startUTC = startLocalDate.toISOString();
      const endUTC = endLocalDate.toISOString();
      
      console.log(`Querying database from ${startUTC} to ${endUTC} (local date range: ${startDate} to ${endDate})`);

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

      const { data: events, error: eventsError } = await supabase
        .from('tracking_events')
        .select(`
          id,
          event_type,
          visitor_id,
          session_id,
          created_at,
          event_data,
          url
        `)
        .eq('product_id', productId)
        .gte('created_at', startUTC)
        .lte('created_at', endUTC)
        .order('created_at', { ascending: true });

      if (eventsError) {
        console.error('Error fetching events:', eventsError);
        setError(`Error cargando eventos: ${eventsError.message}`);
        setLoading(false);
        return;
      }

      if (!events || events.length === 0) {
        console.log('No events found for the selected date range');
        setData({
          total_visits: 0,
          unique_visits: 0,
          total_clicks: 0,
          unique_clicks: 0,
          total_purchases: 0,
          conversion_rate: 0,
          unique_conversion_rate: 0,
          persuasion_rate: 0,
          unique_persuasion_rate: 0,
          utm_stats: [],
          daily_stats: [],
          top_sources: [],
        });
        setLoading(false);
        return;
      }

      console.log(`Processing ${events.length} events. First event timestamp: ${events[0].created_at}, in local time: ${formatDateToTimezone(events[0].created_at, timezone)}`);

      // Inicializamos mapas y sets para estadísticas
      const uniqueVisitors = new Set<string>();
      const uniqueClicks = new Set<string>();
      let totalVisits = 0;
      let totalClicks = 0;
      let totalPurchases = 0;

      // Para estadísticas por UTM
      const utmStats = new Map<string, any>();

      // Para estadísticas diarias
      const dailyStats = new Map<string, any>();
      const dailyUniqueVisitors = new Map<string, Set<string>>();
      const dailyUniqueClicks = new Map<string, Set<string>>();

      events.forEach((event) => {
        // Get date in user's timezone
        const localDate = formatDateToTimezone(event.created_at, timezone).split(' ')[0];
        console.log(`Processing event: ${event.event_type}, created_at: ${event.created_at}, local date: ${localDate}`);
        
        // Inicializar estadísticas diarias si no existen
        if (!dailyStats.has(localDate)) {
          dailyStats.set(localDate, {
            date: localDate,
            visits: 0,
            unique_visits: 0,
            clicks: 0,
            unique_clicks: 0,
            purchases: 0
          });
        }

        // Inicializar sets de visitas y clics únicos por día
        if (!dailyUniqueVisitors.has(localDate)) {
          dailyUniqueVisitors.set(localDate, new Set());
        }
        if (!dailyUniqueClicks.has(localDate)) {
          dailyUniqueClicks.set(localDate, new Set());
        }
        
        const dayStats = dailyStats.get(localDate);
        const dayUniqueVisitors = dailyUniqueVisitors.get(localDate);
        const dayUniqueClicks = dailyUniqueClicks.get(localDate);
        
        // Safety check
        if (!dayStats || !dayUniqueVisitors || !dayUniqueClicks) {
          console.error(`Missing daily stats for date ${localDate}`);
          return;
        }

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
            visitorSet: new Set(),
            clickSet: new Set(),
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
        dailyStats.set(localDate, dayStats);
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
        className={`h-4 w-4 ${sortField === field ? 'text-gray-900' : 'text-gray-400 group-hover:text-gray-500'}`}
      />
    </button>
  );

  const handleUtmFilterChange = useCallback((field: keyof typeof utmFilters, value: string) => {
    setUtmFilters((prevFilters) => ({
      ...prevFilters,
      [field]: value,
    }));
  }, []);

  // Resumen global
  const topCampaignByVisits = useMemo(() => {
    if (!data || data.utm_stats.length === 0) return null;
    return data.utm_stats.reduce((prev, curr) => (curr.visits > prev.visits ? curr : prev));
  }, [data]);

  const topCampaignByConversion = useMemo(() => {
    if (!data || data.utm_stats.length === 0) return null;
    return data.utm_stats.reduce((prev, curr) => (curr.conversion_rate > prev.conversion_rate ? curr : prev));
  }, [data]);

  // Agrupación por categoría seleccionada
  const groupedUtmSummary = useMemo(() => {
    if (!data) return [];
    const groupField = selectedUtmCategory;
    const grouped: Record<string, {
      category: string;
      visits: number;
      unique_visits: number;
      clicks: number;
      unique_clicks: number;
      purchases: number;
    }> = {};

    data.utm_stats.forEach((utm) => {
      const key = utm[groupField] || 'none';
      if (!grouped[key]) {
        grouped[key] = {
          category: key,
          visits: 0,
          unique_visits: 0,
          clicks: 0,
          unique_clicks: 0,
          purchases: 0,
        };
      }
      grouped[key].visits += utm.visits;
      grouped[key].unique_visits += utm.unique_visits;
      grouped[key].clicks += utm.clicks;
      grouped[key].unique_clicks += utm.unique_clicks;
      grouped[key].purchases += utm.purchases;
    });

    const result = Object.values(grouped);
    result.forEach((item) => {
      item['conversion_rate'] = item.visits > 0 ? (item.purchases / item.visits) * 100 : 0;
      item['unique_conversion_rate'] = item.unique_visits > 0 ? (item.purchases / item.unique_visits) * 100 : 0;
      item['persuasion_rate'] = item.visits > 0 ? (item.clicks / item.visits) * 100 : 0;
      item['unique_persuasion_rate'] = item.unique_visits > 0 ? (item.unique_clicks / item.unique_visits) * 100 : 0;
    });
    // Ordenar según la métrica seleccionada
    const metricKey =
      selectedSummaryMetric === 'conversion'
        ? showUnique ? 'unique_conversion_rate' : 'conversion_rate'
        : showUnique ? 'unique_persuasion_rate' : 'persuasion_rate';
    return result.sort((a, b) => b[metricKey] - a[metricKey]);
  }, [data, selectedUtmCategory, selectedSummaryMetric, showUnique]);

  if (loading) {
    return (
      <div className="space-y-6">
        {/* Contenido de carga (skeletons) */}
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="flex flex-wrap gap-4 items-start justify-between">
            <div className="space-y-4 w-full lg:w-auto">
              <div className="flex flex-wrap gap-4 items-end">
                <div>
                  <label htmlFor="start-date" className="block text-sm font-medium text-gray-700">
                    Fecha inicial
                  </label>
                  <input type="date" id="start-date" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" readOnly />
                </div>
                <div>
                  <label htmlFor="end-date" className="block text-sm font-medium text-gray-700">
                    Fecha final
                  </label>
                  <input type="date" id="end-date" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" readOnly />
                </div>
                <button className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white" disabled>
                  <RefreshCw className="h-4 w-4" />
                </button>
              </div>
              {dateError && <div className="text-sm text-red-600">{dateError}</div>}
              <div className="flex flex-wrap gap-2">
                {TIMEFRAME_OPTIONS.map((option) => (
                  <button key={option.value} className="px-4 py-2 rounded-md text-sm font-medium transition-colors bg-gray-100 text-gray-500 border border-gray-200 cursor-not-allowed" disabled>
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
        {/* Skeletons para KPIs, gráficos y tabla */}
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
                  max={formatLocalDate(new Date())}
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
              <input type="checkbox" checked={showUnique} onChange={() => setShowUnique(!showUnique)} className="sr-only peer" />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 
              peer-checked:after:translate-x-5 peer-checked:after:border-white after:content-[''] 
              after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 
              after:border after:rounded-full after:h-5 after:w-5 after:transition-all 
              peer-checked:bg-indigo-600"></div>
              <span className="ml-3 text-sm font-medium text-gray-900">{showUnique ? 'Únicos' : 'Totales'}</span>
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
              <p className="text-sm font-medium text-gray-500">Pagos Iniciados {showUnique ? 'Únicos' : 'Totales'}</p>
              <h3 className="text-2xl font-bold text-gray-900">{showUnique ? data.unique_clicks : data.total_clicks}</h3>
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

      {/* Sección de pestañas para Resumen y Detalle UTMs */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
          <div className="flex space-x-4">
            <button
              onClick={() => setActiveTab('resumen')}
              className={`px-4 py-2 text-sm font-medium ${
                activeTab === 'resumen' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-gray-500'
              }`}
            >
              Resumen
            </button>
            <button
              onClick={() => setActiveTab('detalle')}
              className={`px-4 py-2 text-sm font-medium ${
                activeTab === 'detalle' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-gray-500'
              }`}
            >
              Tabla UTM
            </button>
          </div>
        </div>

        {activeTab === 'resumen' ? (
          <div className="p-4 space-y-6">
            {/* Resumen General */}
            <div className="bg-white p-4 rounded-lg shadow">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Resumen General</h3>
              <p>
                En el período seleccionado se registraron {data.total_visits} visitas, {data.total_clicks} pagos iniciados y {data.total_purchases} compras. La tasa de conversión global es{' '}
                {(showUnique ? data.unique_conversion_rate : data.conversion_rate).toFixed(2)}% y la tasa de persuasión es{' '}
                {(showUnique ? data.unique_persuasion_rate : data.persuasion_rate).toFixed(2)}%.
              </p>
            </div>

            {/* Sección avanzada de análisis por categoría */}
            <div className="mt-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Análisis Avanzado por Categoría de UTM</h3>
              <div className="flex flex-wrap gap-4 items-center mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Categoría</label>
                  <select
                    value={selectedUtmCategory}
                    onChange={(e) => setSelectedUtmCategory(e.target.value as 'campaign' | 'medium' | 'content' | 'source')}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                  >
                    <option value="campaign">Campaña</option>
                    <option value="medium">Segmentación</option>
                    <option value="content">Anuncio</option>
                    <option value="source">Fuente</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Métrica</label>
                  <div className="flex space-x-4 mt-1">
                    <label className="inline-flex items-center">
                      <input
                        type="radio"
                        name="summaryMetric"
                        value="conversion"
                        checked={selectedSummaryMetric === 'conversion'}
                        onChange={() => setSelectedSummaryMetric('conversion')}
                        className="form-radio"
                      />
                      <span className="ml-2">Conversión</span>
                    </label>
                    <label className="inline-flex items-center">
                      <input
                        type="radio"
                        name="summaryMetric"
                        value="persuasion"
                        checked={selectedSummaryMetric === 'persuasion'}
                        onChange={() => setSelectedSummaryMetric('persuasion')}
                        className="form-radio"
                      />
                      <span className="ml-2">Persuasión</span>
                    </label>
                  </div>
                </div>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg shadow">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={groupedUtmSummary.slice(0, 5)}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="category" />
                    <YAxis tickFormatter={(tick) => `${tick.toFixed(0)}`} />
                    <Tooltip
                      formatter={(value: number) =>
                        selectedSummaryMetric === 'conversion'
                          ? `${value.toFixed(2)}%`
                          : `${value.toFixed(2)}%`
                      }
                    />
                    <Legend />
                    <Bar
                      dataKey={
                        selectedSummaryMetric === 'conversion'
                          ? showUnique ? 'unique_conversion_rate' : 'conversion_rate'
                          : showUnique ? 'unique_persuasion_rate' : 'persuasion_rate'
                      }
                      fill="#8884d8"
                    />
                  </BarChart>
                </ResponsiveContainer>
                <div className="mt-4">
                  <h4 className="text-md font-medium text-gray-900">Top 5 por {selectedUtmCategory === 'campaign' ? 'Campaña' : selectedUtmCategory === 'medium' ? 'Segmentación' : selectedUtmCategory === 'content' ? 'Anuncio' : 'Fuente'}</h4>
                  <ul className="divide-y divide-gray-200">
                    {groupedUtmSummary.slice(0, 5).map((item, index) => (
                      <li key={index} className="py-2 flex justify-between items-center">
                        <span className="font-medium text-gray-700">{item.category}</span>
                        <div className="text-right">
                          <div className="text-sm text-gray-500">
                            {item.visits} visitas, {item.purchases} compras, {item.clicks} clics
                          </div>
                          <div className="text-sm text-gray-900 font-semibold">
                            {selectedSummaryMetric === 'conversion'
                              ? (showUnique ? item.unique_conversion_rate : item.conversion_rate).toFixed(2)
                              : (showUnique ? item.unique_persuasion_rate : item.persuasion_rate).toFixed(2)}
                            %
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        ) : (
          // Tabla de UTMs (detalle)
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
                          <span className="text-sm text-gray-900">{currentPersuasion.toFixed(2)}%</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
