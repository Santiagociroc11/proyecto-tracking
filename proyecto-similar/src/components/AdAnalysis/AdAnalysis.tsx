import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine } from 'recharts';
import { TrendingUp, TrendingDown, Calendar, ArrowUpDown, Search, AlertCircle, CheckCircle, PauseCircle, Info, Layers, CalendarDays } from 'lucide-react';
import { AdDetailsModal } from './AdDetailsModal';

interface AdPerformance {
  ad_id: string;
  ad_name: string;
  adset_name: string;
  totalSales: number;
  avgRoas: number;
  lastWeekRoas: number;
  maxRoas: number;
  minRoas: number;
  totalSpend: number;
  totalProfit: number;
  status: string;
  dailyData: {
    date: string;
    roas: number;
    profit: number;
    spend: number;
    sales: number;
  }[];
}

export function AdAnalysis() {
  const [loading, setLoading] = useState(true);
  const [adPerformance, setAdPerformance] = useState<AdPerformance[]>([]);
  const [sortBy, setSortBy] = useState<'sales' | 'roas' | 'profit'>('sales');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [searchQuery, setSearchQuery] = useState('');
  const [timeRange, setTimeRange] = useState<'1' | '2' | '3' | '7' | '14' | '30' | '90' | 'custom'>('30');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [totalCount, setTotalCount] = useState(0);
  const [selectedAd, setSelectedAd] = useState<AdPerformance | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };

  useEffect(() => {
    fetchAdPerformanceData();
  }, [timeRange, customStartDate, customEndDate]);

  const fetchAdPerformanceData = async () => {
    try {
      setLoading(true);
      
      // Get the date range
      const endDate = new Date();
      const startDate = new Date();
      
      let startDateStr: string;
      let endDateStr: string;
      
      if (timeRange === 'custom') {
        if (!customStartDate || !customEndDate) {
          setLoading(false);
          return;
        }
        startDateStr = customStartDate;
        endDateStr = customEndDate;
      } else {
        const daysBack = parseInt(timeRange);
        if (daysBack === 1) {
          // Hoy - mismo día
          startDateStr = endDate.toISOString().split('T')[0];
          endDateStr = endDate.toISOString().split('T')[0];
        } else if (daysBack === 2) {
          // Ayer - día anterior
          const yesterday = new Date();
          yesterday.setDate(yesterday.getDate() - 1);
          startDateStr = yesterday.toISOString().split('T')[0];
          endDateStr = yesterday.toISOString().split('T')[0];
        } else {
          // Otros periodos (3, 7, 14, 30, 90 días)
          startDate.setDate(startDate.getDate() - (daysBack - 1)); // -1 para incluir hoy
          startDateStr = startDate.toISOString().split('T')[0];
          endDateStr = endDate.toISOString().split('T')[0];
        }
      }

      // Fetch tracked sales for the date range
      const { data: trackedSales, error: trackedError } = await supabase
        .from('tracked_sales')
        .select('*')
        .gte('purchase_date', startDateStr)
        .lte('purchase_date', endDateStr)
        .not('ad_id', 'eq', 'NO REF');

      if (trackedError) throw trackedError;
      
      // Get the count of total tracked sales
      const { count, error: countError } = await supabase
        .from('tracked_sales')
        .select('*', { count: 'exact', head: true });
        
      if (countError) throw countError;
      
      setTotalCount(count || 0);
      
      // Create a map of tracked sales by ad_id and date
      const trackedSalesMap = new Map<string, Map<string, number>>();
      
      trackedSales?.forEach(sale => {
        const key = sale.ad_id;
        if (!trackedSalesMap.has(key)) {
          trackedSalesMap.set(key, new Map<string, number>());
        }
        
        const dateMap = trackedSalesMap.get(key)!;
        const dateKey = sale.purchase_date;
        
        if (!dateMap.has(dateKey)) {
          dateMap.set(dateKey, 0);
        }
        
        dateMap.set(dateKey, dateMap.get(dateKey)! + 1);
      });

      // Fetch Facebook ads data for the same date range
      const { data: facebookAds, error: fbError } = await supabase
        .from('facebook_ads')
        .select('*')
        .gte('fecha', startDateStr)
        .lte('fecha', endDateStr);

      if (fbError) throw fbError;

      // Process the data to get performance metrics by ad
      const adsMap = new Map<string, AdPerformance>();
      const REVENUE_PER_SALE = 18000 / 4100;
      
      // NOTA: AdAnalysis usa datos históricos de la tabla facebook_ads, 
      // mientras que Dashboard usa datos en tiempo real de la API de Facebook.
      // Sin embargo, el cálculo de ventas debe ser consistente: 
      // siempre usar Math.max(ventas_trackeadas, ventas_fb)
      
      // First, create a map of ad IDs to ad names and adset names
      const adInfoMap = new Map<string, {name: string, adset_name: string, status: string}>();
      facebookAds?.forEach(ad => {
        adInfoMap.set(ad.ad_id, {
          name: ad.anuncio,
          adset_name: ad.conjunto || "Sin conjunto",
          status: ad.adset_status || 'UNKNOWN'
        });
      });
      
      // Now process the data by date and ad ID
      const dailyAdDataMap = new Map<string, Map<string, {
        spend: number,
        sales: number,
        roas: number,
        profit: number
      }>>();
      
      facebookAds?.forEach(ad => {
        const adId = ad.ad_id;
        const date = new Date(ad.fecha).toISOString().split('T')[0];
        
        if (!dailyAdDataMap.has(adId)) {
          dailyAdDataMap.set(adId, new Map());
        }
        
        const dateMap = dailyAdDataMap.get(adId)!;
        
        // Calcular ventas de manera consistente con el Dashboard
        // Siempre usar el mayor entre ventas trackeadas y ventas del pixel de Facebook
        const trackedSalesForDay = trackedSalesMap.has(adId) && trackedSalesMap.get(adId)!.has(date) 
          ? trackedSalesMap.get(adId)!.get(date)! 
          : 0;
        const fbSalesForDay = ad.ventas_fb || 0;
        const dbTrackedSalesForDay = ad.ventas_trackeadas || 0;
        
        // Usar el mayor entre: ventas trackeadas del día, ventas FB del día, y ventas trackeadas de la BD
        const sales = Math.max(trackedSalesForDay, fbSalesForDay, dbTrackedSalesForDay);
        
        const spend = ad.spend || 0;
        const revenue = sales * REVENUE_PER_SALE;
        const profit = revenue - spend;
        const roas = spend > 0 ? revenue / spend : 0;
        
        dateMap.set(date, {
          spend,
          sales,
          roas,
          profit
        });
      });
      
      // Now build the final AdPerformance objects
      for (const [adId, dateMap] of dailyAdDataMap.entries()) {
        if (!adInfoMap.has(adId)) continue;
        
        const adInfo = adInfoMap.get(adId)!;
        const dailyData: {
          date: string,
          roas: number,
          profit: number,
          spend: number,
          sales: number
        }[] = [];
        
        let totalSales = 0;
        let totalSpend = 0;
        let totalProfit = 0;
        let maxRoas = 0;
        let minRoas = Number.MAX_VALUE;
        
        // Sort dates to ensure chronological order
        const sortedDates = Array.from(dateMap.keys()).sort();
        
        for (const date of sortedDates) {
          const data = dateMap.get(date)!;
          
          totalSales += data.sales;
          totalSpend += data.spend;
          totalProfit += data.profit;
          
          if (data.roas > maxRoas) maxRoas = data.roas;
          if (data.roas < minRoas && data.roas > 0) minRoas = data.roas;
          
          dailyData.push({
            date,
            roas: data.roas,
            profit: data.profit,
            spend: data.spend,
            sales: data.sales
          });
        }
        
        // Calculate average ROAS
        const avgRoas = totalSpend > 0 ? (totalSales * REVENUE_PER_SALE) / totalSpend : 0;
        
        // Calculate last week's ROAS
        const lastWeekDate = new Date();
        lastWeekDate.setDate(lastWeekDate.getDate() - 7);
        const lastWeekDateStr = lastWeekDate.toISOString().split('T')[0];
        
        const lastWeekData = dailyData.filter(day => day.date >= lastWeekDateStr);
        const lastWeekSpend = lastWeekData.reduce((sum, day) => sum + day.spend, 0);
        const lastWeekSales = lastWeekData.reduce((sum, day) => sum + day.sales, 0);
        const lastWeekRoas = lastWeekSpend > 0 ? (lastWeekSales * REVENUE_PER_SALE) / lastWeekSpend : 0;
        
        // Handle case where minRoas wasn't set
        if (minRoas === Number.MAX_VALUE) minRoas = 0;
        
        adsMap.set(adId, {
          ad_id: adId,
          ad_name: adInfo.name,
          adset_name: adInfo.adset_name,
          totalSales,
          avgRoas,
          lastWeekRoas,
          maxRoas,
          minRoas,
          totalSpend,
          totalProfit,
          status: adInfo.status,
          dailyData
        });
      }

      // Convert map to array and filter ads with no sales or data
      let adsArray = Array.from(adsMap.values())
        .filter(ad => ad.totalSales > 0 || ad.totalSpend > 0);
      
      setAdPerformance(adsArray);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching ad performance data:', error);
      setLoading(false);
    }
  };

  const handleSortChange = (field: 'sales' | 'roas' | 'profit') => {
    if (sortBy === field) {
      // Toggle sort direction if same field
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      // Default to descending for new field
      setSortBy(field);
      setSortDirection('desc');
    }
  };

  const filteredAds = adPerformance
    .filter(ad => ad.ad_name.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => {
      let comparison = 0;
      
      if (sortBy === 'sales') {
        comparison = a.totalSales - b.totalSales;
      } else if (sortBy === 'roas') {
        comparison = a.avgRoas - b.avgRoas;
      } else if (sortBy === 'profit') {
        comparison = a.totalProfit - b.totalProfit;
      }
      
      return sortDirection === 'asc' ? comparison : -comparison;
    });

  const getRoasTrendIcon = (avg: number, last7: number) => {
    if (last7 > avg * 1.1) return <TrendingUp className="w-4 h-4 text-green-500" />;
    if (last7 < avg * 0.9) return <TrendingDown className="w-4 h-4 text-red-500" />;
    return null;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
            <CheckCircle className="w-3 h-3 mr-1" />
            Activo
          </span>
        );
      case 'PAUSED':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
            <PauseCircle className="w-3 h-3 mr-1" />
            Pausado
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
            <AlertCircle className="w-3 h-3 mr-1" />
            Desconocido
          </span>
        );
    }
  };

  // Calculate totals for displaying summary
  const totalSales = filteredAds.reduce((sum, ad) => sum + ad.totalSales, 0);
  const totalSpend = filteredAds.reduce((sum, ad) => sum + ad.totalSpend, 0);
  const totalProfit = filteredAds.reduce((sum, ad) => sum + ad.totalProfit, 0);

  // Handle click on an ad row
  const handleAdClick = (ad: AdPerformance) => {
    setSelectedAd(ad);
    setIsModalOpen(true);
  };

  // Close the modal
  const handleCloseModal = () => {
    setIsModalOpen(false);
  };

  // Helper function to get max date for date inputs (today)
  const getMaxDate = () => {
    return new Date().toISOString().split('T')[0];
  };

  // Helper function to format the selected period for display
  const getSelectedPeriodText = () => {
    if (timeRange === 'custom') {
      if (customStartDate && customEndDate) {
        const start = new Date(customStartDate).toLocaleDateString('es-ES');
        const end = new Date(customEndDate).toLocaleDateString('es-ES');
        return `${start} - ${end}`;
      }
      return 'Selecciona fechas';
    }
    
    const days = parseInt(timeRange);
    if (days === 1) {
      return 'Hoy';
    } else if (days === 2) {
      return 'Ayer';
    } else if (days === 3) {
      return 'Últimos 3 días';
    } else {
      return `Últimos ${days} días`;
    }
  };

  return (
    <div className="bg-white p-4 sm:p-6 rounded-lg shadow-sm mb-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Análisis de Anuncios</h2>
        
        <div className="flex flex-wrap gap-3 mt-3 sm:mt-0">
          {/* Search input */}
          <div className="relative flex items-center">
            <Search className="w-4 h-4 absolute left-3 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar anuncio..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
          
          {/* Time range selector */}
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value as '1' | '2' | '3' | '7' | '14' | '30' | '90' | 'custom')}
            className="px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
          >
            <option value="1">Hoy</option>
            <option value="2">Ayer</option>
            <option value="3">Últimos 3 días</option>
            <option value="7">Últimos 7 días</option>
            <option value="14">Últimos 14 días</option>
            <option value="30">Últimos 30 días</option>
            <option value="90">Últimos 90 días</option>
            <option value="custom">Periodo personalizado</option>
          </select>
          
          {/* Custom date range inputs */}
          {timeRange === 'custom' && (
            <>
              <div className="flex items-center space-x-2">
                <CalendarDays className="w-4 h-4 text-gray-400" />
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  max={customEndDate || getMaxDate()}
                  className="px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Fecha inicio"
                />
                <span className="text-gray-400">-</span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  min={customStartDate}
                  max={getMaxDate()}
                  className="px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Fecha fin"
                />
              </div>
            </>
          )}
        </div>
      </div>
      
      {/* Period indicator */}
      <div className="mb-4 flex items-center text-sm text-gray-600">
        <Calendar className="mr-2 h-4 w-4" />
        <span>Periodo seleccionado: {getSelectedPeriodText()}</span>
      </div>
      
      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-indigo-50 p-4 rounded-lg shadow-sm">
          <h3 className="text-sm font-medium text-indigo-700 mb-1">Total Ventas</h3>
          <p className="text-2xl font-bold text-indigo-900">{totalSales.toLocaleString()}</p>
          <p className="text-xs text-indigo-600 mt-1">De {totalCount.toLocaleString()} ventas totales en la BD</p>
        </div>
        <div className="bg-blue-50 p-4 rounded-lg shadow-sm">
          <h3 className="text-sm font-medium text-blue-700 mb-1">Total Gasto</h3>
          <p className="text-2xl font-bold text-blue-900">{formatCurrency(totalSpend)}</p>
        </div>
        <div className={`${totalProfit >= 0 ? 'bg-green-50' : 'bg-red-50'} p-4 rounded-lg shadow-sm`}>
          <h3 className={`text-sm font-medium ${totalProfit >= 0 ? 'text-green-700' : 'text-red-700'} mb-1`}>Beneficio Total</h3>
          <p className={`text-2xl font-bold ${totalProfit >= 0 ? 'text-green-900' : 'text-red-900'}`}>{formatCurrency(totalProfit)}</p>
        </div>
      </div>
      
      {loading ? (
        <div className="h-60 flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
        </div>
      ) : (
        <>
          {/* Show message when custom dates are not selected */}
          {timeRange === 'custom' && (!customStartDate || !customEndDate) ? (
            <div className="h-60 flex items-center justify-center">
              <div className="text-center">
                <CalendarDays className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">Selecciona un periodo personalizado</h3>
                <p className="text-gray-500">Elige las fechas de inicio y fin para ver el análisis de anuncios.</p>
              </div>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto mb-4">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Anuncio
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Conjunto
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Estado
                  </th>
                  <th 
                    scope="col" 
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                    onClick={() => handleSortChange('sales')}
                  >
                    <div className="flex items-center">
                      Ventas
                      {sortBy === 'sales' && (
                        <ArrowUpDown className={`ml-1 h-4 w-4 ${sortDirection === 'asc' ? 'text-indigo-500' : 'text-indigo-700'}`} />
                      )}
                    </div>
                  </th>
                  <th 
                    scope="col" 
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                    onClick={() => handleSortChange('roas')}
                  >
                    <div className="flex items-center">
                      ROAS Prom.
                      {sortBy === 'roas' && (
                        <ArrowUpDown className={`ml-1 h-4 w-4 ${sortDirection === 'asc' ? 'text-indigo-500' : 'text-indigo-700'}`} />
                      )}
                    </div>
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    ROAS (7d)
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    ROAS Max/Min
                  </th>
                  <th 
                    scope="col" 
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                    onClick={() => handleSortChange('profit')}
                  >
                    <div className="flex items-center">
                      Profit/Loss
                      {sortBy === 'profit' && (
                        <ArrowUpDown className={`ml-1 h-4 w-4 ${sortDirection === 'asc' ? 'text-indigo-500' : 'text-indigo-700'}`} />
                      )}
                    </div>
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Gasto
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Tendencia
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredAds.map((ad) => (
                  <tr 
                    key={ad.ad_id} 
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => handleAdClick(ad)}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {ad.ad_name}
                      </div>
                      <div className="text-xs text-gray-500">{ad.ad_id}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center text-sm text-indigo-600">
                        <Layers className="h-4 w-4 mr-1 text-indigo-500" />
                        {ad.adset_name}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getStatusBadge(ad.status)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {ad.totalSales}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className={`text-sm font-medium ${ad.avgRoas >= 1.2 ? 'text-green-600' : ad.avgRoas >= 1 ? 'text-yellow-600' : 'text-red-600'}`}>
                        {ad.avgRoas.toFixed(2)}x
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className={`text-sm font-medium ${ad.lastWeekRoas >= 1.2 ? 'text-green-600' : ad.lastWeekRoas >= 1 ? 'text-yellow-600' : 'text-red-600'}`}>
                        {ad.lastWeekRoas.toFixed(2)}x
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <span className="text-green-600 font-medium">{ad.maxRoas.toFixed(2)}</span>
                      <span className="mx-1">/</span>
                      <span className="text-red-600 font-medium">{ad.minRoas.toFixed(2)}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className={`text-sm font-medium ${ad.totalProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatCurrency(ad.totalProfit)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatCurrency(ad.totalSpend)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="h-12 w-24">
                        {ad.dailyData.length > 1 && (
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={ad.dailyData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                              <Line 
                                type="monotone" 
                                dataKey="roas" 
                                stroke="#4F46E5" 
                                strokeWidth={2} 
                                dot={false} 
                                isAnimationActive={false}
                              />
                              <ReferenceLine y={1} stroke="#9CA3AF" strokeDasharray="3 3" />
                            </LineChart>
                          </ResponsiveContainer>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <button 
                        className="text-indigo-600 hover:text-indigo-900 p-1 rounded-full hover:bg-indigo-50"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAdClick(ad);
                        }}
                      >
                        <Info className="h-5 w-5" />
                      </button>
                    </td>
                  </tr>
                ))}
                
                {filteredAds.length === 0 && (
                  <tr>
                    <td colSpan={11} className="px-6 py-4 text-center text-sm text-gray-500">
                      No se encontraron anuncios que coincidan con tu búsqueda
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          
          {filteredAds.length > 0 && (
            <div className="text-sm text-gray-500 text-center">
              Mostrando {filteredAds.length} anuncios de un total de {adPerformance.length}
            </div>
              )}
            </>
          )}
        </>
      )}

      {/* Modal de detalles del anuncio */}
      <AdDetailsModal 
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        ad={selectedAd}
      />
    </div>
  );
} 