import { DecisionStatus } from '../types';
import { supabase } from '../../../lib/supabase';

const BASE_BUDGET = 4;
const BUDGET1 = 10;
const BUDGET2 = 20;
const GRACE_PERIOD_MINUTES = 60; // Período de gracia de 60 minutos después de modificar el presupuesto
const GRACE_PERIOD_MS = 60 * 60 * 1000; // 60 minutos en milisegundos

async function hasRecentBudgetModification(adsetId: string): Promise<boolean> {
  const now = new Date();
  const graceDate = new Date(now.getTime() - (GRACE_PERIOD_MINUTES * 60 * 1000));
  
  const { data } = await supabase
    .from('budget_modifications')
    .select('*')
    .eq('adset_id', adsetId)
    .gte('modified_at', graceDate.toISOString())
    .order('modified_at', { ascending: false })
    .limit(1);

  return data !== null && data.length > 0;
}

export async function getDecisionStatus(
  budget: number,
  roas: number,
  adsetId: string,
  campaignHasBudget?: boolean // Add optional parameter
): Promise<DecisionStatus> {
  if (budget === 0 && !campaignHasBudget) { // If budget is 0 and NOT CBO, it's 'keep' (or specific handling)
    return 'keep';
  }
  if (campaignHasBudget) { // If it's CBO, the ad set budget is 0 but it's managed by campaign
    // For CBO, individual ad set decision might be less about its own budget (which is 0)
    // and more about its performance (ROAS) relative to campaign goals.
    // For now, let's assume 'keep' for CBO ad sets as their budget isn't directly managed here.
    // Or, we could have a specific status like 'campaign_managed'.
    // Let's return 'keep' to avoid unintended 'decision-needed' states based on 0 budget.
    return 'keep';
  }

  const recentModification = await hasRecentBudgetModification(adsetId);
  if (recentModification) {
    return 'keep';
  }

  if (budget <= BASE_BUDGET) {
    if (roas < 1.8) return 'keep';
    if (roas >= 1.8 ) return 'decision-needed';
  } else if (budget > BASE_BUDGET && budget <= BUDGET1) {
    if (roas < 1.0) return 'warning';
    if (roas >= 1.0 && roas < 1.8) return 'keep';
    if (roas >= 1.8 ) return 'decision-needed';
  } else if (budget > BUDGET1 && budget <= BUDGET2) {
    if (roas < 1.0) return 'decision-needed';
    if (roas >= 1.0 && roas < 1.2) return 'decision-needed';
    if (roas >= 1.2 && roas < 1.6) return 'keep';
    if (roas >= 1.6 ) return 'decision-needed';
  } else if (budget > BUDGET2) {
    if (roas < 1.0) return 'decision-needed';
    if (roas >= 1.0 && roas < 1.3) return 'decision-needed';
    if (roas >= 1.3 && roas < 1.6) return 'keep';
    if (roas >= 1.6 ) return 'decision-needed';
  }
  return 'warning';
}

export function getDecisionWeight(status: DecisionStatus): number {
  switch (status) {
    case 'decision-needed': return 2;
    case 'warning': return 1;
    case 'keep': return 0;
    default: return 0;
  }
}

export function getRowStyle(decisionStatus: DecisionStatus): string {
  switch (decisionStatus) {
    case 'decision-needed':
      return 'bg-yellow-50 hover:bg-yellow-100'; // 🔼 or ❌ decision-needed
    case 'warning':
      return 'bg-orange-50 hover:bg-orange-100'; // ⚠️ warning
    case 'keep':
      return 'bg-green-50 hover:bg-green-100'; // ✅ keep
    default:
      return 'hover:bg-gray-50';
  }
}
