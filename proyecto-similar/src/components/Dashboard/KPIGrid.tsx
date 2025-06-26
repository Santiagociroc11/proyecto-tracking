import React from 'react';
import { Activity, DollarSign, Target, Users, Star, ShoppingCart, BarChart4, Tag } from 'lucide-react';
import { KPICard } from '../KPICard/KPICard';
import { CompoundKPICard } from '../KPICard/CompoundKPICard';
import { formatCurrency, formatNumber } from '../../utils/format';

interface KPIGridProps {
  totalSpend: number;
  averageRoas: number;
  totalRoasWithNoRef: number;
  totalSales: number;
  totalSalesWithNoRef: number;
  totalReach: number;
  noRefSalesCount?: number;
  otherAdsSalesCount?: number;
  nonActiveAdsSalesCount?: number;
}

export function KPIGrid({ 
  totalSpend, 
  averageRoas, 
  totalRoasWithNoRef, 
  totalSales,
  totalSalesWithNoRef, 
  totalReach,
  noRefSalesCount = 0,
  otherAdsSalesCount = 0,
  nonActiveAdsSalesCount = 0
}: KPIGridProps) {
  const getRoasColor = (roas: number) => {
    if (roas >= 2) return 'text-green-500';
    if (roas >= 1) return 'text-yellow-500';
    return 'text-red-500';
  };

  // Calcular correctamente las ventas NO REF puras
  const pureNoRefSales = noRefSalesCount;
  const otherAdsSales = otherAdsSalesCount;

  return (
    <div className="grid grid-cols-1 gap-3 sm:gap-4 mb-6 sm:mb-8">
      {/* Fila 1: KPIs principales */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        {/* Tarjeta compuesta de ROAS */}
        <CompoundKPICard
          title="ROAS"
          Icon={Activity}
          iconColor="text-indigo-600"
          metrics={[
            {
              label: "Ads Activos",
              value: `${averageRoas.toFixed(2)}x`,
              color: getRoasColor(averageRoas),
              trend: averageRoas >= 2 ? 'positive' : averageRoas >= 1 ? 'neutral' : 'negative'
            },
            {
              label: "Total (con No Activos)",
              value: `${totalRoasWithNoRef.toFixed(2)}x`,
              color: getRoasColor(totalRoasWithNoRef),
              trend: totalRoasWithNoRef >= 2 ? 'positive' : totalRoasWithNoRef >= 1 ? 'neutral' : 'negative'
            }
          ]}
        />
        
        {/* Tarjeta compuesta de Ventas */}
        <CompoundKPICard
          title="Ventas"
          Icon={ShoppingCart}
          iconColor="text-green-600"
          metrics={[
            {
              label: "Ads Activos",
              value: formatNumber(totalSales),
              color: "text-purple-600"
            },
            {
              label: "Total",
              value: formatNumber(totalSalesWithNoRef),
              color: "text-blue-600"
            }
          ]}
        />
        
        {/* Tarjeta compuesta de Desglose de Ventas */}
        <CompoundKPICard
          title="Desglose de Ventas"
          Icon={BarChart4}
          iconColor="text-amber-600"
          metrics={[
            {
              label: "Ads Activos",
              value: formatNumber(totalSales),
              color: "text-purple-600"
            },
            {
              label: "Otros Ads",
              value: formatNumber(otherAdsSales),
              color: "text-emerald-600"
            },
            {
              label: "NO REF",
              value: formatNumber(pureNoRefSales),
              color: "text-red-600"
            }
          ]}
        />
      </div>

      {/* Fila 2: KPIs secundarios */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <KPICard
          title="Gasto Total"
          value={formatCurrency(totalSpend)}
          Icon={DollarSign}
          iconColor="text-blue-500"
          trend={null}
        />
        <KPICard
          title="Ingresos Totales"
          value={formatCurrency(totalSalesWithNoRef * (18000 / 4200))}
          Icon={Tag}
          iconColor="text-teal-500"
          trend={null}
        />
        <KPICard
          title="Ganancia Bruta"
          value={formatCurrency((totalSalesWithNoRef * (18000 / 4200)) - totalSpend)}
          Icon={DollarSign}
          iconColor={((totalSalesWithNoRef * (18000 / 4200)) - totalSpend) >= 0 ? "text-green-500" : "text-red-500"}
          trend={((totalSalesWithNoRef * (18000 / 4200)) - totalSpend) >= 0 ? "positive" : "negative"}
        />
        <KPICard
          title="Alcance Total"
          value={formatNumber(totalReach)}
          Icon={Users}
          iconColor="text-sky-500"
          trend={null}
        />
      </div>
    </div>
  );
}