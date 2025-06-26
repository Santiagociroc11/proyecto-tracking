import React, { useMemo, useState, useEffect } from 'react';
import { StatusBadge } from './components/StatusBadge';
import { SpendProgress } from './components/SpendProgress';
import { RoasIndicator } from './components/RoasIndicator';
import { BudgetCell } from './components/BudgetCell';
import { TableHeader } from './components/TableHeader';
import { AdSetName } from './components/AdSetName';
import { AdSetReviewModal } from './components/AdSetReviewModal';
import { BulkActionsModal } from './components/BulkActionsModal';
import { CampaignBulkActionsModal } from './components/CampaignBulkActionsModal';
import { useTableSort } from './hooks/useTableSort';
import { supabase } from '../../lib/supabase';
import { TrendingUp, TrendingDown, ChevronDown, ChevronUp, ExternalLink, Layers, AlertTriangle, BarChart2 } from 'lucide-react';
import {
  getDecisionStatus,
  getDecisionWeight,
  getRowStyle,
} from './utils/decisionRules';
import type { AdsTableProps, DecisionStatus, AdsetStatus } from './types';
import { CampaignBudgetModal } from './components/CampaignBudgetModal';

// Función para obtener el color de la insignia según la antigüedad
const getTimeAgoBadgeColor = (timestamp: number): string => {
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffHours = diffMs / (1000 * 60 * 60);
  
  if (diffHours < 3) {
    // Modificación muy reciente (menos de 3 horas): verde sutil
    return 'bg-green-50 text-green-700 font-normal';
  } else if (diffHours < 6) {
    // Modificación reciente (3-6 horas): amarillo
    return 'bg-yellow-100 text-yellow-800 font-medium';
  } else if (diffHours < 12) {
    // Modificación hace 6-12 horas: naranja
    return 'bg-orange-200 text-orange-800 font-medium';
  } else if (diffHours < 24) {
    // Modificación antigua (12-24 horas): rojo
    return 'bg-red-200 text-red-800 font-bold';
  } else {
    // Modificación muy antigua (más de 24 horas): rojo intenso
    return 'bg-red-300 text-red-900 font-bold';
  }
};

