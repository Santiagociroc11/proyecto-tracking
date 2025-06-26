import React from 'react';

interface SpendProgressProps {
  spend: number;
  percentage: number;
  formatCurrency: (value: number) => string;
  hideBar?: boolean;
}

export function SpendProgress({ spend, percentage, formatCurrency, hideBar }: SpendProgressProps) {
  if (hideBar) {
    return (
      <span className="font-medium text-gray-700">{formatCurrency(spend)}</span>
    );
  }
  const width = `${Math.min(percentage, 100)}%`;
  const bgColor = percentage > 90 ? 'bg-red-500' : percentage > 70 ? 'bg-yellow-500' : 'bg-green-500';
  
  return (
    <div className="w-32">
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div className={`${bgColor} h-2 rounded-full`} style={{ width }} />
      </div>
      <div className="text-xs text-gray-500 mt-1">
        {formatCurrency(spend)} ({percentage.toFixed(1)}%)
      </div>
    </div>
  );
}