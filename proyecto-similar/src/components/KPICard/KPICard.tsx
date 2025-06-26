import React from 'react';
import { DivideIcon as LucideIcon, TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface KPICardProps {
  title: string;
  subtitle?: string;
  value: string;
  Icon: LucideIcon;
  iconColor: string;
  trend: 'positive' | 'negative' | 'neutral' | null;
}

export function KPICard({ title, subtitle, value, Icon, iconColor, trend }: KPICardProps) {
  const getTrendIcon = () => {
    if (trend === 'positive') return <TrendingUp className="h-4 sm:h-5 w-4 sm:w-5 text-green-500" />;
    if (trend === 'negative') return <TrendingDown className="h-4 sm:h-5 w-4 sm:w-5 text-red-500" />;
    if (trend === 'neutral') return <Minus className="h-4 sm:h-5 w-4 sm:w-5 text-yellow-500" />;
    return null;
  };

  return (
    <div className="bg-white p-4 sm:p-6 rounded-lg shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Icon className={`h-6 sm:h-8 w-6 sm:w-8 ${iconColor}`} />
          <div>
            <p className="text-xs sm:text-sm text-gray-500">{title}</p>
            {subtitle && (
              <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>
            )}
          </div>
        </div>
        {getTrendIcon()}
      </div>
      <p className="text-lg sm:text-2xl font-semibold truncate">{value}</p>
    </div>
  );
}