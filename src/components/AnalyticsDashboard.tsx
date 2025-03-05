import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { BarChart, LineChart, ArrowUpRight, ArrowDownRight, DollarSign, Users } from 'lucide-react';

interface AnalyticsData {
  total_visits: number;
  total_clicks: number;
  total_purchases: number;
  conversion_rate: number;
  campaign_stats: {
    utm_source: string;
    utm_medium: string;
    utm_campaign: string;
    visits: number;
    clicks: number;
    purchases: number;
    revenue: number;
  }[];
}

interface Props {
  productId: string;
  startDate?: Date;
  endDate?: Date;
}

export default function AnalyticsDashboard({ productId, startDate, endDate }: Props) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [timeframe, setTimeframe] = useState<'day' | 'week' | 'month'>('day');

  useEffect(() => {
    loadAnalytics();
  }, [productId, startDate, endDate, timeframe]);

  async function loadAnalytics() {
    try {
      setLoading(true);

      // Obtener eventos de tracking
      const { data: events, error: eventsError } = await supabase
        .from('tracking_events')
        .select(`
          id,
          event_type,
          event_data,
          created_at,
          visitor_id
        `)
        .eq('product_id', productId)
        .gte('created_at', startDate?.toISOString() || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
        .lte('created_at', endDate?.toISOString() || new Date().toISOString())
        .order('created_at', { ascending: true });

      if (eventsError) throw eventsError;

      // Procesar datos
      const campaignStats = new Map();
      let totalVisits = 0;
      let totalClicks = 0;
      let totalPurchases = 0;
      let totalRevenue = 0;

      events.forEach(event => {
        const utmData = event.event_data?.utm_data || {};
        const campaignKey = `${utmData.utm_source || 'direct'}-${utmData.utm_medium || 'none'}-${utmData.utm_campaign || 'none'}`;

        if (!campaignStats.has(campaignKey)) {
          campaignStats.set(campaignKey, {
            utm_source: utmData.utm_source || 'direct',
            utm_medium: utmData.utm_medium || 'none',
            utm_campaign: utmData.utm_campaign || 'none',
            visits: 0,
            clicks: 0,
            purchases: 0,
            revenue: 0
          });
        }

        const stats = campaignStats.get(campaignKey);

        switch (event.event_type) {
          case 'pageview':
            stats.visits++;
            totalVisits++;
            break;
          case 'hotmart_click':
            stats.clicks++;
            totalClicks++;
            break;
          case 'custom':
            if (event.event_data?.type === 'hotmart_event' && 
                event.event_data?.event === 'PURCHASE_APPROVED') {
              stats.purchases++;
              stats.revenue += event.event_data?.data?.purchase?.price?.value || 0;
              totalPurchases++;
              totalRevenue += event.event_data?.data?.purchase?.price?.value || 0;
            }
            break;
        }

        campaignStats.set(campaignKey, stats);
      });

      setData({
        total_visits: totalVisits,
        total_clicks: totalClicks,
        total_purchases: totalPurchases,
        conversion_rate: totalClicks > 0 ? (totalPurchases / totalClicks) * 100 : 0,
        campaign_stats: Array.from(campaignStats.values())
      });

    } catch (error) {
      console.error('Error cargando analytics:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-[400px] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
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
              <BarChart className="h-6 w-6 text-green-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Clicks en Hotmart</p>
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
              <LineChart className="h-6 w-6 text-yellow-600" />
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

      {/* Filtros de tiempo */}
      <div className="flex space-x-2">
        <button
          onClick={() => setTimeframe('day')}
          className={`px-4 py-2 rounded-md text-sm font-medium ${
            timeframe === 'day'
              ? 'bg-indigo-600 text-white'
              : 'bg-white text-gray-700 hover:bg-gray-50'
          }`}
        >
          Hoy
        </button>
        <button
          onClick={() => setTimeframe('week')}
          className={`px-4 py-2 rounded-md text-sm font-medium ${
            timeframe === 'week'
              ? 'bg-indigo-600 text-white'
              : 'bg-white text-gray-700 hover:bg-gray-50'
          }`}
        >
          Esta Semana
        </button>
        <button
          onClick={() => setTimeframe('month')}
          className={`px-4 py-2 rounded-md text-sm font-medium ${
            timeframe === 'month'
              ? 'bg-indigo-600 text-white'
              : 'bg-white text-gray-700 hover:bg-gray-50'
          }`}
        >
          Este Mes
        </button>
      </div>

      {/* Tabla de Campañas */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="px-4 py-5 sm:px-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900">
            Rendimiento por Campaña
          </h3>
        </div>
        <div className="border-t border-gray-200">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Fuente
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Medio
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Campaña
                  </th>
                  <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Visitas
                  </th>
                  <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Clicks
                  </th>
                  <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Compras
                  </th>
                  <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Conversión
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {data.campaign_stats.map((campaign, index) => {
                  const conversionRate = campaign.clicks > 0 
                    ? (campaign.purchases / campaign.clicks) * 100 
                    : 0;
                  
                  const isPositive = conversionRate > (data.conversion_rate || 0);

                  return (
                    <tr key={index}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {campaign.utm_source}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {campaign.utm_medium}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {campaign.utm_campaign}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                        {campaign.visits}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                        {campaign.clicks}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                        {campaign.purchases}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end space-x-1">
                          <span className={`text-sm ${
                            isPositive ? 'text-green-600' : 'text-red-600'
                          }`}>
                            {conversionRate.toFixed(2)}%
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