// Función para formatear el tiempo relativo (hace X tiempo)
const formatTimeAgo = (timestamp: number): string => {
  const now = Date.now();
  const diffMs = now - timestamp;
  
  // Convertir a segundos
  const diffSec = Math.floor(diffMs / 1000);
  
  // Segundos
  if (diffSec < 60) {
    return diffSec < 5 ? 'justo ahora' : `hace ${diffSec} segundo${diffSec !== 1 ? 's' : ''}`;
  }
  
  // Minutos
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) {
    return `hace ${diffMin} minuto${diffMin !== 1 ? 's' : ''}`;
  }
  
  // Horas
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) {
    const remainingMinutes = diffMin % 60;
    if (remainingMinutes === 0 || diffHour > 3) {
      return `hace ${diffHour} hora${diffHour !== 1 ? 's' : ''}`;
    } else {
      return `hace ${diffHour}h ${remainingMinutes}m`;
    }
  }
  
  // Días
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) {
    return `hace ${diffDay} día${diffDay !== 1 ? 's' : ''}`;
  } else if (diffDay < 30) {
    const diffWeek = Math.floor(diffDay / 7);
    return `hace ${diffWeek} semana${diffWeek !== 1 ? 's' : ''}`;
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

// Componente para mostrar el tiempo relativo con estilo adecuado
const TimeAgoIndicator = ({ timestamp }: { timestamp: number }) => {
  const now = Date.now();
  const diffHours = (now - timestamp) / (1000 * 60 * 60);
  const isVeryOld = diffHours >= 24;
  const isOld = diffHours >= 12;
  const badgeClass = getTimeAgoBadgeColor(timestamp);
  
  return (
    <div className="flex items-center gap-1">
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs ${badgeClass} ${isVeryOld ? 'animate-pulse' : ''}`}>
        {isOld && <AlertTriangle className="h-3 w-3 mr-1" />}
        {formatTimeAgo(timestamp)}
      </span>
      {isVeryOld && (
        <span className="text-xs text-red-700 font-medium">¡Atención!</span>
      )}
    </div>
  );
};

// Definir tipos para los datos agregados
interface AggregatedAdData {
  spend: number;
  sales: number;
  tracked_sales: number;
  max_roas: number;
  presupuesto: number;
  budget_remaining: number;
  adset_status: AdsetStatus;
  ad_id: string;
  adset_id: string;
  decision_status: DecisionStatus;
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
  campaignHasBudget?: boolean;
  campaign_id?: string;
  campaign_name?: string;
  campaign_actual_budget?: number;
}

// Tipo para los datos procesados en la tabla
interface TableRowData {
  conjunto: string;
  presupuesto: number;
  spend: number;
  budget_remaining: number;
  sales: number;
  tracked_sales: number;
  max_roas: number;
  status: AdsetStatus;
  ad_id: string;
  adset_id: string;
  decision_status: DecisionStatus;
  decision_weight: number;
  spendPercentage: number;
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
  last_modification_date: number;
  roas_variation: number;
  roas_variation_percent: number;
  revenue: number;
  profit_loss: number;
  roi_percent: number;
  sales_variation: number;
  profit_variation: number;
  campaignHasBudget?: boolean;
  campaign_id?: string;
  campaign_name?: string;
  campaign_actual_budget?: number;
}

const REVENUE_PER_SALE = 18000 / 4100;

export function AdsTable({
  data,
  loading,
  onRefresh,
  formatCurrency,
}: AdsTableProps) {
  const [activeTab, setActiveTab] = useState<'adSets' | 'campaigns'>('adSets');
  const [selectedAdSet, setSelectedAdSet] = useState<{
    name: string;
    adId: string;
    adsetId: string;
    data: {
      presupuesto: number;
      spend: number;
      max_roas: number;
      sales: number;
      tracked_sales: number;
      campaignHasBudget: boolean;
      campaign_id: string;
      campaign_name: string;
      campaign_actual_budget?: number;
    };
  } | null>(null);

  const [decisionStatuses, setDecisionStatuses] = useState<Record<string, DecisionStatus>>({});
  const [lastModifications, setLastModifications] = useState<Record<string, {
    date: string;
    rawDate: number;
    reason: string;
    previousBudget: number;
    newBudget: number;
    spendAtModification: number;
    roasAtModification: number;
    salesAtModification?: number;
    profitAtModification?: number;
  }>>({});
  const [campaignModifications, setCampaignModifications] = useState<Record<string, {
    date: string;
    rawDate: number;
    reason: string;
    previousBudget: number;
    newBudget: number;
    spendAtModification: number;
    roasAtModification: number;
    salesAtModification?: number;
    profitAtModification?: number;
  }>>({});
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [showBulkActions, setShowBulkActions] = useState(false);
  const [showCampaignBulkActions, setShowCampaignBulkActions] = useState(false);

  const { sortConfig, handleSort } = useTableSort({
    primary: {
      field: 'decision_status',
      direction: 'desc',
    },
    secondary: {
      field: 'max_roas',
      direction: 'desc',
    }
  });

  const [selectedCampaign, setSelectedCampaign] = useState<{
    id: string;
    name: string;
    currentBudget: number;
    currentData: {
      spend: number;
      roas: number;
      sales: number;
      tracked_sales: number;
      profit_loss: number;
    };
  } | null>(null);

  // Función para obtener las modificaciones de presupuesto
  const fetchModifications = async () => {
    try {
      const { data, error } = await supabase
        .from('budget_modifications')
        .select('adset_id, modified_at, reason, previous_budget, new_budget, spend_at_modification, roas_at_modification, sales_at_modification, profit_at_modification')
        .order('modified_at', { ascending: false });

      if (error) {
        console.error('Error fetching budget modifications:', error);
        return;
      }

      // Separar modificaciones de conjuntos y campañas
      const adsetModifications: Record<string, any> = {};
      const campaignModifications: Record<string, any> = {};

      data.forEach((mod: any) => {
        if (mod.adset_id.startsWith('campaign_')) {
          // Es una modificación de campaña
          const campaignId = mod.adset_id.replace('campaign_', '');
          if (!campaignModifications[campaignId] || 
              new Date(mod.modified_at).getTime() > new Date(campaignModifications[campaignId].modified_at).getTime()) {
            campaignModifications[campaignId] = mod;
          }
        } else {
          // Es una modificación de conjunto
          if (!adsetModifications[mod.adset_id] || 
              new Date(mod.modified_at).getTime() > new Date(adsetModifications[mod.adset_id].modified_at).getTime()) {
            adsetModifications[mod.adset_id] = mod;
          }
        }
      });

      // Formatear modificaciones de conjuntos
      const formattedAdsetModifications = Object.entries(adsetModifications).reduce((acc: Record<string, any>, [adsetId, mod]: [string, any]) => {
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

      // Formatear modificaciones de campañas
      const formattedCampaignModifications = Object.entries(campaignModifications).reduce((acc: Record<string, any>, [campaignId, mod]: [string, any]) => {
        acc[campaignId] = {
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

      setLastModifications(formattedAdsetModifications);
      setCampaignModifications(formattedCampaignModifications);
    } catch (error) {
      console.error('Error in fetchModifications:', error);
    }
  };

  // Cargar modificaciones al iniciar
  useEffect(() => {
    fetchModifications();
  }, []);

  useEffect(() => {
    const updateDecisionStatuses = async () => {
      const statusPromises = data.map(async (ad) => {
        const status = await getDecisionStatus(ad.presupuesto, Math.max(ad.roas_ad_fb, ad.roas_negocio_general), ad.adset_id);
        return [ad.adset_id, status];
      });

      const statuses = await Promise.all(statusPromises);
      setDecisionStatuses(Object.fromEntries(statuses));
    };

    updateDecisionStatuses();
  }, [data]);

  const aggregatedData = useMemo(() => {
    return data.reduce((acc: Record<string, AggregatedAdData>, ad) => {
      if (!acc[ad.conjunto]) {
        acc[ad.conjunto] = {
          spend: 0,
          sales: 0,
          tracked_sales: 0,
          max_roas: 0,
          presupuesto: ad.presupuesto,
          budget_remaining: ad.budget_remaining,
          adset_status: ad.adset_status as AdsetStatus,
          ad_id: ad.ad_id,
          adset_id: ad.adset_id,
          decision_status: decisionStatuses[ad.adset_id] || 'keep',
          last_modification: lastModifications[ad.adset_id],
          campaignHasBudget: ad.campaignHasBudget,
          campaign_id: ad.campaign_id,
          campaign_name: ad.campaign_name,
          campaign_actual_budget: ad.campaign_actual_budget,
        };
      }
      acc[ad.conjunto].spend += ad.spend;
      acc[ad.conjunto].sales += ad.ventas_fb;
      acc[ad.conjunto].tracked_sales += ad.ventas_trackeadas;
      const currentMaxRoas = Math.max(ad.roas_ad_fb, ad.roas_negocio_general);
      acc[ad.conjunto].max_roas = Math.max(
        acc[ad.conjunto].max_roas,
        currentMaxRoas
      );
      return acc;
    }, {});
  }, [data, decisionStatuses, lastModifications, campaignModifications]);

  // Nuevo hook para agregar datos por campaña
  const campaignData = useMemo(() => {
    return data.reduce((acc: Record<string, {
      name: string;
      id: string;
      spend: number;
      sales: number;
      tracked_sales: number;
      max_roas: number;
      presupuesto: number;
      budget_remaining: number;
      status: AdsetStatus;
      hasBudget: boolean;
      actual_budget?: number;
      adSets: number;
      revenue: number;
      profit_loss: number;
      roi_percent: number;
      roas: number;
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
    }>, ad) => {
      const campaignId = ad.campaign_id || 'unknown';
      if (!acc[campaignId]) {
        acc[campaignId] = {
          name: ad.campaign_name || 'Sin nombre',
          id: campaignId,
          spend: 0,
          sales: 0,
          tracked_sales: 0,
          max_roas: 0,
          presupuesto: 0,
          budget_remaining: 0,
          status: 'ACTIVE',
          hasBudget: ad.campaignHasBudget || false,
          actual_budget: ad.campaign_actual_budget,
          adSets: 0,
          revenue: 0,
          profit_loss: 0,
          roi_percent: 0,
          roas: 0,
          last_modification: campaignModifications[campaignId],
          roas_variation: 0,
          roas_variation_percent: 0,
          sales_variation: 0,
          profit_variation: 0,
        };
      }
      
      acc[campaignId].spend += ad.spend;
      
      // CORRECCIÓN: Calcular ventas correctamente - tomar el máximo por anuncio individual y luego sumar
      const maxSalesForThisAd = Math.max(ad.ventas_fb, ad.ventas_trackeadas);
      acc[campaignId].sales += maxSalesForThisAd; // Usar sales para almacenar la suma de máximos
      acc[campaignId].tracked_sales += ad.ventas_trackeadas; // Mantener para referencia
      
      acc[campaignId].presupuesto += ad.presupuesto;
      acc[campaignId].budget_remaining += ad.budget_remaining;
      acc[campaignId].adSets += 1;
      
      const currentMaxRoas = Math.max(ad.roas_ad_fb, ad.roas_negocio_general);
      acc[campaignId].max_roas = Math.max(
        acc[campaignId].max_roas,
        currentMaxRoas
      );

      // Calcular revenue y profit/loss para cada campaña usando las ventas ya calculadas correctamente
      acc[campaignId].revenue = acc[campaignId].sales * REVENUE_PER_SALE;
      acc[campaignId].profit_loss = acc[campaignId].revenue - acc[campaignId].spend;
      acc[campaignId].roi_percent = acc[campaignId].spend > 0 
        ? (acc[campaignId].profit_loss / acc[campaignId].spend) * 100 
        : 0;
      // Calcular ROAS real de campaña
      acc[campaignId].roas = acc[campaignId].spend > 0 ? acc[campaignId].revenue / acc[campaignId].spend : 0;
      
      // Calcular variaciones si hay modificación
      if (acc[campaignId].last_modification) {
        const mod = acc[campaignId].last_modification!;
        
        // Variación de ROAS
        if (mod.roasAtModification !== undefined && mod.roasAtModification !== null) {
          acc[campaignId].roas_variation = acc[campaignId].roas - mod.roasAtModification;
          acc[campaignId].roas_variation_percent = mod.roasAtModification !== 0 
            ? (acc[campaignId].roas_variation / mod.roasAtModification) * 100 
            : 0;
        }
        
        // Variación de ventas
        if (mod.salesAtModification !== undefined && mod.salesAtModification !== null) {
          acc[campaignId].sales_variation = acc[campaignId].sales - mod.salesAtModification;
        }
        
        // Variación de ganancia
        if (mod.profitAtModification !== undefined && mod.profitAtModification !== null) {
          acc[campaignId].profit_variation = acc[campaignId].profit_loss - mod.profitAtModification;
        }
      }
      
      return acc;
    }, {});
  }, [data, campaignModifications]);

  const sortedData = useMemo(() => {
    const tableData: TableRowData[] = Object.entries(aggregatedData).map(
      ([conjunto, data]) => {
        // Calcular la variación del ROAS si hay una modificación reciente
        const roasAtMod = data.last_modification?.roasAtModification;
        const roasVariation = data.last_modification && roasAtMod !== undefined && roasAtMod !== null
          ? data.max_roas - roasAtMod
          : 0;
        
        // Calcular revenue y ganancia/pérdida
        const maxSales = Math.max(data.sales, data.tracked_sales);
        const revenue = maxSales * REVENUE_PER_SALE;
        const profitLoss = revenue - data.spend;
        
        // Calcular variaciones de ventas y ganancias con comprobaciones de seguridad
        const salesAtMod = data.last_modification?.salesAtModification;
        const salesVariation = data.last_modification && typeof salesAtMod === 'number'
          ? maxSales - salesAtMod
          : 0;
          
        const profitAtMod = data.last_modification?.profitAtModification;
        const profitVariation = data.last_modification && typeof profitAtMod === 'number'
          ? profitLoss - profitAtMod
          : 0;
        
        // Calcular porcentaje de variación ROAS con comprobaciones de seguridad
        const roasVariationPercent = data.last_modification && roasAtMod && roasAtMod !== 0
          ? ((data.max_roas - roasAtMod) / roasAtMod) * 100
          : 0;
        
        return {
          conjunto,
          presupuesto: data.presupuesto,
          spend: data.spend,
          budget_remaining: data.budget_remaining,
          sales: data.sales,
          tracked_sales: data.tracked_sales,
          max_roas: data.max_roas,
          status: data.adset_status,
          ad_id: data.ad_id,
          adset_id: data.adset_id,
          decision_status: data.decision_status,
          decision_weight: getDecisionWeight(data.decision_status),
          spendPercentage:
            data.presupuesto > 0 ? (data.spend / data.presupuesto) * 100 : 0,
          last_modification: data.last_modification,
          last_modification_date: data.last_modification ? data.last_modification.rawDate : 0,
          roas_variation: roasVariation,
          roas_variation_percent: roasVariationPercent,
          revenue: revenue,
          profit_loss: profitLoss,
          roi_percent: data.spend > 0 ? (profitLoss / data.spend) * 100 : 0,
          sales_variation: salesVariation,
          profit_variation: profitVariation,
          campaignHasBudget: data.campaignHasBudget,
          campaign_id: data.campaign_id,
          campaign_name: data.campaign_name,
          campaign_actual_budget: data.campaign_actual_budget,
        };
      }
    );

    // Separa las filas en activas y no activas
    const activeRows = tableData.filter(row => row.status === 'ACTIVE');
    const nonActiveRows = tableData.filter(row => row.status !== 'ACTIVE');

    // Ordena las filas activas
    activeRows.sort((a, b) => {
      // Si estamos ordenando por decision_status, ese es el único criterio
      if (sortConfig.primary.field === 'decision_status') {
        const comparison = b.decision_weight - a.decision_weight;
        return sortConfig.primary.direction === 'desc' ? comparison : -comparison;
      }
      
      // Para otros campos, primero agrupamos por decision_status y luego por el campo seleccionado
      const decisionComparison = b.decision_weight - a.decision_weight;
      if (decisionComparison !== 0) {
        return decisionComparison;
      }
      
      // Ordenar por el campo seleccionado
      if (sortConfig.primary.field === 'last_modification') {
        // Si ambos no tienen modificación, mantienen su orden original
        if (!a.last_modification && !b.last_modification) return 0;
        
        // Sin modificación siempre va al final (o al principio en asc)
        if (!a.last_modification) return 1; // A va después de B siempre
        if (!b.last_modification) return -1; // B va después de A siempre
        
        // Usar el timestamp directamente para la comparación
        if (sortConfig.primary.direction === 'desc') {
          // Descendente: más reciente primero
          return b.last_modification_date - a.last_modification_date;
        } else {
          // Ascendente: más antiguo primero
          return a.last_modification_date - b.last_modification_date;
        }
      } else if (sortConfig.primary.field === 'conjunto') {
        const comparison = a.conjunto.localeCompare(b.conjunto);
        return sortConfig.primary.direction === 'desc' ? -comparison : comparison;
      } else {
        const aValue = a[sortConfig.primary.field];
        const bValue = b[sortConfig.primary.field];
        const comparison = aValue - bValue;
        return sortConfig.primary.direction === 'desc' ? -comparison : comparison;
      }
    });

    // Combina los datos: filas activas ordenadas seguidas de las no activas en su orden original
    return [...activeRows, ...nonActiveRows];
  }, [aggregatedData, sortConfig]);

  const handleDecisionClick = (row: any) => {
    if (row.status !== 'ACTIVE') {
      return;
    }
    setSelectedAdSet({
      name: row.conjunto,
      adId: row.ad_id,
      adsetId: row.adset_id,
      data: {
        presupuesto: row.presupuesto,
        spend: row.spend,
        max_roas: row.max_roas,
        sales: row.sales,
        tracked_sales: row.tracked_sales,
        campaignHasBudget: row.campaignHasBudget,
        campaign_id: row.campaign_id,
        campaign_name: row.campaign_name,
        campaign_actual_budget: row.campaign_actual_budget,
      },
    });
  };

  const toggleRowExpand = (conjunto: string) => {
    setExpandedRows(prev => ({
      ...prev,
      [conjunto]: !prev[conjunto]
    }));
  };

  // Construir los datos para el modal de acciones masivas
  const activeAdSetsForBulk = useMemo(() => {
    return sortedData
      .filter(row => row.status === 'ACTIVE' && !row.campaignHasBudget) // Excluir conjuntos de campañas CBO
      .map(row => ({
      adsetId: row.adset_id,
      name: row.conjunto,
      status: row.status,
      presupuesto: row.presupuesto,
      roas: row.max_roas,
      sales: row.sales,
      tracked_sales: row.tracked_sales,
        spend: row.spend,
      profit: row.profit_loss,
        last_modification: row.last_modification,
        // CBO Fields
        campaignHasBudget: row.campaignHasBudget,
        campaign_id: row.campaign_id,
        campaign_name: row.campaign_name,
        campaign_actual_budget: row.campaign_actual_budget,
    }));
  }, [sortedData]);
  

  // Renderizado para móviles (tarjetas expandibles)
  const renderMobileView = () => (
    <div className="space-y-4 px-4 sm:hidden">
      {loading ? (
        <div className="py-4 text-center text-gray-500">Cargando...</div>
      ) : (
        sortedData.map((row) => (
          <div
            key={row.conjunto}
            className={`rounded-lg overflow-hidden shadow ${
              row.status !== 'ACTIVE' 
                ? 'bg-gray-300 text-gray-800' 
                : getRowStyle(row.decision_status)
            }`}
          >
            {/* Cabecera de la tarjeta (siempre visible) */}
            <div className="p-4">
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center space-x-2 mb-2">
                    <StatusBadge status={row.status} />
                    <span className="font-medium">
                      {row.conjunto.length > 25 
                        ? `${row.conjunto.substring(0, 25)}...` 
                        : row.conjunto}
                    </span>
                    {row.status === 'ACTIVE' && (
                      <button
                        onClick={() => handleDecisionClick(row)}
                        className="ml-1 p-1 text-blue-600"
                        aria-label="Ver detalles completos"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <div className="flex items-center space-x-3 text-sm">
                    <div className="flex items-center gap-1">
                      <span>ROAS: </span>
                      <span className="font-medium">{row.max_roas.toFixed(2)}x</span>
                      <RoasIndicator
                        value={row.max_roas}
                        variation={row.roas_variation}
                      />
                    </div>
                    <div>
                      <span>Estado: </span>
                      <span className="font-medium">
                        {row.status === 'PAUSED'
                          ? 'Pausado'
                          : row.decision_status === 'decision-needed'
                            ? 'Requiere Decisión'
                            : row.decision_status === 'warning'
                              ? 'Fuera de Rango'
                              : 'OK'
                        }
                      </span>
                    </div>
                  </div>
                </div>
                <button 
                  onClick={() => toggleRowExpand(row.conjunto)}
                  className="p-1 rounded-full hover:bg-gray-200"
                >
                  {expandedRows[row.conjunto] ? (
                    <ChevronUp className="h-5 w-5" />
                  ) : (
                    <ChevronDown className="h-5 w-5" />
                  )}
                </button>
              </div>

              {/* Información principal (presupuesto y progreso) */}
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div>
                  <div className="text-xs text-gray-500">Presupuesto</div>
                  <BudgetCell
                    budget={row.presupuesto}
                    remaining={row.budget_remaining}
                    formatCurrency={formatCurrency}
                    campaignHasBudget={row.campaignHasBudget || false}
                    campaignActualBudget={row.campaign_actual_budget}
                  />
                </div>
                <div>
                  <div className="text-xs text-gray-500">Progreso</div>
                  <SpendProgress
                    spend={row.spend}
                    percentage={row.spendPercentage}
                    formatCurrency={formatCurrency}
                    hideBar={row.campaignHasBudget}
                  />
                </div>
              </div>

              {/* Botones de acción */}
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => toggleRowExpand(row.conjunto)}
                  className="flex-1 px-3 py-1.5 bg-gray-100 text-gray-800 rounded-md hover:bg-gray-200 transition-colors text-sm font-medium flex items-center justify-center"
                >
                  {expandedRows[row.conjunto] ? 'Ocultar detalles' : 'Ver detalles'}
                  {expandedRows[row.conjunto] ? (
                    <ChevronUp className="ml-1 h-4 w-4" />
                  ) : (
                    <ChevronDown className="ml-1 h-4 w-4" />
                  )}
                </button>
                
                {((row.decision_status === 'decision-needed' || row.decision_status === 'warning') && row.status === 'ACTIVE') && (
                  <button
                    onClick={() => handleDecisionClick(row)}
                    className="px-3 py-1.5 bg-yellow-100 text-yellow-800 rounded-md hover:bg-yellow-200 transition-colors text-sm font-medium flex items-center whitespace-nowrap"
                  >
                    Revisar <ExternalLink className="ml-1 h-3 w-3" />
                  </button>
                )}
              </div>
            </div>

            {/* Área expandible */}
            {expandedRows[row.conjunto] && (
              <div className="bg-white p-4 border-t border-gray-200">
                <div className="grid grid-cols-2 gap-4 mb-3">
                  <div>
                    <div className="text-xs text-gray-500">Ventas</div>
                    <div className="flex items-center">
                      <div className="font-medium">{Math.max(row.sales, row.tracked_sales)}</div>
                      {row.sales_variation !== 0 && row.sales_variation !== null && row.sales_variation !== undefined && (
                        <span className={`ml-1.5 text-xs ${row.sales_variation > 0 ? 'text-green-600' : 'text-red-600'} flex items-center`}>
                          {row.sales_variation > 0 ? (
                            <>
                              <TrendingUp className="h-3 w-3 mr-0.5" />
                              +{row.sales_variation}
                            </>
                          ) : (
                            <>
                              <TrendingDown className="h-3 w-3 mr-0.5" />
                              {row.sales_variation}
                            </>
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Ganancia/Pérdida</div>
                    <div className="flex flex-col">
                      <div className={`font-medium ${row.profit_loss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {row.profit_loss >= 0 ? '+' : ''}{formatCurrency(row.profit_loss)} ({row.roi_percent.toFixed(0)}%)
                      </div>
                      {row.profit_variation !== 0 && row.profit_variation !== null && row.profit_variation !== undefined && (
                        <span className={`text-xs ${row.profit_variation > 0 ? 'text-green-600' : 'text-red-600'} flex items-center`}>
                          {row.profit_variation > 0 ? (
                            <>
                              <TrendingUp className="h-3 w-3 mr-0.5" />
                              +{formatCurrency(row.profit_variation)}
                            </>
                          ) : (
                            <>
                              <TrendingDown className="h-3 w-3 mr-0.5" />
                              {formatCurrency(row.profit_variation)}
                            </>
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                
                {/* Agregar Ganancia/Pérdida */}
                <div className="grid grid-cols-2 gap-4 mb-3">
                  <div>
                    <div className="text-xs text-gray-500">Revenue</div>
                    <div className="font-medium">{formatCurrency(row.revenue)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Ganancia/Pérdida</div>
                    <div className={`font-medium ${row.profit_loss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {row.profit_loss >= 0 ? '+' : ''}{formatCurrency(row.profit_loss)} ({row.roi_percent.toFixed(0)}%)
                    </div>
                  </div>
                </div>

                {/* Última modificación */}
                <div className="mt-3">
                  <div className="text-xs text-gray-500 mb-1">Última Modificación</div>
                  {row.campaignHasBudget && (
                    <div className="mb-1 text-xs text-blue-600 font-semibold flex items-center gap-1">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 inline-block" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M12 20a8 8 0 100-16 8 8 0 000 16z" /></svg>
                      Las modificaciones son a nivel de campaña
                    </div>
                  )}
                  {row.last_modification ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <TimeAgoIndicator timestamp={row.last_modification.rawDate} />
                        <span className="text-gray-500 text-xs">
                          {row.last_modification.date}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        {row.last_modification.newBudget > row.last_modification.previousBudget ? (
                          <TrendingUp className="h-4 w-4 text-green-500" />
                        ) : (
                          <TrendingDown className="h-4 w-4 text-red-500" />
                        )}
                        <span>
                          {formatCurrency(row.last_modification.previousBudget)} →{' '}
                          {formatCurrency(row.last_modification.newBudget)}
                        </span>
                      </div>
                      <div className="text-xs text-gray-400">
                        {row.last_modification.reason}
                      </div>
                      <div className="text-xs text-gray-500">
                        <span>Gasto: {formatCurrency(row.last_modification.spendAtModification)}</span>
                        {row.spend > row.last_modification.spendAtModification && (
                          <span className="text-green-600 ml-1">
                            (+{formatCurrency(row.spend - row.last_modification.spendAtModification)})
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500">
                        <span>ROAS: {(row.last_modification?.roasAtModification ?? 0).toFixed(2)}x</span>
                        {row.roas_variation !== 0 && row.roas_variation !== null && row.roas_variation !== undefined && (
                          <span className={`ml-1 ${row.roas_variation > 0 ? 'text-green-600' : 'text-red-600'}`}>
                            ({row.roas_variation > 0 ? '+' : ''}{(row.roas_variation || 0).toFixed(2)}x)
                          </span>
                        )}
                      </div>
                      {typeof row.last_modification?.salesAtModification !== 'undefined' && (
                        <div className="text-xs text-gray-500">
                          <span>Ventas: {row.last_modification.salesAtModification}</span>
                          {row.sales_variation !== 0 && row.sales_variation !== null && row.sales_variation !== undefined && (
                            <span className={`ml-1 ${row.sales_variation > 0 ? 'text-green-600' : 'text-red-600'}`}>
                              ({row.sales_variation > 0 ? '+' : ''}{row.sales_variation})
                            </span>
                          )}
                        </div>
                      )}
                      {typeof row.last_modification?.profitAtModification !== 'undefined' && (
                        <div className="text-xs text-gray-500">
                          <span>Ganancia: {formatCurrency(row.last_modification.profitAtModification)}</span>
                          {row.profit_variation !== 0 && row.profit_variation !== null && row.profit_variation !== undefined && (
                            <span className={`ml-1 ${row.profit_variation > 0 ? 'text-green-600' : 'text-red-600'}`}>
                              ({row.profit_variation > 0 ? '+' : ''}{formatCurrency(row.profit_variation)})
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <span className="text-gray-400 text-sm">Sin modificaciones</span>
                  )}
                </div>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );

  // Renderizado para escritorio (tabla tradicional)
  const renderDesktopView = () => (
    <div className="hidden sm:block overflow-hidden">
      <table className="min-w-full divide-y divide-gray-300">
        <thead className="bg-gray-50">
          <tr>
            <th
              scope="col"
              className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-6"
            >
              <span className="sr-only">Status</span>
            </th>
            <th
              scope="col"
              className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-6 cursor-pointer"
              onClick={() => handleSort('conjunto')}
            >
              Conjunto
            </th>
            <th
              scope="col"
              className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 cursor-pointer"
              onClick={() => handleSort('presupuesto')}
            >
              Presupuesto
            </th>
            <th
              scope="col"
              className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 cursor-pointer"
              onClick={() => handleSort('spend')}
            >
              Gasto
            </th>
            <th
              scope="col"
              className="px-3 py-3.5 text-center text-sm font-semibold text-gray-900 cursor-pointer"
              onClick={() => handleSort('sales')}
            >
              Ventas
            </th>
            <th
              scope="col"
              className="px-3 py-3.5 text-center text-sm font-semibold text-gray-900 cursor-pointer"
              onClick={() => handleSort('profit_loss')}
            >
              Ganancia/Pérdida
            </th>
            <th
              scope="col"
              className="px-3 py-3.5 text-center text-sm font-semibold text-gray-900 cursor-pointer"
              onClick={() => handleSort('max_roas')}
            >
              ROAS
            </th>
            <th
              scope="col"
              className="px-3 py-3.5 text-center text-sm font-semibold text-gray-900 cursor-pointer"
              onClick={() => handleSort('decision_status')}
            >
              Decisión
            </th>
            <th
              scope="col"
              className="py-3.5 pl-3 pr-4 text-left text-sm font-semibold text-gray-900 sm:pr-6 cursor-pointer"
              onClick={() => handleSort('last_modification')}
            >
              Última Modificación
              {sortConfig.primary.field === 'last_modification' && (
                sortConfig.primary.direction === 'asc' 
                  ? <ChevronUp className="inline-block w-4 h-4 ml-1" />
                  : <ChevronDown className="inline-block w-4 h-4 ml-1" />
              )}
            </th>
            <th
              scope="col"
              className="py-3.5 pl-3 pr-4 text-left text-sm font-semibold text-gray-900 sm:pr-6 w-24"
            >
              Acciones
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {loading ? (
            <tr>
              <td colSpan={10} className="py-4 pl-4 pr-3 text-sm text-center">
                Cargando...
              </td>
            </tr>
          ) : (
            sortedData.map((row) => (
              <tr
                key={row.conjunto}
                className={row.status !== 'ACTIVE' ? 'bg-gray-300 text-gray-800 hover:bg-gray-200' : getRowStyle(row.decision_status)}
              >
                <td className="py-4 pl-4 pr-3 text-sm sm:pl-6">
                  <StatusBadge status={row.status} />
                </td>
                <td className="py-4 pl-4 pr-3 text-sm">
                  <AdSetName 
                    name={row.conjunto} 
                    onClick={() => handleDecisionClick(row)}
                  />
                </td>
                <td className="py-4 px-3 text-sm text-gray-500">
                  <BudgetCell
                    budget={row.presupuesto}
                    remaining={row.budget_remaining}
                    formatCurrency={formatCurrency}
                    campaignHasBudget={row.campaignHasBudget || false}
                    campaignActualBudget={row.campaign_actual_budget}
                  />
                </td>
                <td className="py-4 px-3 text-sm text-gray-500">
                  <SpendProgress
                    spend={row.spend}
                    percentage={row.spendPercentage}
                    formatCurrency={formatCurrency}
                    hideBar={row.campaignHasBudget}
                  />
                </td>
                <td className="py-4 px-3 text-sm text-gray-500 text-center">
                  <div className="flex flex-col items-center">
                    <span className="font-medium">{Math.max(row.sales, row.tracked_sales)}</span>
                    {row.sales_variation !== 0 && row.sales_variation !== null && row.sales_variation !== undefined && (
                      <span className={`text-xs ${row.sales_variation > 0 ? 'text-green-600' : 'text-red-600'} flex items-center`}>
                        {row.sales_variation > 0 ? (
                          <>
                            <TrendingUp className="h-3 w-3 mr-0.5" />
                            +{row.sales_variation}
                          </>
                        ) : (
                          <>
                            <TrendingDown className="h-3 w-3 mr-0.5" />
                            {row.sales_variation}
                          </>
                        )}
                      </span>
                    )}
                  </div>
                </td>
                <td className="py-4 px-3 text-sm text-center">
                  <div className={`font-medium ${row.profit_loss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {row.profit_loss >= 0 ? '+' : ''}{formatCurrency(row.profit_loss)}
                    <div className="text-xs text-gray-500">
                      ROI: {row.roi_percent.toFixed(0)}%
                    </div>
                    {row.profit_variation !== 0 && row.profit_variation !== null && row.profit_variation !== undefined && (
                      <div className={`text-xs ${row.profit_variation > 0 ? 'text-green-600' : 'text-red-600'} flex items-center justify-center`}>
                        {row.profit_variation > 0 ? (
                          <>
                            <TrendingUp className="h-3 w-3 mr-0.5" />
                            +{formatCurrency(row.profit_variation)}
                          </>
                        ) : (
                          <>
                            <TrendingDown className="h-3 w-3 mr-0.5" />
                            {formatCurrency(row.profit_variation)}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </td>
                <td className="py-4 px-3 text-sm text-center">
                  <RoasIndicator 
                    value={row.max_roas} 
                    variation={row.roas_variation} 
                  />
                </td>
                <td className="py-4 px-3 text-sm text-gray-500">
                  {row.status === 'PAUSED'
                    ? 'Pausado'
                    : row.decision_status === 'decision-needed'
                      ? 'Requiere Decisión'
                      : row.decision_status === 'warning'
                        ? 'Fuera de Rango'
                        : 'OK'
                  }
                </td>
                <td className="py-4 px-3 text-sm text-gray-500">
                  {row.campaignHasBudget && (
                    <div className="mb-1 text-xs text-blue-600 font-semibold flex items-center gap-1">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 inline-block" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M12 20a8 8 0 100-16 8 8 0 000 16z" /></svg>
                      Las modificaciones son a nivel de campaña
                    </div>
                  )}
                  {row.last_modification ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <TimeAgoIndicator timestamp={row.last_modification.rawDate} />
                        <span className="text-gray-500 text-xs">
                          {row.last_modification.date}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        {row.last_modification.newBudget > row.last_modification.previousBudget ? (
                          <TrendingUp className="h-4 w-4 text-green-500" />
                        ) : (
                          <TrendingDown className="h-4 w-4 text-red-500" />
                        )}
                        <span>
                          {formatCurrency(row.last_modification.previousBudget)} →{' '}
                          {formatCurrency(row.last_modification.newBudget)}
                        </span>
                      </div>
                      <div className="text-xs text-gray-400">
                        {row.last_modification.reason}
                      </div>
                      <div className="text-xs text-gray-500">
                        <span>Gasto: {formatCurrency(row.last_modification.spendAtModification)}</span>
                        {row.spend > row.last_modification.spendAtModification && (
                          <span className="text-green-600 ml-1">
                            (+{formatCurrency(row.spend - row.last_modification.spendAtModification)})
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500">
                        <span>ROAS: {(row.last_modification?.roasAtModification ?? 0).toFixed(2)}x</span>
                        {row.roas_variation !== 0 && row.roas_variation !== null && row.roas_variation !== undefined && (
                          <span className={`ml-1 ${row.roas_variation > 0 ? 'text-green-600' : 'text-red-600'}`}>
                            ({row.roas_variation > 0 ? '+' : ''}{(row.roas_variation || 0).toFixed(2)}x)
                          </span>
                        )}
                      </div>
                      {typeof row.last_modification?.salesAtModification !== 'undefined' && (
                        <div className="text-xs text-gray-500">
                          <span>Ventas: {row.last_modification.salesAtModification}</span>
                          {row.sales_variation !== 0 && row.sales_variation !== null && row.sales_variation !== undefined && (
                            <span className={`ml-1 ${row.sales_variation > 0 ? 'text-green-600' : 'text-red-600'}`}>
                              ({row.sales_variation > 0 ? '+' : ''}{row.sales_variation})
                            </span>
                          )}
                        </div>
                      )}
                      {typeof row.last_modification?.profitAtModification !== 'undefined' && (
                        <div className="text-xs text-gray-500">
                          <span>Ganancia: {formatCurrency(row.last_modification.profitAtModification)}</span>
                          {row.profit_variation !== 0 && row.profit_variation !== null && row.profit_variation !== undefined && (
                            <span className={`ml-1 ${row.profit_variation > 0 ? 'text-green-600' : 'text-red-600'}`}>
                              ({row.profit_variation > 0 ? '+' : ''}{formatCurrency(row.profit_variation)})
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <span className="text-gray-400">Sin modificaciones</span>
                  )}
                </td>
                <td className="py-4 pl-3 pr-4 text-sm sm:pr-6">
                  {((row.decision_status === 'decision-needed' || row.decision_status === 'warning') && row.status !== 'PAUSED') && (
                    <button
                      onClick={() => handleDecisionClick(row)}
                      className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-md hover:bg-yellow-200 transition-colors text-sm font-medium"
                    >
                      Revisar
                    </button>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );

  // Interfaz principal
  return (
    <div className="bg-white shadow-sm rounded-lg">
      <AdSetReviewModal
        isOpen={selectedAdSet !== null}
        onClose={() => setSelectedAdSet(null)}
        adSetName={selectedAdSet?.name || ''}
        adId={selectedAdSet?.adId || ''}
        adsetId={selectedAdSet?.adsetId || ''}
        currentData={
          selectedAdSet?.data || {
            presupuesto: 0,
            spend: 0,
            max_roas: 0,
            sales: 0,
            tracked_sales: 0,
            campaignHasBudget: false,
            campaign_id: '',
            campaign_name: '',
            campaign_actual_budget: 0,
          }
        }
        formatCurrency={formatCurrency}
        onRefresh={() => {
          onRefresh();
          fetchModifications();
        }}
      />

      <BulkActionsModal 
        isOpen={showBulkActions}
        onClose={() => setShowBulkActions(false)}
        adSets={activeAdSetsForBulk}
        formatCurrency={formatCurrency}
        onSuccess={() => {
          onRefresh();
          fetchModifications();
        }}
      />

      <CampaignBulkActionsModal
        isOpen={showCampaignBulkActions}
        onClose={() => setShowCampaignBulkActions(false)}
        campaigns={Object.values(campaignData)}
        formatCurrency={formatCurrency}
        onSuccess={() => {
          onRefresh();
          fetchModifications();
        }}
      />

      <div className="px-4 py-5 sm:px-6">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center">
          <div className="mb-4 sm:mb-0">
            <h2 className="text-lg font-medium text-gray-900">
              Rendimiento de Anuncios
            </h2>
            
            {/* Tabs de navegación */}
            <div className="mt-4 border-b border-gray-200">
              <nav className="-mb-px flex space-x-8">
                <button
                  onClick={() => setActiveTab('campaigns')}
                  className={`${
                    activeTab === 'campaigns'
                      ? 'border-indigo-500 text-indigo-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center`}
                >
                  <BarChart2 className="h-4 w-4 mr-2" />
                  Campañas
                </button>
                <button
                  onClick={() => setActiveTab('adSets')}
                  className={`${
                    activeTab === 'adSets'
                      ? 'border-indigo-500 text-indigo-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center`}
                >
                  <Layers className="h-4 w-4 mr-2" />
                  Conjuntos de Anuncios
                </button>
              </nav>
            </div>
            
            <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
              <div className="bg-blue-50 p-2 rounded-lg border border-blue-100">
                <div className="text-xs text-blue-500 font-medium">
                  {activeTab === 'adSets' ? 'Conjuntos Activos' : 'Campañas Activas'}
                </div>
                <div className="text-lg font-bold text-blue-700">
                  {activeTab === 'adSets' 
                    ? sortedData.filter(row => row.status === 'ACTIVE').length
                    : Object.keys(campaignData).length}
                </div>
              </div>
              
              <div className="bg-green-50 p-2 rounded-lg border border-green-100">
                <div className="text-xs text-green-500 font-medium">Presupuesto Total</div>
                <div className="text-lg font-bold text-green-700">
                  {formatCurrency(activeTab === 'adSets'
                    ? sortedData.reduce((sum, row) => sum + (row.status === 'ACTIVE' ? row.presupuesto : 0), 0)
                    : Object.values(campaignData).reduce((sum, campaign) => sum + campaign.presupuesto, 0)
                  )}
                </div>
              </div>
              
              <div className="bg-indigo-50 p-2 rounded-lg border border-indigo-100">
                <div className="text-xs text-indigo-500 font-medium">Gasto Total</div>
                <div className="text-lg font-bold text-indigo-700">
                  {formatCurrency(activeTab === 'adSets'
                    ? sortedData.reduce((sum, row) => sum + row.spend, 0)
                    : Object.values(campaignData).reduce((sum, campaign) => sum + campaign.spend, 0)
                  )}
                </div>
              </div>
              
              <div className="bg-purple-50 p-2 rounded-lg border border-purple-100">
                <div className="text-xs text-purple-500 font-medium">Ganancia/Pérdida Total</div>
                {(() => {
                  const totalProfit = activeTab === 'adSets'
                    ? sortedData.reduce((sum, row) => sum + row.profit_loss, 0)
                    : Object.values(campaignData).reduce((sum, campaign) => sum + campaign.profit_loss, 0);
                  const totalSales = activeTab === 'adSets'
                    ? sortedData.reduce((sum, row) => sum + Math.max(row.sales, row.tracked_sales), 0)
                    : Object.values(campaignData).reduce((sum, campaign) => sum + campaign.sales, 0);
                  const isPositive = totalProfit >= 0;
                  return (
                    <>
                    <div className={`text-lg font-bold ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                      {isPositive ? '+' : ''}{formatCurrency(totalProfit)}
                    </div>
                      <div className="text-xs text-gray-500 mt-1">
                        Ventas totales: <span className="font-semibold">{totalSales}</span>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            {activeTab === 'adSets' ? (
            <button
              onClick={() => setShowBulkActions(true)}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
              disabled={loading || data.length === 0}
            >
              <Layers className="h-4 w-4" />
              <span>Acciones Masivas</span>
            </button>
            ) : (
              <button
                onClick={() => setShowCampaignBulkActions(true)}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
                disabled={loading || Object.keys(campaignData).length === 0}
              >
                <Layers className="h-4 w-4" />
                <span>Acciones Masivas CBO</span>
              </button>
            )}
            <button
              onClick={onRefresh}
              className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors"
            >
              Actualizar Datos
            </button>
        </div>
      </div>
      
        {activeTab === 'adSets' ? (
          <>
      {renderMobileView()}
      {renderDesktopView()}
          </>
        ) : (
          <div className="mt-4">
            {/* Modal para editar presupuesto de campaña */}
            {selectedCampaign && (
              <CampaignBudgetModal
                isOpen={!!selectedCampaign}
                onClose={() => setSelectedCampaign(null)}
                campaignId={selectedCampaign.id}
                campaignName={selectedCampaign.name}
                currentBudget={selectedCampaign.currentBudget}
                currentData={selectedCampaign.currentData}
                onSave={() => {
                  setSelectedCampaign(null);
                  fetchModifications(); // Recargar modificaciones
                  onRefresh();
                }}
                formatCurrency={formatCurrency}
              />
            )}
            
            {/* Vista móvil para campañas */}
            <div className="space-y-4 px-4 sm:hidden">
              {loading ? (
                <div className="py-4 text-center text-gray-500">Cargando...</div>
              ) : (
                Object.values(campaignData).map((campaign) => (
                  <div
                    key={campaign.id}
                    className="rounded-lg overflow-hidden shadow bg-white"
                  >
                    {/* Cabecera de la tarjeta */}
                    <div className="p-4">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center space-x-2 mb-2">
                            <StatusBadge status={campaign.status} />
                            <span className="font-medium text-gray-900">
                              {campaign.name.length > 30 
                                ? `${campaign.name.substring(0, 30)}...` 
                                : campaign.name}
                            </span>
                          </div>
                          <div className="flex items-center space-x-3 text-sm text-gray-600">
                            <div>
                              <span>Conjuntos: </span>
                              <span className="font-medium">{campaign.adSets}</span>
                            </div>
                            <div>
                              <span>ROAS: </span>
                              <span className="font-medium">{campaign.roas.toFixed(2)}x</span>
                              <RoasIndicator
                                value={campaign.roas}
                                variation={campaign.roas_variation}
                              />
                            </div>
                          </div>
                        </div>
                        <button 
                          onClick={() => toggleRowExpand(campaign.id)}
                          className="p-1 rounded-full hover:bg-gray-200"
                        >
                          {expandedRows[campaign.id] ? (
                            <ChevronUp className="h-5 w-5" />
                          ) : (
                            <ChevronDown className="h-5 w-5" />
                          )}
                        </button>
                      </div>

                      {/* Información principal */}
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <div>
                          <div className="text-xs text-gray-500">Presupuesto</div>
                          <BudgetCell
                            budget={campaign.presupuesto}
                            remaining={campaign.budget_remaining}
                            formatCurrency={formatCurrency}
                            campaignHasBudget={campaign.hasBudget}
                            campaignActualBudget={campaign.actual_budget}
                          />
                        </div>
                        <div>
                          <div className="text-xs text-gray-500">Gasto</div>
                          <SpendProgress
                            spend={campaign.spend}
                            percentage={(campaign.spend / campaign.presupuesto) * 100}
                            formatCurrency={formatCurrency}
                            hideBar={campaign.hasBudget}
                          />
                        </div>
                      </div>

                      {/* Botones de acción */}
                      <div className="mt-3 flex gap-2">
                        <button
                          onClick={() => toggleRowExpand(campaign.id)}
                          className="flex-1 px-3 py-1.5 bg-gray-100 text-gray-800 rounded-md hover:bg-gray-200 transition-colors text-sm font-medium flex items-center justify-center"
                        >
                          {expandedRows[campaign.id] ? 'Ocultar detalles' : 'Ver detalles'}
                          {expandedRows[campaign.id] ? (
                            <ChevronUp className="ml-1 h-4 w-4" />
                          ) : (
                            <ChevronDown className="ml-1 h-4 w-4" />
                          )}
                        </button>
                        
                        {campaign.hasBudget && (
                          <button
                            onClick={() => setSelectedCampaign({
                              id: campaign.id,
                              name: campaign.name,
                              currentBudget: campaign.actual_budget || campaign.presupuesto,
                              currentData: {
                                spend: campaign.spend,
                                roas: campaign.roas,
                                sales: campaign.sales,
                                tracked_sales: campaign.tracked_sales,
                                profit_loss: campaign.profit_loss,
                              }
                            })}
                            className="px-3 py-1.5 bg-blue-100 text-blue-800 rounded-md hover:bg-blue-200 transition-colors text-sm font-medium flex items-center whitespace-nowrap"
                          >
                            Editar <ExternalLink className="ml-1 h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Área expandible */}
                    {expandedRows[campaign.id] && (
                      <div className="bg-white p-4 border-t border-gray-200">
                        <div className="grid grid-cols-2 gap-4 mb-3">
                          <div>
                            <div className="text-xs text-gray-500">Ventas</div>
                            <div className="flex items-center">
                              <div className="font-medium">{campaign.sales}</div>
                              {campaign.sales_variation !== 0 && campaign.sales_variation !== null && campaign.sales_variation !== undefined && (
                                <span className={`ml-1.5 text-xs ${campaign.sales_variation > 0 ? 'text-green-600' : 'text-red-600'} flex items-center`}>
                                  {campaign.sales_variation > 0 ? (
                                    <>
                                      <TrendingUp className="h-3 w-3 mr-0.5" />
                                      +{campaign.sales_variation}
                                    </>
                                  ) : (
                                    <>
                                      <TrendingDown className="h-3 w-3 mr-0.5" />
                                      {campaign.sales_variation}
                                    </>
                                  )}
                                </span>
                              )}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-gray-500">Ganancia/Pérdida</div>
                            <div className="flex flex-col">
                              <div className={`font-medium ${campaign.profit_loss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {campaign.profit_loss >= 0 ? '+' : ''}{formatCurrency(campaign.profit_loss)} ({campaign.roi_percent.toFixed(0)}%)
                              </div>
                              {campaign.profit_variation !== 0 && campaign.profit_variation !== null && campaign.profit_variation !== undefined && (
                                <span className={`text-xs ${campaign.profit_variation > 0 ? 'text-green-600' : 'text-red-600'} flex items-center`}>
                                  {campaign.profit_variation > 0 ? (
                                    <>
                                      <TrendingUp className="h-3 w-3 mr-0.5" />
                                      +{formatCurrency(campaign.profit_variation)}
                                    </>
                                  ) : (
                                    <>
                                      <TrendingDown className="h-3 w-3 mr-0.5" />
                                      {formatCurrency(campaign.profit_variation)}
                                    </>
                                  )}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        
                        {/* Variaciones */}
                        {campaign.last_modification && (
                          <div className="grid grid-cols-1 gap-2 mb-3">
                            <div>
                              <div className="text-xs text-gray-500 mb-1">Variaciones desde última modificación</div>
                              <div className="text-xs space-y-1">
                                <div className={`flex items-center ${campaign.roas_variation_percent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                  <span className="mr-1">ROAS:</span>
                                  <span className="font-medium">
                                    {campaign.roas_variation_percent >= 0 ? '+' : ''}{campaign.roas_variation_percent.toFixed(1)}%
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Última modificación */}
                        <div className="mt-3">
                          <div className="text-xs text-gray-500 mb-1">Última Modificación</div>
                          {campaign.hasBudget ? (
                            // Campaña CBO - mostrar modificaciones de campaña
                            campaign.last_modification ? (
                              <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                  <TimeAgoIndicator timestamp={campaign.last_modification.rawDate} />
                                  <span className="text-gray-500 text-xs">
                                    {campaign.last_modification.date}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2 text-sm">
                                  {campaign.last_modification.newBudget > campaign.last_modification.previousBudget ? (
                                    <TrendingUp className="h-4 w-4 text-green-500" />
                                  ) : (
                                    <TrendingDown className="h-4 w-4 text-red-500" />
                                  )}
                                  <span>
                                    {formatCurrency(campaign.last_modification.previousBudget)} →{' '}
                                    {formatCurrency(campaign.last_modification.newBudget)}
                                  </span>
                                </div>
                                <div className="text-xs text-gray-400">
                                  {campaign.last_modification.reason}
                                </div>
                              </div>
                            ) : (
                              <span className="text-gray-400 text-sm">Sin modificaciones</span>
                            )
                          ) : (
                            // Campaña no CBO - mensaje informativo
                            <div className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded inline-block">
                              <div className="font-medium">Modificaciones a nivel de conjunto</div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Vista de escritorio para campañas */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-300">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-6">
                      Estado
                    </th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                      Campaña
                    </th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                      Conjuntos
                    </th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                      Presupuesto
                    </th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                      Gasto
                    </th>
                    <th scope="col" className="px-3 py-3.5 text-center text-sm font-semibold text-gray-900">
                      Ventas
                    </th>
                    <th scope="col" className="px-3 py-3.5 text-center text-sm font-semibold text-gray-900">
                      ROAS
                    </th>
                    <th scope="col" className="px-3 py-3.5 text-center text-sm font-semibold text-gray-900">
                      Variaciones
                    </th>
                    <th scope="col" className="px-3 py-3.5 text-center text-sm font-semibold text-gray-900">
                      Ganancia/Pérdida
                    </th>
                    <th scope="col" className="px-3 py-3.5 text-center text-sm font-semibold text-gray-900">
                      Última Modificación
                    </th>
                    <th scope="col" className="px-3 py-3.5 text-center text-sm font-semibold text-gray-900">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {loading ? (
                    <tr>
                      <td colSpan={11} className="py-4 text-center text-sm text-gray-500">
                        Cargando...
                      </td>
                    </tr>
                  ) : (
                    Object.values(campaignData).map((campaign) => (
                      <tr key={campaign.id} className="hover:bg-gray-50">
                        <td className="py-4 pl-4 pr-3 text-sm sm:pl-6">
                          <StatusBadge status={campaign.status} />
                        </td>
                        <td className="py-4 px-3 text-sm text-gray-900">
                          {campaign.name}
                        </td>
                        <td className="py-4 px-3 text-sm text-gray-500 text-center">
                          {campaign.adSets}
                        </td>
                        <td className="py-4 px-3 text-sm text-gray-500">
                          <BudgetCell
                            budget={campaign.presupuesto}
                            remaining={campaign.budget_remaining}
                            formatCurrency={formatCurrency}
                            campaignHasBudget={campaign.hasBudget}
                            campaignActualBudget={campaign.actual_budget}
                          />
                        </td>
                        <td className="py-4 px-3 text-sm text-gray-500">
                          <SpendProgress
                            spend={campaign.spend}
                            percentage={(campaign.spend / campaign.presupuesto) * 100}
                            formatCurrency={formatCurrency}
                            hideBar={campaign.hasBudget}
                          />
                        </td>
                        <td className="py-4 px-3 text-sm text-center">
                          {campaign.sales}
                        </td>
                        <td className="py-4 px-3 text-sm text-center">
                          <RoasIndicator value={campaign.roas} variation={campaign.roas_variation} />
                        </td>
                        <td className="py-4 px-3 text-sm text-center">
                          {campaign.last_modification ? (
                            <div className="text-xs space-y-1">
                              <div className={`flex items-center justify-center ${campaign.sales_variation >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                <span className="mr-1">Ventas:</span>
                                <span className="font-medium">
                                  {campaign.sales_variation >= 0 ? '+' : ''}{campaign.sales_variation}
                                </span>
                              </div>
                              <div className={`flex items-center justify-center ${campaign.roas_variation_percent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                <span className="mr-1">ROAS:</span>
                                <span className="font-medium">
                                  {campaign.roas_variation_percent >= 0 ? '+' : ''}{campaign.roas_variation_percent.toFixed(1)}%
                                </span>
                              </div>
                              <div className={`flex items-center justify-center ${campaign.profit_variation >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                <span className="mr-1">Ganancia:</span>
                                <span className="font-medium">
                                  {formatCurrency(campaign.profit_variation)}
                                </span>
                              </div>
                            </div>
                          ) : (
                            <span className="text-gray-400 text-xs">Sin datos</span>
                          )}
                        </td>
                        <td className="py-4 px-3 text-sm text-center">
                          <div className={`font-medium ${campaign.profit_loss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {campaign.profit_loss >= 0 ? '+' : ''}{formatCurrency(campaign.profit_loss)}
                            <div className="text-xs text-gray-500">
                              ROI: {campaign.roi_percent.toFixed(0)}%
                            </div>
                          </div>
                        </td>
                        <td className="py-4 px-3 text-sm text-center">
                          {campaign.hasBudget ? (
                            // Campaña CBO - mostrar modificaciones de campaña
                            campaign.last_modification ? (
                              <div className="text-xs">
                                <TimeAgoIndicator timestamp={campaign.last_modification.rawDate} />
                                <div className="text-gray-500 mt-1">
                                  {formatCurrency(campaign.last_modification.previousBudget)} → {formatCurrency(campaign.last_modification.newBudget)}
                                </div>
                                <div className="text-gray-400 text-xs truncate max-w-32" title={campaign.last_modification.reason}>
                                  {campaign.last_modification.reason}
                                </div>
                              </div>
                            ) : (
                              <span className="text-gray-400 text-xs">Sin modificaciones</span>
                            )
                          ) : (
                            // Campaña no CBO - mensaje informativo
                            <div className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded">
                              <div className="font-medium">Modificaciones</div>
                              <div className="text-blue-500">a nivel de conjunto</div>
                            </div>
                          )}
                        </td>
                        <td className="py-4 px-3 text-sm text-center">
                          {campaign.hasBudget ? (
                            <button
                              className="px-3 py-1 bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200 transition-colors text-sm font-medium"
                              onClick={() => setSelectedCampaign({
                                id: campaign.id,
                                name: campaign.name,
                                currentBudget: campaign.actual_budget || campaign.presupuesto,
                                currentData: {
                                  spend: campaign.spend,
                                  roas: campaign.roas,
                                  sales: campaign.sales,
                                  tracked_sales: campaign.tracked_sales,
                                  profit_loss: campaign.profit_loss,
                                }
                              })}
                            >
                              Editar presupuesto
                            </button>
                          ) : (
                            <span className="text-xs text-gray-500 italic">
                              Ver conjuntos individuales
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
