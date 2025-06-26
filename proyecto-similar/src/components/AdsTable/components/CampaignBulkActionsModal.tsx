import React, { useState, useEffect, useCallback } from 'react';
import { Modal } from '../../Modal/Modal';
import { DollarSign, X, Filter, ChevronDown, ChevronUp, Loader2, Edit, Save, Eye, ExternalLink, ArrowUp, ArrowDown, TrendingUp, TrendingDown, Trash, BookmarkPlus } from 'lucide-react';
import { supabase } from '../../../lib/supabase';

interface CampaignBulkActionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  campaigns: Array<{
    id: string;
    name: string;
    status: string;
    presupuesto: number;
    spend: number;
    roas: number;
    sales: number;
    tracked_sales: number;
    profit_loss: number;
    hasBudget: boolean;
    actual_budget?: number;
    adSets: number;
    revenue: number;
    roi_percent: number;
    last_modification?: {
      date: string;
      rawDate: number;
      reason: string;
      previousBudget: number;
      newBudget: number;
      spendAtModification: number;
      roasAtModification: number;
      salesAtModification?: number;
      profitAtModification?: number;
    };
    roas_variation: number;
    roas_variation_percent: number;
    sales_variation: number;
    profit_variation: number;
  }>;
  formatCurrency: (value: number) => string;
  onSuccess: () => void;
}

type ActionType = 'set-fixed' | 'decrease-all' | 'increase-all' | 'roas-based' | 'compound-rule';
type RoasFilterType = 'above' | 'below' | 'between';
type RoasActionType = 'percentage' | 'fixed' | 'manual';

// Tipos para reglas condicionales compuestas
type ConditionType = 'roas' | 'spend' | 'profit' | 'budget' | 'sales' | 'roi';
type OperatorType = 'greater' | 'less' | 'equal' | 'greater_equal' | 'less_equal' | 'between';
type LogicalOperator = 'AND' | 'OR';

interface Condition {
  id: string;
  type: ConditionType;
  operator: OperatorType;
  value: number;
  value2?: number; // Para operadores "between"
}

interface CompoundRule {
  conditions: Condition[];
  operator: LogicalOperator;
  action: {
    type: 'percentage' | 'fixed';
    value: number;
    direction: 'increase' | 'decrease';
  };
}

// Función helper para determinar el color de la ganancia
const getProfitColorClass = (value: number, isBackground = false) => {
  if (isBackground) {
    return value > 0 ? 'bg-green-100' : value < 0 ? 'bg-red-100' : '';
  }
  return value > 0 ? 'text-green-600' : value < 0 ? 'text-red-600' : 'text-gray-500';
};

