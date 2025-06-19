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
  Filter,
  Lightbulb,
  Rocket,
  Gem,
  AlertTriangle,
  Zap,
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
  ComposedChart,
  Area,
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
    medium: string;
    campaign: string;
    content: string;
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

const decodeName = (name: string) => {
  try {
    return decodeURIComponent(name.replace(/\+/g, ' '));
  } catch (e) {
    return name;
  }
};

interface Props {
  productId: string;
}

type SortField =
  | 'campaign'
  | 'medium'
  | 'content'
  | 'visits'
  | 'clicks'
  | 'purchases'
  | 'conversion_rate'
  | 'persuasion_rate';
type SortDirection = 'asc' | 'desc';
type UtmSortField = 'name' | 'visits' | 'clicks' | 'purchases' | 'conversion_rate' | 'persuasion_rate';

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

const CustomTooltip = ({ active, payload, label, showUnique }: any) => {
  if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
          <div className="bg-white p-4 rounded-lg shadow-lg border border-gray-200">
              <p className="font-bold text-gray-800">{label}</p>
              <div className="mt-2 space-y-1 text-sm">
                  <p className="flex justify-between">
                      <span className="text-gray-500">Visitas {showUnique ? 'Únicas' : 'Totales'}:</span>
                      <span className="font-medium text-blue-600 ml-4">{showUnique ? data.unique_visits : data.visits}</span>
                  </p>
                  <p className="flex justify-between">
                      <span className="text-gray-500">Pagos Iniciados {showUnique ? 'Únicos' : 'Totales'}:</span>
                      <span className="font-medium text-green-600 ml-4">{showUnique ? data.unique_clicks : data.clicks}</span>
                  </p>
                  <p className="flex justify-between">
                      <span className="text-gray-500">Compras:</span>
                      <span className="font-medium text-purple-600 ml-4">{data.purchases}</span>
                  </p>
                  <p className="flex justify-between mt-2 pt-2 border-t">
                      <span className="text-gray-500">Tasa de Conversión:</span>
                      <span className="font-bold text-amber-600 ml-4">{data.conversion_rate.toFixed(2)}%</span>
                  </p>
              </div>
          </div>
      );
  }

  return null;
};

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
          visits: 100,
          clicks: 120,
          purchases: 120,
          conversion: 120,
        };
  });
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [utmFilters, setUtmFilters] = useState<{ campaign: string; medium: string; content: string }>({
    campaign: '',
    medium: '',
    content: '',
  });
  const [showUnique, setShowUnique] = useState(false);
  // Estado para controlar la pestaña activa: "resumen" o "detalle"
  const [activeTab, setActiveTab] = useState<'resumen' | 'detalle'>('resumen');
  // Estado para seleccionar la métrica del resumen
  const [selectedSummaryMetric, setSelectedSummaryMetric] = useState<'conversion' | 'persuasion'>('conversion');
  // Estado para seleccionar la categoría de UTM a analizar
  const [selectedUtmCategory, setSelectedUtmCategory] = useState<'campaign' | 'medium' | 'content'>('campaign');
  // Estado para el modo de análisis
  const [analysisMode, setAnalysisMode] = useState<'pure' | 'combined'>('combined');
  // Estado para la pestaña de UTM activa en la vista de detalle
  const [utmDetailTab, setUtmDetailTab] = useState<'campaign' | 'medium' | 'content'>('campaign');
  // Estados para el filtrado jerárquico
  const [selectedCampaigns, setSelectedCampaigns] = useState<Set<string>>(new Set());
  const [selectedMediums, setSelectedMediums] = useState<Set<string>>(new Set());

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

      // Para estadísticas por UTM (solo datos limpios)
      const utmStats = new Map<string, any>();

      // Para estadísticas diarias (todos los datos)
      const dailyStats = new Map<string, any>();
      const dailyUniqueVisitors = new Map<string, Set<string>>();
      const dailyUniqueClicks = new Map<string, Set<string>>();

      events.forEach((event) => {
        // --- Procesamiento para todos los eventos (cifras totales y diarias) ---
        const localDate = formatDateToTimezone(event.created_at, timezone).split(' ')[0];
        
        if (!dailyStats.has(localDate)) {
          dailyStats.set(localDate, { date: localDate, visits: 0, unique_visits: 0, clicks: 0, unique_clicks: 0, purchases: 0 });
        }
        if (!dailyUniqueVisitors.has(localDate)) {
          dailyUniqueVisitors.set(localDate, new Set());
        }
        if (!dailyUniqueClicks.has(localDate)) {
          dailyUniqueClicks.set(localDate, new Set());
        }
        
        const dayStats = dailyStats.get(localDate);
        const dayUniqueVisitors = dailyUniqueVisitors.get(localDate);
        const dayUniqueClicks = dailyUniqueClicks.get(localDate);

        if (!dayStats || !dayUniqueVisitors || !dayUniqueClicks) return;

        uniqueVisitors.add(event.visitor_id);
        dayUniqueVisitors.add(event.visitor_id);

        if (event.event_type === 'pageview') {
          totalVisits++;
          dayStats.visits++;
        } else if (event.event_type === 'hotmart_click') {
          totalClicks++;
          dayStats.clicks++;
          uniqueClicks.add(event.visitor_id);
          dayUniqueClicks.add(event.visitor_id);
        } else if (event.event_type === 'compra_hotmart') {
          totalPurchases++;
          dayStats.purchases++;
        }

        dayStats.unique_visits = dayUniqueVisitors.size;
        dayStats.unique_clicks = dayUniqueClicks.size;
        dailyStats.set(localDate, dayStats);

        // --- Procesamiento solo para eventos con UTMs válidos (análisis de atribución) ---
        const utmData = event.event_data?.utm_data;
        if (utmData) {
          const campaign = utmData.utm_campaign || '';
          const medium = utmData.utm_medium || '';
          const content = utmData.utm_content || '';
          const isInvalidUtm = campaign.includes('{{') || medium.includes('{{') || content.includes('{{');

          if (!isInvalidUtm) {
            const utmKey = JSON.stringify({ medium: medium || 'none', campaign: campaign || 'none', content: content || 'none' });

            if (!utmStats.has(utmKey)) {
              utmStats.set(utmKey, {
                medium: medium || 'none', campaign: campaign || 'none', content: content || 'none',
                visits: 0, unique_visits: 0, clicks: 0, unique_clicks: 0, purchases: 0,
                visitorSet: new Set(), clickSet: new Set(),
              });
            }
            
            const stats = utmStats.get(utmKey);
            stats.visitorSet.add(event.visitor_id);

            if (event.event_type === 'pageview') {
              stats.visits++;
            } else if (event.event_type === 'hotmart_click') {
              stats.clicks++;
              stats.clickSet.add(event.visitor_id);
            } else if (event.event_type === 'compra_hotmart') {
              stats.purchases++;
            }

            stats.unique_visits = stats.visitorSet.size;
            stats.unique_clicks = stats.clickSet.size;
            utmStats.set(utmKey, stats);
          }
        }
      });

      const utmStatsArray = Array.from(utmStats.values())
        .map((stat) => ({
          ...stat,
          campaign: decodeName(stat.campaign),
          medium: decodeName(stat.medium),
          content: decodeName(stat.content),
          conversion_rate: stat.visits > 0 ? (stat.purchases / stat.visits) * 100 : 0,
          unique_conversion_rate: stat.unique_visits > 0 ? (stat.purchases / stat.unique_visits) * 100 : 0,
          persuasion_rate: stat.visits > 0 ? (stat.clicks / stat.visits) * 100 : 0,
          unique_persuasion_rate: stat.unique_visits > 0 ? (stat.unique_clicks / stat.unique_visits) * 100 : 0,
        }))
        .sort((a, b) => b.visits - a.visits);

      const dailyStatsArray = Array.from(dailyStats.values()).sort((a, b) =>
        a.date.localeCompare(b.date)
      );

      const sourceStatsArray: { source: string; visits: number; unique_visits: number; clicks: number; unique_clicks: number; }[] = [];

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
            utm.content.toLowerCase().includes(utmFilters.content.toLowerCase())
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
    const grouped: Record<string, {
      category: string;
      visits: number;
      unique_visits: number;
      clicks: number;
      unique_clicks: number;
      purchases: number;
      conversion_rate?: number;
      unique_conversion_rate?: number;
      persuasion_rate?: number;
      unique_persuasion_rate?: number;
    }> = {};

    data.utm_stats.forEach((utm) => {
      let key: string;
      
      if (analysisMode === 'pure') {
        // Modo puro: solo la categoría seleccionada
        key = utm[selectedUtmCategory] || 'none';
      } else {
        // Modo combinado: campaña + categoría seleccionada
        if (selectedUtmCategory === 'campaign') {
          key = utm.campaign || 'none';
        } else {
          key = `${utm.campaign} → ${utm[selectedUtmCategory] || 'none'}`;
        }
      }
      
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
    return result.sort((a, b) => (b[metricKey] ?? 0) - (a[metricKey] ?? 0));
  }, [data, selectedUtmCategory, selectedSummaryMetric, showUnique, analysisMode]);

  // Insights para el nuevo dashboard de trafficker
  const insights = useMemo(() => {
    if (!data || data.utm_stats.length === 0) {
      return {
        moneyMachines: [],
        hiddenGems: [],
        leakyFaucets: [],
        wastedAdSpend: [],
        avgVisits: 0,
        avgConversionRate: 0,
      };
    }
  
    const totalUtms = data.utm_stats.length;
    const avgVisits = data.utm_stats.reduce((acc, utm) => acc + utm.visits, 0) / totalUtms;
    const avgConversionRate = (data.total_purchases / data.total_visits) * 100;
  
    const moneyMachines = data.utm_stats
      .filter(utm => utm.visits > avgVisits && (showUnique ? utm.unique_conversion_rate : utm.conversion_rate) > avgConversionRate)
      .sort((a, b) => b.purchases - a.purchases);
  
    const hiddenGems = data.utm_stats
      .filter(utm => utm.visits < avgVisits && (showUnique ? utm.unique_conversion_rate : utm.conversion_rate) > avgConversionRate * 1.5)
      .sort((a, b) => (showUnique ? b.unique_conversion_rate : b.conversion_rate) - (showUnique ? a.unique_conversion_rate : a.conversion_rate));
  
    const leakyFaucets = data.utm_stats
      .filter(utm => utm.visits > avgVisits && (showUnique ? utm.unique_conversion_rate : utm.conversion_rate) < avgConversionRate)
      .sort((a, b) => a.conversion_rate - b.conversion_rate);
  
    const wastedAdSpend = data.utm_stats
      .filter(utm => utm.visits > avgVisits * 0.5 && utm.purchases === 0)
      .sort((a, b) => b.visits - a.visits);
  
    return { moneyMachines, hiddenGems, leakyFaucets, wastedAdSpend, avgVisits, avgConversionRate };
  }, [data, showUnique]);

  const handleCampaignSelection = (selection: Set<string>) => {
    setSelectedCampaigns(selection);
    // Al cambiar la selección de campañas, reseteamos la de segmentaciones
    setSelectedMediums(new Set());
  };

  const clearSelection = () => {
    setSelectedCampaigns(new Set());
    setSelectedMediums(new Set());
  };

  const aggregateStats = useCallback((key: 'campaign' | 'medium' | 'content', sourceData?: any[]) => {
    if (!sourceData) return [];
    
    const grouped = new Map<string, any>();

    sourceData.forEach(utm => {
      const groupKey = utm[key] || 'none';
      if (!grouped.has(groupKey)) {
        grouped.set(groupKey, {
          name: groupKey,
          visits: 0,
          unique_visits: 0,
          clicks: 0,
          unique_clicks: 0,
          purchases: 0
        });
      }
      
      const stats = grouped.get(groupKey);
      stats.visits += utm.visits;
      stats.unique_visits += utm.unique_visits;
      stats.clicks += utm.clicks;
      stats.unique_clicks += utm.unique_clicks;
      stats.purchases += utm.purchases;
    });

    return Array.from(grouped.values()).map(stat => ({
      ...stat,
      conversion_rate: stat.visits > 0 ? (stat.purchases / stat.visits) * 100 : 0,
      unique_conversion_rate: stat.unique_visits > 0 ? (stat.purchases / stat.unique_visits) * 100 : 0,
      persuasion_rate: stat.clicks > 0 ? (stat.clicks / stat.visits) * 100 : 0,
      unique_persuasion_rate: stat.unique_visits > 0 ? (stat.unique_clicks / stat.unique_visits) * 100 : 0
    }));
  }, []);

  // Filtramos los datos basados en las selecciones
  const campaignData = useMemo(() => aggregateStats('campaign', data?.utm_stats), [aggregateStats, data]);

  const mediumData = useMemo(() => {
    if (!data) return [];
    const filteredUtms = selectedCampaigns.size > 0
      ? data.utm_stats.filter(utm => selectedCampaigns.has(utm.campaign || 'none'))
      : data.utm_stats;
    return aggregateStats('medium', filteredUtms);
  }, [aggregateStats, data, selectedCampaigns]);

  const contentData = useMemo(() => {
    if (!data) return [];
    let filteredUtms = data.utm_stats;
    if (selectedCampaigns.size > 0) {
      filteredUtms = filteredUtms.filter(utm => selectedCampaigns.has(utm.campaign || 'none'));
    }
    if (selectedMediums.size > 0) {
      filteredUtms = filteredUtms.filter(utm => selectedMediums.has(utm.medium || 'none'));
    }
    return aggregateStats('content', filteredUtms);
  }, [aggregateStats, data, selectedCampaigns, selectedMediums]);

  const chartData = useMemo(() => {
    if (!data?.daily_stats) return [];
    return data.daily_stats.map(day => ({
        ...day,
        conversion_rate: (showUnique ? day.unique_visits : day.visits) > 0 ? (day.purchases / (showUnique ? day.unique_visits : day.visits)) * 100 : 0,
    }));
  }, [data?.daily_stats, showUnique]);

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
                    {['Campaña', 'Segmentación', 'Anuncio', 'Visitas', 'Pagos Iniciados', 'Compras', 'Conversión', 'Persuasión'].map(
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
                      {Array.from({ length: 8 }).map((_, i) => (
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
            <button
              onClick={exportToExcel}
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              <Download className="h-4 w-4 mr-2" />
              Exportar
            </button>
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
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center">
          <TrendingUp className="h-6 w-6 text-indigo-600 mr-3" />
          Rendimiento a lo largo del tiempo
        </h3>
        <div className="h-96">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
              <defs>
                <linearGradient id="colorVisits" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#FFFFFF" stopOpacity={0.1}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="left" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(value) => `${value.toFixed(1)}%`} />
              <Tooltip content={<CustomTooltip showUnique={showUnique} />} />
              <Legend />
              <Area yAxisId="left" type="monotone" dataKey={showUnique ? 'unique_visits' : 'visits'} name={`Visitas ${showUnique ? 'Únicas' : 'Totales'}`} fill="url(#colorVisits)" stroke="#3B82F6" strokeWidth={2} />
              <Line yAxisId="left" type="monotone" dataKey={showUnique ? 'unique_clicks' : 'clicks'} name={`Pagos Iniciados ${showUnique ? 'Únicos' : 'Totales'}`} stroke="#10B981" strokeWidth={2} dot={false} />
              <Line yAxisId="left" type="monotone" dataKey="purchases" name="Compras" stroke="#8B5CF6" strokeWidth={2.5} />
              <Line yAxisId="right" type="monotone" dataKey="conversion_rate" name="Tasa de Conversión" stroke="#F59E0B" strokeWidth={2} strokeDasharray="5 5" dot={false} />
            </ComposedChart>
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
          <div className="p-6 space-y-8 bg-gray-50">
            {/* Fila 1: Funnel de Conversión y Resumen Global */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Funnel */}
              <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center">
                  <Filter className="h-6 w-6 text-indigo-600 mr-3" />
                  Funnel de Conversión
                </h3>
                <div className="space-y-4">
                  {/* Etapa 1: Visitas */}
                  <div className="flex items-center">
                    <div className="flex-shrink-0 bg-blue-100 rounded-lg w-16 h-16 flex items-center justify-center">
                      <Users className="w-8 h-8 text-blue-600" />
                    </div>
                    <div className="ml-4">
                      <p className="text-lg font-bold text-gray-900">{showUnique ? data.unique_visits : data.total_visits}</p>
                      <p className="text-sm text-gray-500">Visitas {showUnique ? 'Únicas' : 'Totales'}</p>
                    </div>
                  </div>
                  {/* Conector */}
                  <div className="ml-8 pl-1 flex items-center" style={{ minHeight: '40px' }}>
                    <div className="w-px h-full bg-gray-300 mr-4"></div>
                    <div className="text-xs text-blue-600 font-semibold bg-blue-50 px-2 py-1 rounded-full">
                      {( (showUnique ? data.unique_clicks : data.total_clicks) / (showUnique ? data.unique_visits : data.total_visits) * 100 ).toFixed(1)}%
                    </div>
                  </div>
                  {/* Etapa 2: Pagos Iniciados */}
                  <div className="flex items-center">
                    <div className="flex-shrink-0 bg-green-100 rounded-lg w-16 h-16 flex items-center justify-center">
                      <BarChartIcon className="w-8 h-8 text-green-600" />
                    </div>
                    <div className="ml-4">
                      <p className="text-lg font-bold text-gray-900">{showUnique ? data.unique_clicks : data.total_clicks}</p>
                      <p className="text-sm text-gray-500">Pagos Iniciados {showUnique ? 'Únicos' : 'Totales'}</p>
                    </div>
                  </div>
                  {/* Conector */}
                  <div className="ml-8 pl-1 flex items-center" style={{ minHeight: '40px' }}>
                    <div className="w-px h-full bg-gray-300 mr-4"></div>
                    <div className="text-xs text-green-600 font-semibold bg-green-50 px-2 py-1 rounded-full">
                      {( (data.total_purchases) / (showUnique ? data.unique_clicks : data.total_clicks) * 100 ).toFixed(1)}%
                    </div>
                  </div>
                   {/* Etapa 3: Compras */}
                   <div className="flex items-center">
                    <div className="flex-shrink-0 bg-purple-100 rounded-lg w-16 h-16 flex items-center justify-center">
                      <DollarSign className="w-8 h-8 text-purple-600" />
                    </div>
                    <div className="ml-4">
                      <p className="text-lg font-bold text-gray-900">{data.total_purchases}</p>
                      <p className="text-sm text-gray-500">Compras</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Resumen Global */}
              <div className="bg-white p-6 rounded-xl shadow-sm border space-y-6">
                <h3 className="text-xl font-bold text-gray-900">Métricas Clave</h3>
                <div className="space-y-4">
                    <div>
                      <p className="text-sm font-medium text-gray-500">Conversión General</p>
                      <p className="text-3xl font-bold text-indigo-600">{(showUnique ? data.unique_conversion_rate : data.conversion_rate).toFixed(2)}%</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-500">Persuasión General</p>
                      <p className="text-3xl font-bold text-indigo-600">{(showUnique ? data.unique_persuasion_rate : data.persuasion_rate).toFixed(2)}%</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-500">Total Compras</p>
                      <p className="text-3xl font-bold text-indigo-600">{data.total_purchases}</p>
                    </div>
                </div>
              </div>
            </div>

            {/* Fila 2: Motor de Insights */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
              <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center">
                <Lightbulb className="h-6 w-6 text-yellow-500 mr-3" />
                Inteligencia de Campañas
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <InsightCard
                  icon={<Rocket className="h-8 w-8 text-white" />}
                  bgColor="bg-green-500"
                  title="Máquinas de Dinero"
                  description="Alto tráfico y alta conversión. ¡Escalar!"
                  campaigns={insights.moneyMachines}
                  showUnique={showUnique}
                />
                 <InsightCard
                  icon={<Gem className="h-8 w-8 text-white" />}
                  bgColor="bg-sky-500"
                  title="Joyas Ocultas"
                  description="Bajo tráfico, alta conversión. ¡Darle más visibilidad!"
                  campaigns={insights.hiddenGems}
                  showUnique={showUnique}
                />
                <InsightCard
                  icon={<AlertTriangle className="h-8 w-8 text-white" />}
                  bgColor="bg-amber-500"
                  title="Gigantes Cansados"
                  description="Mucho tráfico, baja conversión. ¡Optimizar o pausar!"
                  campaigns={insights.leakyFaucets}
                  showUnique={showUnique}
                />
                <InsightCard
                  icon={<Zap className="h-8 w-8 text-white" />}
                  bgColor="bg-red-500"
                  title="Agujeros Negros"
                  description="Visitas pero 0 compras. ¡Revisar urgentemente!"
                  campaigns={insights.wastedAdSpend}
                  showUnique={showUnique}
                />
              </div>
            </div>
          </div>
        ) : (
          // Tabla de UTMs (detalle)
          <div className="border-t border-gray-200 p-6">
            <div className="flex items-center space-x-2 border-b border-gray-200 mb-4">
              <button
                onClick={() => setUtmDetailTab('campaign')}
                className={`px-4 py-2 text-sm font-medium rounded-t-lg ${
                  utmDetailTab === 'campaign' ? 'bg-indigo-50 text-indigo-700 border-indigo-300 border-t border-l border-r' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Campañas {selectedCampaigns.size > 0 && <span className="text-xs opacity-80">({selectedCampaigns.size})</span>}
              </button>
              <button
                onClick={() => setUtmDetailTab('medium')}
                className={`px-4 py-2 text-sm font-medium rounded-t-lg ${
                  utmDetailTab === 'medium' ? 'bg-indigo-50 text-indigo-700 border-indigo-300 border-t border-l border-r' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Segmentación {selectedMediums.size > 0 && <span className="text-xs opacity-80">({selectedMediums.size})</span>}
              </button>
              <button
                onClick={() => setUtmDetailTab('content')}
                className={`px-4 py-2 text-sm font-medium rounded-t-lg ${
                  utmDetailTab === 'content' ? 'bg-indigo-50 text-indigo-700 border-indigo-300 border-t border-l border-r' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Anuncios
              </button>
              {(selectedCampaigns.size > 0 || selectedMediums.size > 0) && (
                <button
                  onClick={clearSelection}
                  className="ml-auto text-sm font-medium text-indigo-600 hover:text-indigo-800 self-center pb-2 flex items-center gap-1"
                >
                  <RefreshCw className="h-3 w-3" />
                  Limpiar filtros
                </button>
              )}
            </div>

            {utmDetailTab === 'campaign' && <UtmDetailTable data={campaignData} title="Campaña" showUnique={showUnique} selectedItems={selectedCampaigns} onSelectionChange={handleCampaignSelection} />}
            {utmDetailTab === 'medium' && <UtmDetailTable data={mediumData} title="Segmentación" showUnique={showUnique} selectedItems={selectedMediums} onSelectionChange={setSelectedMediums} />}
            {utmDetailTab === 'content' && <UtmDetailTable data={contentData} title="Anuncio" showUnique={showUnique} selectedItems={new Set()} onSelectionChange={() => {}} />}
          </div>
        )}
      </div>
    </div>
  );
}

interface InsightCardProps {
  icon: React.ReactNode;
  bgColor: string;
  title: string;
  description: string;
  campaigns: any[];
  showUnique: boolean;
}

const InsightCard: React.FC<InsightCardProps> = ({ icon, bgColor, title, description, campaigns, showUnique }) => {
  return (
    <div className="bg-slate-50 rounded-lg p-4 border border-slate-200 flex flex-col">
      <div className="flex items-start justify-between">
        <div className={`p-3 rounded-lg ${bgColor}`}>
          {icon}
        </div>
        <span className="font-bold text-3xl text-gray-300">{campaigns.length}</span>
      </div>
      <div className="mt-4">
        <h4 className="font-bold text-gray-800 text-lg">{title}</h4>
        <p className="text-xs text-gray-500 h-8">{description}</p>
      </div>
      <div className="mt-4 space-y-3 flex-grow">
        {campaigns.slice(0, 3).map((utm, index) => (
          <div key={index} className="bg-white p-3 rounded-lg text-xs border border-gray-200">
            <div className="space-y-1.5">
              <div className="flex items-center">
                <span className="inline-block w-20 text-center bg-blue-100 text-blue-800 text-[10px] font-semibold mr-2 px-2 py-0.5 rounded-full">CAMPAÑA</span>
                <p className="font-medium text-gray-700 truncate" title={utm.campaign}>{utm.campaign}</p>
              </div>
              <div className="flex items-center">
                <span className="inline-block w-20 text-center bg-green-100 text-green-800 text-[10px] font-semibold mr-2 px-2 py-0.5 rounded-full">CONJUNTO</span>
                <p className="text-gray-600 truncate" title={utm.medium}>{utm.medium}</p>
              </div>
              <div className="flex items-center">
                <span className="inline-block w-20 text-center bg-purple-100 text-purple-800 text-[10px] font-semibold mr-2 px-2 py-0.5 rounded-full">ANUNCIO</span>
                <p className="text-gray-600 truncate" title={utm.content}>{utm.content}</p>
              </div>
            </div>
            <div className="flex justify-between items-center text-gray-600 mt-2 pt-2 border-t border-gray-100">
              <span className="font-medium text-sm">{showUnique ? utm.unique_visits : utm.visits} visitas</span>
              <span className="font-bold text-base text-gray-800">{(showUnique ? utm.unique_conversion_rate : utm.conversion_rate).toFixed(1)}%</span>
            </div>
          </div>
        ))}
      </div>
      {campaigns.length === 0 && (
         <div className="flex-grow flex items-center justify-center">
            <p className="text-sm text-gray-400">No hay campañas aquí.</p>
         </div>
      )}
    </div>
  );
};

interface UtmDetailTableProps {
  data: any[];
  title: string;
  showUnique: boolean;
  selectedItems: Set<string>;
  onSelectionChange: (selection: Set<string>) => void;
}

function UtmDetailTable({ data, title, showUnique, selectedItems, onSelectionChange }: UtmDetailTableProps): JSX.Element {
  const [sortField, setSortField] = useState<UtmSortField>('visits');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const handleSort = (field: UtmSortField) => {
    if (field === sortField) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const sortedData = useMemo(() => {
    const sortableData = [...data];

    const getSortableValue = (item: any, field: UtmSortField) => {
      switch (field) {
        case 'visits': return showUnique ? item.unique_visits : item.visits;
        case 'clicks': return showUnique ? item.unique_clicks : item.clicks;
        case 'conversion_rate': return showUnique ? item.unique_conversion_rate : item.conversion_rate;
        case 'persuasion_rate': return showUnique ? item.unique_persuasion_rate : item.persuasion_rate;
        default: return item[field];
      }
    };
    
    sortableData.sort((a, b) => {
      const aValue = getSortableValue(a, sortField);
      const bValue = getSortableValue(b, sortField);
      const multiplier = sortDirection === 'asc' ? 1 : -1;

      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return (aValue - bValue) * multiplier;
      }
      return String(aValue).localeCompare(String(bValue)) * multiplier;
    });

    return sortableData;
  }, [data, sortField, sortDirection, showUnique]);

  const handleRowClick = (itemName: string) => {
    const newSelection = new Set(selectedItems);
    if (newSelection.has(itemName)) {
      newSelection.delete(itemName);
    } else {
      newSelection.add(itemName);
    }
    onSelectionChange(newSelection);
  };

  const handleSelectAll = () => {
    if (selectedItems.size === sortedData.length) {
      onSelectionChange(new Set());
    } else {
      onSelectionChange(new Set(sortedData.map(item => item.name)));
    }
  };

  const SortableHeader = ({ field, label, align = 'right' }: { field: UtmSortField; label: string, align?: 'left' | 'right' }) => (
    <th scope="col" className={`px-6 py-3 text-${align} text-xs font-medium text-gray-500 uppercase tracking-wider`}>
      <button onClick={() => handleSort(field)} className="group inline-flex items-center space-x-1 hover:text-gray-900">
        <span>{label}</span>
        <ArrowUpDown className={`h-4 w-4 ${sortField === field ? 'text-gray-900' : 'text-gray-400 group-hover:text-gray-500'}`} />
      </button>
    </th>
  );

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th scope="col" className="px-6 py-3 text-left">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                checked={sortedData.length > 0 && selectedItems.size === sortedData.length}
                onChange={handleSelectAll}
              />
            </th>
            <SortableHeader field="name" label={title} align="left" />
            <SortableHeader field="visits" label="Visitas" />
            <SortableHeader field="clicks" label="Pagos Iniciados" />
            <SortableHeader field="purchases" label="Compras" />
            <SortableHeader field="conversion_rate" label="Conversión" />
            <SortableHeader field="persuasion_rate" label="Persuasión" />
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {sortedData.map((item, index) => (
            <tr
              key={index}
              className={`hover:bg-gray-100 cursor-pointer ${selectedItems.has(item.name) ? 'bg-indigo-50' : ''}`}
              onClick={() => handleRowClick(item.name)}
            >
              <td className="px-6 py-4">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  checked={selectedItems.has(item.name)}
                  readOnly // El click en la fila se encarga de la lógica
                />
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{item.name}</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">{showUnique ? item.unique_visits : item.visits}</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">{showUnique ? item.unique_clicks : item.clicks}</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">{item.purchases}</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                {(showUnique ? item.unique_conversion_rate : item.conversion_rate).toFixed(2)}%
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                {(showUnique ? item.unique_persuasion_rate : item.persuasion_rate).toFixed(2)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

