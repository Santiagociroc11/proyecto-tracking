import { AdData as CoreAdData } from '../../types/facebook';

export type DecisionStatus = 'keep' | 'decision-needed' | 'warning' | 'increase' | 'decrease';
export type SortField = 'conjunto' | 'presupuesto' | 'spend' | 'sales' | 'tracked_sales' | 'max_roas' | 'decision_status' | 'last_modification' | 'profit_loss' | 'sales_variation' | 'profit_variation';
export type SortDirection = 'asc' | 'desc';
export type AdsetStatus = 'ACTIVE' | 'PAUSED' | 'UNKNOWN';

export interface SortConfig {
  primary: {
    field: SortField;
    direction: SortDirection;
  };
  secondary?: {
    field: SortField;
    direction: SortDirection;
  };
}

export interface AdsTableProps {
  data: CoreAdData[];
  loading: boolean;
  onRefresh: () => void;
  formatCurrency: (value: number) => string;
}