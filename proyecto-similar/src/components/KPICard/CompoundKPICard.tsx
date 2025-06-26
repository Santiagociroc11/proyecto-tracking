import React from 'react';
import { DivideIcon as LucideIcon, TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface Metric {
  label: string;
  value: string;
  color?: string;
  trend?: 'positive' | 'negative' | 'neutral' | null;
}

interface CompoundKPICardProps {
  title: string;
  subtitle?: string;
  Icon: LucideIcon;
  iconColor: string;
  metrics: Metric[];
}

export function CompoundKPICard({ title, subtitle, Icon, iconColor, metrics }: CompoundKPICardProps) {
  const getTrendIcon = (trend: 'positive' | 'negative' | 'neutral' | null) => {
    if (trend === 'positive') return <TrendingUp className="h-3.5 w-3.5 text-green-500" />;
    if (trend === 'negative') return <TrendingDown className="h-3.5 w-3.5 text-red-500" />;
    if (trend === 'neutral') return <Minus className="h-3.5 w-3.5 text-yellow-500" />;
    return null;
  };

  return (
    <div className="bg-white p-4 sm:p-6 rounded-lg shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <Icon className={`h-6 sm:h-7 w-6 sm:w-7 ${iconColor}`} />
        <div>
          <h3 className="text-sm sm:text-base font-medium text-gray-800">{title}</h3>
          {subtitle && (
            <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>
          )}
        </div>
      </div>
      
      <div className="space-y-3">
        {metrics.map((metric, index) => (
          <div key={index} className="flex items-center justify-between">
            <span className="text-xs text-gray-500">{metric.label}</span>
            <div className="flex items-center gap-1">
              <span className={`text-sm sm:text-base font-semibold ${metric.color || ''}`}>
                {metric.value}
              </span>
              {metric.trend && getTrendIcon(metric.trend)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
} 