// Modal para visualizar y editar la tabla completa de ajustes manuales
function ManualAdjustmentTableModal({
  isOpen,
  onClose,
  campaigns,
  manualBudgets,
  setManualBudgets,
  formatCurrency,
}: {
  isOpen: boolean;
  onClose: () => void;
  campaigns: Array<{
    id: string;
    name: string;
    status: string;
    presupuesto: number;
    spend: number;
    roas: number;
    sales: number;
    tracked_sales: number;
    profit_loss: number;
    hasBudget: boolean;
    actual_budget?: number;
    adSets: number;
    revenue: number;
    roi_percent: number;
    last_modification?: {
      date: string;
      rawDate: number;
      reason: string;
      previousBudget: number;
      newBudget: number;
      spendAtModification: number;
      roasAtModification: number;
      salesAtModification?: number;
      profitAtModification?: number;
    };
    roas_variation: number;
    roas_variation_percent: number;
    sales_variation: number;
    profit_variation: number;
  }>;
  manualBudgets: Record<string, number>;
  setManualBudgets: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  formatCurrency: (value: number) => string;
}) {
  // Estado para ordenamiento
  const [sortField, setSortField] = useState<string>('roas');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Función para manejar el ordenamiento
  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  // Ordenar las campañas
  const sortedCampaigns = [...campaigns].sort((a, b) => {
    let aValue: any = a[sortField as keyof typeof a];
    let bValue: any = b[sortField as keyof typeof b];

    // Manejar valores undefined
    if (aValue === undefined) aValue = sortDirection === 'asc' ? Infinity : -Infinity;
    if (bValue === undefined) bValue = sortDirection === 'asc' ? Infinity : -Infinity;

    // Ordenar
    if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
    if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  // Calcular totales
  const totals = campaigns.reduce((acc, campaign) => {
    acc.totalSpend += campaign.spend || 0;
    acc.totalProfit += campaign.profit_loss || 0;
    acc.totalBudget += campaign.actual_budget || campaign.presupuesto;
    acc.totalNewBudget += manualBudgets[campaign.id] !== undefined
      ? manualBudgets[campaign.id]
      : (campaign.actual_budget || campaign.presupuesto);
    return acc;
  }, {
    totalSpend: 0,
    totalProfit: 0,
    totalBudget: 0,
    totalNewBudget: 0
  });

  const handleBudgetChange = (campaignId: string, value: number) => {
    setManualBudgets(prev => ({
      ...prev,
      [campaignId]: value
    }));
  };

  const calculateVariation = (original: number, newValue: number) => {
    const diff = newValue - original;
    const percentage = original > 0 ? (diff / original) * 100 : 0;
    return { diff, percentage };
  };

  const renderSortIcon = (field: string) => {
    if (sortField !== field) return null;
    return sortDirection === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />;
  };

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-7xl">
      <div className="p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold text-gray-900">Ajustes Manuales de Presupuesto - Campañas CBO</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Resumen de totales */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-blue-50 p-3 rounded-lg">
            <div className="text-xs text-blue-600 font-medium">Presupuesto Actual</div>
            <div className="text-lg font-bold text-blue-800">{formatCurrency(totals.totalBudget)}</div>
          </div>
          <div className="bg-green-50 p-3 rounded-lg">
            <div className="text-xs text-green-600 font-medium">Nuevo Presupuesto</div>
            <div className="text-lg font-bold text-green-800">{formatCurrency(totals.totalNewBudget)}</div>
          </div>
          <div className="bg-indigo-50 p-3 rounded-lg">
            <div className="text-xs text-indigo-600 font-medium">Gasto Total</div>
            <div className="text-lg font-bold text-indigo-800">{formatCurrency(totals.totalSpend)}</div>
          </div>
          <div className={`p-3 rounded-lg ${getProfitColorClass(totals.totalProfit, true)}`}>
            <div className={`text-xs font-medium ${getProfitColorClass(totals.totalProfit)}`}>Ganancia Total</div>
            <div className={`text-lg font-bold ${getProfitColorClass(totals.totalProfit)}`}>
              {formatCurrency(totals.totalProfit)}
            </div>
          </div>
        </div>

        {/* Tabla de campañas */}
        <div className="overflow-x-auto max-h-96">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th 
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                  onClick={() => handleSort('name')}
                >
                  <div className="flex items-center">
                    Campaña {renderSortIcon('name')}
                  </div>
                </th>
                <th 
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                  onClick={() => handleSort('adSets')}
                >
                  <div className="flex items-center">
                    Conjuntos {renderSortIcon('adSets')}
                  </div>
                </th>
                <th 
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                  onClick={() => handleSort('roas')}
                >
                  <div className="flex items-center">
                    ROAS {renderSortIcon('roas')}
                  </div>
                </th>
                <th 
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                  onClick={() => handleSort('spend')}
                >
                  <div className="flex items-center">
                    Gasto {renderSortIcon('spend')}
                  </div>
                </th>
                <th 
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                  onClick={() => handleSort('profit_loss')}
                >
                  <div className="flex items-center">
                    Ganancia {renderSortIcon('profit_loss')}
                  </div>
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Variaciones
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Presupuesto Actual
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Nuevo Presupuesto
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Variación
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {sortedCampaigns.map((campaign) => {
                const currentBudget = campaign.actual_budget || campaign.presupuesto;
                const newBudget = manualBudgets[campaign.id] !== undefined ? manualBudgets[campaign.id] : currentBudget;
                const variation = calculateVariation(currentBudget, newBudget);
                
                return (
                  <tr key={campaign.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm">
                      <div className="font-medium text-gray-900">{campaign.name}</div>
                      <div className="text-xs text-gray-500">{campaign.id}</div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 text-center">
                      {campaign.adSets}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`font-medium ${
                        campaign.roas >= 1.5 ? 'text-green-600' : 
                        campaign.roas >= 1.2 ? 'text-yellow-600' : 'text-red-600'
                      }`}>
                        {campaign.roas.toFixed(2)}x
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {formatCurrency(campaign.spend)}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className={getProfitColorClass(campaign.profit_loss)}>
                        {formatCurrency(campaign.profit_loss)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {campaign.last_modification ? (
                        <div className="text-xs space-y-1">
                          <div className={`${campaign.sales_variation >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            <span className="text-gray-500">V:</span> {campaign.sales_variation >= 0 ? '+' : ''}{campaign.sales_variation}
                          </div>
                          <div className={`${campaign.roas_variation_percent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            <span className="text-gray-500">R:</span> {campaign.roas_variation_percent >= 0 ? '+' : ''}{campaign.roas_variation_percent.toFixed(1)}%
                          </div>
                          <div className={`${campaign.profit_variation >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            <span className="text-gray-500">G:</span> {formatCurrency(campaign.profit_variation)}
                          </div>
                        </div>
                      ) : (
                        <span className="text-gray-400 text-xs">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {formatCurrency(currentBudget)}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <input
                        type="number"
                        value={newBudget}
                        onChange={(e) => handleBudgetChange(campaign.id, parseFloat(e.target.value) || 0)}
                        className="w-24 px-2 py-1 border border-gray-300 rounded text-sm focus:ring-indigo-500 focus:border-indigo-500"
                        min="0"
                        step="0.01"
                      />
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {Math.abs(variation.diff) > 0.01 && (
                        <div className={`flex items-center ${variation.diff > 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {variation.diff > 0 ? <ArrowUp className="w-3 h-3 mr-1" /> : <ArrowDown className="w-3 h-3 mr-1" />}
                          <span className="text-xs">
                            {formatCurrency(Math.abs(variation.diff))} ({Math.abs(variation.percentage).toFixed(1)}%)
                          </span>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors"
          >
            Aplicar Cambios
          </button>
        </div>
      </div>
    </Modal>
  );
}

// Componente para guardar perfiles
function SaveProfileModal({
  isOpen,
  onClose,
  onSave,
  initialName = '',
}: {
  isOpen: boolean;
  onClose: () => void;
  onSave: (name: string, description: string) => void;
  initialName?: string;
}) {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState('');

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setName(e.target.value);
  };

  const handleClose = () => {
    setName('');
    setDescription('');
    onClose();
  };

  const handleSave = () => {
    if (name.trim()) {
      onSave(name.trim(), description.trim());
      handleClose();
    }
  };

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={handleClose} className="max-w-md">
      <div className="p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Guardar Perfil de Acción</h3>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nombre del perfil *
            </label>
            <input
              type="text"
              value={name}
              onChange={handleNameChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="Ej: Incremento ROAS Alto"
              maxLength={50}
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Descripción (opcional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
              rows={3}
              placeholder="Describe cuándo usar este perfil..."
              maxLength={200}
            />
          </div>
        </div>

        <div className="flex justify-end space-x-3 mt-6">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim()}
            className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Guardar Perfil
          </button>
        </div>
      </div>
    </Modal>
  );
}

interface CampaignBulkActionProfile {
  id: string;
  name: string;
  description: string | null;
  action_type: ActionType;
  value: number;
  roas_filter_type: RoasFilterType | null;
  roas_min_value: number | null;
  roas_max_value: number | null;
  roas_action_type: RoasActionType | null;
  user_id: string;
  created_at: string;
  updated_at: string;
  extra_data?: {
    roasBetweenAction?: 'increase' | 'decrease';
    reason?: string;
    selectedCampaigns?: Record<string, boolean>;
    manualBudgets?: Record<string, number>;
    compoundRules?: CompoundRule;
  };
}

// Sección de reglas compuestas
const CompoundRuleSection = ({
  compoundRules,
  setCompoundRules,
  compoundRuleFilteredCampaigns,
  campaigns,
  selectedCampaigns,
  setShowManualTableModal
}: {
  compoundRules: CompoundRule;
  setCompoundRules: React.Dispatch<React.SetStateAction<CompoundRule>>;
  compoundRuleFilteredCampaigns: Array<any>;
  campaigns: Array<any>;
  selectedCampaigns: Record<string, boolean>;
  setShowManualTableModal: (show: boolean) => void;
}) => {
  const updateCondition = (id: string, updates: Partial<Condition>) => {
    setCompoundRules(prev => ({
      ...prev,
      conditions: prev.conditions.map(condition =>
        condition.id === id ? { ...condition, ...updates } : condition
      )
    }));
  };

  const removeCondition = (id: string) => {
    setCompoundRules(prev => ({
      ...prev,
      conditions: prev.conditions.filter(condition => condition.id !== id)
    }));
  };

  const addCondition = () => {
    const newCondition: Condition = {
      id: Date.now().toString(),
      type: 'roas',
      operator: 'greater',
      value: 1.5
    };
    setCompoundRules(prev => ({
      ...prev,
      conditions: [...prev.conditions, newCondition]
    }));
  };

  const getConditionLabel = (type: ConditionType) => {
    const labels = {
      roas: 'ROAS',
      spend: 'Gasto',
      profit: 'Ganancia',
      budget: 'Presupuesto',
      sales: 'Ventas',
      roi: 'ROI %'
    };
    return labels[type];
  };

  const getOperatorLabel = (operator: OperatorType) => {
    const labels = {
      greater: '>',
      less: '<',
      equal: '=',
      greater_equal: '≥',
      less_equal: '≤',
      between: 'entre'
    };
    return labels[operator];
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-gray-700">Condiciones</h4>
        <button
          onClick={addCondition}
          className="text-sm text-indigo-600 hover:text-indigo-800"
        >
          + Agregar condición
        </button>
      </div>

      {compoundRules.conditions.map((condition, index) => (
        <div key={condition.id} className="flex items-center space-x-2 p-3 bg-gray-50 rounded-lg">
          {index > 0 && (
            <select
              value={compoundRules.operator}
              onChange={(e) => setCompoundRules(prev => ({ ...prev, operator: e.target.value as LogicalOperator }))}
              className="px-2 py-1 border border-gray-300 rounded text-sm"
            >
              <option value="AND">Y</option>
              <option value="OR">O</option>
            </select>
          )}

          <select
            value={condition.type}
            onChange={(e) => updateCondition(condition.id, { type: e.target.value as ConditionType })}
            className="px-2 py-1 border border-gray-300 rounded text-sm"
          >
            <option value="roas">ROAS</option>
            <option value="spend">Gasto</option>
            <option value="profit">Ganancia</option>
            <option value="budget">Presupuesto</option>
            <option value="sales">Ventas</option>
            <option value="roi">ROI %</option>
          </select>

          <select
            value={condition.operator}
            onChange={(e) => updateCondition(condition.id, { operator: e.target.value as OperatorType })}
            className="px-2 py-1 border border-gray-300 rounded text-sm"
          >
            <option value="greater">Mayor que</option>
            <option value="greater_equal">Mayor o igual</option>
            <option value="less">Menor que</option>
            <option value="less_equal">Menor o igual</option>
            <option value="equal">Igual a</option>
            <option value="between">Entre</option>
          </select>

          <input
            type="number"
            value={condition.value}
            onChange={(e) => updateCondition(condition.id, { value: parseFloat(e.target.value) || 0 })}
            className="w-20 px-2 py-1 border border-gray-300 rounded text-sm"
            step="0.01"
          />

          {condition.operator === 'between' && (
            <>
              <span className="text-sm text-gray-500">y</span>
              <input
                type="number"
                value={condition.value2 || 0}
                onChange={(e) => updateCondition(condition.id, { value2: parseFloat(e.target.value) || 0 })}
                className="w-20 px-2 py-1 border border-gray-300 rounded text-sm"
                step="0.01"
              />
            </>
          )}

          <button
            onClick={() => removeCondition(condition.id)}
            className="text-red-600 hover:text-red-800"
          >
            <Trash className="w-4 h-4" />
          </button>
        </div>
      ))}

      <div className="p-3 bg-blue-50 rounded-lg">
        <h5 className="text-sm font-medium text-blue-800 mb-2">Acción a realizar</h5>
        <div className="flex items-center space-x-2">
          <select
            value={compoundRules.action.direction}
            onChange={(e) => setCompoundRules(prev => ({
              ...prev,
              action: { ...prev.action, direction: e.target.value as 'increase' | 'decrease' }
            }))}
            className="px-2 py-1 border border-gray-300 rounded text-sm"
          >
            <option value="increase">Incrementar</option>
            <option value="decrease">Disminuir</option>
          </select>

          <select
            value={compoundRules.action.type}
            onChange={(e) => setCompoundRules(prev => ({
              ...prev,
              action: { ...prev.action, type: e.target.value as 'percentage' | 'fixed' }
            }))}
            className="px-2 py-1 border border-gray-300 rounded text-sm"
          >
            <option value="percentage">Porcentaje</option>
            <option value="fixed">Valor fijo</option>
          </select>

          <input
            type="number"
            value={compoundRules.action.value}
            onChange={(e) => setCompoundRules(prev => ({
              ...prev,
              action: { ...prev.action, value: parseFloat(e.target.value) || 0 }
            }))}
            className="w-20 px-2 py-1 border border-gray-300 rounded text-sm"
            step="0.01"
            min="0"
          />

          <span className="text-sm text-gray-500">
            {compoundRules.action.type === 'percentage' ? '%' : '$'}
          </span>
        </div>
      </div>

      {compoundRuleFilteredCampaigns.length > 0 && (
        <div className="p-3 bg-green-50 rounded-lg">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-green-800">
              {compoundRuleFilteredCampaigns.length} campañas cumplen las condiciones
            </span>
            <button
              onClick={() => setShowManualTableModal(true)}
              className="text-sm text-green-600 hover:text-green-800 flex items-center"
            >
              <Eye className="w-4 h-4 mr-1" />
              Ver detalles
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export function CampaignBulkActionsModal({
  isOpen,
  onClose,
  campaigns: initialCampaigns,
  formatCurrency,
  onSuccess,
}: CampaignBulkActionsModalProps) {
  const [selectedAction, setSelectedAction] = useState<ActionType>('set-fixed');
  const [fixedBudget, setFixedBudget] = useState<number>(5);
  const [percentageChange, setPercentageChange] = useState<number>(10);
  const [roasThreshold, setRoasThreshold] = useState<number>(1.5);
  const [roasMinThreshold, setRoasMinThreshold] = useState<number>(1);
  const [roasMaxThreshold, setRoasMaxThreshold] = useState<number>(2);
  const [roasFilter, setRoasFilter] = useState<RoasFilterType>('above');
  const [roasBetweenAction, setRoasBetweenAction] = useState<'increase' | 'decrease'>('increase');
  const [roasActionType, setRoasActionType] = useState<RoasActionType>('percentage');
  const [reason, setReason] = useState<string>('');
  const [showCampaigns, setShowCampaigns] = useState(false);
  const [selectedCampaigns, setSelectedCampaigns] = useState<Record<string, boolean>>({});
  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState<{
    success: number;
    failed: number;
    modified: Array<{ name: string; oldBudget: number; newBudget: number }>;
  } | null>(null);

  // Estados para funcionalidades avanzadas
  const [profiles, setProfiles] = useState<CampaignBulkActionProfile[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<string>('');
  const [showSaveProfile, setShowSaveProfile] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [manualBudgets, setManualBudgets] = useState<Record<string, number>>({});
  const [showManualTableModal, setShowManualTableModal] = useState(false);
  const [compoundRules, setCompoundRules] = useState<CompoundRule>({
    conditions: [],
    operator: 'AND',
    action: {
      type: 'percentage',
      value: 10,
      direction: 'increase'
    }
  });

  // Cargar perfiles al abrir el modal
  useEffect(() => {
    if (isOpen) {
      fetchProfiles();
      // Seleccionar todas las campañas CBO por defecto
      const defaultSelection: Record<string, boolean> = {};
      initialCampaigns.forEach(campaign => {
        if (campaign.hasBudget) {
          defaultSelection[campaign.id] = true;
        }
      });
      setSelectedCampaigns(defaultSelection);
    }
  }, [isOpen, initialCampaigns]);

  const fetchProfiles = async () => {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) return;

      const { data, error } = await supabase
        .from('campaign_bulk_action_profiles')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching profiles:', error);
        return;
      }

      setProfiles(data || []);
    } catch (error) {
      console.error('Error in fetchProfiles:', error);
    }
  };

  const saveProfile = async () => {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        throw new Error('Error de autenticación');
      }

      const profileData = {
        action_type: selectedAction,
        value: selectedAction === 'set-fixed' ? fixedBudget : percentageChange,
        roas_filter_type: selectedAction === 'roas-based' ? roasFilter : null,
        roas_min_value: selectedAction === 'roas-based' && roasFilter === 'between' ? roasMinThreshold : null,
        roas_max_value: selectedAction === 'roas-based' && roasFilter === 'between' ? roasMaxThreshold : roasThreshold,
        roas_action_type: selectedAction === 'roas-based' ? roasActionType : null,
        user_id: user.id,
        extra_data: {
          roasBetweenAction,
          reason,
          selectedCampaigns,
          manualBudgets: selectedAction === 'roas-based' && roasActionType === 'manual' ? manualBudgets : undefined,
          compoundRules: selectedAction === 'compound-rule' ? compoundRules : undefined,
        }
      };

      if (editingProfile && selectedProfile) {
        const { error } = await supabase
          .from('campaign_bulk_action_profiles')
          .update(profileData)
          .eq('id', selectedProfile);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('campaign_bulk_action_profiles')
          .insert(profileData);

        if (error) throw error;
      }

      await fetchProfiles();
      setEditingProfile(false);
      setSelectedProfile('');
    } catch (error) {
      console.error('Error saving profile:', error);
      alert('Error al guardar el perfil');
    }
  };

  const loadProfile = async (profileId: string) => {
    try {
      const profile = profiles.find(p => p.id === profileId);
      if (!profile) return;

      setSelectedAction(profile.action_type);
      
      if (profile.action_type === 'set-fixed') {
        setFixedBudget(profile.value);
      } else {
        setPercentageChange(profile.value);
      }

      if (profile.roas_filter_type) {
        setRoasFilter(profile.roas_filter_type);
      }
      
      if (profile.roas_min_value !== null) {
        setRoasMinThreshold(profile.roas_min_value);
      }
      
      if (profile.roas_max_value !== null) {
        if (profile.roas_filter_type === 'between') {
          setRoasMaxThreshold(profile.roas_max_value);
        } else {
          setRoasThreshold(profile.roas_max_value);
        }
      }

      if (profile.roas_action_type) {
        setRoasActionType(profile.roas_action_type);
      }

      if (profile.extra_data) {
        if (profile.extra_data.roasBetweenAction) {
          setRoasBetweenAction(profile.extra_data.roasBetweenAction);
        }
        if (profile.extra_data.reason) {
          setReason(profile.extra_data.reason);
        }
        if (profile.extra_data.selectedCampaigns) {
          setSelectedCampaigns(profile.extra_data.selectedCampaigns);
        }
        if (profile.extra_data.manualBudgets) {
          setManualBudgets(profile.extra_data.manualBudgets);
        }
        if (profile.extra_data.compoundRules) {
          setCompoundRules(profile.extra_data.compoundRules);
        }
      }

      setSelectedProfile(profileId);
    } catch (error) {
      console.error('Error loading profile:', error);
    }
  };

  const deleteProfile = async () => {
    if (!selectedProfile) return;
    
    if (!confirm('¿Estás seguro de que quieres eliminar este perfil?')) return;

    try {
      const { error } = await supabase
        .from('campaign_bulk_action_profiles')
        .delete()
        .eq('id', selectedProfile);

      if (error) throw error;

      await fetchProfiles();
      setSelectedProfile('');
      setEditingProfile(false);
    } catch (error) {
      console.error('Error deleting profile:', error);
      alert('Error al eliminar el perfil');
    }
  };

  const handleProfileChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const profileId = e.target.value;
    if (profileId) {
      loadProfile(profileId);
    } else {
      setSelectedProfile('');
    }
  };

  const handleSaveClick = () => {
    if (editingProfile) {
      saveProfile();
    } else {
      setShowSaveProfile(true);
    }
  };

  const handleEditClick = () => {
    setEditingProfile(true);
  };

  const calculateNewBudget = (campaign: { id?: string, presupuesto: number; roas: number; spend?: number; profit_loss?: number; sales?: number; actual_budget?: number }): number => {
    const currentBudget = campaign.actual_budget || campaign.presupuesto;
    
    switch (selectedAction) {
      case 'set-fixed':
        return fixedBudget;
      case 'decrease-all':
        return currentBudget * (1 - percentageChange / 100);
      case 'increase-all':
        return currentBudget * (1 + percentageChange / 100);
      case 'roas-based':
        if (roasActionType === 'manual') {
          return manualBudgets[campaign.id!] !== undefined ? manualBudgets[campaign.id!] : currentBudget;
        }
        
        let shouldApplyAction = false;
        if (roasFilter === 'above') {
          shouldApplyAction = campaign.roas >= roasThreshold;
        } else if (roasFilter === 'below') {
          shouldApplyAction = campaign.roas < roasThreshold;
        } else if (roasFilter === 'between') {
          shouldApplyAction = campaign.roas >= roasMinThreshold && campaign.roas <= roasMaxThreshold;
        }
        
        if (!shouldApplyAction) return currentBudget;
        
        if (roasActionType === 'percentage') {
          const multiplier = roasFilter === 'below' || (roasFilter === 'between' && roasBetweenAction === 'decrease') 
            ? (1 - percentageChange / 100) 
            : (1 + percentageChange / 100);
          return currentBudget * multiplier;
        } else if (roasActionType === 'fixed') {
          return fixedBudget;
        }
        return currentBudget;
      case 'compound-rule':
        if (evaluateCompoundConditions(campaign, compoundRules)) {
          if (compoundRules.action.type === 'percentage') {
            const multiplier = compoundRules.action.direction === 'increase' 
              ? (1 + compoundRules.action.value / 100)
              : (1 - compoundRules.action.value / 100);
            return currentBudget * multiplier;
          } else {
            return compoundRules.action.value;
          }
        }
        return currentBudget;
      default:
        return currentBudget;
    }
  };

  const evaluateCompoundConditions = (
    campaign: { id?: string, presupuesto: number; roas: number; spend?: number; profit_loss?: number; sales?: number; actual_budget?: number },
    rule: CompoundRule
  ): boolean => {
    if (rule.conditions.length === 0) return false;

    const results = rule.conditions.map(condition => {
      let value: number;
      
      switch (condition.type) {
        case 'roas':
          value = campaign.roas;
          break;
        case 'spend':
          value = campaign.spend || 0;
          break;
        case 'profit':
          value = campaign.profit_loss || 0;
          break;
        case 'budget':
          value = campaign.actual_budget || campaign.presupuesto;
          break;
        case 'sales':
          value = campaign.sales || 0;
          break;
        case 'roi':
          const currentBudget = campaign.actual_budget || campaign.presupuesto;
          value = currentBudget > 0 ? ((campaign.profit_loss || 0) / currentBudget) * 100 : 0;
          break;
        default:
          return false;
      }

      switch (condition.operator) {
        case 'greater':
          return value > condition.value;
        case 'greater_equal':
          return value >= condition.value;
        case 'less':
          return value < condition.value;
        case 'less_equal':
          return value <= condition.value;
        case 'equal':
          return Math.abs(value - condition.value) < 0.01;
        case 'between':
          return value >= condition.value && value <= (condition.value2 || condition.value);
        default:
          return false;
      }
    });

    return rule.operator === 'AND' ? results.every(r => r) : results.some(r => r);
  };

  const processBulkAction = async () => {
    try {
      setProcessing(true);
      const campaignsToModify = initialCampaigns.filter(
        campaign => selectedCampaigns[campaign.id] && campaign.hasBudget
      );

      if (campaignsToModify.length === 0) {
        alert('No hay campañas seleccionadas para modificar');
        return;
      }

      let successCount = 0;
      let failCount = 0;
      const modifiedCampaigns: Array<{ name: string; oldBudget: number; newBudget: number }> = [];

      // Obtener el usuario actual
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        throw new Error('Error de autenticación');
      }

      for (const campaign of campaignsToModify) {
        try {
          const newBudget = calculateNewBudget(campaign);
          const currentBudget = campaign.actual_budget || campaign.presupuesto;

          // Solo proceder si hay un cambio real en el presupuesto
          if (Math.abs(newBudget - currentBudget) < 0.01) {
            continue;
          }

          // Registrar la modificación en la misma tabla que los conjuntos
          // Usamos adset_id para almacenar campaign_id y agregamos un prefijo para identificar
          const { error: modificationError } = await supabase
            .from('budget_modifications')
            .insert({
              adset_id: `campaign_${campaign.id}`, // Prefijo para identificar que es una campaña
              previous_budget: currentBudget,
              new_budget: newBudget,
              reason: `[CAMPAÑA CBO] ${reason || `Acción masiva: ${selectedAction}`}`,
              user_id: user.id,
              spend_at_modification: campaign.spend,
              roas_at_modification: campaign.roas,
              sales_at_modification: Math.max(campaign.sales, campaign.tracked_sales),
              profit_at_modification: campaign.profit_loss,
            });

          if (modificationError) {
            throw modificationError;
          }

          // Actualizar el presupuesto de la campaña
          const { error: updateError } = await supabase
            .from('campaigns')
            .update({ actual_budget: newBudget })
            .eq('id', campaign.id);

          if (updateError) {
            throw updateError;
          }

          successCount++;
          modifiedCampaigns.push({
            name: campaign.name,
            oldBudget: currentBudget,
            newBudget: newBudget,
          });
        } catch (error) {
          console.error(`Error modificando campaña ${campaign.name}:`, error);
          failCount++;
        }
      }

      setResults({
        success: successCount,
        failed: failCount,
        modified: modifiedCampaigns,
      });

      if (successCount > 0) {
        setTimeout(() => {
          onSuccess();
        }, 100);
      }
    } catch (error) {
      console.error('Error in bulk action:', error);
      alert('Error al procesar la acción masiva');
    } finally {
      setProcessing(false);
    }
  };

  const toggleAllCampaigns = (check: boolean) => {
    const newSelection = { ...selectedCampaigns };
    initialCampaigns.forEach(campaign => {
      if (campaign.hasBudget) {
        newSelection[campaign.id] = check;
      }
    });
    setSelectedCampaigns(newSelection);
  };

  // Filtrar campañas según el criterio ROAS
  const roasFilteredCampaigns = initialCampaigns.filter(campaign => {
    if (!selectedCampaigns[campaign.id] || !campaign.hasBudget) return false;
    
    if (selectedAction === 'roas-based') {
      return roasFilter === 'between'
        ? campaign.roas >= roasMinThreshold && campaign.roas <= roasMaxThreshold
        : roasFilter === 'above'
          ? campaign.roas >= roasThreshold
          : campaign.roas < roasThreshold;
    } else if (selectedAction === 'compound-rule') {
      return evaluateCompoundConditions(campaign, compoundRules);
    }
    
    return true;
  });

  // Calcular el presupuesto total actual y nuevo
  const campaignsToModify = roasFilteredCampaigns;
  const totalCurrentBudget = campaignsToModify.reduce((sum, campaign) => sum + (campaign.actual_budget || campaign.presupuesto), 0);
  const totalNewBudget = campaignsToModify.reduce((sum, campaign) => sum + calculateNewBudget(campaign), 0);
  const budgetDifference = totalNewBudget - totalCurrentBudget;

  if (!isOpen) return null;

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} className="max-w-4xl">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold text-gray-900">Acciones Masivas - Campañas CBO</h2>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
              <X className="h-6 w-6" />
            </button>
          </div>

          {/* Gestión de perfiles */}
          <div className="mb-6 p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-gray-700">Perfiles Guardados</h3>
              <div className="flex space-x-2">
                {selectedProfile && (
                  <>
                    <button
                      onClick={handleEditClick}
                      className="text-sm text-blue-600 hover:text-blue-800 flex items-center"
                    >
                      <Edit className="w-4 h-4 mr-1" />
                      {editingProfile ? 'Editando...' : 'Editar'}
                    </button>
                    <button
                      onClick={deleteProfile}
                      className="text-sm text-red-600 hover:text-red-800 flex items-center"
                    >
                      <Trash className="w-4 h-4 mr-1" />
                      Eliminar
                    </button>
                  </>
                )}
                <button
                  onClick={handleSaveClick}
                  className="text-sm text-green-600 hover:text-green-800 flex items-center"
                >
                  <BookmarkPlus className="w-4 h-4 mr-1" />
                  {editingProfile ? 'Actualizar' : 'Guardar'}
                </button>
              </div>
            </div>
            
            <select
              value={selectedProfile}
              onChange={handleProfileChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="">Seleccionar perfil guardado...</option>
              {profiles.map(profile => (
                <option key={profile.id} value={profile.id}>
                  {profile.name} {profile.description && `- ${profile.description}`}
                </option>
              ))}
            </select>
          </div>

          {/* Tipo de acción */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Tipo de Acción
            </label>
            <select
              value={selectedAction}
              onChange={(e) => setSelectedAction(e.target.value as ActionType)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="set-fixed">Establecer presupuesto fijo</option>
              <option value="increase-all">Incrementar todos los presupuestos</option>
              <option value="decrease-all">Disminuir todos los presupuestos</option>
              <option value="roas-based">Basado en ROAS</option>
              <option value="compound-rule">Regla compuesta (condiciones múltiples)</option>
            </select>
          </div>

          {/* Configuración específica por tipo de acción */}
          {selectedAction === 'set-fixed' && (
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Presupuesto fijo (USD)
              </label>
              <input
                type="number"
                value={fixedBudget}
                onChange={(e) => setFixedBudget(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                min="0"
                step="0.01"
              />
            </div>
          )}

          {(selectedAction === 'increase-all' || selectedAction === 'decrease-all') && (
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Porcentaje de {selectedAction === 'increase-all' ? 'incremento' : 'disminución'} (%)
              </label>
              <input
                type="number"
                value={percentageChange}
                onChange={(e) => setPercentageChange(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                min="0"
                max="100"
                step="0.1"
              />
            </div>
          )}

          {selectedAction === 'roas-based' && (
            <div className="mb-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Filtro ROAS
                </label>
                <select
                  value={roasFilter}
                  onChange={(e) => setRoasFilter(e.target.value as RoasFilterType)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="above">ROAS mayor o igual a</option>
                  <option value="below">ROAS menor a</option>
                  <option value="between">ROAS entre</option>
                </select>
              </div>

              {roasFilter === 'between' ? (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      ROAS mínimo
                    </label>
                    <input
                      type="number"
                      value={roasMinThreshold}
                      onChange={(e) => setRoasMinThreshold(parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                      min="0"
                      step="0.1"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      ROAS máximo
                    </label>
                    <input
                      type="number"
                      value={roasMaxThreshold}
                      onChange={(e) => setRoasMaxThreshold(parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                      min="0"
                      step="0.1"
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Umbral ROAS
                  </label>
                  <input
                    type="number"
                    value={roasThreshold}
                    onChange={(e) => setRoasThreshold(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                    min="0"
                    step="0.1"
                  />
                </div>
              )}

              {roasFilter === 'between' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Acción para campañas en el rango
                  </label>
                  <select
                    value={roasBetweenAction}
                    onChange={(e) => setRoasBetweenAction(e.target.value as 'increase' | 'decrease')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                  >
                    <option value="increase">Incrementar presupuesto</option>
                    <option value="decrease">Disminuir presupuesto</option>
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tipo de ajuste
                </label>
                <select
                  value={roasActionType}
                  onChange={(e) => setRoasActionType(e.target.value as RoasActionType)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="percentage">Porcentaje</option>
                  <option value="fixed">Valor fijo</option>
                  <option value="manual">Ajuste manual</option>
                </select>
              </div>

              {roasActionType === 'percentage' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Porcentaje de cambio (%)
                  </label>
                  <input
                    type="number"
                    value={percentageChange}
                    onChange={(e) => setPercentageChange(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                    min="0"
                    step="0.1"
                  />
                </div>
              )}

              {roasActionType === 'fixed' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Nuevo presupuesto (USD)
                  </label>
                  <input
                    type="number"
                    value={fixedBudget}
                    onChange={(e) => setFixedBudget(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                    min="0"
                    step="0.01"
                  />
                </div>
              )}

              {roasActionType === 'manual' && (
                <div className="p-3 bg-blue-50 rounded-lg">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-blue-800">
                      Ajuste manual de presupuestos
                    </span>
                    <button
                      onClick={() => setShowManualTableModal(true)}
                      className="text-sm text-blue-600 hover:text-blue-800 flex items-center"
                    >
                      <Edit className="w-4 h-4 mr-1" />
                      Editar presupuestos
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {selectedAction === 'compound-rule' && (
            <div className="mb-6">
              <CompoundRuleSection
                compoundRules={compoundRules}
                setCompoundRules={setCompoundRules}
                compoundRuleFilteredCampaigns={roasFilteredCampaigns}
                campaigns={initialCampaigns}
                selectedCampaigns={selectedCampaigns}
                setShowManualTableModal={setShowManualTableModal}
              />
            </div>
          )}

          {/* Razón */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Razón del cambio (opcional)
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
              rows={2}
              placeholder="Describe por qué estás haciendo este cambio..."
            />
          </div>

          {/* Selección de campañas */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <label className="block text-sm font-medium text-gray-700">
                Campañas a modificar ({Object.values(selectedCampaigns).filter(Boolean).length} seleccionadas)
              </label>
              <div className="flex space-x-2">
                <button
                  onClick={() => toggleAllCampaigns(true)}
                  className="text-sm text-indigo-600 hover:text-indigo-800"
                >
                  Seleccionar todas
                </button>
                <button
                  onClick={() => toggleAllCampaigns(false)}
                  className="text-sm text-gray-600 hover:text-gray-800"
                >
                  Deseleccionar todas
                </button>
                <button
                  onClick={() => setShowCampaigns(!showCampaigns)}
                  className="text-sm text-gray-600 hover:text-gray-800 flex items-center"
                >
                  {showCampaigns ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  {showCampaigns ? 'Ocultar' : 'Mostrar'} lista
                </button>
              </div>
            </div>

            {showCampaigns && (
              <div className="max-h-60 overflow-y-auto border border-gray-200 rounded-md">
                {initialCampaigns.filter(campaign => campaign.hasBudget).map((campaign) => (
                  <div key={campaign.id} className="flex items-center p-3 border-b border-gray-100 last:border-b-0">
                    <input
                      type="checkbox"
                      checked={selectedCampaigns[campaign.id] || false}
                      onChange={(e) => setSelectedCampaigns(prev => ({
                        ...prev,
                        [campaign.id]: e.target.checked
                      }))}
                      className="mr-3 h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                    />
                    <div className="flex-1">
                      <div className="font-medium text-gray-900">{campaign.name}</div>
                      <div className="text-sm text-gray-500">
                        {campaign.adSets} conjuntos • ROAS: {campaign.roas.toFixed(2)}x • 
                        Presupuesto: {formatCurrency(campaign.actual_budget || campaign.presupuesto)} • 
                        Gasto: {formatCurrency(campaign.spend)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-sm font-medium ${getProfitColorClass(campaign.profit_loss)}`}>
                        {formatCurrency(campaign.profit_loss)}
                      </div>
                      <div className="text-xs text-gray-500">
                        ROI: {campaign.roi_percent.toFixed(1)}%
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Resumen de cambios */}
          {campaignsToModify.length > 0 && (
            <div className="mb-6 p-4 bg-blue-50 rounded-lg">
              <h3 className="text-sm font-medium text-blue-800 mb-2">Resumen de cambios</h3>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-blue-600">Campañas afectadas:</span>
                  <span className="font-medium ml-1">{campaignsToModify.length}</span>
                </div>
                <div>
                  <span className="text-blue-600">Presupuesto actual:</span>
                  <span className="font-medium ml-1">{formatCurrency(totalCurrentBudget)}</span>
                </div>
                <div>
                  <span className="text-blue-600">Nuevo presupuesto:</span>
                  <span className="font-medium ml-1">{formatCurrency(totalNewBudget)}</span>
                </div>
              </div>
              <div className="mt-2">
                <span className="text-blue-600">Diferencia:</span>
                <span className={`font-medium ml-1 ${budgetDifference >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {budgetDifference >= 0 ? '+' : ''}{formatCurrency(budgetDifference)}
                </span>
              </div>
            </div>
          )}

          {/* Resultados */}
          {results && (
            <div className="mb-6 p-4 bg-green-50 rounded-lg">
              <h3 className="text-sm font-medium text-green-800 mb-2">Resultados</h3>
              <div className="text-sm text-green-700">
                <p>✅ {results.success} campañas modificadas exitosamente</p>
                {results.failed > 0 && <p>❌ {results.failed} campañas fallaron</p>}
              </div>
              {results.modified.length > 0 && (
                <div className="mt-2 max-h-32 overflow-y-auto">
                  <div className="text-xs text-green-600">Campañas modificadas:</div>
                  {results.modified.map((mod, index) => (
                    <div key={index} className="text-xs text-green-700">
                      {mod.name}: {formatCurrency(mod.oldBudget)} → {formatCurrency(mod.newBudget)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Botones de acción */}
          <div className="flex justify-end space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={processBulkAction}
              disabled={processing || campaignsToModify.length === 0}
              className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center"
            >
              {processing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Procesando...
                </>
              ) : (
                `Aplicar cambios (${campaignsToModify.length} campañas)`
              )}
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal de tabla manual */}
      <ManualAdjustmentTableModal
        isOpen={showManualTableModal}
        onClose={() => setShowManualTableModal(false)}
        campaigns={roasFilteredCampaigns}
        manualBudgets={manualBudgets}
        setManualBudgets={setManualBudgets}
        formatCurrency={formatCurrency}
      />

      {/* Modal para guardar perfil */}
      <SaveProfileModal
        isOpen={showSaveProfile}
        onClose={() => setShowSaveProfile(false)}
        onSave={(name, description) => {
          // Implementar lógica de guardado
          console.log('Saving profile:', name, description);
          setShowSaveProfile(false);
        }}
      />
    </>
  );
} 