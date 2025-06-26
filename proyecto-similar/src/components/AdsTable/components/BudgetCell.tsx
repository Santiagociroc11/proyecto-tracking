import React from 'react';

interface BudgetCellProps {
  budget: number;
  remaining: number;
  formatCurrency: (value: number) => string;
  campaignHasBudget: boolean;
  campaignActualBudget?: number;
}

export function BudgetCell({ budget, remaining, formatCurrency, campaignHasBudget, campaignActualBudget }: BudgetCellProps) {
  if (campaignHasBudget) {
    return (
      <div className="flex flex-col">
        <span className="text-sm font-medium text-blue-600">
          Campaña CBO
        </span>
        {typeof campaignActualBudget === 'number' && (
          <span className="text-xs text-gray-500">
            Total: {formatCurrency(campaignActualBudget)}
          </span>
        )}
        <span className="text-xs text-gray-500">
          (Conjunto: {formatCurrency(budget)})
        </span>
      </div>
    );
  }

  return (
    <div>
      <div>
        {budget === 0 && campaignHasBudget ? (
          <span className="text-blue-600 font-semibold" title="Este conjunto usa el presupuesto de la campaña">Presupuesto a nivel de campaña</span>
        ) : (
          formatCurrency(budget)
        )}
      </div>
      <div className="text-xs text-gray-400">
        Restante: {formatCurrency(remaining)}
      </div>
    </div>
  );
}