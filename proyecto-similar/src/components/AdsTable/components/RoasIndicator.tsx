import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface RoasIndicatorProps {
  value?: number | null;
  variation?: number | null;
}

export function RoasIndicator({ value = 0, variation = 0 }: RoasIndicatorProps) {
  // Asegurarse de que value sea un número, con valor predeterminado 0
  const safeValue = (value === null || value === undefined) ? 0 : value;
  // Asegurarse de que variation sea un número, con valor predeterminado 0
  const safeVariation = (variation === null || variation === undefined) ? 0 : variation;
  
  const getVariationDisplay = () => {
    if (!safeVariation) return null;
    
    const isPositive = safeVariation > 0;
    return (
      <span className={`text-xs ml-1 ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
        {isPositive ? (
          <span className="flex items-center">
            <TrendingUp className="h-3 w-3 mr-0.5" />
            +{safeVariation.toFixed(2)}
          </span>
        ) : (
          <span className="flex items-center">
            <TrendingDown className="h-3 w-3 mr-0.5" />
            {safeVariation.toFixed(2)}
          </span>
        )}
      </span>
    );
  };

  return (
    <div className="flex items-center justify-center">
      <span className={`font-medium ${safeValue >= 2 ? 'text-green-600' : safeValue >= 1 ? 'text-yellow-600' : 'text-red-600'}`}>
        {safeValue.toFixed(2)}x
      </span>
      {getVariationDisplay()}
    </div>
  );
}