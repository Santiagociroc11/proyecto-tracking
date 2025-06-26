import React, { useState, useEffect, useCallback } from 'react';
import { Modal } from '../../Modal/Modal';
import { DollarSign, X, Filter, ChevronDown, ChevronUp, Loader2, Edit, Save, Eye, ExternalLink, ArrowUp, ArrowDown, TrendingUp, TrendingDown, Trash, BookmarkPlus } from 'lucide-react';
import { supabase } from '../../../lib/supabase';

interface BulkActionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  adSets: Array<{
    adsetId: string;
    name: string;
    status: string;
    presupuesto: number;
    roas: number;
    sales?: number;
    tracked_sales?: number;
    spend?: number;
    profit?: number;
    last_modification?: {
      date: string;
      rawDate: number;
      reason: string;
      previousBudget: number;
      newBudget: number;
      profitAtModification?: number;
      roasAtModification?: number;
      spendAtModification?: number;
    };
  }>;
  formatCurrency: (value: number) => string;
  onSuccess: () => void;
}

type ActionType = 'set-fixed' | 'decrease-all' | 'increase-all' | 'roas-based' | 'compound-rule';
type RoasFilterType = 'above' | 'below' | 'between';
type RoasActionType = 'percentage' | 'fixed' | 'manual';

// Tipos para reglas condicionales compuestas
type ConditionType = 'roas' | 'spend' | 'profit' | 'budget' | 'sales';
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

// Función para formatear el tiempo relativo (hace X tiempo)
const formatTimeAgo = (timestamp: number): string => {
  const now = Date.now();
  const diffMs = now - timestamp;

  // Convertir a segundos
  const diffSec = Math.floor(diffMs / 1000);

  // Segundos
  if (diffSec < 60) {
    return `hace ${diffSec} segundo${diffSec !== 1 ? 's' : ''}`;
  }

  // Minutos
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) {
    return `hace ${diffMin} minuto${diffMin !== 1 ? 's' : ''}`;
  }

  // Horas
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) {
    return `hace ${diffHour} hora${diffHour !== 1 ? 's' : ''}`;
  }

  // Días
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 30) {
    return `hace ${diffDay} día${diffDay !== 1 ? 's' : ''}`;
  }

  // Meses
  const diffMonth = Math.floor(diffDay / 30);
  if (diffMonth < 12) {
    return `hace ${diffMonth} mes${diffMonth !== 1 ? 'es' : ''}`;
  }

  // Años
  const diffYear = Math.floor(diffMonth / 12);
  return `hace ${diffYear} año${diffYear !== 1 ? 's' : ''}`;
};

