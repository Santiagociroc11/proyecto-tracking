import React, { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ComposedChart, Line, ReferenceLine, Cell } from 'recharts';
import { AdData } from '../AdsTable/types';
import { DollarSign, TrendingUp, BarChart3, PieChart } from 'lucide-react';

interface ROASChartProps {
  data: AdData[];
}

// Constante para el cálculo de revenue
const REVENUE_PER_SALE = 18000 / 4100;

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value);
};

const truncateText = (text: string) => {
  // Extract meaningful parts from the name (assuming format like "ITU TIENDA DIGITAL")
  const parts = text.split(' ');
  if (parts.length <= 2) return text;
  
  // Take first word and last word
  return `${parts[0]} ... ${parts[parts.length - 1]}`;
};

export function ROASChart({ data }: ROASChartProps) {
  const [sortBy, setSortBy] = useState<'roas' | 'profit' | 'spend'>('roas');
  const [showCount, setShowCount] = useState<number>(10);
  
  // Umbral de ROAS objetivo
  const targetRoas = 1.2;

  if (!Array.isArray(data) || data.length === 0) {
    return (
      <div className="bg-white p-4 sm:p-6 rounded-lg shadow-sm mb-6 sm:mb-8">
        <h2 className="text-base sm:text-lg font-medium text-gray-900 mb-4">Rendimiento de Conjuntos de Anuncios</h2>
        <div className="h-[250px] sm:h-[400px] flex items-center justify-center text-gray-500">
          No hay datos disponibles
        </div>
      </div>
    );
  }

  // Aggregate data by ad set with more metrics
  const aggregatedData = data.reduce((acc: Record<string, {
    roas: number;
    spend: number;
    sales: number;
    count: number;
  }>, item) => {
    if (!acc[item.conjunto]) {
      acc[item.conjunto] = { 
        roas: 0, 
        spend: 0, 
        sales: 0,
        count: 0 
      };
    }
    
    // Usar el mayor de los dos ROAS
    const currentRoas = Math.max(item.roas_ad_fb, item.roas_negocio_general || 0);
    acc[item.conjunto].roas += currentRoas;
    acc[item.conjunto].spend += item.spend;
    acc[item.conjunto].sales += Math.max(item.ventas_fb, item.ventas_trackeadas);
    acc[item.conjunto].count += 1;
    return acc;
  }, {});

  // Transform to array and calculate metrics
  const chartData = Object.entries(aggregatedData)
    .map(([adSet, values]) => {
      const avgRoas = values.roas / values.count;
      const totalSpend = values.spend;
      const totalSales = values.sales;
      const revenue = totalSales * REVENUE_PER_SALE;
      const profit = revenue - totalSpend;
      const roi = totalSpend > 0 ? (profit / totalSpend) * 100 : 0;
      
      return {
        conjunto: truncateText(adSet),
        fullName: adSet,
        roas: avgRoas,
        spend: totalSpend,
        sales: totalSales,
        revenue: revenue,
        profit: profit,
        roi: roi,
        belowTarget: avgRoas < targetRoas
      };
    })
    // Ordenar según la selección del usuario
    .sort((a, b) => {
      if (sortBy === 'roas') return b.roas - a.roas;
      if (sortBy === 'profit') return b.profit - a.profit;
      return b.spend - a.spend;
    })
    .slice(0, showCount);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white p-4 shadow-lg rounded-lg border border-gray-200">
          <p className="font-medium text-gray-900 mb-2 truncate max-w-xs">{data.fullName}</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            <div>
              <p className="text-xs text-gray-500">ROAS</p>
              <p className={`text-sm font-medium ${data.belowTarget ? 'text-red-600' : 'text-green-600'}`}>
                {data.roas.toFixed(2)}x
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">ROI</p>
              <p className={`text-sm font-medium ${data.roi >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {data.roi.toFixed(0)}%
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Gasto</p>
              <p className="text-sm font-medium text-gray-800">
                {formatCurrency(data.spend)}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Ventas</p>
              <p className="text-sm font-medium text-gray-800">{data.sales}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Revenue</p>
              <p className="text-sm font-medium text-blue-600">
                {formatCurrency(data.revenue)}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Profit/Loss</p>
              <p className={`text-sm font-medium ${data.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {data.profit >= 0 ? '+' : ''}{formatCurrency(data.profit)}
              </p>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-white p-4 sm:p-6 rounded-lg shadow-sm mb-6 sm:mb-8">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-4">
        <h2 className="text-base sm:text-lg font-medium text-gray-900 mb-1 sm:mb-0">
          Top {showCount} Conjuntos por {sortBy === 'roas' ? 'ROAS' : sortBy === 'profit' ? 'Profit' : 'Gasto'}
        </h2>
        
        <div className="flex gap-2 flex-wrap">
          {/* Filtros */}
          <div className="inline-flex rounded-md shadow-sm" role="group">
            <button
              type="button"
              onClick={() => setSortBy('roas')}
              className={`px-3 py-1.5 text-xs font-medium rounded-l-lg ${
                sortBy === 'roas' 
                  ? 'bg-indigo-600 text-white' 
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <TrendingUp className="h-3 w-3 inline mr-1" />
              ROAS
            </button>
            <button
              type="button"
              onClick={() => setSortBy('profit')}
              className={`px-3 py-1.5 text-xs font-medium ${
                sortBy === 'profit' 
                  ? 'bg-indigo-600 text-white' 
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <DollarSign className="h-3 w-3 inline mr-1" />
              Profit
            </button>
            <button
              type="button"
              onClick={() => setSortBy('spend')}
              className={`px-3 py-1.5 text-xs font-medium rounded-r-lg ${
                sortBy === 'spend' 
                  ? 'bg-indigo-600 text-white' 
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <BarChart3 className="h-3 w-3 inline mr-1" />
              Gasto
            </button>
          </div>
          
          {/* Selector de cantidad */}
          <select
            value={showCount}
            onChange={(e) => setShowCount(Number(e.target.value))}
            className="rounded-md border border-gray-300 text-xs py-1.5 px-2 bg-white focus:ring-indigo-500 focus:border-indigo-500"
          >
            <option value={5}>Top 5</option>
            <option value={10}>Top 10</option>
            <option value={15}>Top 15</option>
            <option value={20}>Top 20</option>
          </select>
        </div>
      </div>
      
      <div className="h-[300px] sm:h-[400px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={chartData}
            margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
            barSize={20}
            barGap={0}
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
            <XAxis
              dataKey="conjunto"
              angle={-45}
              textAnchor="end"
              height={60}
              interval={0}
              tick={{ 
                fontSize: 10,
                fill: '#4B5563'
              }}
            />
            <YAxis
              yAxisId="left"
              orientation="left"
              tickFormatter={(value) => `${value.toFixed(1)}x`}
              label={{ 
                value: 'ROAS',
                angle: -90,
                position: 'insideLeft',
                style: { fill: '#4F46E5', fontSize: 10 }
              }}
              tick={{ fontSize: 10 }}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tickFormatter={formatCurrency}
              label={{ 
                value: 'Gasto/Profit',
                angle: 90,
                position: 'insideRight',
                style: { fill: '#059669', fontSize: 10 }
              }}
              tick={{ fontSize: 10 }}
            />
            
            {/* Línea de referencia para ROAS objetivo */}
            <ReferenceLine 
              yAxisId="left" 
              y={targetRoas} 
              stroke="#FF5722" 
              strokeDasharray="3 3"
              label={{
                value: `ROAS meta: ${targetRoas}x`,
                position: 'right',
                fill: '#FF5722',
                fontSize: 10
              }}
            />
            
            <Tooltip content={<CustomTooltip />} />
            <Legend 
              verticalAlign="top"
              height={36}
              iconType="circle"
              wrapperStyle={{ fontSize: '12px' }}
            />
            
            {/* Barras con colores condicionales basados en ROAS objetivo */}
            <Bar
              yAxisId="left"
              dataKey="roas"
              name="ROAS"
              radius={[4, 4, 0, 0]}
            >
              {chartData.map((entry, index) => (
                <Cell 
                  key={`cell-${index}`} 
                  fill={entry.belowTarget ? '#EF4444' : '#4F46E5'} 
                />
              ))}
            </Bar>
            
            <Bar
              yAxisId="right"
              dataKey="spend"
              fill="#059669"
              name="Gasto"
              radius={[4, 4, 0, 0]}
              opacity={0.7}
            />
            
            {/* Línea para profit */}
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="profit"
              stroke="#FB923C"
              strokeWidth={2}
              name="Profit/Loss"
              dot={{ r: 4 }}
              activeDot={{ r: 6 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}