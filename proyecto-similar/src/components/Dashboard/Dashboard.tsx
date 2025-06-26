import React from 'react';
import { KPIGrid } from './KPIGrid';
import { ROASChart } from '../ROASChart/ROASChart';
import { AdsTable } from '../AdsTable/AdsTable';
import { formatCurrency } from '../../utils/format';
import { AdData } from '../AdsTable/types';

interface DashboardProps {
  data: AdData[];
  loading: boolean;
  totalSpend: number;
  averageRoas: number;
  totalRoasWithNoRef: number;
  totalSales: number;
  totalSalesWithNoRef: number;
  totalReach: number;
  noRefSalesCount?: number;
  otherAdsSalesCount?: number;
  nonActiveAdsSalesCount?: number;
  onRefresh: () => void;
}

export function Dashboard({
  data = [],
  loading,
  totalSpend,
  averageRoas,
  totalRoasWithNoRef,
  totalSales,
  totalSalesWithNoRef,
  totalReach,
  noRefSalesCount,
  otherAdsSalesCount,
  nonActiveAdsSalesCount,
  onRefresh
}: DashboardProps) {
  return (
    <main className="max-w-8xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6 md:py-8 space-y-4 sm:space-y-6 md:space-y-8">
      <KPIGrid
        totalSpend={totalSpend}
        averageRoas={averageRoas}
        totalRoasWithNoRef={totalRoasWithNoRef}
        totalSales={totalSales}
        totalSalesWithNoRef={totalSalesWithNoRef}
        totalReach={totalReach}
        noRefSalesCount={noRefSalesCount}
        otherAdsSalesCount={otherAdsSalesCount}
        nonActiveAdsSalesCount={nonActiveAdsSalesCount}
      />
      <ROASChart data={data} />
      <AdsTable
        data={data}
        loading={loading}
        onRefresh={onRefresh}
        formatCurrency={formatCurrency}
      />
    </main>
  );
}