// Modal para visualizar y editar la tabla completa de ajustes manuales
function ManualAdjustmentTableModal({
  isOpen,
  onClose,
  adSets,
  manualBudgets,
  setManualBudgets,
  formatCurrency,
}: {
  isOpen: boolean;
  onClose: () => void;
  adSets: Array<{
    adsetId: string;
    name: string;
    status: string;
    presupuesto: number;
    roas: number;
    sales?: number;
    tracked_sales?: number;
    spend?: number;
    profit?: number;
    last_modification?: {
      date: string;
      rawDate: number;
      reason: string;
      previousBudget: number;
      newBudget: number;
      profitAtModification?: number;
      roasAtModification?: number;
      spendAtModification?: number;
    };
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

  // Ordenar los adSets
  const sortedAdSets = [...adSets].sort((a, b) => {
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
  const totals = adSets.reduce((acc, adSet) => {
    acc.totalSpend += adSet.spend || 0;
    acc.totalProfit += adSet.profit || 0;
    acc.totalBudget += adSet.presupuesto;
    acc.totalNewBudget += manualBudgets[adSet.adsetId] !== undefined
      ? manualBudgets[adSet.adsetId]
      : adSet.presupuesto;
    return acc;
  }, {
    totalSpend: 0,
    totalProfit: 0,
    totalBudget: 0,
    totalNewBudget: 0
  });

  const handleBudgetChange = (adsetId: string, value: number) => {
    setManualBudgets(prev => ({
      ...prev,
      [adsetId]: value
    }));
  };

  const calculateVariation = (original: number, newValue: number) => {
    const diff = newValue - original;
    const percent = original > 0 ? (diff / original) * 100 : 0;
    return {
      diff,
      percent,
      isIncrease: diff > 0
    };
  };

  const renderSortIcon = (field: string) => {
    if (sortField !== field) return null;
    return sortDirection === 'asc' ? <ArrowUp className="h-3 w-3 ml-1" /> : <ArrowDown className="h-3 w-3 ml-1" />;
  };

  // Función de formateo en este componente
  const formatDate = (dateString: string, rawDate?: number): string => {
    if (rawDate) {
      return `${formatTimeAgo(rawDate)} (${dateString})`;
    }
    return dateString;
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="p-6">
        <div className="flex justify-between items-start mb-5">
          <h2 className="text-xl font-semibold text-gray-900">
            Tabla de Ajuste Manual - {adSets.length} Conjuntos
          </h2>
          <button
            onClick={onClose}
            className="rounded-full p-1 hover:bg-gray-100 text-gray-500"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-5 bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th
                    className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                    onClick={() => handleSort('name')}
                  >
                    <div className="flex items-center">
                      Conjunto {renderSortIcon('name')}
                    </div>
                  </th>
                  <th
                    className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                    onClick={() => handleSort('roas')}
                  >
                    <div className="flex items-center justify-end">
                      ROAS {renderSortIcon('roas')}
                    </div>
                  </th>
                  <th
                    className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                    onClick={() => handleSort('spend')}
                  >
                    <div className="flex items-center justify-end">
                      Gasto {renderSortIcon('spend')}
                    </div>
                  </th>
                  <th
                    className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                    onClick={() => handleSort('profit')}
                  >
                    <div className="flex items-center justify-end">
                      Profit/Loss {renderSortIcon('profit')}
                    </div>
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Última Modificación
                  </th>
                  <th
                    className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                    onClick={() => handleSort('presupuesto')}
                  >
                    <div className="flex items-center justify-end">
                      Presupuesto Actual {renderSortIcon('presupuesto')}
                    </div>
                  </th>
                  <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Nuevo Presupuesto
                  </th>
                  <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Variación
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {sortedAdSets.map(adSet => {
                  const currentBudget = manualBudgets[adSet.adsetId] !== undefined
                    ? manualBudgets[adSet.adsetId]
                    : adSet.presupuesto;

                  const variation = calculateVariation(adSet.presupuesto, currentBudget);

                  const roi = adSet.spend !== undefined && adSet.profit !== undefined && adSet.spend > 0
                    ? ((adSet.profit / adSet.spend) * 100).toFixed(0)
                    : null;

                  return (
                    <tr key={adSet.adsetId} className={adSet.profit !== undefined ? (adSet.profit >= 0 ? 'hover:bg-green-50' : 'hover:bg-red-50') : 'hover:bg-gray-50'}>
                      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
                        <div className="font-medium truncate max-w-xs" title={adSet.name}>
                          {adSet.name}
                        </div>
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap text-sm text-right">
                        <div className="font-medium">{adSet.roas.toFixed(2)}x</div>
                        {roi && (
                          <div className="text-xs text-gray-500">
                            ROI: {roi}%
                          </div>
                        )}
                        {adSet.last_modification && adSet.last_modification.roasAtModification !== undefined && (
                          <div className="mt-1 text-xs">
                            {adSet.roas !== adSet.last_modification.roasAtModification && (
                              <div className={`flex items-center ${adSet.roas > adSet.last_modification.roasAtModification ? 'text-green-600' : 'text-red-600'}`}>
                                {adSet.roas > adSet.last_modification.roasAtModification ? (
                                  <>
                                    <TrendingUp className="h-3 w-3 mr-0.5" />
                                    +{(adSet.roas - adSet.last_modification.roasAtModification).toFixed(2)}x
                                  </>
                                ) : (
                                  <>
                                    <TrendingDown className="h-3 w-3 mr-0.5" />
                                    {(adSet.roas - adSet.last_modification.roasAtModification).toFixed(2)}x
                                  </>
                                )}
                                <span className="ml-1 text-gray-500">
                                  ({((adSet.roas - adSet.last_modification.roasAtModification) / adSet.last_modification.roasAtModification * 100).toFixed(1)}%)
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap text-sm text-right text-gray-900">
                        {adSet.spend !== undefined ? (
                          formatCurrency(adSet.spend)
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                        {adSet.spend !== undefined && adSet.last_modification && adSet.last_modification.spendAtModification !== undefined && (
                          <div className="mt-1 text-xs">
                            {adSet.spend !== adSet.last_modification.spendAtModification && (
                              <div className={`flex items-center justify-end ${adSet.spend > adSet.last_modification.spendAtModification ? 'text-green-600' : 'text-red-600'}`}>
                                {adSet.spend > adSet.last_modification.spendAtModification ? (
                                  <>
                                    <TrendingUp className="h-3 w-3 mr-0.5" />
                                    +{formatCurrency(adSet.spend - adSet.last_modification.spendAtModification)}
                                  </>
                                ) : (
                                  <>
                                    <TrendingDown className="h-3 w-3 mr-0.5" />
                                    {formatCurrency(adSet.spend - adSet.last_modification.spendAtModification)}
                                  </>
                                )}
                                <span className="ml-1 text-gray-500">
                                  ({((adSet.spend - adSet.last_modification.spendAtModification) / adSet.last_modification.spendAtModification * 100).toFixed(1)}%)
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap text-sm text-right">
                        {adSet.profit !== undefined ? (
                          <span className={adSet.profit >= 0 ? 'text-green-600' : 'text-red-600'}>
                            {adSet.profit >= 0 ? '+' : ''}{formatCurrency(adSet.profit)}
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                        {adSet.profit !== undefined && adSet.last_modification && adSet.last_modification.profitAtModification !== undefined && (
                          <div className="mt-1 text-xs">
                            {adSet.profit !== adSet.last_modification.profitAtModification && (
                              <div className={`flex items-center justify-end ${adSet.profit > adSet.last_modification.profitAtModification ? 'text-green-600' : 'text-red-600'}`}>
                                {adSet.profit > adSet.last_modification.profitAtModification ? (
                                  <>
                                    <TrendingUp className="h-3 w-3 mr-0.5" />
                                    +{formatCurrency(adSet.profit - adSet.last_modification.profitAtModification)}
                                  </>
                                ) : (
                                  <>
                                    <TrendingDown className="h-3 w-3 mr-0.5" />
                                    {formatCurrency(adSet.profit - adSet.last_modification.profitAtModification)}
                                  </>
                                )}
                                <span className="ml-1 text-gray-500">
                                  ({adSet.last_modification.profitAtModification !== 0
                                    ? ((adSet.profit - adSet.last_modification.profitAtModification) / Math.abs(adSet.last_modification.profitAtModification) * 100).toFixed(1)
                                    : adSet.profit > 0 ? '+∞' : '-∞'}%)
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap text-xs">
                        {adSet.last_modification && adSet.last_modification.date && (
                          <div className="mt-2">
                            <span className="text-xs text-gray-400 mr-1">Modificación:</span>
                            <span className="text-sm font-medium text-gray-700">{formatTimeAgo(adSet.last_modification.rawDate)} <span className="text-gray-500 font-normal text-xs">({adSet.last_modification.date})</span></span>
                            <div className="flex items-center gap-1 mt-1 text-xs">
                              {adSet.last_modification.newBudget > adSet.last_modification.previousBudget ? (
                                <TrendingUp className="h-3 w-3 text-green-500" />
                              ) : (
                                <TrendingDown className="h-3 w-3 text-red-500" />
                              )}
                              <span className={`font-medium ${adSet.last_modification.newBudget > adSet.last_modification.previousBudget ? 'text-green-600' : 'text-red-600'}`}>
                                {formatCurrency(adSet.last_modification.previousBudget)} → {formatCurrency(adSet.last_modification.newBudget)}
                              </span>
                            </div>

                          </div>
                        )}
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap text-sm text-right text-gray-900">
                        {formatCurrency(adSet.presupuesto)}
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap">
                        <div className="flex flex-col items-center">
                          <div className="bg-indigo-50 px-3 pt-1 pb-3 rounded-lg border-2 border-indigo-200 shadow-sm w-36">
                            <div className="flex items-center justify-center mb-1">
                              <Edit className="h-3 w-3 text-indigo-500 mr-1" />
                              <span className="text-xs font-medium text-indigo-600">Presupuesto</span>
                            </div>
                            <div className="relative">
                              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2">
                                <DollarSign className="h-4 w-4 text-indigo-500" />
                              </div>
                              <input
                                type="number"
                                value={currentBudget}
                                onChange={(e) => handleBudgetChange(adSet.adsetId, Math.max(1, parseFloat(e.target.value) || 0))}
                                className="w-full rounded-md border border-indigo-300 pl-7 py-1.5 text-sm font-medium bg-white focus:ring-indigo-500 focus:border-indigo-500 hover:border-indigo-400 transition-colors"
                                step="0.01"
                                min="1"
                              />
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap text-sm text-right">
                        {variation.diff !== 0 && (
                          <div className="flex items-center justify-center">
                            <div className={`text-sm font-medium px-3 py-1 rounded-full ${variation.isIncrease
                              ? 'bg-green-100 text-green-700'
                              : 'bg-red-100 text-red-700'
                              }`}>
                              {variation.isIncrease ? '+' : ''}{formatCurrency(variation.diff)}
                              ({variation.isIncrease ? '+' : ''}{variation.percent.toFixed(1)}%)
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-gray-50 font-medium">
                <tr>
                  <td className="px-3 py-3 text-sm text-gray-900">Totales</td>
                  <td className="px-3 py-3 text-sm text-right">-</td>
                  <td className="px-3 py-3 text-sm text-right text-gray-900">{formatCurrency(totals.totalSpend)}</td>
                  <td className="px-3 py-3 text-sm text-right">
                    <span className={totals.totalProfit >= 0 ? 'text-green-600' : 'text-red-600'}>
                      {totals.totalProfit >= 0 ? '+' : ''}{formatCurrency(totals.totalProfit)}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-sm text-left">-</td>
                  <td className="px-3 py-3 text-sm text-right text-gray-900">{formatCurrency(totals.totalBudget)}</td>
                  <td className="px-3 py-3 text-sm text-right text-gray-900">{formatCurrency(totals.totalNewBudget)}</td>
                  <td className="px-3 py-3 text-sm text-right">
                    {totals.totalNewBudget !== totals.totalBudget && (
                      <span className={totals.totalNewBudget > totals.totalBudget ? 'text-green-600' : 'text-red-600'}>
                        {totals.totalNewBudget > totals.totalBudget ? '+' : ''}
                        {formatCurrency(totals.totalNewBudget - totals.totalBudget)}
                      </span>
                    )}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-indigo-600 border border-transparent rounded-md shadow-sm text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 text-sm font-medium"
          >
            Aceptar
          </button>
        </div>
      </div>
    </Modal>
  );
}

// Interface for the bulk action profiles
interface BulkActionProfile {
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
    selectedAdSets?: Record<string, boolean>;
    manualBudgets?: Record<string, number>;
  };
}

// Modal para guardar perfil
const SaveProfileModal = React.memo(({
  showSaveProfilePrompt,
  setShowSaveProfilePrompt,
  selectedProfileId,
  profiles,
  newProfileName,
  setNewProfileName,
  profileSaving,
  saveProfile
}: {
  showSaveProfilePrompt: boolean;
  setShowSaveProfilePrompt: (show: boolean) => void;
  selectedProfileId: string;
  profiles: BulkActionProfile[];
  newProfileName: string;
  setNewProfileName: (name: string) => void;
  profileSaving: boolean;
  saveProfile: () => Promise<void>;
}) => {
  // Si no hay que mostrar el modal, no se renderiza
  if (!showSaveProfilePrompt) return null;

  // Manejar cambio de nombre con memoización
  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewProfileName(e.target.value);
  };

  // Memoizar funciones de cierre y guardado
  const handleClose = () => {
    setShowSaveProfilePrompt(false);
  };

  const handleSave = () => {
    saveProfile();
  };

  // Determinar si es edición o creación
  const isEditing = !!selectedProfileId;
  const selectedProfile = profiles.find(p => p.id === selectedProfileId);

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50"
      onClick={(e) => e.stopPropagation()}
    >
      <div 
        className="bg-white rounded-lg p-6 max-w-md w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-medium text-gray-900 mb-2">
          {isEditing ? 'Editar Perfil' : 'Guardar Perfil'}
        </h3>
        
        {isEditing && (
          <p className="text-sm text-gray-500 mb-4">
            Estás editando el perfil "{selectedProfile?.name}". Los cambios sobrescribirán la configuración guardada.
          </p>
        )}

        <form 
          onSubmit={(e) => {
            e.preventDefault();
            if (!profileSaving && newProfileName.trim()) {
              handleSave();
            }
          }}
        >
          <div className="mb-4">
            <label htmlFor="profile-name" className="block text-sm font-medium text-gray-700 mb-1">
              Nombre del Perfil
            </label>
            <input
              id="profile-name"
              type="text"
              value={newProfileName}
              onChange={handleNameChange}
              className="block w-full rounded-md border-gray-300 shadow-sm py-2 px-3 bg-white focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              placeholder="Mi perfil de optimización"
              autoFocus
            />
          </div>

          <div className="flex justify-end gap-3">
            <button
              onClick={handleClose}
              disabled={profileSaving}
              className="px-4 py-2 bg-white border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 text-sm font-medium"
              type="button"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={profileSaving || !newProfileName.trim()}
              className="inline-flex items-center px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {profileSaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  {isEditing ? 'Actualizando...' : 'Guardando...'}
                </>
              ) : (
                isEditing ? 'Actualizar Perfil' : 'Guardar Perfil'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
});

// Selector de perfiles
const ProfileSelector = React.memo(({
  selectedProfileId,
  setSelectedProfileId,
  profiles,
  isLoadingProfiles,
  loadProfile,
  initialAdSets,
  setSelectedAction,
  setFixedBudget,
  setPercentageChange,
  setRoasThreshold,
  setRoasMinThreshold,
  setRoasMaxThreshold,
  setRoasFilter,
  setRoasAction,
  setRoasBetweenAction,
  setRoasFixedBudget,
  setManualBudgets,
  setReason,
  setSelectedAdSets,
  profileSaving,
  setShowSaveProfilePrompt,
  setNewProfileName,
  deleteProfile
}: {
  selectedProfileId: string;
  setSelectedProfileId: (id: string) => void;
  profiles: BulkActionProfile[];
  isLoadingProfiles: boolean;
  loadProfile: (profileId: string) => Promise<void>;
  initialAdSets: Array<any>;
  setSelectedAction: React.Dispatch<React.SetStateAction<ActionType>>;
  setFixedBudget: React.Dispatch<React.SetStateAction<number>>;
  setPercentageChange: React.Dispatch<React.SetStateAction<number>>;
  setRoasThreshold: React.Dispatch<React.SetStateAction<number>>;
  setRoasMinThreshold: React.Dispatch<React.SetStateAction<number>>;
  setRoasMaxThreshold: React.Dispatch<React.SetStateAction<number>>;
  setRoasFilter: React.Dispatch<React.SetStateAction<RoasFilterType>>;
  setRoasAction: React.Dispatch<React.SetStateAction<RoasActionType>>;
  setRoasBetweenAction: React.Dispatch<React.SetStateAction<'increase' | 'decrease'>>;
  setRoasFixedBudget: React.Dispatch<React.SetStateAction<number>>;
  setManualBudgets: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  setReason: React.Dispatch<React.SetStateAction<string>>;
  setSelectedAdSets: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  profileSaving: boolean;
  setShowSaveProfilePrompt: (show: boolean) => void;
  setNewProfileName: (name: string) => void;
  deleteProfile: () => Promise<void>;
}) => {
  // Manejar cambio de perfil
  const handleProfileChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newProfileId = e.target.value;
    setSelectedProfileId(newProfileId);
    
    if (newProfileId) {
      // Cargar el perfil seleccionado
      loadProfile(newProfileId);
    } else {
      // Si selecciona "Nuevo perfil...", resetear a valores por defecto
      setSelectedAction('set-fixed');
      setFixedBudget(5);
      setPercentageChange(10);
      setRoasThreshold(1.5);
      setRoasMinThreshold(1);
      setRoasMaxThreshold(2);
      setRoasFilter('above');
      setRoasAction('percentage');
      setRoasBetweenAction('increase');
      setRoasFixedBudget(5);
      setManualBudgets({});
      setReason('');
      
      // Por defecto, seleccionar todos los adSets activos
      const initialSelection = initialAdSets.reduce((acc, adSet) => {
        if (adSet.status === 'ACTIVE') {
          acc[adSet.adsetId] = true;
        }
        return acc;
      }, {} as Record<string, boolean>);
      setSelectedAdSets(initialSelection);
    }
  };

  const handleSaveClick = () => {
    // Si hay un perfil seleccionado, prellenamos el nombre
    if (selectedProfileId) {
      const profile = profiles.find(p => p.id === selectedProfileId);
      if (profile) {
        setNewProfileName(profile.name);
      }
    } else {
      setNewProfileName('');
    }
    setShowSaveProfilePrompt(true);
  };

  const handleEditClick = () => {
    // Prellenar el nombre del perfil seleccionado
    const profile = profiles.find(p => p.id === selectedProfileId);
    if (profile) {
      setNewProfileName(profile.name);
      setShowSaveProfilePrompt(true);
    }
  };

  return (
    <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
      <div className="flex-grow">
        <select
          value={selectedProfileId}
          onChange={handleProfileChange}
          className="block w-full rounded-md border-gray-300 shadow-sm py-2 px-3 bg-white focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
          disabled={isLoadingProfiles}
        >
          <option value="">Nuevo perfil...</option>
          {profiles.map(profile => (
            <option key={profile.id} value={profile.id}>
              {profile.name}
            </option>
          ))}
        </select>
      </div>
      
      {selectedProfileId ? (
        <div className="flex gap-2">
          <button
            onClick={handleEditClick}
            disabled={profileSaving}
            className="inline-flex items-center px-3 py-2 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-md hover:bg-indigo-100 transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 text-sm font-medium"
          >
            <Edit className="h-4 w-4 mr-1" />
            Editar
          </button>
          <button
            onClick={deleteProfile}
            disabled={profileSaving}
            className="inline-flex items-center px-3 py-2 bg-red-50 text-red-700 border border-red-200 rounded-md hover:bg-red-100 transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 text-sm font-medium"
          >
            <Trash className="h-4 w-4 mr-1" />
            Eliminar
          </button>
        </div>
      ) : (
        <button
          onClick={handleSaveClick}
          disabled={profileSaving}
          className="inline-flex items-center px-3 py-2 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-md hover:bg-indigo-100 transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 text-sm font-medium"
        >
          <BookmarkPlus className="h-4 w-4 mr-1" />
          Guardar
        </button>
      )}
    </div>
  );
});

// Componente para una condición individual
const ConditionComponent = React.memo(({ 
  condition, 
  onUpdate, 
  onRemove,
  isOnlyCondition
}: { 
  condition: Condition; 
  onUpdate: (id: string, updatedCondition: Partial<Condition>) => void;
  onRemove: (id: string) => void;
  isOnlyCondition: boolean;
}) => {
  return (
    <div className="flex flex-wrap items-center gap-2 p-3 bg-white rounded-md border border-gray-200 shadow-sm">
      <select
        value={condition.type}
        onChange={(e) => onUpdate(condition.id, { type: e.target.value as ConditionType })}
        className="py-1.5 px-3 text-sm bg-gray-50 border border-gray-300 rounded focus:ring-indigo-500 focus:border-indigo-500"
      >
        <option value="roas">ROAS</option>
        <option value="spend">Gasto</option>
        <option value="profit">Profit</option>
        <option value="budget">Presupuesto</option>
        <option value="sales">Ventas</option>
      </select>
      
      <select
        value={condition.operator}
        onChange={(e) => onUpdate(condition.id, { operator: e.target.value as OperatorType })}
        className="py-1.5 px-3 text-sm bg-gray-50 border border-gray-300 rounded focus:ring-indigo-500 focus:border-indigo-500"
      >
        <option value="greater">mayor que</option>
        <option value="less">menor que</option>
        <option value="equal">igual a</option>
        <option value="greater_equal">mayor o igual a</option>
        <option value="less_equal">menor o igual a</option>
        <option value="between">entre</option>
      </select>
      
      <div className="relative flex items-center">
        {(condition.type === 'spend' || condition.type === 'profit' || condition.type === 'budget') && (
          <div className="pointer-events-none absolute left-3 flex items-center">
            <DollarSign className="h-4 w-4 text-gray-400" />
          </div>
        )}
        
        <input
          type="number"
          value={condition.value}
          onChange={(e) => onUpdate(condition.id, { value: parseFloat(e.target.value) || 0 })}
          className={`py-1.5 rounded border border-gray-300 focus:ring-indigo-500 focus:border-indigo-500 text-sm ${
            (condition.type === 'spend' || condition.type === 'profit' || condition.type === 'budget') 
              ? 'pl-8' 
              : 'px-3'
          }`}
          step={condition.type === 'roas' ? '0.1' : '1'}
        />
        
        {(condition.type === 'roas') && (
          <span className="ml-1 text-sm text-gray-500">x</span>
        )}
      </div>
      
      {condition.operator === 'between' && (
        <>
          <span className="text-sm text-gray-500">y</span>
          <div className="relative flex items-center">
            {(condition.type === 'spend' || condition.type === 'profit' || condition.type === 'budget') && (
              <div className="pointer-events-none absolute left-3 flex items-center">
                <DollarSign className="h-4 w-4 text-gray-400" />
              </div>
            )}
            
            <input
              type="number"
              value={condition.value2 || 0}
              onChange={(e) => onUpdate(condition.id, { value2: parseFloat(e.target.value) || 0 })}
              className={`py-1.5 rounded border border-gray-300 focus:ring-indigo-500 focus:border-indigo-500 text-sm ${
                (condition.type === 'spend' || condition.type === 'profit' || condition.type === 'budget') 
                  ? 'pl-8' 
                  : 'px-3'
              }`}
              step={condition.type === 'roas' ? '0.1' : '1'}
            />
            
            {(condition.type === 'roas') && (
              <span className="ml-1 text-sm text-gray-500">x</span>
            )}
          </div>
        </>
      )}
      
      {!isOnlyCondition && (
        <button
          onClick={() => onRemove(condition.id)}
          className="ml-auto p-1 text-red-500 hover:text-red-700 rounded-full hover:bg-red-50"
          type="button"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
});

// Componente para la acción basada en reglas compuestas
const CompoundRuleAction = React.memo(({
  compoundRules,
  setCompoundRules
}: {
  compoundRules: CompoundRule;
  setCompoundRules: React.Dispatch<React.SetStateAction<CompoundRule>>;
}) => {
  return (
    <div className="p-3 bg-gray-50 rounded-md border border-gray-200">
      <h4 className="text-sm font-medium text-gray-700 mb-2">Acción a realizar si se cumplen las condiciones:</h4>
      
      <div className="flex items-center gap-2 mb-2">
        <select
          value={compoundRules.action.type}
          onChange={(e) => setCompoundRules({
            ...compoundRules,
            action: {
              ...compoundRules.action,
              type: e.target.value as 'percentage' | 'fixed'
            }
          })}
          className="py-1.5 px-3 text-sm bg-white border border-gray-300 rounded focus:ring-indigo-500 focus:border-indigo-500"
        >
          <option value="percentage">Ajustar por porcentaje</option>
          <option value="fixed">Establecer valor fijo</option>
        </select>
        
        {compoundRules.action.type === 'percentage' && (
          <select
            value={compoundRules.action.direction}
            onChange={(e) => setCompoundRules({
              ...compoundRules,
              action: {
                ...compoundRules.action,
                direction: e.target.value as 'increase' | 'decrease'
              }
            })}
            className="py-1.5 px-3 text-sm bg-white border border-gray-300 rounded focus:ring-indigo-500 focus:border-indigo-500"
          >
            <option value="increase">Aumentar</option>
            <option value="decrease">Disminuir</option>
          </select>
        )}
      </div>
      
      <div className="relative mt-2">
        {compoundRules.action.type === 'fixed' ? (
          <div className="flex items-center">
            <div className="pointer-events-none absolute left-3 flex items-center">
              <DollarSign className="h-4 w-4 text-gray-400" />
            </div>
            <input
              type="number"
              value={compoundRules.action.value}
              onChange={(e) => setCompoundRules({
                ...compoundRules,
                action: {
                  ...compoundRules.action,
                  value: Math.max(1, parseFloat(e.target.value) || 0)
                }
              })}
              className="pl-8 py-1.5 px-3 rounded border border-gray-300 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
              placeholder="5.00"
              step="0.01"
              min="1"
            />
          </div>
        ) : (
          <div className="flex items-center">
            <input
              type="number"
              value={compoundRules.action.value}
              onChange={(e) => setCompoundRules({
                ...compoundRules,
                action: {
                  ...compoundRules.action,
                  value: Math.max(1, Math.min(100, parseFloat(e.target.value) || 0))
                }
              })}
              className="py-1.5 px-3 rounded border border-gray-300 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
              placeholder="10"
              step="1"
              min="1"
              max="100"
            />
            <span className="ml-1 text-sm text-gray-500">%</span>
          </div>
        )}
      </div>
    </div>
  );
});

// Componente para la sección de reglas compuestas
const CompoundRuleSection = ({
  compoundRules,
  setCompoundRules,
  compoundRuleFilteredAdSets,
  adSets,
  selectedAdSets,
  setShowManualTableModal
}: {
  compoundRules: CompoundRule;
  setCompoundRules: React.Dispatch<React.SetStateAction<CompoundRule>>;
  compoundRuleFilteredAdSets: Array<any>;
  adSets: Array<any>;
  selectedAdSets: Record<string, boolean>;
  setShowManualTableModal: (show: boolean) => void;
}) => {
  // Función para actualizar una condición
  const updateCondition = (id: string, updates: Partial<Condition>) => {
    setCompoundRules({
      ...compoundRules,
      conditions: compoundRules.conditions.map(c => 
        c.id === id ? { ...c, ...updates } : c
      )
    });
  };
  
  // Función para eliminar una condición
  const removeCondition = (id: string) => {
    setCompoundRules({
      ...compoundRules,
      conditions: compoundRules.conditions.filter(c => c.id !== id)
    });
  };
  
  // Función para añadir una nueva condición
  const addCondition = () => {
    setCompoundRules({
      ...compoundRules,
      conditions: [
        ...compoundRules.conditions,
        {
          id: crypto.randomUUID(),
          type: 'roas',
          operator: 'greater_equal',
          value: 2
        }
      ]
    });
  };
  
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium text-gray-700 mb-2">Condiciones:</h3>
        
        <div className="space-y-3">
          {compoundRules.conditions.map((condition, index) => (
            <ConditionComponent
              key={condition.id}
              condition={condition}
              onUpdate={updateCondition}
              onRemove={removeCondition}
              isOnlyCondition={compoundRules.conditions.length === 1}
            />
          ))}
        </div>
        
        <button
          onClick={addCondition}
          className="mt-2 px-3 py-1.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded text-sm flex items-center gap-1 hover:bg-indigo-100"
          type="button"
        >
          <span>Añadir condición</span>
        </button>
      </div>
      
      {compoundRules.conditions.length > 1 && (
        <div>
          <h3 className="text-sm font-medium text-gray-700 mb-2">Operador lógico:</h3>
          
          <div className="flex gap-3">
            <label className="flex items-center cursor-pointer">
              <input
                type="radio"
                checked={compoundRules.operator === 'AND'}
                onChange={() => setCompoundRules({...compoundRules, operator: 'AND'})}
                className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
              />
              <span className="ml-2 text-sm text-gray-700">
                Todas las condiciones deben cumplirse (AND)
              </span>
            </label>
            
            <label className="flex items-center cursor-pointer">
              <input
                type="radio"
                checked={compoundRules.operator === 'OR'}
                onChange={() => setCompoundRules({...compoundRules, operator: 'OR'})}
                className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
              />
              <span className="ml-2 text-sm text-gray-700">
                Al menos una condición debe cumplirse (OR)
              </span>
            </label>
          </div>
        </div>
      )}
      
      <CompoundRuleAction compoundRules={compoundRules} setCompoundRules={setCompoundRules} />
      
      <div className="p-3 bg-indigo-50 rounded-md border border-indigo-200">
        <h4 className="text-sm font-medium text-indigo-700 mb-2">Conjuntos que cumplen las condiciones:</h4>
        <div className="text-sm text-indigo-900">
          {compoundRuleFilteredAdSets.length} de {adSets.filter(adSet => selectedAdSets[adSet.adsetId] && adSet.status === 'ACTIVE').length} conjuntos seleccionados
        </div>
        {compoundRuleFilteredAdSets.length > 0 && (
          <button
            onClick={() => setShowManualTableModal(true)}
            type="button"
            className="mt-2 text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
          >
            <Eye className="h-3 w-3" />
            Ver conjuntos filtrados
          </button>
        )}
      </div>
    </div>
  );
};

export function BulkActionsModal({
  isOpen,
  onClose,
  adSets: initialAdSets,
  formatCurrency,
  onSuccess,
}: BulkActionsModalProps) {
  const [selectedAction, setSelectedAction] = useState<ActionType>('set-fixed');
  const [fixedBudget, setFixedBudget] = useState<number>(5);
  const [percentageChange, setPercentageChange] = useState<number>(10);
  const [roasThreshold, setRoasThreshold] = useState<number>(1.5);
  const [roasMinThreshold, setRoasMinThreshold] = useState<number>(1);
  const [roasMaxThreshold, setRoasMaxThreshold] = useState<number>(2);
  const [roasFilter, setRoasFilter] = useState<RoasFilterType>('above');
  const [roasAction, setRoasAction] = useState<RoasActionType>('percentage');
  const [roasBetweenAction, setRoasBetweenAction] = useState<'increase' | 'decrease'>('increase');
  const [roasFixedBudget, setRoasFixedBudget] = useState<number>(5);
  const [manualBudgets, setManualBudgets] = useState<Record<string, number>>({});
  const [reason, setReason] = useState<string>('');
  const [showAdSets, setShowAdSets] = useState(false);
  const [selectedAdSets, setSelectedAdSets] = useState<Record<string, boolean>>({});
  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState<{
    success: number;
    failed: number;
    modified: Array<{ name: string; oldBudget: number; newBudget: number }>;
  } | null>(null);
  const [showManualEditor, setShowManualEditor] = useState(false);
  // Estado para el modal de tabla completa
  const [showManualTableModal, setShowManualTableModal] = useState(false);
  const [adSets, setAdSets] = useState(initialAdSets);
  const [lastModifications, setLastModifications] = useState<Record<string, any>>({});

  // Estado para gestión de perfiles
  const [profiles, setProfiles] = useState<BulkActionProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string>('');
  const [isLoadingProfiles, setIsLoadingProfiles] = useState(false);
  const [showSaveProfilePrompt, setShowSaveProfilePrompt] = useState(false);
  const [newProfileName, setNewProfileName] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);

  // Estados para reglas condicionales compuestas
  const [compoundRules, setCompoundRules] = useState<CompoundRule>({
    conditions: [
      {
        id: crypto.randomUUID(),
        type: 'roas',
        operator: 'greater_equal',
        value: 2
      },
      {
        id: crypto.randomUUID(),
        type: 'spend',
        operator: 'less',
        value: 100
      }
    ],
    operator: 'AND',
    action: {
      type: 'percentage',
      value: 10,
      direction: 'increase'
    }
  });

  // Función para obtener las modificaciones de presupuesto
  const fetchLastModifications = async () => {
    try {
      const adsetIds = initialAdSets.map(adSet => adSet.adsetId);

      if (adsetIds.length === 0) return;

      const { data, error } = await supabase
        .from('budget_modifications')
        .select('adset_id, modified_at, reason, previous_budget, new_budget, spend_at_modification, roas_at_modification, sales_at_modification, profit_at_modification')
        .in('adset_id', adsetIds)
        .order('modified_at', { ascending: false });

      if (error) {
        console.error('Error fetching budget modifications:', error);
        return;
      }

      // Group by adset_id, taking only the most recent modification for each
      const modificationMap = data.reduce((acc: Record<string, any>, mod: any) => {
        if (!acc[mod.adset_id] || new Date(mod.modified_at).getTime() > new Date(acc[mod.adset_id].modified_at).getTime()) {
          acc[mod.adset_id] = mod;
        }
        return acc;
      }, {});

      // Format the data for use in the component
      const formattedModifications = Object.entries(modificationMap).reduce((acc: Record<string, any>, [adsetId, mod]: [string, any]) => {
        acc[adsetId] = {
          date: new Date(mod.modified_at).toLocaleString('es-ES', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
          }),
          rawDate: new Date(mod.modified_at).getTime(),
          reason: mod.reason,
          previousBudget: mod.previous_budget,
          newBudget: mod.new_budget,
          spendAtModification: mod.spend_at_modification,
          roasAtModification: mod.roas_at_modification,
          salesAtModification: mod.sales_at_modification,
          profitAtModification: mod.profit_at_modification,
        };
        return acc;
      }, {});

      setLastModifications(formattedModifications);

      // Update adSets with the latest modifications
      const updatedAdSets = initialAdSets.map(adSet => ({
        ...adSet,
        last_modification: formattedModifications[adSet.adsetId]
      }));

      setAdSets(updatedAdSets);
    } catch (error) {
      console.error('Error in fetchLastModifications:', error);
    }
  };

  // Función para cargar los perfiles del usuario
  const fetchProfiles = async () => {
    try {
      setIsLoadingProfiles(true);

      // Obtener el usuario actual
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) {
        console.error('Error obteniendo usuario:', userError);
        return;
      }

      if (!user) {
        console.error('No hay usuario autenticado');
        return;
      }

      // Consultar perfiles del usuario
      const { data, error } = await supabase
        .from('bulk_action_profiles')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error obteniendo perfiles:', error);
        return;
      }

      setProfiles(data || []);
    } catch (error) {
      console.error('Error en fetchProfiles:', error);
    } finally {
      setIsLoadingProfiles(false);
    }
  };

  // Función para guardar el perfil actual
  const saveProfile = async () => {
    if (!newProfileName.trim()) {
      alert('Por favor, proporciona un nombre para el perfil');
      return;
    }

    try {
      setProfileSaving(true);

      // Obtener el usuario actual
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!user) throw new Error('No hay usuario autenticado');

      // Preparar los datos extra como un objeto
      const extraData = {
        roasBetweenAction: roasBetweenAction,
        reason: reason,
        selectedAdSets: selectedAdSets,
        manualBudgets: roasAction === 'manual' ? manualBudgets : {},
        // Añadir datos de reglas compuestas
        compoundRules: selectedAction === 'compound-rule' ? compoundRules : null
      };

      // Preparar datos para guardar
      const profileData = {
        name: newProfileName.trim(),
        description: reason || null,
        action_type: selectedAction,
        value: selectedAction === 'set-fixed'
          ? fixedBudget
          : selectedAction === 'roas-based' && roasAction === 'fixed'
            ? roasFixedBudget
            : selectedAction === 'compound-rule'
              ? compoundRules.action.value
              : percentageChange,
        roas_filter_type: selectedAction === 'roas-based' ? roasFilter : null,
        roas_min_value: selectedAction === 'roas-based' && roasFilter === 'between' ? roasMinThreshold :
          selectedAction === 'roas-based' ? roasThreshold : null,
        roas_max_value: selectedAction === 'roas-based' && roasFilter === 'between' ? roasMaxThreshold : null,
        roas_action_type: selectedAction === 'roas-based' ? roasAction : null,
        user_id: user.id,
        extra_data: JSON.stringify(extraData)
      };

      // Comprobar si es actualización o creación
      if (selectedProfileId) {
        // Actualizar perfil existente
        const { error } = await supabase
          .from('bulk_action_profiles')
          .update(profileData)
          .eq('id', selectedProfileId);

        if (error) throw error;
      } else {
        // Crear nuevo perfil
        const { error } = await supabase
          .from('bulk_action_profiles')
          .insert(profileData);

        if (error) throw error;
      }

      // Refrescar lista de perfiles
      await fetchProfiles();

      // Cerrar el prompt
      setShowSaveProfilePrompt(false);
      setNewProfileName('');

    } catch (error) {
      console.error('Error guardando perfil:', error);
      alert('Error al guardar el perfil');
    } finally {
      setProfileSaving(false);
    }
  };

  // Función para cargar un perfil seleccionado
  const loadProfile = async (profileId: string) => {
    if (!profileId || profileId === 'new') {
      // Reiniciar a valores por defecto
      setSelectedAction('set-fixed');
      setFixedBudget(5);
      setPercentageChange(10);
      setRoasThreshold(1.5);
      setRoasMinThreshold(1);
      setRoasMaxThreshold(2);
      setRoasFilter('above');
      setRoasAction('percentage');
      setRoasBetweenAction('increase');
      setRoasFixedBudget(5);
      setManualBudgets({});
      setReason('');
      // Reiniciar reglas compuestas a valores por defecto
      setCompoundRules({
        conditions: [
          {
            id: crypto.randomUUID(),
            type: 'roas',
            operator: 'greater_equal',
            value: 2
          },
          {
            id: crypto.randomUUID(),
            type: 'spend',
            operator: 'less',
            value: 100
          }
        ],
        operator: 'AND',
        action: {
          type: 'percentage',
          value: 10,
          direction: 'increase'
        }
      });
      return;
    }

    try {
      const profile = profiles.find(p => p.id === profileId);

      if (!profile) {
        console.error('Perfil no encontrado');
        return;
      }

      // Cargar valores básicos
      setSelectedAction(profile.action_type);

      // Cargar valor según el tipo de acción
      if (profile.action_type === 'set-fixed') {
        setFixedBudget(profile.value);
      } else if (profile.action_type === 'roas-based' && profile.roas_action_type === 'fixed') {
        setRoasFixedBudget(profile.value);
      } else {
        setPercentageChange(profile.value);
      }

      // Cargar configuración ROAS si aplica
      if (profile.action_type === 'roas-based') {
        setRoasFilter(profile.roas_filter_type as RoasFilterType || 'above');
        setRoasAction(profile.roas_action_type as RoasActionType || 'percentage');

        if (profile.roas_filter_type === 'between') {
          setRoasMinThreshold(profile.roas_min_value || 1);
          setRoasMaxThreshold(profile.roas_max_value || 2);
        } else {
          setRoasThreshold(profile.roas_min_value || 1.5);
        }
      }

      // Cargar datos extra si existen
      let extraData = {};
      try {
        if (profile.extra_data && typeof profile.extra_data === 'string') {
          extraData = JSON.parse(profile.extra_data);
        } else if (profile.extra_data) {
          extraData = profile.extra_data;
        }
      } catch (e) {
        console.error('Error al parsear extra_data:', e);
      }

      if (Object.keys(extraData).length > 0) {
        // @ts-ignore
        if (extraData.roasBetweenAction) setRoasBetweenAction(extraData.roasBetweenAction);
        // @ts-ignore
        if (extraData.reason) setReason(extraData.reason);
        // @ts-ignore
        if (extraData.selectedAdSets) {
          // Combinar con adSets actuales para asegurar que sólo se seleccionan los disponibles
          const newSelection: Record<string, boolean> = {};
          // @ts-ignore
          Object.keys(extraData.selectedAdSets).forEach(adsetId => {
            // Verificar si el adSet existe en la lista actual
            if (adSets.some(adSet => adSet.adsetId === adsetId)) {
              // @ts-ignore
              newSelection[adsetId] = extraData.selectedAdSets[adsetId];
            }
          });
          setSelectedAdSets(newSelection);
        }
        // @ts-ignore
        if (extraData.manualBudgets && profile.roas_action_type === 'manual') {
          // @ts-ignore
          setManualBudgets(extraData.manualBudgets);
        }
        
        // Cargar reglas compuestas si existen y si el tipo de acción es compound-rule
        // @ts-ignore
        if (extraData.compoundRules && profile.action_type === 'compound-rule') {
          // @ts-ignore
          const loadedRules = extraData.compoundRules;
          
          // Asegurarnos de que cada condición tenga un ID
          const fixedConditions = loadedRules.conditions.map((condition: any) => ({
            ...condition,
            id: condition.id || crypto.randomUUID()
          }));
          
          setCompoundRules({
            ...loadedRules,
            conditions: fixedConditions
          });
        }
      }

      // Establecer descripción/razón si existe
      if (profile.description) {
        setReason(profile.description);
      }

    } catch (error) {
      console.error('Error cargando perfil:', error);
      alert('Error al cargar el perfil');
    }
  };

  // Función para eliminar un perfil
  const deleteProfile = async () => {
    if (!selectedProfileId) return;

    if (!confirm('¿Estás seguro de que deseas eliminar este perfil?')) {
      return;
    }

    try {
      setProfileSaving(true);

      const { error } = await supabase
        .from('bulk_action_profiles')
        .delete()
        .eq('id', selectedProfileId);

      if (error) throw error;

      // Refrescar lista y reiniciar selección
      await fetchProfiles();
      setSelectedProfileId('');

    } catch (error) {
      console.error('Error eliminando perfil:', error);
      alert('Error al eliminar el perfil');
    } finally {
      setProfileSaving(false);
    }
  };

  // Cargar perfiles al abrir el modal
  useEffect(() => {
    if (isOpen) {
      fetchProfiles();
    }
  }, [isOpen]);

  // Inicializa los adSets seleccionados al abrir el modal
  useEffect(() => {
    if (isOpen) {
      // Cargar las últimas modificaciones al abrir el modal
      fetchLastModifications();

      // Por defecto, selecciona todos los adSets activos excepto los que tienen presupuesto 0
      const initialSelection = initialAdSets.reduce((acc, adSet) => {
        if (adSet.status === 'ACTIVE' && adSet.presupuesto > 0) {
          acc[adSet.adsetId] = true;
        }
        return acc;
      }, {} as Record<string, boolean>);

      setSelectedAdSets(initialSelection);
    } else {
      // Cuando el modal se cierra completamente, reiniciar el estado de resultados
      setResults(null);
    }
  }, [isOpen, initialAdSets]);

  // Calcula el nuevo presupuesto para un adSet específico
  const calculateNewBudget = (adSet: { adsetId?: string, presupuesto: number; roas: number; spend?: number; profit?: number; sales?: number }): number => {
    switch (selectedAction) {
      case 'set-fixed':
        return fixedBudget;
      case 'decrease-all':
        return Math.max(1, adSet.presupuesto * (1 - percentageChange / 100));
      case 'increase-all':
        return adSet.presupuesto * (1 + percentageChange / 100);
      case 'roas-based': {
        // Verificamos si el adSet cumple la condición de ROAS
        let meetsRoasCondition = false;

        if (roasFilter === 'above') {
          meetsRoasCondition = adSet.roas >= roasThreshold;
        } else if (roasFilter === 'below') {
          meetsRoasCondition = adSet.roas < roasThreshold;
        } else if (roasFilter === 'between') {
          meetsRoasCondition = adSet.roas >= roasMinThreshold && adSet.roas <= roasMaxThreshold;
        }

        if (!meetsRoasCondition) {
          return adSet.presupuesto; // Sin cambios si no cumple el criterio
        }

        // Si cumple la condición, aplicamos la acción según el tipo seleccionado
        switch (roasAction) {
          case 'percentage':
            if (roasFilter === 'below') {
              return Math.max(1, adSet.presupuesto * (1 - percentageChange / 100)); // Disminuye para ROAS bajo
            } else if (roasFilter === 'above') {
              return adSet.presupuesto * (1 + percentageChange / 100); // Aumenta para ROAS alto
            } else if (roasFilter === 'between') {
              // Para el rango, depende de si queremos aumentar o disminuir
              return roasBetweenAction === 'increase'
                ? adSet.presupuesto * (1 + percentageChange / 100)
                : Math.max(1, adSet.presupuesto * (1 - percentageChange / 100));
            }
            return adSet.presupuesto;
          case 'fixed':
            return roasFixedBudget;
          case 'manual':
            // Si hay un valor manual, lo usamos; de lo contrario, mantenemos el presupuesto actual
            return adSet.adsetId && manualBudgets[adSet.adsetId] !== undefined
              ? manualBudgets[adSet.adsetId]
              : adSet.presupuesto;
          default:
            return adSet.presupuesto;
        }
      }
      case 'compound-rule': {
        // Verificar si el adSet cumple con todas las condiciones
        const meetsConditions = evaluateCompoundConditions(adSet, compoundRules);
        
        if (!meetsConditions) {
          return adSet.presupuesto; // Sin cambios si no cumple las condiciones
        }
        
        // Si cumple las condiciones, aplicar la acción
        const { type, value, direction } = compoundRules.action;
        
        if (type === 'percentage') {
          return direction === 'increase'
            ? adSet.presupuesto * (1 + value / 100)
            : Math.max(1, adSet.presupuesto * (1 - value / 100));
        } else { // fixed
          return value;
        }
      }
      default:
        return adSet.presupuesto;
    }
  };

  // Evalúa si un adSet cumple con las condiciones compuestas
  const evaluateCompoundConditions = (
    adSet: { adsetId?: string, presupuesto: number; roas: number; spend?: number; profit?: number; sales?: number },
    rule: CompoundRule
  ): boolean => {
    if (rule.conditions.length === 0) return false;
    
    const results = rule.conditions.map(condition => {
      let adSetValue: number | undefined;
      
      // Obtener el valor correspondiente del adSet según el tipo de condición
      switch (condition.type) {
        case 'roas':
          adSetValue = adSet.roas;
          break;
        case 'spend':
          adSetValue = adSet.spend;
          break;
        case 'profit':
          adSetValue = adSet.profit;
          break;
        case 'budget':
          adSetValue = adSet.presupuesto;
          break;
        case 'sales':
          adSetValue = adSet.sales;
          break;
      }
      
      // Si no hay valor definido y no es presupuesto o ROAS (que siempre están), la condición no se cumple
      if (adSetValue === undefined && condition.type !== 'budget' && condition.type !== 'roas') {
        return false;
      }
      
      // Evaluar según el operador
      switch (condition.operator) {
        case 'greater':
          return adSetValue !== undefined && adSetValue > condition.value;
        case 'less':
          return adSetValue !== undefined && adSetValue < condition.value;
        case 'equal':
          return adSetValue !== undefined && adSetValue === condition.value;
        case 'greater_equal':
          return adSetValue !== undefined && adSetValue >= condition.value;
        case 'less_equal':
          return adSetValue !== undefined && adSetValue <= condition.value;
        case 'between':
          return adSetValue !== undefined && condition.value2 !== undefined && 
                 adSetValue >= condition.value && adSetValue <= condition.value2;
        default:
          return false;
      }
    });
    
    // Combinar resultados según el operador lógico
    return rule.operator === 'AND'
      ? results.every(r => r) // Todas las condiciones deben cumplirse
      : results.some(r => r); // Al menos una condición debe cumplirse
  };

  // Selecciona los adSets que cumplen con la condición ROAS
  const roasFilteredAdSets = adSets.filter(adSet => {
    if (!selectedAdSets[adSet.adsetId] || adSet.status !== 'ACTIVE') return false;

    if (roasFilter === 'above') {
      return adSet.roas >= roasThreshold;
    } else if (roasFilter === 'below') {
      return adSet.roas < roasThreshold;
    } else if (roasFilter === 'between') {
      return adSet.roas >= roasMinThreshold && adSet.roas <= roasMaxThreshold;
    }

    return false;
  });

  // Previsualizaciones de los adSets que serán modificados
  const adSetsToModify = adSets.filter(adSet =>
    selectedAdSets[adSet.adsetId] &&
    adSet.status === 'ACTIVE' &&
    calculateNewBudget(adSet) !== adSet.presupuesto
  );

  // Inicializar presupuestos manuales cuando se cambia el filtro o acción ROAS
  useEffect(() => {
    if (roasAction === 'manual') {
      const initialManualBudgets = { ...manualBudgets };
      roasFilteredAdSets.forEach(adSet => {
        // Si no hay un valor manual previo, usamos el presupuesto actual como valor inicial
        if (initialManualBudgets[adSet.adsetId] === undefined) {
          initialManualBudgets[adSet.adsetId] = adSet.presupuesto;
        }
      });
      setManualBudgets(initialManualBudgets);
    }
  }, [roasFilter, roasThreshold, roasAction, selectedAdSets]);

  // Procesa la acción masiva
  const processBulkAction = async () => {
    if (!reason.trim()) {
      alert('Por favor, proporciona una razón para este cambio masivo');
      return;
    }

    try {
      setProcessing(true);
      const modifiedAdSets: Array<{ name: string; oldBudget: number; newBudget: number }> = [];
      let successCount = 0;
      let failCount = 0;

      // Get the current user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!user) throw new Error('No authenticated user found');

      // Get Facebook configuration
      const { data: configData, error: configError } = await supabase
        .from('facebook_config')
        .select('*')
        .single();

      if (configError) throw configError;
      if (!configData?.access_token) {
        throw new Error('Facebook configuration is missing');
      }

      const baseUrl = 'https://graph.facebook.com';
      const version = 'v23.0';

      // Obtener los IDs de los adsets a modificar
      const adSetsToProcess = adSetsToModify.filter(adSet =>
        calculateNewBudget(adSet) !== adSet.presupuesto
      );

      if (adSetsToProcess.length === 0) {
        setResults({
          success: 0,
          failed: 0,
          modified: [],
        });
        setProcessing(false);
        return;
      }

      const adsetIds = adSetsToProcess.map(adSet => adSet.adsetId);

      // Obtener la fecha actual en formato YYYY-MM-DD
      const today = new Date().toISOString().split('T')[0];

      // Obtener ventas trackeadas desde Supabase
      const { data: trackedSales, error: trackedError } = await supabase
        .from('tracked_sales')
        .select('ad_id')
        .in('ad_id', adsetIds)
        .eq('purchase_date', today);

      if (trackedError) {
        console.error('Error fetching tracked sales:', trackedError);
      }

      // Agrupar ventas trackeadas por ad_id (que contiene el ID del adset)
      const trackedSalesMap = (trackedSales || []).reduce((acc, sale) => {
        if (!acc[sale.ad_id]) acc[sale.ad_id] = 0;
        acc[sale.ad_id]++;
        return acc;
      }, {} as Record<string, number>);

      // Obtener datos de Facebook para todos los adsets en una sola llamada al API
      const adsetInsights: Record<string, { spend: number; sales: number; tracked_sales: number }> = {};

      try {
        const params = new URLSearchParams({
          access_token: configData.access_token,
          fields: 'adset_id,spend,actions',
          level: 'adset',
          filtering: JSON.stringify([{
            field: 'adset.id',
            operator: 'IN',
            value: adsetIds
          }]),
          time_range: JSON.stringify({ since: today, until: today }),
        });

        const url = `${baseUrl}/${version}/act_${configData.account_id}/insights?${params.toString()}`;
        const response = await fetch(url);

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`Error from Facebook API: ${errorText}`);
        } else {
          const data = await response.json();

          // Procesar datos de insights
          if (data.data && data.data.length > 0) {
            for (const insight of data.data) {
              const adsetId = insight.adset_id;

              // Encontrar ventas de las acciones
              const purchaseAction = insight.actions?.find(
                (a: any) => a.action_type === 'purchase'
              );

              adsetInsights[adsetId] = {
                spend: parseFloat(insight.spend || 0),
                sales: parseInt(purchaseAction?.value || 0),
                tracked_sales: trackedSalesMap[adsetId] || 0
              };
            }
          }
        }
      } catch (error) {
        console.error('Error fetching Facebook insights:', error);
      }

      // Definir constante para cálculo de ingresos
      const REVENUE_PER_SALE = 18000 / 4100;

      // Definir el tipo para los resultados de las modificaciones
      type UpdateResult = {
        success: boolean;
        adSet: typeof adSetsToProcess[0];
        newBudget: number;
        error?: Error;
      };

      // Definir el tipo para las modificaciones de presupuesto
      type BudgetModification = {
        adset_id: string;
        previous_budget: number;
        new_budget: number;
        reason: string;
        user_id: string;
        spend_at_modification: number;
        roas_at_modification: number;
        sales_at_modification: number;
        profit_at_modification: number;
      };

      // Preparar todas las modificaciones para inserción en batch
      const budgetModifications: BudgetModification[] = [];

      // Usar Promise.all para procesar en paralelo las llamadas a la API de Facebook
      const updateResults = await Promise.allSettled(
        adSetsToProcess.map(async (adSet) => {
          try {
            const newBudget = calculateNewBudget(adSet);

            // Skip if no change
            if (newBudget === adSet.presupuesto) return {
              success: false,
              adSet,
              newBudget: adSet.presupuesto
            } as UpdateResult;

            const url = `${baseUrl}/${version}/${adSet.adsetId}`;
            const response = await fetch(url, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                access_token: configData.access_token,
                daily_budget: Math.round(newBudget * 100), // Convert to cents
              }),
            });

            if (!response.ok) {
              const errorData = await response.json();
              throw new Error(errorData.error?.message || 'Error updating budget');
            }

            // Combinar métricas de insights con datos del adSet
            // Si no hay datos de insights para este adSet, usar los datos del adSet directamente
            const metrics = adsetInsights[adSet.adsetId] || {
              spend: adSet.spend || 0,
              sales: adSet.sales || 0,
              tracked_sales: adSet.tracked_sales || 0
            };

            // Calcular maxSales y profit
            const maxSales = Math.max(metrics.sales, metrics.tracked_sales);
            const revenue = maxSales * REVENUE_PER_SALE;
            const profit = revenue - metrics.spend;

            // Preparar modificación para inserción en batch
            budgetModifications.push({
              adset_id: adSet.adsetId,
              previous_budget: adSet.presupuesto,
              new_budget: newBudget,
              reason: `[Bulk Action] ${reason}`,
              user_id: user.id,
              spend_at_modification: metrics.spend,
              roas_at_modification: adSet.roas,
              sales_at_modification: maxSales,
              profit_at_modification: profit
            });

            return {
              success: true,
              adSet,
              newBudget
            } as UpdateResult;
          } catch (error) {
            console.error(`Error updating adset ${adSet.adsetId}:`, error);
            return {
              success: false,
              adSet,
              error: error instanceof Error ? error : new Error(String(error)),
              newBudget: adSet.presupuesto
            } as UpdateResult;
          }
        })
      );

      // Procesar resultados de las actualizaciones
      updateResults.forEach((result) => {
        if (result.status === 'fulfilled') {
          const { success, adSet, newBudget } = result.value;

          if (success) {
            modifiedAdSets.push({
              name: adSet.name,
              oldBudget: adSet.presupuesto,
              newBudget,
            });
            successCount++;
          } else {
            failCount++;
          }
        } else {
          failCount++;
        }
      });

      // Insertar modificaciones en batch si hay alguna
      if (budgetModifications.length > 0) {
        const { error: batchError } = await supabase
          .from('budget_modifications')
          .insert(budgetModifications);

        if (batchError) {
          console.error('Error insertando modificaciones en batch:', batchError);
          // No fallamos todo el proceso, seguimos ya que la actualización en Facebook fue exitosa
        }
      }

      setResults({
        success: successCount,
        failed: failCount,
        modified: modifiedAdSets,
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

  const toggleAllAdSets = (check: boolean) => {
    const newSelection = { ...selectedAdSets };
    adSets.forEach(adSet => {
      if (adSet.status === 'ACTIVE') {
        newSelection[adSet.adsetId] = check;
      }
    });
    setSelectedAdSets(newSelection);
  };

  // Selecciona los adSets que cumplen con las condiciones compuestas
  const compoundRuleFilteredAdSets = adSets.filter(adSet => {
    if (!selectedAdSets[adSet.adsetId] || adSet.status !== 'ACTIVE') return false;
    return evaluateCompoundConditions(adSet, compoundRules);
  });

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="relative">
        {/* Header con botón de cerrar y selector de perfiles */}
        <div className="p-4 sm:p-6 border-b border-gray-200">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg sm:text-xl font-semibold text-gray-900">
              Acciones Masivas
            </h2>
            <button
              onClick={onClose}
              className="rounded-full p-1 hover:bg-gray-100 text-gray-500"
              aria-label="Cerrar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Selector de perfiles */}
          <ProfileSelector
            selectedProfileId={selectedProfileId}
            setSelectedProfileId={setSelectedProfileId}
            profiles={profiles}
            isLoadingProfiles={isLoadingProfiles}
            loadProfile={loadProfile}
            initialAdSets={initialAdSets}
            setSelectedAction={setSelectedAction}
            setFixedBudget={setFixedBudget}
            setPercentageChange={setPercentageChange}
            setRoasThreshold={setRoasThreshold}
            setRoasMinThreshold={setRoasMinThreshold}
            setRoasMaxThreshold={setRoasMaxThreshold}
            setRoasFilter={setRoasFilter}
            setRoasAction={setRoasAction}
            setRoasBetweenAction={setRoasBetweenAction}
            setRoasFixedBudget={setRoasFixedBudget}
            setManualBudgets={setManualBudgets}
            setReason={setReason}
            setSelectedAdSets={setSelectedAdSets}
            profileSaving={profileSaving}
            setShowSaveProfilePrompt={setShowSaveProfilePrompt}
            setNewProfileName={setNewProfileName}
            deleteProfile={deleteProfile}
          />
        </div>

        <div className="p-4 sm:p-6">
          {results ? (
            // Resultados de la acción
            <div className="space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <h3 className="text-lg font-medium text-green-800 mb-2">
                  Acción completada
                </h3>
                <div className="flex gap-6 mb-4">
                  <div>
                    <span className="text-sm text-gray-500">Exitosos</span>
                    <p className="text-2xl font-bold text-green-600">{results.success}</p>
                  </div>
                  {results.failed > 0 && (
                    <div>
                      <span className="text-sm text-gray-500">Fallidos</span>
                      <p className="text-2xl font-bold text-red-600">{results.failed}</p>
                    </div>
                  )}
                </div>

                {results.modified.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 mb-2">
                      Conjuntos Modificados:
                    </h4>
                    <div className="max-h-60 overflow-y-auto bg-white rounded border border-gray-200">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">
                              Conjunto
                            </th>
                            <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">
                              Anterior
                            </th>
                            <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">
                              Nuevo
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {results.modified.map((mod, idx) => (
                            <tr key={idx}>
                              <td className="px-3 py-2 text-sm text-gray-900 break-words pr-2">
                                {mod.name}
                              </td>
                              <td className="px-3 py-2 text-sm text-gray-500 text-right">
                                {formatCurrency(mod.oldBudget)}
                              </td>
                              <td className="px-3 py-2 text-sm text-gray-900 text-right font-medium">
                                {formatCurrency(mod.newBudget)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end">
                <button
                  onClick={() => {
                    onClose();
                  }}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors"
                >
                  Cerrar
                </button>
              </div>
            </div>
          ) : (
            // Formulario para seleccionar acción
            <div className="space-y-6">
              {/* Selector de tipo de acción */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tipo de Acción
                </label>
                <select
                  value={selectedAction}
                  onChange={(e) => setSelectedAction(e.target.value as ActionType)}
                  className="block w-full rounded-md border-gray-300 shadow-sm py-2 px-3 bg-white focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                >
                  <option value="set-fixed">Establecer presupuesto fijo</option>
                  <option value="decrease-all">Disminuir todos los presupuestos</option>
                  <option value="increase-all">Aumentar todos los presupuestos</option>
                  <option value="roas-based">Basado en ROAS</option>
                  <option value="compound-rule">Reglas condicionales compuestas</option>
                </select>
              </div>

              {/* Opciones específicas según el tipo de acción */}
              {selectedAction === 'set-fixed' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Presupuesto fijo para todos
                  </label>
                  <div className="relative rounded-md shadow-sm">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                      <DollarSign className="h-4 w-4 text-gray-400" />
                    </div>
                    <input
                      type="number"
                      value={fixedBudget}
                      onChange={(e) =>
                        setFixedBudget(Math.max(1, parseFloat(e.target.value) || 0))
                      }
                      className="block w-full rounded-md border-gray-300 pl-10 py-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                      placeholder="5.00"
                      step="0.01"
                      min="1"
                    />
                  </div>
                  <p className="mt-1 text-sm text-gray-500">
                    Establece el mismo presupuesto para todos los conjuntos seleccionados
                  </p>
                </div>
              )}

              {(selectedAction === 'decrease-all' || selectedAction === 'increase-all') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {selectedAction === 'decrease-all' ? 'Porcentaje de disminución' : 'Porcentaje de aumento'}
                  </label>
                  <div className="relative rounded-md shadow-sm">
                    <input
                      type="number"
                      value={percentageChange}
                      onChange={(e) =>
                        setPercentageChange(Math.max(1, Math.min(100, parseFloat(e.target.value) || 0)))
                      }
                      className="block w-full rounded-md border-gray-300 pr-12 py-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                      placeholder="10"
                      step="1"
                      min="1"
                      max="100"
                    />
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                      <span className="text-gray-500 sm:text-sm">%</span>
                    </div>
                  </div>
                  <p className="mt-1 text-sm text-gray-500">
                    {selectedAction === 'decrease-all'
                      ? 'Reduce el presupuesto actual de cada conjunto en este porcentaje'
                      : 'Aumenta el presupuesto actual de cada conjunto en este porcentaje'}
                  </p>
                </div>
              )}

              {selectedAction === 'roas-based' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Filtro ROAS
                    </label>
                    <select
                      value={roasFilter}
                      onChange={(e) => setRoasFilter(e.target.value as RoasFilterType)}
                      className="block w-full rounded-md border-gray-300 shadow-sm py-2 px-3 bg-white focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    >
                      <option value="above">ROAS mayor o igual que</option>
                      <option value="below">ROAS menor que</option>
                      <option value="between">ROAS entre dos valores</option>
                    </select>
                  </div>

                  {roasFilter === 'between' ? (
                    <>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            ROAS mínimo
                          </label>
                          <div className="relative rounded-md shadow-sm">
                            <input
                              type="number"
                              value={roasMinThreshold}
                              onChange={(e) =>
                                setRoasMinThreshold(Math.max(0, parseFloat(e.target.value) || 0))
                              }
                              className="block w-full rounded-md border-gray-300 pr-10 py-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                              placeholder="1.0"
                              step="0.1"
                              min="0"
                            />
                            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                              <span className="text-gray-500 sm:text-sm">x</span>
                            </div>
                          </div>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            ROAS máximo
                          </label>
                          <div className="relative rounded-md shadow-sm">
                            <input
                              type="number"
                              value={roasMaxThreshold}
                              onChange={(e) =>
                                setRoasMaxThreshold(Math.max(roasMinThreshold, parseFloat(e.target.value) || roasMinThreshold))
                              }
                              className="block w-full rounded-md border-gray-300 pr-10 py-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                              placeholder="2.0"
                              step="0.1"
                              min={roasMinThreshold}
                            />
                            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                              <span className="text-gray-500 sm:text-sm">x</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Selector para aumentar o disminuir presupuesto en el rango entre */}
                      {roasAction === 'percentage' && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Acción para el rango ROAS
                          </label>
                          <select
                            value={roasBetweenAction}
                            onChange={(e) => setRoasBetweenAction(e.target.value as 'increase' | 'decrease')}
                            className="block w-full rounded-md border-gray-300 shadow-sm py-2 px-3 bg-white focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                          >
                            <option value="increase">Aumentar presupuesto</option>
                            <option value="decrease">Disminuir presupuesto</option>
                          </select>
                        </div>
                      )}
                    </>
                  ) : (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Umbral de ROAS
                      </label>
                      <div className="relative rounded-md shadow-sm">
                        <input
                          type="number"
                          value={roasThreshold}
                          onChange={(e) =>
                            setRoasThreshold(Math.max(0, parseFloat(e.target.value) || 0))
                          }
                          className="block w-full rounded-md border-gray-300 pr-10 py-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                          placeholder="1.5"
                          step="0.1"
                          min="0"
                        />
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                          <span className="text-gray-500 sm:text-sm">x</span>
                        </div>
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Tipo de ajuste
                    </label>
                    <select
                      value={roasAction}
                      onChange={(e) => setRoasAction(e.target.value as RoasActionType)}
                      className="block w-full rounded-md border-gray-300 shadow-sm py-2 px-3 bg-white focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    >
                      <option value="percentage">Ajuste porcentual</option>
                      <option value="fixed">Valor fijo</option>
                      <option value="manual">Ajuste manual</option>
                    </select>
                  </div>

                  {roasAction === 'percentage' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        {(roasFilter === 'below' || (roasFilter === 'between' && roasBetweenAction === 'decrease'))
                          ? 'Porcentaje de disminución'
                          : 'Porcentaje de aumento'}
                      </label>
                      <div className="relative rounded-md shadow-sm">
                        <input
                          type="number"
                          value={percentageChange}
                          onChange={(e) =>
                            setPercentageChange(Math.max(1, Math.min(100, parseFloat(e.target.value) || 0)))
                          }
                          className="block w-full rounded-md border-gray-300 pr-12 py-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                          placeholder="10"
                          step="1"
                          min="1"
                          max="100"
                        />
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                          <span className="text-gray-500 sm:text-sm">%</span>
                        </div>
                      </div>
                      <p className="mt-1 text-sm text-gray-500">
                        {roasFilter === 'below'
                          ? `Reduce el presupuesto de conjuntos con ROAS < ${roasThreshold}x`
                          : roasFilter === 'above'
                            ? `Aumenta el presupuesto de conjuntos con ROAS ≥ ${roasThreshold}x`
                            : roasBetweenAction === 'increase'
                              ? `Aumenta el presupuesto de conjuntos con ROAS entre ${roasMinThreshold}x y ${roasMaxThreshold}x`
                              : `Disminuye el presupuesto de conjuntos con ROAS entre ${roasMinThreshold}x y ${roasMaxThreshold}x`}
                      </p>
                    </div>
                  )}

                  {roasAction === 'fixed' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Presupuesto fijo para conjuntos filtrados
                      </label>
                      <div className="relative rounded-md shadow-sm">
                        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                          <DollarSign className="h-4 w-4 text-gray-400" />
                        </div>
                        <input
                          type="number"
                          value={roasFixedBudget}
                          onChange={(e) =>
                            setRoasFixedBudget(Math.max(1, parseFloat(e.target.value) || 0))
                          }
                          className="block w-full rounded-md border-gray-300 pl-10 py-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                          placeholder="5.00"
                          step="0.01"
                          min="1"
                        />
                      </div>
                      <p className="mt-1 text-sm text-gray-500">
                        Establece el mismo presupuesto para todos los conjuntos que cumplan la condición ROAS
                      </p>
                    </div>
                  )}

                  {roasAction === 'manual' && (
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <label className="block text-sm font-medium text-gray-700">
                          Ajuste manual para conjuntos filtrados
                        </label>
                        <div className="flex gap-2 items-center">
                          <button
                            onClick={() => setShowManualTableModal(true)}
                            type="button"
                            className="text-sm text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                          >
                            <ExternalLink className="h-4 w-4" />
                            Ver Tabla Completa
                          </button>
                          <button
                            onClick={() => setShowManualEditor(!showManualEditor)}
                            type="button"
                            className="text-sm text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                          >
                            <Edit className="h-4 w-4" />
                            {showManualEditor ? 'Guardar' : 'Editar presupuestos'}
                          </button>
                        </div>
                      </div>

                      {showManualEditor ? (
                        <div className="bg-gray-50 p-3 rounded-md border border-gray-200 max-h-80 overflow-y-auto">
                          <p className="text-xs text-gray-500 mb-3 flex items-center gap-1">
                            <span>Haz clic en "Ver Tabla Completa" para una mejor visualización</span>
                            <ExternalLink className="h-3 w-3 inline" />
                          </p>
                          {roasFilteredAdSets.length > 0 ? (
                            <div className="space-y-3">
                              {roasFilteredAdSets.map(adSet => (
                                <div key={adSet.adsetId} className="p-3 rounded-md border border-gray-200 bg-white shadow-sm">
                                  <div className="flex justify-between items-center">
                                    <div className="flex-1 min-w-0 pr-4">
                                      <div className="text-sm font-medium text-gray-900 truncate" title={adSet.name}>
                                        {adSet.name}
                                      </div>
                                      {/* Layout responsivo - cambia a columna en móviles */}
                                      <div className="flex flex-col sm:flex-row flex-wrap gap-y-2 gap-x-5 mt-2">
                                        <div className="flex items-center sm:flex-col sm:items-center">
                                          <span className="text-xs text-gray-400 mr-2 sm:mr-0">ROAS</span>
                                          <span className="text-base font-semibold">{adSet.roas.toFixed(2)}x</span>
                                        </div>
                                        <div className="flex items-center sm:flex-col sm:items-center">
                                          <span className="text-xs text-gray-400 mr-2 sm:mr-0">Gasto</span>
                                          <span className="text-base font-semibold">
                                            {adSet.spend !== undefined ? formatCurrency(adSet.spend) : '-'}
                                          </span>
                                        </div>
                                        <div className="flex items-center sm:flex-col sm:items-center">
                                          <span className="text-xs text-gray-400 mr-2 sm:mr-0">Profit/Loss</span>
                                          <span className={`text-base font-semibold ${adSet.profit !== undefined
                                            ? (adSet.profit > 0 ? 'text-green-600' : adSet.profit < 0 ? 'text-red-600' : '')
                                            : ''}`}>
                                            {adSet.profit !== undefined
                                              ? (adSet.profit >= 0 ? '+' : '') + formatCurrency(adSet.profit)
                                              : '-'}
                                          </span>
                                        </div>
                                      </div>
                                      {adSet.last_modification && adSet.last_modification.date && (
                                        <div className="mt-2">
                                          <div className="text-xs flex items-center">
                                            <span className="text-gray-400 mr-1">Modificación:</span>
                                            <span className="font-medium text-gray-700">
                                              {formatTimeAgo(adSet.last_modification.rawDate)}
                                              <span className="text-gray-500 font-normal ml-1 text-xs">({adSet.last_modification.date})</span>
                                            </span>
                                          </div>
                                          <div className="flex items-center gap-1 mt-1 text-xs">
                                            {adSet.last_modification.newBudget > adSet.last_modification.previousBudget ? (
                                              <TrendingUp className="h-3 w-3 text-green-500" />
                                            ) : (
                                              <TrendingDown className="h-3 w-3 text-red-500" />
                                            )}
                                            <span className={`font-medium ${adSet.last_modification.newBudget > adSet.last_modification.previousBudget ? 'text-green-600' : 'text-red-600'}`}>
                                              {formatCurrency(adSet.last_modification.previousBudget)} → {formatCurrency(adSet.last_modification.newBudget)}
                                            </span>
                                          </div>
                                          {adSet.profit !== undefined && adSet.last_modification.profitAtModification !== undefined && (
                                            <div className="flex items-center gap-1 mt-1 text-xs">
                                              <span className="text-gray-500">Profit/Loss:</span>
                                              <span className={`font-medium ${adSet.last_modification.profitAtModification >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                {adSet.last_modification.profitAtModification >= 0 ? '+' : ''}{formatCurrency(adSet.last_modification.profitAtModification)}
                                              </span>
                                              <span className="text-gray-500 mx-1">→</span>
                                              <span className={`font-medium ${adSet.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                {adSet.profit >= 0 ? '+' : ''}{formatCurrency(adSet.profit)}
                                              </span>
                                              {adSet.profit !== adSet.last_modification.profitAtModification && (
                                                <span className={`ml-1 ${adSet.profit > adSet.last_modification.profitAtModification ? 'text-green-600' : 'text-red-600'} flex items-center`}>
                                                  {adSet.profit > adSet.last_modification.profitAtModification ? (
                                                    <>
                                                      <TrendingUp className="h-3 w-3 mr-0.5" />
                                                      +{formatCurrency(adSet.profit - adSet.last_modification.profitAtModification)}
                                                    </>
                                                  ) : (
                                                    <>
                                                      <TrendingDown className="h-3 w-3 mr-0.5" />
                                                      {formatCurrency(adSet.profit - adSet.last_modification.profitAtModification)}
                                                    </>
                                                  )}
                                                </span>
                                              )}
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </div>

                                    <div className="flex-shrink-0">
                                      <div className="bg-indigo-50 px-3 pt-1 pb-2 rounded-lg border border-indigo-200 shadow-sm">
                                        <div className="flex items-center justify-center mb-1">
                                          <Edit className="h-3 w-3 text-indigo-500 mr-1" />
                                          <span className="text-xs font-medium text-indigo-600">Presupuesto</span>
                                        </div>
                                        <div className="relative">
                                          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2">
                                            <DollarSign className="h-4 w-4 text-indigo-500" />
                                          </div>
                                          <input
                                            type="number"
                                            value={manualBudgets[adSet.adsetId] !== undefined ? manualBudgets[adSet.adsetId] : adSet.presupuesto}
                                            onChange={(e) => {
                                              const value = Math.max(1, parseFloat(e.target.value) || 0);
                                              setManualBudgets(prev => ({
                                                ...prev,
                                                [adSet.adsetId]: value
                                              }));
                                            }}
                                            className="w-28 rounded-md border border-indigo-300 pl-7 py-1.5 text-sm font-medium bg-white focus:ring-indigo-500 focus:border-indigo-500 hover:border-indigo-400 transition-colors"
                                            step="0.01"
                                            min="1"
                                          />
                                        </div>
                                      </div>
                                    </div>
                                  </div>

                                  {(manualBudgets[adSet.adsetId] !== undefined && manualBudgets[adSet.adsetId] !== adSet.presupuesto) && (
                                    <div className="mt-2 flex items-center justify-end">
                                      <div className={`text-xs font-medium px-2 py-0.5 rounded-full ${manualBudgets[adSet.adsetId] > adSet.presupuesto
                                        ? 'bg-green-100 text-green-700'
                                        : 'bg-red-100 text-red-700'
                                        }`}>
                                        {manualBudgets[adSet.adsetId] > adSet.presupuesto ? '+' : ''}
                                        {formatCurrency(manualBudgets[adSet.adsetId] - adSet.presupuesto)}
                                        ({((manualBudgets[adSet.adsetId] - adSet.presupuesto) / adSet.presupuesto * 100).toFixed(1)}%)
                                      </div>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-sm text-center text-gray-500 py-4">
                              No hay conjuntos que cumplan el criterio de ROAS seleccionado.
                            </p>
                          )}
                        </div>
                      ) : (
                        <div className="bg-gray-50 p-3 rounded-md border border-gray-200">
                          <div className="flex justify-between items-center">
                            <p className="text-sm text-gray-700 mb-0">
                              {roasFilteredAdSets.length} conjuntos cumplen con el criterio ROAS
                            </p>
                            <button
                              onClick={() => setShowManualTableModal(true)}
                              type="button"
                              className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                            >
                              <ExternalLink className="h-3 w-3" />
                              Ver Tabla
                            </button>
                          </div>
                          <p className="text-xs text-gray-500 mt-1">
                            Haz clic en "Editar presupuestos" para establecer valores manualmente.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {selectedAction === 'compound-rule' && (
                <CompoundRuleSection
                  compoundRules={compoundRules}
                  setCompoundRules={setCompoundRules}
                  compoundRuleFilteredAdSets={compoundRuleFilteredAdSets}
                  adSets={adSets}
                  selectedAdSets={selectedAdSets}
                  setShowManualTableModal={setShowManualTableModal}
                />
              )}

              {/* Razón del cambio */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Razón del cambio
                </label>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="block w-full rounded-md border-gray-300 shadow-sm py-2 px-3 bg-white focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  placeholder="Optimización masiva de presupuestos..."
                />
              </div>

              {/* Selector de conjuntos */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Conjuntos afectados
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => toggleAllAdSets(true)}
                      className="text-xs text-indigo-600 hover:text-indigo-800"
                      type="button"
                    >
                      Seleccionar todos
                    </button>
                    <button
                      onClick={() => toggleAllAdSets(false)}
                      className="text-xs text-indigo-600 hover:text-indigo-800"
                      type="button"
                    >
                      Deseleccionar todos
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowAdSets(!showAdSets)}
                  className="flex w-full items-center justify-between rounded-md bg-gray-100 p-2 text-left text-sm hover:bg-gray-200"
                >
                  <span className="font-medium">
                    {Object.values(selectedAdSets).filter(Boolean).length} conjuntos seleccionados
                  </span>
                  {showAdSets ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>

                {showAdSets && (
                  <div className="mt-2 max-h-60 overflow-y-auto border border-gray-200 rounded-md">
                    <ul className="divide-y divide-gray-200">
                      {adSets
                        .filter(adSet => adSet.status === 'ACTIVE')
                        .map(adSet => (
                          <li key={adSet.adsetId} className="relative">
                            <label className="flex items-start gap-2 p-3 hover:bg-gray-50">
                              <input
                                type="checkbox"
                                checked={!!selectedAdSets[adSet.adsetId]}
                                onChange={(e) => setSelectedAdSets({
                                  ...selectedAdSets,
                                  [adSet.adsetId]: e.target.checked
                                })}
                                className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 mt-1"
                              />
                              <div className="w-full">
                                <p className="text-sm font-medium text-gray-900 break-words pr-2">
                                  {adSet.name}
                                </p>
                                <div className="flex flex-wrap gap-3 text-xs text-gray-500 mt-1">
                                  <span>Presupuesto: {formatCurrency(adSet.presupuesto)}</span>
                                  <span>ROAS: {adSet.roas.toFixed(2)}x</span>
                                  {adSet.spend !== undefined && (
                                    <span>Gasto: {formatCurrency(adSet.spend)}</span>
                                  )}
                                  {adSet.profit !== undefined && (
                                    <span className={getProfitColorClass(adSet.profit)}>
                                      {adSet.profit >= 0 ? '+' : ''}{formatCurrency(adSet.profit)}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </label>
                          </li>
                        ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Previsualización */}
              {adSetsToModify.length > 0 && (
                <div className="bg-yellow-50 p-3 rounded-md border border-yellow-200">
                  <h3 className="text-sm font-medium text-yellow-800 mb-2">
                    Previsualización de cambios
                  </h3>
                  <p className="text-xs text-yellow-700 mb-2">
                    Se modificarán {adSetsToModify.length} conjuntos de anuncios.
                  </p>
                  <div className="max-h-48 overflow-y-auto">
                    <table className="min-w-full divide-y divide-yellow-200">
                      <thead className="bg-yellow-100">
                        <tr>
                          <th className="px-3 py-1 text-left text-xs font-medium text-yellow-800">
                            Conjunto
                          </th>
                          <th className="px-3 py-1 text-right text-xs font-medium text-yellow-800">
                            Actual
                          </th>
                          <th className="px-3 py-1 text-right text-xs font-medium text-yellow-800">
                            Nuevo
                          </th>
                          <th className="px-3 py-1 text-right text-xs font-medium text-yellow-800">
                            % Cambio
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-yellow-50 divide-y divide-yellow-200">
                        {adSetsToModify.slice(0, 5).map((adSet) => {
                          const newBudget = calculateNewBudget(adSet);
                          const percentChange = ((newBudget - adSet.presupuesto) / adSet.presupuesto) * 100;
                          return (
                            <tr key={adSet.adsetId}>
                              <td className="px-3 py-1 text-xs text-yellow-800 break-words max-w-[150px]">
                                {adSet.name}
                              </td>
                              <td className="px-3 py-1 text-xs text-right text-yellow-800">
                                {formatCurrency(adSet.presupuesto)}
                              </td>
                              <td className="px-3 py-1 text-xs text-right text-yellow-800">
                                {formatCurrency(newBudget)}
                              </td>
                              <td className="px-3 py-1 text-xs text-right text-yellow-800">
                                <span className={percentChange > 0 ? 'text-green-700' : percentChange < 0 ? 'text-red-700' : 'text-gray-500'}>
                                  {percentChange > 0 ? '+' : ''}{percentChange.toFixed(0)}%
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                        {adSetsToModify.length > 5 && (
                          <tr>
                            <td colSpan={4} className="px-3 py-1 text-xs text-center text-yellow-700">
                              + {adSetsToModify.length - 5} más...
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Resumen de métricas */}
                  <div className="mt-3 pt-2 border-t border-yellow-200">
                    <div className="grid grid-cols-3 gap-2">
                      <div className="text-center">
                        <p className="text-xs text-yellow-800">Presupuesto Total Actual</p>
                        <p className="text-sm font-medium text-yellow-900">
                          {formatCurrency(adSetsToModify.reduce((acc, adSet) => acc + adSet.presupuesto, 0))}
                        </p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs text-yellow-800">Presupuesto Total Nuevo</p>
                        <p className="text-sm font-medium text-yellow-900">
                          {formatCurrency(adSetsToModify.reduce((acc, adSet) => acc + calculateNewBudget(adSet), 0))}
                        </p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs text-yellow-800">Variación Total</p>
                        <p className="text-sm font-medium text-yellow-900">
                          {formatCurrency(adSetsToModify.reduce((acc, adSet) => acc + (calculateNewBudget(adSet) - adSet.presupuesto), 0))}
                        </p>
                      </div>
                    </div>


                  </div>
                </div>
              )}

              {/* Botones de acción */}
              <div className="flex justify-end pt-4 space-x-3 border-t border-gray-200">
                <button
                  onClick={onClose}
                  disabled={processing}
                  className="px-4 py-2 bg-white border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 text-sm font-medium"
                >
                  Cancelar
                </button>
                <button
                  onClick={processBulkAction}
                  disabled={
                    processing ||
                    !reason.trim() ||
                    adSetsToModify.length === 0 ||
                    Object.values(selectedAdSets).filter(Boolean).length === 0
                  }
                  className="inline-flex items-center px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {processing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Procesando...
                    </>
                  ) : (
                    'Aplicar Cambios'
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal de tabla completa para ajuste manual */}
      <ManualAdjustmentTableModal
        isOpen={showManualTableModal}
        onClose={() => setShowManualTableModal(false)}
        adSets={adSets.filter(adSet =>
          selectedAdSets[adSet.adsetId] &&
          adSet.status === 'ACTIVE' &&
          ((roasFilter === 'above' && adSet.roas >= roasThreshold) ||
            (roasFilter === 'below' && adSet.roas < roasThreshold) ||
            (roasFilter === 'between' && adSet.roas >= roasMinThreshold && adSet.roas <= roasMaxThreshold))
        )}
        manualBudgets={manualBudgets}
        setManualBudgets={setManualBudgets}
        formatCurrency={formatCurrency}
      />

      {/* Modal para guardar perfil */}
      <SaveProfileModal
        showSaveProfilePrompt={showSaveProfilePrompt}
        setShowSaveProfilePrompt={setShowSaveProfilePrompt}
        selectedProfileId={selectedProfileId}
        profiles={profiles}
        newProfileName={newProfileName}
        setNewProfileName={setNewProfileName}
        profileSaving={profileSaving}
        saveProfile={saveProfile}
      />
    </Modal>
  );
}



