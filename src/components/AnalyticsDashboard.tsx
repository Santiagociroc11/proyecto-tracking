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
  Target,
  TrendingDown,
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
  Label,
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
import { AdDetailsModal } from './AdDetailsModal';

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
  dailyData: {
    date: string;
    roas: number;
    profit: number;
    spend: number;
    sales: number;
    revenue: number;
  }[];
}

interface AnalyticsData {
  total_visits: number;
  unique_visits: number;
  total_clicks: number;
  unique_clicks: number;
  total_purchases: number;
  total_order_bumps: number;
  conversion_rate: number;
  unique_conversion_rate: number;
  persuasion_rate: number;
  unique_persuasion_rate: number;
  order_bump_rate: number; // Porcentaje de ventas que incluyen order bump
  total_main_product_revenue: number;
  total_order_bump_revenue: number;
  total_revenue: number;
  revenue_today: number;
  total_ad_spend: number;
  ad_spend_today: number;
  roas: number; // Return on Ad Spend
  roas_today: number;
  utm_stats: {
    medium: string;
    campaign: string;
    content: string;
    medium_raw?: string; // Valor completo con ID
    campaign_raw?: string; // Valor completo con ID
    content_raw?: string; // Valor completo con ID
    visits: number;
    unique_visits: number;
    clicks: number;
    unique_clicks: number;
    purchases: number;
    order_bumps: number;
    revenue: number;
    ad_spend: number;
    campaign_budget: number;
    adset_budget: number;
    roas: number;
    conversion_rate: number;
    unique_conversion_rate: number;
    persuasion_rate: number;
    unique_persuasion_rate: number;
    order_bump_rate: number;
  }[];
  daily_stats: {
    date: string;
    visits: number;
    unique_visits: number;
    clicks: number;
    unique_clicks: number;
    purchases: number;
    order_bumps: number;
    revenue: number;
    ad_spend: number;
    roas: number;
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

const cleanUtmName = (name: string) => {
  if (!name || name === '-') return 'none';
  try {
    // Decodificar primero
    const decoded = decodeName(name);
    
    // Si contiene ||, tomar solo la parte antes del ||
    if (decoded.includes('||')) {
      const parts = decoded.split('||');
      const namePart = parts[0].trim();
      const idPart = parts[1]?.trim();
      
      // Si solo tenemos ID sin nombre, formatear para display
      if (!namePart && idPart) {
        return `[ID: ${idPart.substring(0, 8)}...]`;
      }
      
      return namePart || decoded;
    }
    
    // Verificar si es solo un ID numérico largo (posible Facebook ID)
    if (/^\d{15,}$/.test(decoded)) {
      return `[ID: ${decoded.substring(0, 8)}...]`;
    }
    
    return decoded;
  } catch (e) {
    return name;
  }
};

const extractUtmId = (utmValue: string) => {
  try {
    const decoded = decodeName(utmValue);
    const parts = decoded.split('||');
    // Si tiene ID (parte después del ||), lo devuelve, sino devuelve null
    return parts.length > 1 && parts[1].trim() ? parts[1].trim() : null;
  } catch (e) {
    return null;
  }
};

// Función para normalizar nombres de campaña para matching más flexible
const normalizeCampaignName = (name: string): string => {
  if (!name) return '';
  
  return name
    // Remover emojis usando rangos de surrogate pairs (según lo solicitado)
     // Remover emojis al inicio (🔴, 🟢, etc.)
     .replace(/^[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '')
    // Normalizar barras escapadas
    .replace(/\\\\+/g, '\\')
    // NUEVO: Normalizar conectores y espacios múltiples
    .replace(/\s*\+\s*/g, ' ')  // Convertir " + " o "+" a un espacio
    .replace(/\s*-\s*/g, ' ')   // Convertir " - " o "-" a un espacio  
    .replace(/\s*\|\s*/g, '|')  // Normalizar espacios alrededor de |
    .replace(/\s+/g, ' ')       // Colapsar espacios múltiples
    // Trim espacios al inicio y final
    .trim()
    // Convertir a lowercase para comparación case-insensitive
    .toLowerCase();
};

// Función de matching más inteligente
const findCampaignMatch = (utmData: any, utmBaseStats: Map<any, any>): string | null => {
  const utmCampaign = utmData.utm_campaign || '';
  const utmMedium = utmData.utm_medium || '';
  const utmContent = utmData.utm_content || '';
  
  // 1. Intentar matching exacto primero
  for (const [key, stats] of utmBaseStats.entries()) {
    if (stats.campaign === utmCampaign &&
        stats.medium === utmMedium &&
        stats.content === utmContent) {
      return key;
    }
  }
  
  // 2. Intentar matching normalizado
  const normalizedUtmCampaign = normalizeCampaignName(utmCampaign);
  const normalizedUtmMedium = normalizeCampaignName(utmMedium);
  const normalizedUtmContent = normalizeCampaignName(utmContent);
  
  for (const [key, stats] of utmBaseStats.entries()) {
    const normalizedStatsCampaign = normalizeCampaignName(stats.campaign);
    const normalizedStatsMedium = normalizeCampaignName(stats.medium);
    const normalizedStatsContent = normalizeCampaignName(stats.content);
    
    if (normalizedStatsCampaign === normalizedUtmCampaign &&
        normalizedStatsMedium === normalizedUtmMedium &&
        normalizedStatsContent === normalizedUtmContent) {
      console.log(`[FUZZY MATCH] ✅ Found normalized match:`, {
        original_utm: utmCampaign,
        original_campaign: stats.campaign,
        normalized_utm: normalizedUtmCampaign,
        normalized_campaign: normalizedStatsCampaign,
        match_type: 'campaign_medium_content'
      });
      return key;
    }
    
    // Debug de campañas similares que no hicieron match
    if (normalizedStatsCampaign === normalizedUtmCampaign) {
      console.log(`[FUZZY DEBUG] Campaign match but medium/content differ:`, {
        utm_campaign: utmCampaign,
        utm_medium: utmMedium,
        utm_content: utmContent,
        stats_campaign: stats.campaign,
        stats_medium: stats.medium,
        stats_content: stats.content,
        normalized_utm_medium: normalizedUtmMedium,
        normalized_stats_medium: normalizedStatsMedium,
        normalized_utm_content: normalizedUtmContent,
        normalized_stats_content: normalizedStatsContent,
      });
    }
  }
  
  return null;
};

const getUtmGroupingKey = (campaign: string, medium: string, content: string) => {
  // Intentar extraer IDs
  const campaignId = extractUtmId(campaign);
  const mediumId = extractUtmId(medium);
  const contentId = extractUtmId(content);
  
  // Si tiene IDs, usar los IDs para agrupar (más preciso)
  if (campaignId || mediumId || contentId) {
    return JSON.stringify({ 
      campaign_id: campaignId || campaign || 'none',
      medium_id: mediumId || medium || 'none', 
      content_id: contentId || content || 'none'
    });
  }
  
  // Si no tiene IDs, usar nombres para agrupar (backward compatibility)
  return JSON.stringify({ 
    medium: medium || 'none', 
    campaign: campaign || 'none', 
    content: content || 'none' 
  });
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
  | 'persuasion_rate'
  | 'roas';
type SortDirection = 'asc' | 'desc';
type UtmSortField = 'name' | 'visits' | 'clicks' | 'purchases' | 'conversion_rate' | 'persuasion_rate' | 'checkout_conversion_rate' | 'roas' | 'ad_spend';

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
                  <p className="flex justify-between">
                      <span className="text-gray-500">Order Bumps:</span>
                      <span className="font-medium text-orange-600 ml-4">{data.order_bumps}</span>
                  </p>
                  <p className="flex justify-between mt-2 pt-2 border-t">
                      <span className="text-gray-500">Ingresos del Día:</span>
                      <span className="font-bold text-emerald-600 ml-4">
                        ${(data.revenue || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                  </p>
                  <p className="flex justify-between">
                      <span className="text-gray-500">Gasto Publicitario:</span>
                      <span className="font-bold text-red-600 ml-4">
                        ${(data.ad_spend || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                  </p>
                  <p className="flex justify-between">
                      <span className="text-gray-500">ROAS:</span>
                      <span className="font-bold text-indigo-600 ml-4">
                        {(data.roas || 0).toFixed(2)}x
                      </span>
                  </p>
              </div>
          </div>
      );
  }

  return null;
};

const getEventPrice = (event: any): number => {
    const commissions = event.event_data?.data?.commissions;
    const purchasePrice = event.event_data?.data?.purchase?.price;
    if (!purchasePrice) return 0;
  
    const producerCommission = commissions?.find((c: any) => c.source === 'PRODUCER');
    if (producerCommission) {
      return producerCommission.value;
    }
    return purchasePrice.value;
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
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ModalItem | null>(null);
  const [rawEvents, setRawEvents] = useState<any[]>([]);
  const [rawAdPerformance, setRawAdPerformance] = useState<any[]>([]);

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
      setRawEvents(events || []);
      
      const today = new Date();
      const todayFormatted = formatLocalDate(today);
      const [todayYear, todayMonth, todayDay] = todayFormatted.split('-').map(Number);
      const todayStartLocalDate = new Date(todayYear, todayMonth - 1, todayDay, 0, 0, 0);
      const todayEndLocalDate = new Date(todayYear, todayMonth - 1, todayDay, 23, 59, 59, 999);
      const todayStartUTC = todayStartLocalDate.toISOString();
      const todayEndUTC = todayEndLocalDate.toISOString();

      const { data: todayEvents, error: todayEventsError } = await supabase
        .from('tracking_events')
        .select(`event_type, event_data`)
        .eq('product_id', productId)
        .in('event_type', ['compra_hotmart', 'compra_hotmart_orderbump'])
        .gte('created_at', todayStartUTC)
        .lte('created_at', todayEndUTC);

      if (todayEventsError) {
        console.error("Error fetching today's revenue events:", todayEventsError);
      }
      
      const revenueToday = todayEvents?.reduce((acc, event) => acc + getEventPrice(event), 0) ?? 0;

      if (!events || events.length === 0) {
        console.log('No events found for the selected date range');
        setData({
          total_visits: 0,
          unique_visits: 0,
          total_clicks: 0,
          unique_clicks: 0,
          total_purchases: 0,
          total_order_bumps: 0,
          conversion_rate: 0,
          unique_conversion_rate: 0,
          persuasion_rate: 0,
          unique_persuasion_rate: 0,
          order_bump_rate: 0,
          total_main_product_revenue: 0,
          total_order_bump_revenue: 0,
          total_revenue: 0,
          revenue_today: revenueToday,
          total_ad_spend: 0,
          ad_spend_today: 0,
          roas: 0,
          roas_today: 0,
          utm_stats: [],
          daily_stats: [],
          top_sources: [],
        });
        setLoading(false);
        return;
      }


      // Inicializamos mapas y sets para estadísticas
      const uniqueVisitors = new Set<string>();
      const uniqueClicks = new Set<string>();
      let totalVisits = 0;
      let totalClicks = 0;
      let totalPurchases = 0;
      let totalOrderBumps = 0;
      let totalMainProductRevenue = 0;
      let totalOrderBumpRevenue = 0;

      // Para estadísticas diarias (todos los datos)
      const dailyStats = new Map<string, any>();
      const dailyUniqueVisitors = new Map<string, Set<string>>();
      const dailyUniqueClicks = new Map<string, Set<string>>();
      
      // NUEVA LÓGICA UTM: Basada en ad_performance
      let newUtmStats: any[] = [];

      // Arrays para rastrear las ventas y sus fechas
      const allPurchases: Array<{eventType: string, timestamp: string, localTime: string, hasUtm: boolean, utmData?: any}> = [];
      let totalMainPurchases = 0;
      let totalOrderBumpPurchases = 0;

      events.forEach((event) => {
        // --- Procesamiento para todos los eventos (cifras totales y diarias) ---
        const localDate = formatDateToTimezone(event.created_at, timezone).split(' ')[0];
        
        if (!dailyStats.has(localDate)) {
          dailyStats.set(localDate, { date: localDate, visits: 0, unique_visits: 0, clicks: 0, unique_clicks: 0, purchases: 0, order_bumps: 0, revenue: 0, ad_spend: 0, roas: 0 });
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
          totalMainPurchases++; // Contador separado para ventas principales
          dayStats.purchases++;
          const price = getEventPrice(event);
          totalMainProductRevenue += price;
          dayStats.revenue += price;
          
          // Rastrear esta venta
          allPurchases.push({
            eventType: 'compra_hotmart',
            timestamp: event.created_at,
            localTime: formatDateToTimezone(event.created_at, timezone),
            hasUtm: !!event.event_data?.utm_data,
            utmData: event.event_data?.utm_data
          });
        } else if (event.event_type === 'compra_hotmart_orderbump') {
          totalOrderBumps++;
          totalOrderBumpPurchases++; // Contador separado para order bumps
          totalPurchases++; // Contar order bump como una compra total
          dayStats.order_bumps++;
          dayStats.purchases++; // Contar order bump como una compra en el día
          const price = getEventPrice(event);
          totalOrderBumpRevenue += price;
          dayStats.revenue += price;
          
          // Rastrear esta venta
          allPurchases.push({
            eventType: 'compra_hotmart_orderbump',
            timestamp: event.created_at,
            localTime: formatDateToTimezone(event.created_at, timezone),
            hasUtm: !!event.event_data?.utm_data,
            utmData: event.event_data?.utm_data
          });
        }

        dayStats.unique_visits = dayUniqueVisitors.size;
        dayStats.unique_clicks = dayUniqueClicks.size;
        dailyStats.set(localDate, dayStats);

        // La nueva lógica UTM se procesa después de obtener ad_performance
      });

      // La nueva lógica UTM se construirá después de procesar ad_performance

      const dailyStatsArray = Array.from(dailyStats.values()).sort((a, b) =>
        a.date.localeCompare(b.date)
      );

      const sourceStatsArray: { source: string; visits: number; unique_visits: number; clicks: number; unique_clicks: number; }[] = [];

      // Obtener las cuentas publicitarias del producto
      const { data: productAdAccounts } = await supabase
        .from('product_ad_accounts')
        .select('id')
        .eq('product_id', productId);

      const productAdAccountIds = productAdAccounts?.map(acc => acc.id) || [];

      // Consultar gasto publicitario usando ad_performance (datos reales y detallados)
      // Convertir fechas locales a UTC para la consulta de ad_performance
      const adStartUTC = startDate; // startDate ya está en formato YYYY-MM-DD local
      const adEndUTC = endDate;     // endDate ya está en formato YYYY-MM-DD local
      
      
      const { data: adPerformanceData, error: adPerformanceError } = await supabase
        .from('ad_performance')
        .select(`
          ad_id,
          campaign_id,
          adset_id,
          ad_name,
          adset_name,
          campaign_name,
          spend,
          date
        `)
        .gte('date', adStartUTC)
        .lte('date', adEndUTC)
        .in('product_ad_account_id', productAdAccountIds);

      if (adPerformanceError) {
        console.error('Error fetching ad performance data:', adPerformanceError);
      }
      setRawAdPerformance(adPerformanceData || []);

      // Consultar gasto publicitario de hoy
      const { data: adPerformanceTodayData, error: adPerformanceTodayError } = await supabase
        .from('ad_performance')
        .select(`
          ad_id,
          campaign_id,
          adset_id,
          ad_name,
          adset_name,
          campaign_name,
          spend
        `)
        .eq('date', todayFormatted)
        .in('product_ad_account_id', productAdAccountIds);

      if (adPerformanceTodayError) {
        console.error('Error fetching today ad performance data:', adPerformanceTodayError);
      }

      // PRIMERO: Identificar TODOS los UTMs que generaron tracking para este producto
      const campaignsWithTrackingForTotals = new Set<string>();
      const adsetsWithTrackingForTotals = new Set<string>();
      const adsWithTrackingForTotals = new Set<string>();
      
      events.forEach(event => {
        if (event.event_data?.utm_data) {
          const utmData = event.event_data.utm_data;
          
          // Extraer IDs de los UTMs si están disponibles
          const campaignId = extractUtmId(utmData.utm_campaign || '');
          const adsetId = extractUtmId(utmData.utm_medium || '');
          const adId = extractUtmId(utmData.utm_content || '');
          
          if (campaignId) campaignsWithTrackingForTotals.add(campaignId);
          if (adsetId) adsetsWithTrackingForTotals.add(adsetId);
          if (adId) adsWithTrackingForTotals.add(adId);
          
          // También agregar por nombres para matching secundario
          if (utmData.utm_campaign) campaignsWithTrackingForTotals.add(utmData.utm_campaign);
          if (utmData.utm_medium) adsetsWithTrackingForTotals.add(utmData.utm_medium);
          if (utmData.utm_content) adsWithTrackingForTotals.add(utmData.utm_content);
        }
      });

      console.log(`[KPI] Campañas con tracking: ${campaignsWithTrackingForTotals.size}`);
      console.log(`[KPI] Adsets con tracking: ${adsetsWithTrackingForTotals.size}`);
      console.log(`[KPI] Ads con tracking: ${adsWithTrackingForTotals.size}`);

      // Filtrar ad_performance usando la misma lógica que la tabla UTM
      const filteredAdPerformanceForKPIs = adPerformanceData?.filter((ad: any) => {
        // Verificar por ID exacto (más preciso)
        const hasTrackingById = (
          campaignsWithTrackingForTotals.has(ad.campaign_id || '') ||
          adsetsWithTrackingForTotals.has(ad.adset_id || '') ||
          adsWithTrackingForTotals.has(ad.ad_id || '')
        );
        
        // Verificar por nombre (fallback)
        const hasTrackingByName = (
          campaignsWithTrackingForTotals.has(ad.campaign_name || '') ||
          adsetsWithTrackingForTotals.has(ad.adset_name || '') ||
          adsWithTrackingForTotals.has(ad.ad_name || '')
        );
        
        return hasTrackingById || hasTrackingByName;
      }) || [];

      // Calcular totales usando la misma lógica que la tabla UTM
      const totalAdSpend = filteredAdPerformanceForKPIs.reduce((acc, item: any) => {
        return acc + (parseFloat(item.spend) || 0);
      }, 0);

      const filteredAdPerformanceTodayForKPIs = adPerformanceTodayData?.filter((ad: any) => {
        const hasTrackingById = (
          campaignsWithTrackingForTotals.has(ad.campaign_id || '') ||
          adsetsWithTrackingForTotals.has(ad.adset_id || '') ||
          adsWithTrackingForTotals.has(ad.ad_id || '')
        );
        
        const hasTrackingByName = (
          campaignsWithTrackingForTotals.has(ad.campaign_name || '') ||
          adsetsWithTrackingForTotals.has(ad.adset_name || '') ||
          adsWithTrackingForTotals.has(ad.ad_name || '')
        );
        
        return hasTrackingById || hasTrackingByName;
      }) || [];
      
      const adSpendToday = filteredAdPerformanceTodayForKPIs.reduce((acc, item: any) => {
        return acc + (parseFloat(item.spend) || 0);
      }, 0);

      console.log(`[KPI] Total ad spend calculado: $${totalAdSpend.toFixed(2)}`);
      console.log(`[KPI] Ad spend hoy: $${adSpendToday.toFixed(2)}`);
      console.log(`[KPI] Ads filtrados para KPIs: ${filteredAdPerformanceForKPIs.length}`);

      // Calcular ROAS
      const totalRevenue = totalMainProductRevenue + totalOrderBumpRevenue;
      const roas = totalAdSpend > 0 ? totalRevenue / totalAdSpend : 0;
      const roasToday = adSpendToday > 0 ? revenueToday / adSpendToday : 0;

      // Crear mapa de gasto por fecha para daily stats usando los mismos datos filtrados
      const adSpendByDate = new Map<string, number>();
      filteredAdPerformanceForKPIs.forEach((item: any) => {
        const currentSpend = adSpendByDate.get(item.date) || 0;
        adSpendByDate.set(item.date, currentSpend + (parseFloat(item.spend) || 0));
      });

      // Actualizar daily stats con ad spend y ROAS
      const dailyStatsArrayWithAdSpend = Array.from(dailyStats.values()).map(day => {
        const dayAdSpend = adSpendByDate.get(day.date) || 0;
        const dayRoas = dayAdSpend > 0 ? day.revenue / dayAdSpend : 0;
        return {
          ...day,
          ad_spend: dayAdSpend,
          roas: dayRoas
        };
      }).sort((a, b) => a.date.localeCompare(b.date));

      // ===== NUEVA LÓGICA UTM: BASADA EN AD_PERFORMANCE =====
      console.log('=== CONSTRUYENDO NUEVA TABLA UTM ===');
      
      // Debug de eventos encontrados
      const eventsSummary = {
        total: events.length,
        pageviews: events.filter(e => e.event_type === 'pageview').length,
        hotmart_clicks: events.filter(e => e.event_type === 'hotmart_click').length,
        compra_hotmart: events.filter(e => e.event_type === 'compra_hotmart').length,
        compra_hotmart_orderbump: events.filter(e => e.event_type === 'compra_hotmart_orderbump').length,
        pageviews_with_utm: events.filter(e => e.event_type === 'pageview' && e.event_data?.utm_data).length,
        clicks_with_utm: events.filter(e => e.event_type === 'hotmart_click' && e.event_data?.utm_data).length,
        compras_with_utm: events.filter(e => e.event_type === 'compra_hotmart' && e.event_data?.utm_data).length,
        orderBumps_with_utm: events.filter(e => e.event_type === 'compra_hotmart_orderbump' && e.event_data?.utm_data).length,
      };
      console.log('[EVENTOS] Resumen de eventos encontrados:', eventsSummary);
      
      // Debug específico para casos edge de UTMs
      const utmEdgeCases = {
        utms_with_fallback_dash: events.filter(e => 
          e.event_data?.utm_data && 
          Object.values(e.event_data.utm_data).some((val: any) => val === '-')
        ).length,
        utms_only_ids: events.filter(e => {
          const utm = e.event_data?.utm_data;
          if (!utm) return false;
          // Verificar si algún valor parece ser solo un ID (15+ dígitos)
          return Object.values(utm).some((val: any) => 
            typeof val === 'string' && /^\d{15,}$/.test(val)
          );
        }).length,
        utms_with_ids: events.filter(e => {
          const utm = e.event_data?.utm_data;
          if (!utm) return false;
          // Verificar si algún valor contiene ||
          return Object.values(utm).some((val: any) => 
            typeof val === 'string' && val.includes('||')
          );
        }).length,
      };
      console.log('[UTM EDGE CASES] Casos especiales encontrados:', utmEdgeCases);
      
      // 1. Primero, identificar qué campañas/adsets/ads generaron tracking events para este producto
      const campaignsWithTracking = new Set<string>();
      const adsetsWithTracking = new Set<string>();
      const adsWithTracking = new Set<string>();
      
      events.forEach(event => {
        if (event.event_data?.utm_data) {
          const utmData = event.event_data.utm_data;
          
          // Extraer IDs de los UTMs si están disponibles
          const campaignId = extractUtmId(utmData.utm_campaign || '');
          const adsetId = extractUtmId(utmData.utm_medium || '');
          const adId = extractUtmId(utmData.utm_content || '');
          
          if (campaignId) campaignsWithTracking.add(campaignId);
          if (adsetId) adsetsWithTracking.add(adsetId);
          if (adId) adsWithTracking.add(adId);
          
          // También agregar por nombres para matching secundario
          if (utmData.utm_campaign) campaignsWithTracking.add(utmData.utm_campaign);
          if (utmData.utm_medium) adsetsWithTracking.add(utmData.utm_medium);
          if (utmData.utm_content) adsWithTracking.add(utmData.utm_content);
        }
      });
      
      console.log(`Campañas con tracking: ${campaignsWithTracking.size}`);
      console.log(`Adsets con tracking: ${adsetsWithTracking.size}`);
      console.log(`Ads con tracking: ${adsWithTracking.size}`);
      
      // 2. Obtener campañas, adsets y ads que gastaron en el período
      const { data: adPerformanceForUtm } = await supabase
        .from('ad_performance')
        .select(`
          ad_id,
          campaign_id,
          adset_id,
          ad_name,
          adset_name,
          campaign_name,
          spend,
          date,
          campaign_budget,
          adset_budget
        `)
        .gte('date', adStartUTC)
        .lte('date', adEndUTC)
        .in('product_ad_account_id', productAdAccountIds)
        .gt('spend', 0); // Solo los que gastaron
      
      console.log(`Ads que gastaron (total): ${adPerformanceForUtm?.length || 0}`);
      
      // 3. Filtrar solo los ads que generaron tracking events para este producto
      const filteredAdPerformance = adPerformanceForUtm?.filter(ad => {
        // Verificar por ID exacto (más preciso)
        const hasTrackingById = (
          campaignsWithTracking.has(ad.campaign_id) ||
          adsetsWithTracking.has(ad.adset_id) ||
          adsWithTracking.has(ad.ad_id)
        );
        
        // Verificar por nombre (fallback)
        const hasTrackingByName = (
          campaignsWithTracking.has(ad.campaign_name || '') ||
          adsetsWithTracking.has(ad.adset_name || '') ||
          adsWithTracking.has(ad.ad_name || '')
        );
        
        return hasTrackingById || hasTrackingByName;
      }) || [];
      
              console.log(`Ads filtrados con tracking para este producto: ${filteredAdPerformance.length}`);
        
        // Debug: Mostrar todas las campañas disponibles en ad_performance
        const availableCampaigns = [...new Set(filteredAdPerformance.map(ad => ad.campaign_name))];
        console.log('[AD_PERFORMANCE] Campañas disponibles para matching:', availableCampaigns);
        
        if (filteredAdPerformance.length > 0) {
        // 4. Crear la base de la tabla UTM con las campañas filtradas que gastaron
        const utmBaseStats = new Map();
        
        filteredAdPerformance.forEach(ad => {
          const key = `${ad.campaign_id}|${ad.adset_id}|${ad.ad_id}`;
          
          if (!utmBaseStats.has(key)) {
            // Pasar ambos tipos de presupuesto por separado
            const campaignBudget = parseFloat(ad.campaign_budget) || 0;
            const adsetBudget = parseFloat(ad.adset_budget) || 0;
            
            utmBaseStats.set(key, {
              campaign_id: ad.campaign_id,
              adset_id: ad.adset_id,
              ad_id: ad.ad_id,
              campaign: ad.campaign_name || 'Sin nombre',
              medium: ad.adset_name || 'Sin nombre',
              content: ad.ad_name || 'Sin nombre',
              ad_spend: 0,
              campaign_budget: campaignBudget,
              adset_budget: adsetBudget,
              visits: 0,
              unique_visits: 0,
              clicks: 0,
              unique_clicks: 0,
              purchases: 0,
              order_bumps: 0,
              revenue: 0,
              visitorSet: new Set(),
              clickSet: new Set(),
            });
          }
          
          const stats = utmBaseStats.get(key);
          stats.ad_spend += parseFloat(ad.spend) || 0;
        });
        
        console.log(`Grupos UTM base creados (filtrados): ${utmBaseStats.size}`);
        
        // 5. Mapear tracking events por sesión para rastrear el flujo UTM
        const sessionUtmMap = new Map(); // session_id -> utm_data de la visita
        const clickUtmMap = new Map();   // session_id -> utm_data del click
        
        events.forEach(event => {
          const sessionId = event.session_id || event.visitor_id;
          
          if (event.event_type === 'pageview' && event.event_data?.utm_data) {
            // La visita es la fuente más confiable de UTM
            sessionUtmMap.set(sessionId, event.event_data.utm_data);
          } else if (event.event_type === 'hotmart_click') {
            // El click usa UTM del evento o hereda de la visita
            let clickUtm = event.event_data?.utm_data;
            if (!clickUtm && sessionUtmMap.has(sessionId)) {
              clickUtm = sessionUtmMap.get(sessionId);
            }
            if (clickUtm) {
              clickUtmMap.set(sessionId, clickUtm);
            }
          }
        });
        
        console.log(`Sesiones con UTM de visita: ${sessionUtmMap.size}`);
        console.log(`Sesiones con UTM de click: ${clickUtmMap.size}`);
        
        // 6. Procesar eventos y asignar a las campañas correspondientes
        events.forEach(event => {
          const sessionId = event.session_id || event.visitor_id;
          let utmData = null;
          
          // Determinar qué UTM usar según el tipo de evento
          if (event.event_type === 'pageview') {
            utmData = event.event_data?.utm_data;
          } else if (event.event_type === 'hotmart_click') {
            utmData = event.event_data?.utm_data || sessionUtmMap.get(sessionId);
          } else if (event.event_type === 'compra_hotmart' || event.event_type === 'compra_hotmart_orderbump') {
            // CORREGIDO: Las compras primero usan UTM del propio evento, luego del click, luego de la visita
            utmData = event.event_data?.utm_data || clickUtmMap.get(sessionId) || sessionUtmMap.get(sessionId);
            
            // Debug para ventas
            if (event.event_type === 'compra_hotmart' || event.event_type === 'compra_hotmart_orderbump') {
              console.log(`[VENTA] ${event.event_type} - Session: ${sessionId}`, {
                hasDirectUtm: !!event.event_data?.utm_data,
                hasClickUtm: !!clickUtmMap.get(sessionId),
                hasVisitUtm: !!sessionUtmMap.get(sessionId),
                finalUtm: utmData ? 'SÍ' : 'NO',
                utmCampaign: utmData?.utm_campaign || 'NINGUNA',
                utmMedium: utmData?.utm_medium || 'NINGUNA',
                utmContent: utmData?.utm_content || 'NINGUNA',
              });
            }
          }
          
          if (!utmData) {
            // Debug para eventos sin UTM
            if (event.event_type === 'compra_hotmart' || event.event_type === 'compra_hotmart_orderbump') {
              console.log(`[VENTA SIN UTM] ${event.event_type} - Session: ${sessionId} - NO SE ATRIBUIRÁ`);
            }
            return;
          }
          
          // Buscar matching con ad_performance
          // Primero por IDs exactos
          const campaignId = extractUtmId(utmData.utm_campaign || '');
          const adsetId = extractUtmId(utmData.utm_medium || '');
          const adId = extractUtmId(utmData.utm_content || '');
          
          let matchingKey = null;
          if (campaignId && adsetId && adId) {
            matchingKey = `${campaignId}|${adsetId}|${adId}`;
          }
          
          // Si no hay match por ID, usar la función de matching inteligente
          if (!matchingKey || !utmBaseStats.has(matchingKey)) {
            matchingKey = findCampaignMatch(utmData, utmBaseStats);
          }
          
          // Debug adicional para ventas que fallan en matching
          if ((event.event_type === 'compra_hotmart' || event.event_type === 'compra_hotmart_orderbump') && !matchingKey) {
            const availableCampaignNames = Array.from(utmBaseStats.values()).map(s => s.campaign);
            console.log(`[MATCHING FAILED] ${event.event_type}`, {
              buscando_campaign: utmData.utm_campaign,
              buscando_medium: utmData.utm_medium,
              buscando_content: utmData.utm_content,
              campaigns_disponibles: availableCampaignNames,
              exact_matches: availableCampaignNames.filter(c => c.includes(utmData.utm_campaign?.split('|')[0] || '')),
              total_campaigns_en_tabla: utmBaseStats.size
            });
          }
          
          // Debug del matching para ventas
          if (event.event_type === 'compra_hotmart' || event.event_type === 'compra_hotmart_orderbump') {
            console.log(`[MATCHING] ${event.event_type} - Session: ${sessionId}`, {
              utmCampaign: utmData.utm_campaign,
              utmMedium: utmData.utm_medium,
              utmContent: utmData.utm_content,
              extractedIds: { campaignId, adsetId, adId },
              matchingKeyByIds: campaignId && adsetId && adId ? `${campaignId}|${adsetId}|${adId}` : 'NO',
              matchingKeyFinal: matchingKey || 'NO MATCH',
              utmStatsSize: utmBaseStats.size,
              availableKeys: Array.from(utmBaseStats.keys()).slice(0, 3), // Primeras 3 keys para debug
            });
          }
          
          if (matchingKey && utmBaseStats.has(matchingKey)) {
            const stats = utmBaseStats.get(matchingKey);
            stats.visitorSet.add(event.visitor_id);
            
            if (event.event_type === 'pageview') {
              stats.visits++;
            } else if (event.event_type === 'hotmart_click') {
              stats.clicks++;
              stats.clickSet.add(event.visitor_id);
            } else if (event.event_type === 'compra_hotmart') {
              const price = getEventPrice(event);
              stats.purchases++;
              stats.revenue += price;
              console.log(`[VENTA ATRIBUIDA] compra_hotmart - Campaign: ${stats.campaign} - Revenue: $${price.toFixed(2)}`);
            } else if (event.event_type === 'compra_hotmart_orderbump') {
              const price = getEventPrice(event);
              stats.order_bumps++;
              stats.purchases++; // Contar order bump como compra
              stats.revenue += price;
              console.log(`[ORDER BUMP ATRIBUIDO] orderbump - Campaign: ${stats.campaign} - Revenue: $${price.toFixed(2)}`);
            }
          } else if (event.event_type === 'compra_hotmart' || event.event_type === 'compra_hotmart_orderbump') {
            // Venta que NO se pudo atribuir
            const price = getEventPrice(event);
            console.log(`[VENTA NO ATRIBUIDA] ${event.event_type} - Revenue perdido: $${price.toFixed(2)} - UTM: ${JSON.stringify(utmData)}`);
          }
        });
        
        // 7. Convertir a array final con métricas calculadas
        newUtmStats = Array.from(utmBaseStats.values()).map(stat => {
          stat.unique_visits = stat.visitorSet.size;
          stat.unique_clicks = stat.clickSet.size;
          
          // Limpiar sets antes de retornar
          delete stat.visitorSet;
          delete stat.clickSet;
          
          const roas = stat.ad_spend > 0 ? stat.revenue / stat.ad_spend : 0;
          
          return {
            ...stat,
            campaign: cleanUtmName(stat.campaign),
            medium: cleanUtmName(stat.medium),
            content: cleanUtmName(stat.content),
            campaign_raw: stat.campaign,
            medium_raw: stat.medium,
            content_raw: stat.content,
            campaign_budget: stat.campaign_budget || 0,
            adset_budget: stat.adset_budget || 0,
            roas,
            conversion_rate: stat.visits > 0 ? (stat.purchases / stat.visits) * 100 : 0,
            unique_conversion_rate: stat.unique_visits > 0 ? (stat.purchases / stat.unique_visits) * 100 : 0,
            persuasion_rate: stat.visits > 0 ? (stat.clicks / stat.visits) * 100 : 0,
            unique_persuasion_rate: stat.unique_visits > 0 ? (stat.unique_clicks / stat.unique_visits) * 100 : 0,
            checkout_conversion_rate: stat.clicks > 0 ? (stat.purchases / stat.clicks) * 100 : 0,
            unique_checkout_conversion_rate: stat.unique_clicks > 0 ? (stat.purchases / stat.unique_clicks) * 100 : 0,
            order_bump_rate: stat.purchases > 0 ? (stat.order_bumps / stat.purchases) * 100 : 0,
          };
        }).sort((a, b) => b.ad_spend - a.ad_spend); // Ordenar por gasto
        
        console.log(`Tabla UTM final creada con ${newUtmStats.length} elementos`);
        console.log(`Total purchases en nueva tabla: ${newUtmStats.reduce((acc, utm) => acc + utm.purchases, 0)}`);
        console.log(`Total order bumps en nueva tabla: ${newUtmStats.reduce((acc, utm) => acc + utm.order_bumps, 0)}`);
      } else {
        newUtmStats = [];
        console.log('No hay datos de ad_performance para construir tabla UTM');
      }

      // ===== LOGS DE DEBUG PARA VENTAS =====
      console.log('=== SALES DEBUG INFO ===');
      console.log(`Total purchases found in events: ${totalPurchases}`);
      console.log(`  - Ventas principales: ${totalMainPurchases}`);
      console.log(`  - Order bumps: ${totalOrderBumpPurchases}`);
      console.log(`All purchases array length: ${allPurchases.length}`);
      console.log(`Query range (local): ${startDate} to ${endDate}`);
      console.log(`Query range (UTC): ${startUTC} to ${endUTC}`);
      console.log(`User timezone: ${timezone}`);
      
      if (allPurchases.length > 0) {
        // Ordenar por fecha
        const sortedPurchases = [...allPurchases].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        console.log('PRIMERA VENTA:');
        console.log(`  Timestamp UTC: ${sortedPurchases[0].timestamp}`);
        console.log(`  Hora local: ${sortedPurchases[0].localTime}`);
        console.log(`  Tipo: ${sortedPurchases[0].eventType}`);
        console.log(`  Tiene UTM: ${sortedPurchases[0].hasUtm}`);
        
        console.log('ÚLTIMA VENTA:');
        const lastIndex = sortedPurchases.length - 1;
        console.log(`  Timestamp UTC: ${sortedPurchases[lastIndex].timestamp}`);
        console.log(`  Hora local: ${sortedPurchases[lastIndex].localTime}`);
        console.log(`  Tipo: ${sortedPurchases[lastIndex].eventType}`);
        console.log(`  Tiene UTM: ${sortedPurchases[lastIndex].hasUtm}`);
        
        // Contar ventas con y sin UTM
        const ventasConUtm = allPurchases.filter(p => p.hasUtm).length;
        const ventasSinUtm = allPurchases.filter(p => !p.hasUtm).length;
        const ventasPrincipales = allPurchases.filter(p => p.eventType === 'compra_hotmart').length;
        const ventasOrderBump = allPurchases.filter(p => p.eventType === 'compra_hotmart_orderbump').length;
        
        console.log(`Ventas CON UTM: ${ventasConUtm}`);
        console.log(`Ventas SIN UTM: ${ventasSinUtm}`);
        console.log(`Ventas por tipo:`);
        console.log(`  - Principales: ${ventasPrincipales}`);
        console.log(`  - Order bumps: ${ventasOrderBump}`);
      }
      
      // Usar la nueva tabla UTM
      const finalUtmStats = newUtmStats;
      const totalUtmPurchases = finalUtmStats.reduce((acc: number, utm: any) => acc + utm.purchases, 0);
      const totalUtmOrderBumps = finalUtmStats.reduce((acc: number, utm: any) => acc + utm.order_bumps, 0);
      const totalUtmAdSpend = finalUtmStats.reduce((acc: number, utm: any) => acc + utm.ad_spend, 0);
      const totalUtmRevenue = finalUtmStats.reduce((acc: number, utm: any) => acc + utm.revenue, 0);
      
              console.log(`=== COMPARACIÓN FINAL KPIs vs UTM ===`);
        console.log(`[KPI] Total ad spend: $${totalAdSpend.toFixed(2)}`);
        console.log(`[UTM] Total ad spend: $${totalUtmAdSpend.toFixed(2)}`);
        console.log(`[DIFF] Diferencia: $${Math.abs(totalAdSpend - totalUtmAdSpend).toFixed(2)}`);
        console.log(`[KPI] Total revenue: $${totalRevenue.toFixed(2)}`);
        console.log(`[UTM] Total revenue: $${totalUtmRevenue.toFixed(2)}`);
        console.log(`[DIFF] Diferencia revenue: $${Math.abs(totalRevenue - totalUtmRevenue).toFixed(2)}`);
        console.log(`[KPI] Total purchases: ${totalPurchases}`);
        console.log(`[UTM] Total purchases: ${totalUtmPurchases}`);
        console.log(`[DIFF] Diferencia purchases: ${Math.abs(totalPurchases - totalUtmPurchases)}`);
        console.log(`[KPI] ROAS: ${roas.toFixed(2)}x`);
        console.log(`[UTM] ROAS: ${totalUtmAdSpend > 0 ? (totalUtmRevenue / totalUtmAdSpend).toFixed(2) : 0}x`);
        console.log(`=== ANÁLISIS DE ATRIBUCIÓN ===`);
        console.log(`[ATRIBUCIÓN] Revenue atribuido a UTMs: $${totalUtmRevenue.toFixed(2)} de $${totalRevenue.toFixed(2)}`);
        console.log(`[ATRIBUCIÓN] Porcentaje atribuido: ${totalRevenue > 0 ? ((totalUtmRevenue / totalRevenue) * 100).toFixed(1) : 0}%`);
        console.log(`[ATRIBUCIÓN] Revenue perdido (sin atribuir): $${(totalRevenue - totalUtmRevenue).toFixed(2)}`);
        console.log(`[ATRIBUCIÓN] Purchases atribuidas: ${totalUtmPurchases} de ${totalPurchases}`);
        console.log(`[ATRIBUCIÓN] Purchases perdidas: ${totalPurchases - totalUtmPurchases}`);
        console.log(`=============================`);

      setData({
        total_visits: totalVisits,
        unique_visits: uniqueVisitors.size,
        total_clicks: totalClicks,
        unique_clicks: uniqueClicks.size,
        total_purchases: totalPurchases,
        total_order_bumps: totalOrderBumps,
        conversion_rate: totalVisits > 0 ? (totalPurchases / totalVisits) * 100 : 0,
        unique_conversion_rate: uniqueVisitors.size > 0 ? (totalPurchases / uniqueVisitors.size) * 100 : 0,
        persuasion_rate: totalVisits > 0 ? (totalClicks / totalVisits) * 100 : 0,
        unique_persuasion_rate: uniqueVisitors.size > 0 ? (uniqueClicks.size / uniqueVisitors.size) * 100 : 0,
        order_bump_rate: totalPurchases > 0 ? (totalOrderBumps / totalPurchases) * 100 : 0,
        total_main_product_revenue: totalMainProductRevenue,
        total_order_bump_revenue: totalOrderBumpRevenue,
        total_revenue: totalRevenue,
        revenue_today: revenueToday,
        total_ad_spend: totalAdSpend,
        ad_spend_today: adSpendToday,
        roas: roas,
        roas_today: roasToday,
        utm_stats: finalUtmStats,
        daily_stats: dailyStatsArrayWithAdSpend,
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
      'Compras': utm.purchases,
      'Order Bumps': utm.order_bumps,
      'Ingresos ($)': utm.revenue.toFixed(2),
      'Gasto Publicitario ($)': utm.ad_spend.toFixed(2),
      'Presupuesto Campaña ($)': (utm.campaign_budget || 0).toFixed(2),
      'Presupuesto Adset ($)': (utm.adset_budget || 0).toFixed(2),
      'ROAS': utm.roas.toFixed(2),
      'Conversión (%)': (showUnique ? utm.unique_conversion_rate : utm.conversion_rate).toFixed(2),
      'Persuasión (%)': (showUnique ? utm.unique_persuasion_rate : utm.persuasion_rate).toFixed(2),
      'Tasa Order Bump (%)': utm.order_bump_rate.toFixed(2),
    }));
    const utmSheet = XLSX.utils.json_to_sheet(utmData);
    XLSX.utils.book_append_sheet(workbook, utmSheet, 'UTMs');

    const dailyData = data.daily_stats.map((day) => ({
      'Fecha': day.date,
      'Visitas': showUnique ? day.unique_visits : day.visits,
      'Pagos Iniciados': showUnique ? day.unique_clicks : day.clicks,
      'Compras': day.purchases,
      'Order Bumps': day.order_bumps,
      'Ingresos ($)': day.revenue.toFixed(2),
      'Gasto Publicitario ($)': day.ad_spend.toFixed(2),
      'ROAS': day.roas.toFixed(2),
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
        roasChampions: [],
      };
    }
  
    const campaignsWithRevenue = data.utm_stats.filter(utm => utm.revenue > 0);
    const campaignsWithClicks = data.utm_stats.filter(utm => utm.clicks > 0);
    const campaignsWithAdSpend = data.utm_stats.filter(utm => utm.ad_spend > 0);
  
    const moneyMachines = [...campaignsWithRevenue]
      .sort((a, b) => b.revenue - a.revenue);
  
    const hiddenGems = [...campaignsWithRevenue]
      .filter(utm => utm.purchases > 0)
      .map(utm => ({ ...utm, aov: utm.revenue / utm.purchases }))
      .sort((a, b) => b.aov - a.aov);
  
    const leakyFaucets = campaignsWithClicks
      .filter(utm => utm.purchases === 0)
      .sort((a, b) => b.clicks - a.clicks);
  
    const wastedAdSpend = data.utm_stats
      .filter(utm => utm.visits > 0 && utm.clicks === 0)
      .sort((a, b) => b.visits - a.visits);

    const roasChampions = [...campaignsWithAdSpend]
      .filter(utm => utm.roas > 0)
      .sort((a, b) => b.roas - a.roas);
  
    return { moneyMachines, hiddenGems, leakyFaucets, wastedAdSpend, roasChampions };
  }, [data]);

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
      // Crear clave compuesta para evitar mezclar elementos con el mismo nombre
      let groupKey: string;
      let displayName: string;
      let id: string | null = null;
      let parentName: string | undefined;
      let grandParentName: string | undefined;

      if (key === 'campaign') {
        id = utm.campaign_id;
        if (!id) return;
        groupKey = id;
        displayName = utm.campaign || 'none';
      } else if (key === 'medium') {
        id = utm.adset_id;
        if (!id) return;
        groupKey = id;
        displayName = utm.medium || 'none';
        parentName = utm.campaign;
      } else { // content
        id = utm.ad_id;
        if (!id) return;
        groupKey = id;
        displayName = utm.content || 'none';
        parentName = utm.medium;
        grandParentName = utm.campaign;
      }
      
      if (!grouped.has(groupKey)) {
        grouped.set(groupKey, {
          id: id,
          name: displayName,
          parentName: parentName,
          grandParentName: grandParentName,
          fullKey: groupKey, // Guardar la clave completa para debugging
          visits: 0,
          unique_visits: 0,
          clicks: 0,
          unique_clicks: 0,
          purchases: 0,
          order_bumps: 0,
          revenue: 0,
          ad_spend: 0,
          campaign_budget_values: [],
          adset_budget_values: [],
          budget_display: '',
          budget_value: 0
        });
      }
      
      const stats = grouped.get(groupKey);
      stats.visits += utm.visits;
      stats.unique_visits += utm.unique_visits;
      stats.clicks += utm.clicks;
      stats.unique_clicks += utm.unique_clicks;
      stats.purchases += utm.purchases;
      stats.order_bumps += utm.order_bumps;
      stats.revenue += utm.revenue;
      stats.ad_spend += utm.ad_spend;
      
      // Recolectar valores de presupuesto
      if (utm.campaign_budget > 0) {
        stats.campaign_budget_values.push(utm.campaign_budget);
      }
      if (utm.adset_budget > 0) {
        stats.adset_budget_values.push(utm.adset_budget);
      }
    });

    // Procesar presupuestos y determinar qué mostrar según el nivel
    Array.from(grouped.values()).forEach(stat => {
      const campaignBudget = stat.campaign_budget_values.length > 0 ? Math.max(...stat.campaign_budget_values) : 0;
      const adsetBudget = stat.adset_budget_values.length > 0 ? Math.max(...stat.adset_budget_values) : 0;
      
      if (key === 'campaign') {
        // En tabla de CAMPAÑAS
        if (campaignBudget > 0) {
          stat.budget_display = `$${campaignBudget.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
          stat.budget_value = campaignBudget;
        } else if (adsetBudget > 0) {
          stat.budget_display = 'Presupuesto ABO';
          stat.budget_value = 0; // Para ordenamiento
        } else {
          stat.budget_display = 'Sin presupuesto';
          stat.budget_value = 0;
        }
      } else if (key === 'medium') {
        // En tabla de CONJUNTOS (medium)
        if (adsetBudget > 0) {
          stat.budget_display = `$${adsetBudget.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
          stat.budget_value = adsetBudget;
        } else if (campaignBudget > 0) {
          stat.budget_display = 'Presupuesto CBO';
          stat.budget_value = 0; // Para ordenamiento
        } else {
          stat.budget_display = 'Sin presupuesto';
          stat.budget_value = 0;
        }
      } else {
        // En tabla de ANUNCIOS (content)
        const totalBudget = adsetBudget || campaignBudget || 0;
        if (totalBudget > 0) {
          stat.budget_display = `$${totalBudget.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
          stat.budget_value = totalBudget;
        } else {
          stat.budget_display = 'Sin presupuesto';
          stat.budget_value = 0;
        }
      }
      
      // Limpiar arrays temporales
      delete stat.campaign_budget_values;
      delete stat.adset_budget_values;
    });

    return Array.from(grouped.values()).map(stat => ({
      ...stat,
      roas: stat.ad_spend > 0 ? stat.revenue / stat.ad_spend : 0,
      conversion_rate: stat.visits > 0 ? (stat.purchases / stat.visits) * 100 : 0,
      unique_conversion_rate: stat.unique_visits > 0 ? (stat.purchases / stat.unique_visits) * 100 : 0,
      persuasion_rate: stat.clicks > 0 ? (stat.clicks / stat.visits) * 100 : 0,
      unique_persuasion_rate: stat.unique_visits > 0 ? (stat.unique_clicks / stat.unique_visits) * 100 : 0,
      checkout_conversion_rate: stat.clicks > 0 ? (stat.purchases / stat.clicks) * 100 : 0,
      unique_checkout_conversion_rate: stat.unique_clicks > 0 ? (stat.purchases / stat.unique_clicks) * 100 : 0,
      order_bump_rate: stat.purchases > 0 ? (stat.order_bumps / stat.purchases) * 100 : 0,
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
        ...day
    }));
  }, [data?.daily_stats, showUnique]);

  const handleOpenModal = async (item: any, type: 'campaign' | 'adset' | 'ad') => {
    // Replicar la lógica de atribución completa para obtener datos diarios precisos
    
    // 1. Recrear el mapa base de UTMs desde el performance de anuncios
    const campaignsWithTracking = new Set<string>();
    const adsetsWithTracking = new Set<string>();
    const adsWithTracking = new Set<string>();
    
    rawEvents.forEach(event => {
      if (event.event_data?.utm_data) {
        const utmData = event.event_data.utm_data;
        const campaignId = extractUtmId(utmData.utm_campaign || '');
        const adsetId = extractUtmId(utmData.utm_medium || '');
        const adId = extractUtmId(utmData.utm_content || '');
        if (campaignId) campaignsWithTracking.add(campaignId);
        if (adsetId) adsetsWithTracking.add(adsetId);
        if (adId) adsWithTracking.add(adId);
        if (utmData.utm_campaign) campaignsWithTracking.add(utmData.utm_campaign);
        if (utmData.utm_medium) adsetsWithTracking.add(utmData.utm_medium);
        if (utmData.utm_content) adsWithTracking.add(utmData.utm_content);
      }
    });

    const filteredAdPerformance = rawAdPerformance.filter(ad => {
      const hasTrackingById = (
        campaignsWithTracking.has(ad.campaign_id) ||
        adsetsWithTracking.has(ad.adset_id) ||
        adsWithTracking.has(ad.ad_id)
      );
      const hasTrackingByName = (
        campaignsWithTracking.has(ad.campaign_name || '') ||
        adsetsWithTracking.has(ad.adset_name || '') ||
        adsWithTracking.has(ad.ad_name || '')
      );
      return hasTrackingById || hasTrackingByName;
    });

    const utmBaseStats = new Map();
    filteredAdPerformance.forEach(ad => {
        const key = `${ad.campaign_id}|${ad.adset_id}|${ad.ad_id}`;
        if (!utmBaseStats.has(key)) {
            utmBaseStats.set(key, {
                campaign_id: ad.campaign_id,
                adset_id: ad.adset_id,
                ad_id: ad.ad_id,
                campaign: ad.campaign_name || 'Sin nombre',
                medium: ad.adset_name || 'Sin nombre',
                content: ad.ad_name || 'Sin nombre',
            });
        }
    });

    // 2. Recrear mapas de sesión y click para atribución
    const sessionUtmMap = new Map();
    const clickUtmMap = new Map();
    rawEvents.forEach(event => {
      const sessionId = event.session_id || event.visitor_id;
      if (event.event_type === 'pageview' && event.event_data?.utm_data) {
        sessionUtmMap.set(sessionId, event.event_data.utm_data);
      } else if (event.event_type === 'hotmart_click') {
        let clickUtm = event.event_data?.utm_data;
        if (!clickUtm && sessionUtmMap.has(sessionId)) {
          clickUtm = sessionUtmMap.get(sessionId);
        }
        if (clickUtm) {
          clickUtmMap.set(sessionId, clickUtm);
        }
      }
    });

    // 3. Filtrar eventos de compra usando la lógica de matching completa
    const purchaseEvents = rawEvents.filter(e => 
      e.event_type === 'compra_hotmart' || e.event_type === 'compra_hotmart_orderbump'
    );

    const relevantEvents = purchaseEvents.filter(e => {
        const sessionId = e.session_id || e.visitor_id;
        const utmData = e.event_data?.utm_data || clickUtmMap.get(sessionId) || sessionUtmMap.get(sessionId);
        if (!utmData) return false;

        const campaignId = extractUtmId(utmData.utm_campaign || '');
        const adsetId = extractUtmId(utmData.utm_medium || '');
        const adId = extractUtmId(utmData.utm_content || '');
        
        let matchingKey = null;
        if (campaignId && adsetId && adId) {
          matchingKey = `${campaignId}|${adsetId}|${adId}`;
        }
        if (!matchingKey || !utmBaseStats.has(matchingKey)) {
          matchingKey = findCampaignMatch(utmData, utmBaseStats);
        }

        if (!matchingKey || !utmBaseStats.has(matchingKey)) return false;

        const matchedStats = utmBaseStats.get(matchingKey);

        if (type === 'campaign') {
            return matchedStats.campaign_id === item.id;
        }
        if (type === 'adset') {
            return matchedStats.adset_id === item.id;
        }
        if (type === 'ad') {
            return matchedStats.ad_id === item.id;
        }
        return false;
    });
    
    // 4. Filtrar datos de performance de anuncios
    const relevantAdPerformance = rawAdPerformance.filter(p => {
        if (type === 'campaign') return p.campaign_id === item.id;
        if (type === 'adset') return p.adset_id === item.id;
        if (type === 'ad') return p.ad_id === item.id;
        return false;
    });

    // 5. Crear mapa de datos diarios
    const dailyDataMap = new Map<string, { date: string; spend: number; sales: number; revenue: number }>();

    relevantAdPerformance.forEach(p => {
        const date = p.date;
        if (!dailyDataMap.has(date)) {
            dailyDataMap.set(date, { date, spend: 0, sales: 0, revenue: 0 });
        }
        const dayData = dailyDataMap.get(date)!;
        dayData.spend += parseFloat(p.spend) || 0;
    });

    relevantEvents.forEach(e => {
        const date = formatDateToTimezone(e.created_at, timezone).split(' ')[0];
        if (!dailyDataMap.has(date)) {
            dailyDataMap.set(date, { date, spend: 0, sales: 0, revenue: 0 });
        }
        const dayData = dailyDataMap.get(date)!;
        dayData.sales += 1;
        dayData.revenue += getEventPrice(e);
    });

    // 6. Calcular métricas y crear item para el modal
    const dailyDataForModal = Array.from(dailyDataMap.values()).map(d => {
        const profit = d.revenue - d.spend;
        const roas = d.spend > 0 ? d.revenue / d.spend : 0;
        return { ...d, profit, roas, revenue: d.revenue };
    }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const totals = dailyDataForModal.reduce((acc, day) => {
        acc.totalSpend += day.spend;
        acc.totalSales += day.sales;
        acc.totalProfit += day.profit;
        acc.totalRevenue += day.revenue;
        return acc;
    }, { totalSpend: 0, totalSales: 0, totalProfit: 0, totalRevenue: 0 });

    const avgRoas = totals.totalSpend > 0 ? totals.totalRevenue / totals.totalSpend : 0;
    const roasValues = dailyDataForModal.map(d => d.roas).filter(r => isFinite(r) && r > 0);
    const maxRoas = roasValues.length > 0 ? Math.max(...roasValues) : 0;
    const minRoas = roasValues.length > 0 ? Math.min(...roasValues) : 0;

    const modalItem: ModalItem = {
        id: item.id,
        name: item.name,
        parentName: item.parentName,
        grandParentName: item.grandParentName,
        type: type,
        totalSales: totals.totalSales,
        avgRoas: avgRoas,
        maxRoas: maxRoas,
        minRoas: minRoas,
        totalSpend: totals.totalSpend,
        totalProfit: totals.totalProfit,
        dailyData: dailyDataForModal,
        status: 'ACTIVE', 
        lastWeekRoas: 0,
    };

    setSelectedItem(modalItem);
    setIsModalOpen(true);
};

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

  const aov = data.total_purchases > 0 ? data.total_revenue / data.total_purchases : 0;
  const mainProductPurchases = data.total_purchases - data.total_order_bumps;
  const rpv = showUnique 
    ? (data.unique_visits > 0 ? data.total_revenue / data.unique_visits : 0)
    : (data.total_visits > 0 ? data.total_revenue / data.total_visits : 0);

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

      {/* KPIs Principales */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        {/* Ingresos */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 flex flex-col justify-between">
          <div>
            <p className="text-sm font-medium text-gray-600 mb-1">Ingresos Totales</p>
            <h3 className="text-3xl font-bold text-gray-900">
              ${data.total_revenue.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h3>
          </div>
          <div className="mt-4 pt-4 border-t border-gray-100 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-green-700 font-semibold">Principal:</span>
              <span className="font-bold text-gray-800">${data.total_main_product_revenue.toLocaleString('es-ES', { maximumFractionDigits: 0 })}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-orange-600 font-semibold">Order Bumps:</span>
              <span className="font-bold text-gray-800">${data.total_order_bump_revenue.toLocaleString('es-ES', { maximumFractionDigits: 0 })}</span>
            </div>
          </div>
        </div>

        {/* Beneficios */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 flex flex-col justify-between">
          <div>
            <p className="text-sm font-medium text-gray-600 mb-1">Beneficio Neto</p>
            <h3 className={`text-3xl font-bold ${(data.total_revenue - data.total_ad_spend) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              ${(data.total_revenue - data.total_ad_spend).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h3>
          </div>
          <div className="mt-4 pt-4 border-t border-gray-100 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Gasto Pub.:</span>
              <span className="font-semibold text-red-600">${data.total_ad_spend.toLocaleString('es-ES', { maximumFractionDigits: 2 })}</span>
            </div>
             <div className="flex justify-between text-sm">
              <span className="text-gray-600">Margen:</span>
              <span className="font-semibold text-gray-800">{(data.total_revenue > 0 ? ((data.total_revenue - data.total_ad_spend) / data.total_revenue * 100) : 0).toFixed(1)}%</span>
            </div>
          </div>
        </div>

        {/* ROAS */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-baseline">
              <p className="text-sm font-medium text-gray-600 mb-1">ROAS Total</p>
              <div className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  data.roas >= 3 ? 'bg-green-100 text-green-800' : 
                  data.roas >= 2 ? 'bg-yellow-100 text-yellow-800' : 
                  'bg-red-100 text-red-800'
                }`}>
                  {data.roas >= 3 ? 'Excelente' : data.roas >= 2 ? 'Bueno' : 'Crítico'}
                </div>
            </div>
            <h3 className="text-3xl font-bold text-gray-900">{data.roas.toFixed(2)}x</h3>
          </div>
          <div className="mt-4 pt-4 border-t border-gray-100 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-purple-700 font-semibold">ROAS Principal:</span>
              <span className="font-bold text-gray-800">{(data.total_ad_spend > 0 ? data.total_main_product_revenue / data.total_ad_spend : 0).toFixed(2)}x</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-indigo-700 font-semibold">ROAS Total:</span>
              <span className="font-bold text-gray-800">{data.roas.toFixed(2)}x</span>
            </div>
          </div>
        </div>
        
        {/* Costos Clave */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 flex flex-col justify-between">
          <div>
            <p className="text-sm font-medium text-gray-600 mb-1">CPA (Principal)</p>
            <h3 className="text-3xl font-bold text-gray-900">
              ${(mainProductPurchases > 0 ? data.total_ad_spend / mainProductPurchases : 0).toFixed(2)}
            </h3>
          </div>
          <div className="mt-4 pt-4 border-t border-gray-100 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">CPV:</span>
              <span className="font-semibold text-gray-800">
                ${((showUnique ? data.unique_visits : data.total_visits) > 0 ? data.total_ad_spend / (showUnique ? data.unique_visits : data.total_visits) : 0).toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Costo / Click:</span>
              <span className="font-semibold text-gray-800">
                ${((showUnique ? data.unique_clicks : data.total_clicks) > 0 ? data.total_ad_spend / (showUnique ? data.unique_clicks : data.total_clicks) : 0).toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* KPIs de Rendimiento */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden mb-6">
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Métricas de Rendimiento</h3>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6">
            {/* Visitas */}
            <div className="text-center">
              <div className="flex items-center justify-center mb-3">
                <div className="p-3 bg-blue-50 rounded-lg">
                  <Users className="h-6 w-6 text-blue-600" />
                </div>
              </div>
              <p className="text-xs font-medium text-gray-500 mb-2">Visitas {showUnique ? 'Únicas' : 'Totales'}</p>
              <h3 className="text-2xl font-bold text-gray-900 mb-1">
                {(showUnique ? data.unique_visits : data.total_visits).toLocaleString()}
              </h3>
                             <p className="text-sm font-medium text-blue-600">
                 CPV: ${((showUnique ? data.unique_visits : data.total_visits) > 0 ? data.total_ad_spend / (showUnique ? data.unique_visits : data.total_visits) : 0).toFixed(2)}
               </p>
            </div>

            {/* Pagos Iniciados */}
            <div className="text-center">
              <div className="flex items-center justify-center mb-3">
                <div className="p-3 bg-green-50 rounded-lg">
                  <BarChartIcon className="h-6 w-6 text-green-600" />
                </div>
              </div>
              <p className="text-xs font-medium text-gray-500 mb-2">Pagos Iniciados {showUnique ? 'Únicos' : 'Totales'}</p>
              <h3 className="text-2xl font-bold text-gray-900 mb-1">
                {(showUnique ? data.unique_clicks : data.total_clicks).toLocaleString()}
              </h3>
                             <p className="text-sm font-medium text-green-600">
                 Persuasión: {((showUnique ? data.unique_clicks : data.total_clicks) / (showUnique ? data.unique_visits : data.total_visits) * 100).toFixed(1)}%
               </p>
            </div>

            {/* Compras */}
            <div className="text-center">
              <div className="flex items-center justify-center mb-3">
                <div className="p-3 bg-purple-50 rounded-lg">
                  <DollarSign className="h-6 w-6 text-purple-600" />
                </div>
              </div>
              <p className="text-xs font-medium text-gray-500 mb-2">Compras Totales</p>
              <h3 className="text-2xl font-bold text-gray-900 mb-1">
                {data.total_purchases.toLocaleString()}
              </h3>
                             <div className="text-sm space-y-1 mt-2">
                 <p className="text-purple-600 font-semibold">Principal: {data.total_purchases - data.total_order_bumps}</p>
                 <p className="text-orange-600 font-semibold">Order Bump: {data.total_order_bumps}</p>
               </div>
            </div>

            {/* Tasa de Conversión */}
            <div className="text-center">
              <div className="flex items-center justify-center mb-3">
                <div className="p-3 bg-yellow-50 rounded-lg">
                  <LineChartIcon className="h-6 w-6 text-yellow-600" />
                </div>
              </div>
              <p className="text-xs font-medium text-gray-500 mb-2">Tasa de Conversión</p>
              <h3 className="text-2xl font-bold text-gray-900 mb-1">
                {(showUnique ? data.unique_conversion_rate : data.conversion_rate).toFixed(2)}%
              </h3>
                             <p className="text-sm font-medium text-yellow-600">
                 Checkout: {((showUnique ? data.unique_clicks : data.total_clicks) > 0 ? (data.total_purchases / (showUnique ? data.unique_clicks : data.total_clicks) * 100) : 0).toFixed(1)}%
               </p>
            </div>

            {/* AOV y Order Bump */}
            <div className="text-center">
              <div className="flex items-center justify-center mb-3">
                <div className="p-3 bg-indigo-50 rounded-lg">
                  <TrendingUp className="h-6 w-6 text-indigo-600" />
                </div>
              </div>
              <p className="text-xs font-medium text-gray-500 mb-2">Valor Promedio</p>
              <h3 className="text-2xl font-bold text-gray-900 mb-1">
                ${aov.toFixed(0)}
              </h3>
                             <p className="text-sm font-medium text-indigo-600">
                 OB Rate: {data.order_bump_rate.toFixed(1)}%
               </p>
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
            <ComposedChart data={chartData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
              <defs>
                <linearGradient id="colorVisits" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#FFFFFF" stopOpacity={0.1}/>
                </linearGradient>
                <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#FFFFFF" stopOpacity={0.1}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="left" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis 
                yAxisId="right" 
                orientation="right" 
                tick={{ fontSize: 12 }} 
                axisLine={false} tickLine={false} 
                tickFormatter={(value) => `$${new Intl.NumberFormat('es-ES', { notation: "compact", compactDisplay: "short" }).format(value as number)}`} 
              >
                <Label value="Ingresos" angle={-90} position="insideRight" style={{ textAnchor: 'middle', fill: '#6b7280' }} />
              </YAxis>
              <Tooltip content={<CustomTooltip showUnique={showUnique} />} />
              <Legend verticalAlign="top" wrapperStyle={{ top: -10 }}/>
              <Area yAxisId="left" type="monotone" dataKey={showUnique ? 'unique_visits' : 'visits'} name={`Visitas ${showUnique ? 'Únicas' : 'Totales'}`} fill="url(#colorVisits)" stroke="#3B82F6" strokeWidth={2} />
              <Line yAxisId="left" type="monotone" dataKey={showUnique ? 'unique_clicks' : 'clicks'} name={`Pagos Iniciados ${showUnique ? 'Únicos' : 'Totales'}`} stroke="#10B981" strokeWidth={2} dot={false} />
              <Line yAxisId="left" type="monotone" dataKey="purchases" name="Compras" stroke="#8B5CF6" strokeWidth={2.5} />
              <Line yAxisId="left" type="monotone" dataKey="order_bumps" name="Order Bumps" stroke="#F97316" strokeWidth={2.5} />
              <Line 
                yAxisId="right" 
                type="monotone" 
                dataKey="revenue" 
                name="💰 Ingresos ($)" 
                stroke="#059669" 
                strokeWidth={4} 
                dot={{ r: 6, strokeWidth: 3, fill: '#059669', stroke: '#fff' }} 
                activeDot={{ r: 8, strokeWidth: 3, fill: '#059669', stroke: '#fff' }} 
                strokeDasharray="none"
              />
              <Line 
                yAxisId="right" 
                type="monotone" 
                dataKey="ad_spend" 
                name="📈 Gasto Publicitario ($)" 
                stroke="#DC2626" 
                strokeWidth={3} 
                dot={{ r: 4, strokeWidth: 2, fill: '#DC2626', stroke: '#fff' }} 
                activeDot={{ r: 6, strokeWidth: 2, fill: '#DC2626', stroke: '#fff' }} 
                strokeDasharray="5 5"
              />
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
                   {/* Conector a Ingresos */}
                   <div className="ml-8 pl-1 flex items-center" style={{ minHeight: '40px' }}>
                    <div className="w-px h-full bg-gray-300 mr-4"></div>
                    <div className="text-xs text-emerald-600 font-semibold bg-emerald-50 px-2 py-1 rounded-full">
                      ${(aov).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / compra
                    </div>
                  </div>
                  {/* Etapa 4: Ingresos */}
                  <div className="flex items-center">
                    <div className="flex-shrink-0 bg-emerald-100 rounded-lg w-16 h-16 flex items-center justify-center">
                      <TrendingUp className="w-8 h-8 text-emerald-600" />
                    </div>
                    <div className="ml-4">
                      <p className="text-lg font-bold text-gray-900">${(data.total_revenue).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                      <p className="text-sm text-gray-500">Ingresos Totales</p>
                    </div>
                  </div>
                  {/* Separador visual para gasto publicitario */}
                  <div className="ml-8 pl-1 flex items-center" style={{ minHeight: '40px' }}>
                    <div className="w-px h-full bg-red-300 mr-4"></div>
                    <div className="text-xs text-red-600 font-semibold bg-red-50 px-2 py-1 rounded-full">
                      ROAS: {data.roas.toFixed(2)}x
                    </div>
                  </div>
                  {/* Etapa 5: Gasto Publicitario */}
                  <div className="flex items-center">
                    <div className="flex-shrink-0 bg-red-100 rounded-lg w-16 h-16 flex items-center justify-center">
                      <TrendingDown className="w-8 h-8 text-red-600" />
                    </div>
                    <div className="ml-4">
                      <p className="text-lg font-bold text-gray-900">${(data.total_ad_spend).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                      <p className="text-sm text-gray-500">Gasto Publicitario</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Resumen Global */}
              <div className="bg-white p-6 rounded-xl shadow-sm border space-y-6">
                <h3 className="text-xl font-bold text-gray-900">Métricas Clave</h3>
                <div className="grid grid-cols-2 gap-x-6 gap-y-6">
                    <div>
                      <p className="text-sm font-medium text-gray-500">ROAS Total</p>
                      <p className="text-3xl font-bold text-purple-600">{data.roas.toFixed(2)}x</p>
                      <p className="text-xs text-gray-400">
                        {data.roas >= 3 ? '🟢 Excelente' : data.roas >= 2 ? '🟡 Bueno' : '🔴 Mejorar'}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-500">Conversión General</p>
                      <p className="text-3xl font-bold text-indigo-600">{(showUnique ? data.unique_conversion_rate : data.conversion_rate).toFixed(2)}%</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-500">Gasto / Visita (CPV)</p>
                      <p className="text-3xl font-bold text-red-600">${((showUnique ? data.unique_visits : data.total_visits) > 0 ? data.total_ad_spend / (showUnique ? data.unique_visits : data.total_visits) : 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-500">Ingreso / Compra (AOV)</p>
                      <p className="text-3xl font-bold text-emerald-600">${aov.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-500">Beneficio Neto</p>
                      <p className="text-3xl font-bold text-green-600">${(data.total_revenue - data.total_ad_spend).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-500">Margen de Beneficio</p>
                      <p className="text-3xl font-bold text-blue-600">{(data.total_revenue > 0 ? ((data.total_revenue - data.total_ad_spend) / data.total_revenue * 100) : 0).toFixed(2)}%</p>
                    </div>
                </div>
              </div>
            </div>

            {/* Fila 2: Métricas de Rentabilidad */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
              <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center">
                <Target className="h-6 w-6 text-purple-600 mr-3" />
                Análisis de Rentabilidad
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* ROAS y Rentabilidad */}
                <div className="bg-gradient-to-br from-purple-50 to-indigo-50 p-6 rounded-lg border border-purple-200">
                  <h4 className="text-lg font-semibold text-gray-800 mb-4">ROAS y Rentabilidad</h4>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">ROAS:</span>
                      <span className={`text-lg font-bold ${data.roas >= 3 ? 'text-green-600' : data.roas >= 2 ? 'text-yellow-600' : 'text-red-600'}`}>
                        {data.roas.toFixed(2)}x
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">ROI:</span>
                      <span className="text-lg font-bold text-purple-600">
                        {(data.total_ad_spend > 0 ? (((data.total_revenue - data.total_ad_spend) / data.total_ad_spend) * 100) : 0).toFixed(1)}%
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 mt-2">
                      {data.roas >= 3 ? '🟢 Excelente rentabilidad' : data.roas >= 2 ? '🟡 Rentabilidad aceptable' : '🔴 Revisar estrategia'}
                    </div>
                  </div>
                </div>

                {/* Costos y Eficiencia */}
                <div className="bg-gradient-to-br from-red-50 to-pink-50 p-6 rounded-lg border border-red-200">
                  <h4 className="text-lg font-semibold text-gray-800 mb-4">Costos y Eficiencia</h4>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Gasto Total:</span>
                      <span className="text-lg font-bold text-red-600">
                        ${data.total_ad_spend.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">CPV (Costo/Visita):</span>
                      <span className="text-sm font-medium text-gray-700">
                        ${((showUnique ? data.unique_visits : data.total_visits) > 0 ? data.total_ad_spend / (showUnique ? data.unique_visits : data.total_visits) : 0).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">CPC (Costo/Click):</span>
                      <span className="text-sm font-medium text-gray-700">
                        ${((showUnique ? data.unique_clicks : data.total_clicks) > 0 ? data.total_ad_spend / (showUnique ? data.unique_clicks : data.total_clicks) : 0).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Beneficios */}
                <div className="bg-gradient-to-br from-green-50 to-emerald-50 p-6 rounded-lg border border-green-200">
                  <h4 className="text-lg font-semibold text-gray-800 mb-4">Beneficios</h4>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Beneficio Neto:</span>
                      <span className={`text-lg font-bold ${(data.total_revenue - data.total_ad_spend) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        ${(data.total_revenue - data.total_ad_spend).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Margen:</span>
                      <span className={`text-lg font-bold ${((data.total_revenue - data.total_ad_spend) / data.total_revenue * 100) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {(data.total_revenue > 0 ? ((data.total_revenue - data.total_ad_spend) / data.total_revenue * 100) : 0).toFixed(1)}%
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">ROI:</span>
                      <span className="text-sm font-medium text-gray-700">
                        {(data.total_ad_spend > 0 ? (((data.total_revenue - data.total_ad_spend) / data.total_ad_spend) * 100) : 0).toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Fila 3: Motor de Insights */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
              <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center">
                <Lightbulb className="h-6 w-6 text-yellow-500 mr-3" />
                Inteligencia de Campañas
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
                <InsightCard
                  icon={<Target className="h-8 w-8 text-white" />}
                  bgColor="bg-purple-500"
                  title="ROAS Champions"
                  description="Campañas con mejor retorno de inversión. ¡Duplicar presupuesto!"
                  campaigns={insights.roasChampions}
                  showUnique={showUnique}
                  metricType="roas"
                />
                <InsightCard
                  icon={<Rocket className="h-8 w-8 text-white" />}
                  bgColor="bg-green-500"
                  title="Máquinas de Dinero"
                  description="Campañas que más ingresos generan. ¡Escalar!"
                  campaigns={insights.moneyMachines}
                  showUnique={showUnique}
                  metricType="revenue"
                />
                 <InsightCard
                  icon={<Gem className="h-8 w-8 text-white" />}
                  bgColor="bg-sky-500"
                  title="Joyas Ocultas"
                  description="Campañas con el mayor valor por compra (AOV). ¡Analizar!"
                  campaigns={insights.hiddenGems}
                  showUnique={showUnique}
                  metricType="aov"
                />
                <InsightCard
                  icon={<AlertTriangle className="h-8 w-8 text-white" />}
                  bgColor="bg-amber-500"
                  title="Gigantes Cansados"
                  description="Atraen clicks pero no convierten. ¡Optimizar landing/oferta!"
                  campaigns={insights.leakyFaucets}
                  showUnique={showUnique}
                  metricType="clicks"
                />
                <InsightCard
                  icon={<Zap className="h-8 w-8 text-white" />}
                  bgColor="bg-red-500"
                  title="Agujeros Negros"
                  description="Atraen visitas pero no convierten. ¡Revisar creativos!"
                  campaigns={insights.wastedAdSpend}
                  showUnique={showUnique}
                  metricType="visits"
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

            {utmDetailTab === 'campaign' && <UtmDetailTable data={campaignData} title="Campaña" showUnique={showUnique} selectedItems={selectedCampaigns} onSelectionChange={handleCampaignSelection} showBudgetColumn={true} onItemClick={(item) => handleOpenModal(item, 'campaign')} />}
            {utmDetailTab === 'medium' && <UtmDetailTable data={mediumData} title="Segmentación" showUnique={showUnique} selectedItems={selectedMediums} onSelectionChange={setSelectedMediums} showBudgetColumn={true} onItemClick={(item) => handleOpenModal(item, 'adset')} />}
            {utmDetailTab === 'content' && <UtmDetailTable data={contentData} title="Anuncio" showUnique={showUnique} selectedItems={new Set()} onSelectionChange={() => {}} showBudgetColumn={false} onItemClick={(item) => handleOpenModal(item, 'ad')} />}
          </div>
        )}
      </div>
      <AdDetailsModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} item={selectedItem} />
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
  metricType: 'revenue' | 'aov' | 'clicks' | 'visits' | 'roas';
}

const InsightCard: React.FC<InsightCardProps> = ({ icon, bgColor, title, description, campaigns, showUnique, metricType }) => {
  const getMetric = (utm: any) => {
    switch (metricType) {
      case 'revenue':
        return <span className="font-bold text-base text-green-700">${(utm.revenue || 0).toLocaleString('es-ES', { maximumFractionDigits: 0 })}</span>;
      case 'aov':
        return <span className="font-bold text-base text-sky-700">${(utm.aov || 0).toLocaleString('es-ES', { maximumFractionDigits: 0 })} AOV</span>;
      case 'clicks':
        return <span className="font-bold text-base text-amber-700">{utm.clicks} Clicks</span>;
      case 'visits':
        return <span className="font-bold text-base text-red-700">{utm.visits} Visitas</span>;
      case 'roas':
        return <span className="font-bold text-base text-purple-700">{(utm.roas || 0).toFixed(2)}x ROAS</span>;
      default:
        return null;
    }
  };
  
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
              <span className="font-medium text-sm">{utm.purchases > 0 ? `${utm.purchases} compras` : `${showUnique ? utm.unique_visits : utm.visits} visitas`}</span>
              {getMetric(utm)}
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
  showBudgetColumn?: boolean;
  onItemClick: (item: any) => void;
}

const getHeatmapPill = (value: number, min: number, max: number): string => {
  if (max === min || !isFinite(value)) {
    return 'bg-gray-100 text-gray-800';
  }
  const normalized = (value - min) / (max - min);

  if (normalized < 0.15) return 'bg-red-100 text-red-800';
  if (normalized < 0.75) return 'bg-amber-100 text-amber-800';
  return 'bg-green-100 text-green-800';
};

const FilterPopover = ({ onApply, onClear }: { onApply: (op: '>' | '<' | '=', val: string) => void; onClear: () => void; }) => {
  const [operator, setOperator] = useState<'>' | '<' | '='>('>');
  const [value, setValue] = useState('');

  const handleApply = () => {
    if (value) {
      onApply(operator, value);
    }
  };

  return (
    <div className="absolute top-full mt-2 right-0 bg-white p-4 rounded-lg shadow-2xl border z-10 w-56 space-y-3">
      <h4 className="text-sm font-bold text-gray-800">Filtrar Métrica</h4>
      <div className="flex items-center space-x-2">
        <select
          value={operator}
          onChange={(e) => setOperator(e.target.value as any)}
          className="block w-1/3 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
        >
          <option value=">">&gt;</option>
          <option value="<">&lt;</option>
          <option value="=">=</option>
        </select>
        <input
          type="number"
          placeholder="Valor"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="block w-2/3 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
        />
      </div>
      <div className="flex justify-between">
        <button onClick={() => { onClear(); setValue(''); }} className="text-xs text-gray-500 hover:text-gray-700">Limpiar</button>
        <button onClick={handleApply} className="text-xs bg-indigo-600 text-white px-3 py-1 rounded-md hover:bg-indigo-700">Aplicar</button>
      </div>
    </div>
  );
};

function UtmDetailTable({ data, title, showUnique, selectedItems, onSelectionChange, showBudgetColumn = true, onItemClick }: UtmDetailTableProps): JSX.Element {
  type UtmSortField = 'name' | 'visits' | 'clicks' | 'purchases' | 'revenue' | 'conversion_rate' | 'checkout_conversion_rate' | 'roas' | 'ad_spend' | 'budget' | 'profit';
  const [sortField, setSortField] = useState<UtmSortField>('revenue');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [nameFilter, setNameFilter] = useState('');
  const [metricFilters, setMetricFilters] = useState<Partial<Record<UtmSortField, { op: string; val: number }>>>({});
  const [activePopover, setActivePopover] = useState<UtmSortField | null>(null);

  const handleSort = (field: UtmSortField) => {
    if (field === sortField) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const { tableData: filteredAndSortedData, minMaxValues } = useMemo(() => {
    const getSortableValue = (item: any, field: UtmSortField) => {
      switch (field) {
        case 'visits': return showUnique ? item.unique_visits : item.visits;
        case 'clicks': return showUnique ? item.unique_clicks : item.clicks;
        case 'purchases': return item.purchases;
        case 'revenue': return item.revenue;
        case 'ad_spend': return item.ad_spend;
        case 'budget': return item.budget_value || 0;
        case 'roas': return item.roas;
        case 'conversion_rate': return showUnique ? item.unique_conversion_rate : item.conversion_rate;
        case 'checkout_conversion_rate': return showUnique ? item.unique_checkout_conversion_rate : item.checkout_conversion_rate;
        case 'profit': return (item.revenue || 0) - (item.ad_spend || 0);
        default: return item[field];
      }
    };
    
    const filteredData = data.filter(item => {
      if (nameFilter && !item.name.toLowerCase().includes(nameFilter.toLowerCase())) {
        return false;
      }
      for (const field in metricFilters) {
        const filter = metricFilters[field as UtmSortField];
        if (!filter) continue;
        const itemValue = getSortableValue(item, field as UtmSortField);
        if (filter.op === '>' && !(itemValue > filter.val)) return false;
        if (filter.op === '<' && !(itemValue < filter.val)) return false;
        if (filter.op === '=' && !(itemValue == filter.val)) return false;
      }
      return true;
    });

    const metricsToScale: UtmSortField[] = ['conversion_rate', 'checkout_conversion_rate', 'roas'];
    const minMaxValues = metricsToScale.reduce((acc, field) => {
      const values = filteredData.map(item => getSortableValue(item, field)).filter(v => typeof v === 'number' && isFinite(v));
      acc[field] = {
        min: values.length > 0 ? Math.min(...values) : 0,
        max: values.length > 0 ? Math.max(...values) : 0,
      };
      return acc;
    }, {} as Record<UtmSortField, { min: number; max: number }>);

    const sortableData = [...filteredData];
    
    sortableData.sort((a, b) => {
      const aValue = getSortableValue(a, sortField);
      const bValue = getSortableValue(b, sortField);
      const multiplier = sortDirection === 'asc' ? 1 : -1;

      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return (aValue - bValue) * multiplier;
      }
      return String(aValue).localeCompare(String(bValue)) * multiplier;
    });

    return { tableData: sortableData, minMaxValues };
  }, [data, sortField, sortDirection, showUnique, nameFilter, metricFilters]);

  const handleRowClick = (itemName: string) => {
    const newSelection = new Set(selectedItems);
    if (newSelection.has(itemName)) {
      newSelection.delete(itemName);
    } else {
      newSelection.add(itemName);
    }
    onSelectionChange(newSelection);
  };

  const handleSetFilter = (field: UtmSortField, op: string, val: string) => {
    const numVal = parseFloat(val);
    if (!isNaN(numVal)) {
      setMetricFilters(prev => ({ ...prev, [field]: { op, val: numVal } }));
    }
    setActivePopover(null);
  };

  const handleClearFilter = (field: UtmSortField) => {
    setMetricFilters(prev => {
      const newFilters = { ...prev };
      delete newFilters[field];
      return newFilters;
    });
    setActivePopover(null);
  };

  const handleSelectAll = () => {
    if (selectedItems.size === filteredAndSortedData.length) {
      onSelectionChange(new Set());
    } else {
      onSelectionChange(new Set(filteredAndSortedData.map(item => item.name)));
    }
  };

  const SortableHeader = ({ field, label, align = 'right' }: { field: UtmSortField; label: string, align?: 'left' | 'right' }) => {
    const isFiltered = !!metricFilters[field];
    return (
      <th scope="col" className={`px-3 py-3 text-${align} text-xs font-medium text-gray-500 uppercase tracking-wider`}>
        <div className="flex items-center gap-2" style={{ justifyContent: align }}>
          <button onClick={() => handleSort(field)} className="group inline-flex items-center space-x-1 hover:text-gray-900">
            <span className={isFiltered ? 'text-indigo-600' : ''}>{label}</span>
            <ArrowUpDown className={`h-4 w-4 ${sortField === field ? 'text-gray-900' : isFiltered ? 'text-indigo-400' : 'text-gray-400 group-hover:text-gray-500'}`} />
          </button>
          <div className="relative">
            <button onClick={() => setActivePopover(activePopover === field ? null : field)}>
              <Filter className={`h-4 w-4 ${isFiltered ? 'text-indigo-600' : 'text-gray-400 hover:text-gray-700'}`} />
            </button>
            {activePopover === field && <FilterPopover onApply={(op, val) => handleSetFilter(field, op, val)} onClear={() => handleClearFilter(field)} />}
          </div>
        </div>
      </th>
    );
  };
  
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th scope="col" className="pl-4 pr-3 py-3 text-left">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                checked={filteredAndSortedData.length > 0 && selectedItems.size === filteredAndSortedData.length}
                onChange={handleSelectAll}
              />
            </th>
            <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              <div className="flex items-center gap-2">
                <button onClick={() => handleSort('name')} className="group inline-flex items-center space-x-1 hover:text-gray-900">
                  <span>{title}</span>
                  <ArrowUpDown className={`h-4 w-4 ${sortField === 'name' ? 'text-gray-900' : 'text-gray-400 group-hover:text-gray-500'}`} />
                </button>
                <input
                  type="text"
                  placeholder="Buscar..."
                  value={nameFilter}
                  onChange={e => setNameFilter(e.target.value)}
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm text-xs p-1.5"
                />
              </div>
            </th>
            {showBudgetColumn && <SortableHeader field="budget" label="Presupuesto" />}
            <SortableHeader field="visits" label="Visitas" />
            <SortableHeader field="clicks" label="Pagos Iniciados" />
            <SortableHeader field="purchases" label="Compras" />
            <SortableHeader field="conversion_rate" label="Conversión" />
            <SortableHeader field="revenue" label="Ingresos" />
            <SortableHeader field="ad_spend" label="Gasto Pub." />
            <SortableHeader field="profit" label="Beneficio" />
            <SortableHeader field="roas" label="ROAS" />
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {filteredAndSortedData.map((item, index) => (
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
              <td 
                className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 cursor-pointer hover:text-indigo-600 hover:underline"
                onClick={(e) => { e.stopPropagation(); onItemClick(item); }}
              >
                {item.name}
              </td>
              {showBudgetColumn && (
                <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                  <span className={`${
                    item.budget_display?.includes('CBO') || item.budget_display?.includes('ABO') 
                      ? 'text-gray-500 italic text-xs' 
                      : 'text-blue-600 font-bold'
                  }`}>
                    {item.budget_display || 'Sin presupuesto'}
                  </span>
                </td>
              )}
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800 font-medium text-right">{showUnique ? item.unique_visits : item.visits}</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800 font-medium text-right">{showUnique ? item.unique_clicks : item.clicks}</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800 font-medium text-right">{item.purchases}</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                <div className="space-y-1">
                  <div>
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getHeatmapPill(showUnique ? item.unique_conversion_rate : item.conversion_rate, minMaxValues.conversion_rate.min, minMaxValues.conversion_rate.max)}`}>
                      {(showUnique ? item.unique_conversion_rate : item.conversion_rate).toFixed(2)}% Total
                    </span>
                  </div>
                  <div>
                    <span className={`px-2 inline-flex text-xs leading-5 font-medium rounded-full ${getHeatmapPill(showUnique ? item.unique_checkout_conversion_rate : item.checkout_conversion_rate, minMaxValues.checkout_conversion_rate.min, minMaxValues.checkout_conversion_rate.max)} opacity-75`}>
                      {(showUnique ? item.unique_checkout_conversion_rate : item.checkout_conversion_rate).toFixed(2)}% Checkout
                    </span>
                  </div>
                </div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600 font-bold text-right">
                ${(item.revenue || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-red-600 font-bold text-right">
                ${(item.ad_spend || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-right">
                {(() => {
                  const profit = (item.revenue || 0) - (item.ad_spend || 0);
                  return (
                    <span className={profit >= 0 ? 'text-green-600' : 'text-red-600'}>
                      {profit >= 0 ? '+' : ''}${profit.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  );
                })()}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                  (item.roas || 0) >= 3 ? 'bg-green-100 text-green-800' : 
                  (item.roas || 0) >= 2 ? 'bg-yellow-100 text-yellow-800' : 
                  'bg-red-100 text-red-800'
                }`}>
                  {(item.roas || 0).toFixed(2)}x
                </span>
              </td>
            </tr>
          ))}
          
          {/* Fila de totales */}
          {filteredAndSortedData.length > 0 && (() => {
            const totals = filteredAndSortedData.reduce((acc, item) => ({
              visits: acc.visits + (showUnique ? item.unique_visits : item.visits),
              clicks: acc.clicks + (showUnique ? item.unique_clicks : item.clicks),
              purchases: acc.purchases + item.purchases,
              revenue: acc.revenue + (item.revenue || 0),
              ad_spend: acc.ad_spend + (item.ad_spend || 0),
              budget: acc.budget + (item.budget_value || 0),
            }), { visits: 0, clicks: 0, purchases: 0, revenue: 0, ad_spend: 0, budget: 0 });
            
            const totalConversionRate = totals.visits > 0 ? (totals.purchases / totals.visits) * 100 : 0;
            const totalCheckoutConversionRate = totals.clicks > 0 ? (totals.purchases / totals.clicks) * 100 : 0;
            const totalRoas = totals.ad_spend > 0 ? totals.revenue / totals.ad_spend : 0;
            const totalProfit = totals.revenue - totals.ad_spend;
            
            return (
              <tr className="bg-gray-100 font-bold border-t-2 border-gray-300">
                <td className="px-6 py-4">
                  <span className="text-gray-500">📊</span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-bold">
                  TOTALES ({filteredAndSortedData.length} {filteredAndSortedData.length === 1 ? 'elemento' : 'elementos'})
                </td>
                {showBudgetColumn && (
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-blue-600 font-bold text-right">
                    ${totals.budget.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                )}
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800 font-bold text-right">
                  {totals.visits.toLocaleString()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800 font-bold text-right">
                  {totals.clicks.toLocaleString()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800 font-bold text-right">
                  {totals.purchases.toLocaleString()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                  <div className="space-y-1">
                    <div>
                      <span className="px-2 inline-flex text-xs leading-5 font-bold rounded-full bg-blue-100 text-blue-800">
                        {totalConversionRate.toFixed(2)}% Total
                      </span>
                    </div>
                    <div>
                      <span className="px-2 inline-flex text-xs leading-5 font-medium rounded-full bg-blue-100 text-blue-800 opacity-75">
                        {totalCheckoutConversionRate.toFixed(2)}% Checkout
                      </span>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600 font-bold text-right">
                  ${totals.revenue.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-red-600 font-bold text-right">
                  ${totals.ad_spend.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-right">
                  <span className={totalProfit >= 0 ? 'text-green-600' : 'text-red-600'}>
                    {totalProfit >= 0 ? '+' : ''}${totalProfit.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                  <span className={`px-2 inline-flex text-xs leading-5 font-bold rounded-full ${
                    totalRoas >= 3 ? 'bg-green-100 text-green-800' : 
                    totalRoas >= 2 ? 'bg-yellow-100 text-yellow-800' : 
                    'bg-red-100 text-red-800'
                  }`}>
                    {totalRoas.toFixed(2)}x
                  </span>
                </td>
              </tr>
            );
          })()}
        </tbody>
      </table>
    </div>
  );
}

