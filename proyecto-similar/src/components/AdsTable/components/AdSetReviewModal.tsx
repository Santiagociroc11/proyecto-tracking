import React, { useState, useEffect } from "react";
import { Modal } from "../../Modal/Modal";
import { Loader2, Brain, DollarSign, ArrowDown, ArrowUp, Calendar, Info, X, TrendingUp, TrendingDown, Eye, Layers } from "lucide-react";
import { supabase } from "../../../lib/supabase";
import { StatusBadge } from "./StatusBadge";
import { SpendProgress } from "./SpendProgress";
import { RoasIndicator } from "./RoasIndicator";
import { getDecisionStatus } from "../utils/decisionRules";
import type { DecisionStatus } from "../types";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Bar, ComposedChart, ReferenceLine, Label, Area } from "recharts";
import { useFacebookConfig } from "../../../hooks/useFacebookConfig";

interface AdSetReviewModalProps {
   isOpen: boolean;
   onClose: () => void;
   adSetName: string;
   adId: string;
   adsetId: string;
   currentData: {
      presupuesto: number;
      spend: number;
      max_roas: number;
      sales: number;
      tracked_sales: number;
   };
   formatCurrency: (value: number) => string;
   onRefresh: () => void;
}

interface DailyData {
   fecha: string;
   ads: Array<{
      ad_name: string;
      ad_id: string;
      spend: number;
      sales: number;
      tracked_sales: number;
      roas_ad_fb: number;
      roas_negocio_general: number;
      max_roas: number;
   }>;
   total_spend: number;
   total_sales: number;
   total_tracked_sales: number;
   average_roas_fb: number;
   average_roas_negocio: number;
   max_roas: number;
}

interface BudgetModification {
   date: string;
   rawDate: number;
   reason: string;
   previousBudget: number;
   newBudget: number;
   spendAtModification: number;
   roasAtModification: number;
   salesAtModification: number;
   profitAtModification: number;
}

const REVENUE_PER_SALE = 18000 / 4100;

const parseBogotaDate = (dateString: string): Date => {
   return new Date(dateString + "T00:00:00-05:00");
};

const formatBogotaDate = (date: Date): string => {
   return new Intl.DateTimeFormat("sv-SE", {
      timeZone: "America/Bogota",
   }).format(date);
};

const formatDisplayDate = (date: Date): string => {
   return new Intl.DateTimeFormat("es-CO", {
      timeZone: "America/Bogota",
      day: "numeric",
      month: "short",
   }).format(date);
};

export function AdSetReviewModal({ isOpen, onClose, adSetName, adId, adsetId, currentData, formatCurrency, onRefresh }: AdSetReviewModalProps) {
   const { activeAccount } = useFacebookConfig();
   const [historicalData, setHistoricalData] = useState<DailyData[]>([]);
   const [loading, setLoading] = useState(true);
   const [analyzing, setAnalyzing] = useState(false);
   const [aiRecommendation, setAiRecommendation] = useState<string | null>(null);
   const [newBudget, setNewBudget] = useState<number>(currentData.presupuesto);
   const [updatingBudget, setUpdatingBudget] = useState(false);
   const [reason, setReason] = useState<string>("");
   const [showHistorical, setShowHistorical] = useState(false);
   const [currentDecisionStatus, setCurrentDecisionStatus] = useState<DecisionStatus>("keep");
   const [adDecisionStatuses, setAdDecisionStatuses] = useState<Record<string, DecisionStatus>>({});
   const [lastModification, setLastModification] = useState<BudgetModification | null>(null);
   const [activeTab, setActiveTab] = useState<"metrics" | "preview">("metrics");
   const [adPreview, setAdPreview] = useState<string | null>(null);
   const [loadingPreview, setLoadingPreview] = useState(false);

   useEffect(() => {
      const loadDecisionStatus = async () => {
         if (isOpen) {
            const status = await getDecisionStatus(currentData.presupuesto, currentData.max_roas, adsetId);
            setCurrentDecisionStatus(status);
         }
      };
      loadDecisionStatus();
   }, [isOpen, currentData.presupuesto, currentData.max_roas, adsetId]);

   useEffect(() => {
      if (isOpen) {
         setNewBudget(currentData.presupuesto);
      }
   }, [isOpen, currentData.presupuesto]);

   useEffect(() => {
      if (!isOpen) {
         setAiRecommendation(null);
         setReason("");
         setHistoricalData([]);
         setShowHistorical(false);
         setAnalyzing(false);
         setLoading(true);
         setCurrentDecisionStatus("keep");
         setAdDecisionStatuses({});
      }
   }, [isOpen]);

   useEffect(() => {
      if (isOpen) {
         fetchHistoricalData();
         fetchLastModification();
      }
   }, [isOpen, adSetName, adId, adsetId]);

   useEffect(() => {
      if (isOpen && activeTab === "preview") {
         fetchAdPreview();
      }
   }, [isOpen, activeTab, adId]);

   const fetchHistoricalData = async () => {
      try {
         setLoading(true);

         if (!activeAccount) {
            throw new Error("No hay cuenta activa configurada");
         }

         const endDate = new Date();
         const startDate = new Date();
         startDate.setDate(startDate.getDate() - 6);
         const since = formatBogotaDate(startDate);
         const until = formatBogotaDate(endDate);

         const { data: trackedSales, error: trackedError } = await supabase.from("tracked_sales").select("*").gte("purchase_date", since).lte("purchase_date", until);
         if (trackedError) throw trackedError;

         const trackedSalesMap = (trackedSales || []).reduce((acc, sale) => {
            const date = sale.purchase_date;
            if (!acc[date]) acc[date] = {};
            if (!acc[date][sale.ad_id]) acc[date][sale.ad_id] = [];
            acc[date][sale.ad_id].push(sale);
            return acc;
         }, {});

         const baseUrl = "https://graph.facebook.com";
         const version = "v23.0";
         const endpoint = `act_${activeAccount.account_id}/insights`;
         const url = `${baseUrl}/${version}/${endpoint}`;

         const params = new URLSearchParams({
            access_token: activeAccount.access_token,
            fields: "ad_id,ad_name,spend,actions,action_values,date_start",
            level: "ad",
            time_increment: "1",
         });

         params.append(
            "filtering",
            JSON.stringify([
               {
                  field: "ad.id",
                  operator: "EQUAL",
                  value: adId,
               },
            ])
         );
         params.append("time_range", JSON.stringify({ since, until }));

         const response = await fetch(`${url}?${params.toString()}`);
         if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Facebook API error (${response.status}): ${errorText}`);
         }
         const fbData = await response.json();
         if (fbData.error) throw new Error(`Facebook API error: ${fbData.error.message}`);

         const transformedData = fbData.data.reduce((acc: Record<string, DailyData>, ad: any) => {
            const date = ad.date_start;
            const purchaseAction = ad.actions?.find((a: any) => a.action_type === "purchase");
            const purchaseValue = ad.action_values?.find((a: any) => a.action_type === "purchase");
            const spend = parseFloat(ad.spend || 0);
            const sales = parseInt(purchaseAction?.value || 0);
            const revenue = parseFloat(purchaseValue?.value || 0);
            const trackedSalesForAd = (trackedSalesMap[date]?.[ad.ad_id] || []).length;
            const roas_ad_fb = spend > 0 ? revenue / spend : 0;
            const roas_negocio = spend > 0 ? (trackedSalesForAd * REVENUE_PER_SALE) / spend : 0;
            const max_roas = Math.max(roas_ad_fb, roas_negocio);
            if (!acc[date]) {
               acc[date] = {
                  fecha: date,
                  ads: [],
                  total_spend: 0,
                  total_sales: 0,
                  total_tracked_sales: 0,
                  average_roas_fb: 0,
                  average_roas_negocio: 0,
                  max_roas: 0,
               };
            }
            acc[date].ads.push({
               ad_name: ad.ad_name,
               ad_id: ad.ad_id,
               spend,
               sales,
               tracked_sales: trackedSalesForAd,
               roas_ad_fb,
               roas_negocio_general: roas_negocio,
               max_roas,
            });
            acc[date].total_spend += spend;
            acc[date].total_sales += sales;
            acc[date].total_tracked_sales += trackedSalesForAd;
            acc[date].max_roas = Math.max(acc[date].max_roas, max_roas);
            return acc;
         }, {});

         const finalData = Object.values(transformedData)
            .map(
               (day): DailyData => ({
                  ...day,
                  average_roas_fb: day.total_spend > 0 ? (day.total_sales * REVENUE_PER_SALE) / day.total_spend : 0,
                  average_roas_negocio: day.total_spend > 0 ? (day.total_tracked_sales * REVENUE_PER_SALE) / day.total_spend : 0,
               })
            )
            .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());

         const statusPromises: Promise<void>[] = [];
         const tempStatuses: Record<string, DecisionStatus> = {};

         for (const day of finalData) {
            for (const ad of day.ads) {
               const adKey = `${day.fecha}-${ad.ad_id}`;
               statusPromises.push(
                  getDecisionStatus(currentData.presupuesto, ad.max_roas, adsetId).then((status) => {
                     tempStatuses[adKey] = status;
                  })
               );
            }
         }

         await Promise.all(statusPromises);
         setAdDecisionStatuses(tempStatuses);
         setHistoricalData(finalData);
      } catch (error) {
         console.error("Error fetching historical data:", error);
         alert(error instanceof Error ? error.message : "Error al cargar datos históricos");
      } finally {
         setLoading(false);
      }
   };

   const fetchLastModification = async () => {
      try {
         const { data: modifications, error } = await supabase.from("budget_modifications").select("modified_at, reason, previous_budget, new_budget, spend_at_modification, roas_at_modification, sales_at_modification, profit_at_modification").eq("adset_id", adsetId).order("modified_at", { ascending: false }).limit(1);

         if (error) {
            console.error("Error fetching last modification:", error);
            return;
         }

         if (modifications && modifications.length > 0) {
            const mod = modifications[0];
            setLastModification({
               date: new Date(mod.modified_at).toLocaleString("es-ES", {
                  year: "numeric",
                  month: "2-digit",
                  day: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: true,
               }),
               rawDate: new Date(mod.modified_at).getTime(),
               reason: mod.reason,
               previousBudget: mod.previous_budget,
               newBudget: mod.new_budget,
               spendAtModification: mod.spend_at_modification || 0,
               roasAtModification: mod.roas_at_modification || 0,
               salesAtModification: mod.sales_at_modification || 0,
               profitAtModification: mod.profit_at_modification || 0,
            });
         }
      } catch (error) {
         console.error("Error fetching last modification:", error);
      }
   };

   const updateBudget = async () => {
      try {
         setUpdatingBudget(true);

         // Get the current user
         const {
            data: { user },
            error: userError,
         } = await supabase.auth.getUser();
         if (userError) throw userError;
         if (!user) throw new Error("No authenticated user found");

         if (!activeAccount) {
            throw new Error("No hay cuenta activa configurada");
         }

         const baseUrl = "https://graph.facebook.com";
         const version = "v23.0";
         const url = `${baseUrl}/${version}/${adsetId}`;

         const params = new URLSearchParams({
            access_token: activeAccount.access_token,
            daily_budget: Math.round(newBudget * 100).toString(), // Convert to cents
         });

         const response = await fetch(url, {
            method: "POST",
            headers: {
               "Content-Type": "application/x-www-form-urlencoded",
            },
            body: params.toString(),
         });

         if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error?.message || "Error updating budget");
         }

         // Calculate current profit
         const maxSales = Math.max(currentData.sales, currentData.tracked_sales);
         const revenue = maxSales * REVENUE_PER_SALE;
         const profit = revenue - currentData.spend;

         // Register the budget modification with user_id, current spend and current ROAS
         const { error: modificationError } = await supabase.from("budget_modifications").insert([
            {
               adset_id: adsetId,
               previous_budget: currentData.presupuesto,
               new_budget: newBudget,
               reason: reason || "Actualización de presupuesto",
               user_id: user.id,
               spend_at_modification: currentData.spend,
               roas_at_modification: currentData.max_roas,
               sales_at_modification: maxSales,
               profit_at_modification: profit,
            },
         ]);

         if (modificationError) throw modificationError;

         await onRefresh();
         onClose();
      } catch (error) {
         console.error("Error updating budget:", error);
         alert("Error al actualizar el presupuesto");
      } finally {
         setUpdatingBudget(false);
      }
   };

   const requestAiAnalysis = async () => {
      try {
         setAnalyzing(true);
         setAiRecommendation(null);

         const analysisData = {
            adSetName,
            adId,
            currentMetrics: {
               budget: currentData.presupuesto,
               spend: currentData.spend,
               maxRoas: currentData.max_roas,
               sales: currentData.sales,
               trackedSales: currentData.tracked_sales,
            },
            historicalPerformance: historicalData.map((day) => ({
               date: day.fecha,
               metrics: {
                  totalSpend: day.total_spend,
                  totalSales: day.total_sales,
                  totalTrackedSales: day.total_tracked_sales,
                  maxRoas: day.max_roas,
                  ads: day.ads.map((ad) => ({
                     name: ad.ad_name,
                     spend: ad.spend,
                     sales: ad.sales,
                     trackedSales: ad.tracked_sales,
                     roasFb: ad.roas_ad_fb,
                     roasNegocio: ad.roas_negocio_general,
                     maxRoas: ad.max_roas,
                  })),
               },
            })),
         };

         const response = await fetch("https://n8n.automscc.com/webhook/ai-analisis-backend", {
            method: "POST",
            headers: {
               "Content-Type": "application/json",
            },
            body: JSON.stringify(analysisData),
         });

         if (!response.ok) {
            throw new Error("Error al obtener el análisis de IA");
         }

         const result = await response.text();
         setAiRecommendation(result);
      } catch (error) {
         console.error("Error requesting AI analysis:", error);
         alert("Error al analizar los datos con IA");
      } finally {
         setAnalyzing(false);
      }
   };

   const fetchAdPreview = async () => {
      try {
         setLoadingPreview(true);

         if (!activeAccount) {
            throw new Error("No hay cuenta activa configurada");
         }

         const baseUrl = "https://graph.facebook.com";
         const version = "v23.0";
         const url = `${baseUrl}/${version}/${adId}/previews`;

         const params = new URLSearchParams({
            access_token: activeAccount.access_token,
            ad_format: "DESKTOP_FEED_STANDARD",
         });

         const response = await fetch(`${url}?${params.toString()}`);

         if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Facebook API error (${response.status}): ${errorText}`);
         }

         const previewData = await response.json();

         if (previewData.error) {
            throw new Error(`Facebook API error: ${previewData.error.message}`);
         }

         if (previewData.data && previewData.data.length > 0) {
            setAdPreview(previewData.data[0].body);
         } else {
            setAdPreview('<div class="p-4 text-gray-500">No hay vista previa disponible para este anuncio.</div>');
         }
      } catch (error) {
         console.error("Error fetching ad preview:", error);
         setAdPreview('<div class="p-4 text-red-500">Error al cargar la vista previa. Por favor, inténtalo de nuevo.</div>');
      } finally {
         setLoadingPreview(false);
      }
   };

   const handleClose = () => {
      onClose();
   };

   const formatDate = (dateString: string): string => {
      const d = parseBogotaDate(dateString);
      return formatDisplayDate(d);
   };

   const todayString = formatBogotaDate(new Date());

   // Prepare chart data from historical data
   const chartData = historicalData
      .map((day: DailyData) => {
         // Calculate the maximum ROAS for the day (across all ads)
         const roasValue = day.max_roas;

         // Calculate revenue (using the max between FB sales and tracked sales)
         const maxSales = Math.max(day.total_sales, day.total_tracked_sales);
         const revenue = maxSales * REVENUE_PER_SALE;

         return {
            date: formatDate(day.fecha),
            roas: roasValue,
            spend: day.total_spend,
            revenue: revenue,
            // Format the date for display in chart
            formattedDate: formatDate(day.fecha),
            // Determine if this day was profitable
            profitable: roasValue >= 1,
         };
      })
      .reverse(); // Reverse to show oldest to newest

   const CustomTooltip = ({ active, payload, label }) => {
      if (active && payload && payload.length) {
         // Buscar cada dato por dataKey en lugar de usar índices fijos
         const roasItem = payload.find((item) => item.dataKey === "roas");
         const revenueItem = payload.find((item) => item.dataKey === "revenue");
         const spendItem = payload.find((item) => item.dataKey === "spend");

         const roasValue = roasItem ? roasItem.value : 0;
         const isProfitable = roasValue >= 1;

         // Encontrar la información del día en historicalData usando el label (fecha formateada)
         const dayData = historicalData.find((day) => formatDate(day.fecha) === label);
         const adCount = dayData?.ads.length || 0;
         // Calcular el número de ventas (tomando el mayor entre total_sales y total_tracked_sales)
         const salesNumber = dayData ? Math.max(dayData.total_sales, dayData.total_tracked_sales) : 0;
         // Calcular el revenue basado en las ventas (puede coincidir con revenueItem.value)
         const computedRevenue = salesNumber * REVENUE_PER_SALE;
         // Calcular la ganancia o pérdida: revenue menos gasto total del día
         const profitValue = dayData ? computedRevenue - dayData.total_spend : 0;

         return (
            <div className="bg-white p-3 shadow-lg rounded-lg border border-gray-200">
               <p className="font-medium text-gray-900 mb-1">{label}</p>
               <div className="space-y-1">
                  <p className="text-sm flex items-center">
                     ROAS:{" "}
                     <span className={`font-medium ml-1 ${isProfitable ? "text-green-600" : "text-red-600"}`}>
                        {roasValue.toFixed(2)}x {isProfitable ? <span className="text-xs ml-1">(Ganancia)</span> : <span className="text-xs ml-1">(Pérdida)</span>}
                     </span>
                  </p>
                  <p className="text-sm text-gray-600">
                     Ingresos: <span className="font-medium text-blue-600">{formatCurrency(revenueItem ? revenueItem.value : computedRevenue)}</span>
                  </p>
                  <p className="text-sm text-gray-600">
                     Ventas: <span className="font-medium">{salesNumber}</span>
                  </p>
                  <p className="text-sm text-gray-600">
                     {profitValue >= 0 ? "Ganancia" : "Pérdida"}: <span className={`font-medium ${profitValue >= 0 ? "text-green-600" : "text-red-600"}`}>{formatCurrency(profitValue)}</span>
                  </p>
                  <p className="text-sm text-gray-600">
                     Gasto Total: <span className="font-medium text-emerald-600">{formatCurrency(spendItem ? spendItem.value : 0)}</span>
                     <span className="text-xs ml-1 text-gray-500">
                        ({adCount} {adCount === 1 ? "anuncio" : "anuncios"})
                     </span>
                  </p>
               </div>
            </div>
         );
      }
      return null;
   };

   // Custom dot component that shows the ROAS value
   const CustomizedDot = (props: any) => {
      const { cx, cy, value } = props;
      const isProfitable = value >= 1;

      return (
         <g>
            <circle cx={cx} cy={cy} r={4} fill={isProfitable ? "#10B981" : "#EF4444"} stroke={isProfitable ? "#064E3B" : "#991B1B"} strokeWidth={1} />
            <text x={cx} y={cy - 10} textAnchor="middle" fill={isProfitable ? "#065F46" : "#B91C1C"} fontSize={10} fontWeight="bold">
               {value.toFixed(1)}
            </text>
         </g>
      );
   };

   // First, let's compute the current profit
   const maxSales = Math.max(currentData.sales, currentData.tracked_sales);
   const revenue = maxSales * REVENUE_PER_SALE;
   const currentProfit = revenue - currentData.spend;

   const salesVariation = lastModification ? maxSales - lastModification.salesAtModification : 0;
   const profitVariation = lastModification ? currentProfit - lastModification.profitAtModification : 0;

   return (
      <Modal isOpen={isOpen} onClose={handleClose}>
         <div className="relative">
            {/* Header con botón de cerrar */}
            <div className="p-4 sm:p-6 border-b border-gray-200">
               <div className="flex justify-between items-center">
                  <h2 className="text-lg sm:text-xl font-semibold text-gray-900 truncate pr-8">{adSetName}</h2>
                  <button onClick={handleClose} className="rounded-full p-1 hover:bg-gray-100 text-gray-500" aria-label="Cerrar">
                     <X className="h-5 w-5" />
                  </button>
               </div>
            </div>

            {/* Tabs de navegación */}
            <div className="border-b border-gray-200">
               <nav className="flex -mb-px">
                  <button onClick={() => setActiveTab("metrics")} className={`py-3 px-4 font-medium text-sm border-b-2 ${activeTab === "metrics" ? "border-indigo-500 text-indigo-600" : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"}`}>
                     Métricas y Análisis
                  </button>
                  <button onClick={() => setActiveTab("preview")} className={`py-3 px-4 font-medium text-sm border-b-2 flex items-center gap-1 ${activeTab === "preview" ? "border-indigo-500 text-indigo-600" : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"}`}>
                     <Eye className="h-4 w-4" />
                     Vista previa
                  </button>
               </nav>
            </div>

            {/* Contenido de la pestaña de Métricas */}
            {activeTab === "metrics" && (
               <div className="p-4 sm:p-6">
                  {/* Métricas de rendimiento */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
                     <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
                        <h3 className="text-xs text-gray-500 mb-1">Presupuesto</h3>
                        <p className="text-lg font-semibold">{formatCurrency(currentData.presupuesto)}</p>
                     </div>
                     <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
                        <h3 className="text-xs text-gray-500 mb-1">Gastado</h3>
                        <p className="text-lg font-semibold">{formatCurrency(currentData.spend)}</p>
                        <p className="text-xs text-gray-500">{Math.round((currentData.spend / currentData.presupuesto) * 100)}% del presupuesto</p>
                     </div>
                     <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
                        <h3 className="text-xs text-gray-500 mb-1">ROAS</h3>
                        <div className="flex items-center">
                           <p className="text-lg font-semibold">{currentData.max_roas.toFixed(2)}x</p>
                           {lastModification && (
                              <span className={`text-xs ml-2 ${currentData.max_roas > lastModification.roasAtModification ? "text-green-600" : "text-red-600"}`}>
                                 {currentData.max_roas > lastModification.roasAtModification ? (
                                    <span className="flex items-center">
                                       <TrendingUp className="h-3 w-3 mr-0.5" />+{(currentData.max_roas - lastModification.roasAtModification).toFixed(2)}
                                    </span>
                                 ) : (
                                    <span className="flex items-center">
                                       <TrendingDown className="h-3 w-3 mr-0.5" />
                                       {(currentData.max_roas - lastModification.roasAtModification).toFixed(2)}
                                    </span>
                                 )}
                              </span>
                           )}
                        </div>
                     </div>
                     <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
                        <h3 className="text-xs text-gray-500 mb-1">Decisión</h3>
                        <p className="text-lg font-semibold flex items-center">
                           {currentDecisionStatus === "increase" && <TrendingUp className="h-5 w-5 text-green-500 mr-1" />}
                           {currentDecisionStatus === "decrease" && <TrendingDown className="h-5 w-5 text-red-500 mr-1" />}
                           {currentDecisionStatus === "keep" && <span className="text-yellow-500">Mantener</span>}
                           {currentDecisionStatus === "increase" && <span className="text-green-500">Aumentar</span>}
                           {currentDecisionStatus === "decrease" && <span className="text-red-500">Reducir</span>}
                        </p>
                     </div>
                     <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
                        <h3 className="text-xs text-gray-500 mb-1">Ventas</h3>
                        <div className="flex items-center">
                           <p className="text-lg font-semibold">{maxSales}</p>
                           {lastModification && (
                              <span className={`text-xs ml-2 ${salesVariation > 0 ? "text-green-600" : salesVariation < 0 ? "text-red-600" : "text-gray-500"}`}>
                                 {salesVariation > 0 ? (
                                    <span className="flex items-center">
                                       <TrendingUp className="h-3 w-3 mr-0.5" />+{salesVariation}
                                    </span>
                                 ) : salesVariation < 0 ? (
                                    <span className="flex items-center">
                                       <TrendingDown className="h-3 w-3 mr-0.5" />
                                       {salesVariation}
                                    </span>
                                 ) : null}
                              </span>
                           )}
                        </div>
                     </div>
                     <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
                        <h3 className="text-xs text-gray-500 mb-1">Ganancia</h3>
                        <div className="flex items-center">
                           <p className="text-lg font-semibold">{formatCurrency(currentProfit)}</p>
                           {lastModification && (
                              <span className={`text-xs ml-2 ${profitVariation > 0 ? "text-green-600" : profitVariation < 0 ? "text-red-600" : "text-gray-500"}`}>
                                 {profitVariation > 0 ? (
                                    <span className="flex items-center">
                                       <TrendingUp className="h-3 w-3 mr-0.5" />+{formatCurrency(profitVariation)}
                                    </span>
                                 ) : profitVariation < 0 ? (
                                    <span className="flex items-center">
                                       <TrendingDown className="h-3 w-3 mr-0.5" />
                                       {formatCurrency(profitVariation)}
                                    </span>
                                 ) : null}
                              </span>
                           )}
                        </div>
                     </div>
                  </div>

                  {/* Formulario para actualizar presupuesto */}
                  <div className="bg-gray-50 p-4 rounded-lg mb-6">
                     <div className="text-sm font-medium text-gray-900 mb-3">Actualizar Presupuesto</div>
                     <div className="flex flex-col sm:flex-row gap-3">
                        <div className="w-full sm:w-1/3">
                           <label className="block text-xs sm:text-sm text-gray-500 mb-1">Nuevo Presupuesto</label>
                           <div className="relative rounded-md shadow-sm">
                              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                                 <DollarSign className="h-4 w-4 text-gray-400" />
                              </div>
                              <input type="number" value={newBudget} onChange={(e) => setNewBudget(Math.max(0, parseFloat(e.target.value) || 0))} className="block w-full rounded-md border-0 py-1.5 pl-8 pr-3 text-gray-900 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6" placeholder="0.00" step="0.01" min="0" />
                           </div>
                        </div>
                        <div className="flex-1">
                           <label className="block text-xs sm:text-sm text-gray-500 mb-1">Razón del cambio</label>
                           <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} className="block w-full rounded-md border-0 py-1.5 px-3 text-gray-900 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6" placeholder="Explica por qué cambias el presupuesto..." />
                        </div>
                     </div>
                     <button onClick={updateBudget} disabled={updatingBudget || newBudget === currentData.presupuesto} className="mt-3 w-full px-3 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                        {updatingBudget ? (
                           <>
                              <Loader2 className="h-4 w-4 animate-spin" />
                              <span>Actualizando...</span>
                           </>
                        ) : (
                           <span>Actualizar Presupuesto</span>
                        )}
                     </button>
                  </div>

                  {/* Última modificación de presupuesto */}
                  {lastModification && (
                     <div className="mt-8 mb-6">
                        <h3 className="text-md font-semibold text-gray-900 mb-3 flex items-center">
                           <Calendar className="h-5 w-5 mr-2 text-indigo-500" />
                           Última modificación
                        </h3>

                        <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-100 mb-4">
                           <div className="flex justify-between items-start">
                              <div>
                                 <span className="text-xs font-medium text-indigo-500 bg-indigo-100 px-2 py-1 rounded-full">{lastModification.date}</span>
                                 <p className="mt-2 text-sm text-gray-600 italic">"{lastModification.reason}"</p>
                              </div>
                              <div className="flex items-center px-3 py-1.5 rounded-full bg-white shadow-sm">
                                 {lastModification.newBudget > lastModification.previousBudget ? <TrendingUp className="h-5 w-5 text-green-500 mr-1.5" /> : <TrendingDown className="h-5 w-5 text-red-500 mr-1.5" />}
                                 <div className="flex flex-col">
                                    <span className="text-xs text-gray-500">Presupuesto</span>
                                    <div className="text-sm font-medium">
                                       <span className="text-gray-500 line-through">{formatCurrency(lastModification.previousBudget)}</span>
                                       {" → "}
                                       <span className={`font-semibold ${lastModification.newBudget > lastModification.previousBudget ? "text-green-600" : "text-red-600"}`}>{formatCurrency(lastModification.newBudget)}</span>
                                    </div>
                                 </div>
                              </div>
                           </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                           {/* Métricas al momento de la modificación */}
                           <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
                              <h4 className="text-sm font-medium text-gray-900 mb-3 border-b pb-2">Métricas al momento de la modificación</h4>
                              <div className="grid grid-cols-2 gap-4">
                                 <div>
                                    <div className="flex items-center mb-1">
                                       <DollarSign className="h-4 w-4 text-gray-400 mr-1" />
                                       <span className="text-xs text-gray-500">Gasto</span>
                                    </div>
                                    <div className="text-sm font-medium">
                                       {formatCurrency(lastModification.spendAtModification)}
                                       {currentData.spend > lastModification.spendAtModification ? (
                                          <span className="ml-1.5 text-xs text-green-600 inline-flex items-center">
                                             <TrendingUp className="h-3 w-3 mr-0.5" />+{formatCurrency(currentData.spend - lastModification.spendAtModification)}
                                          </span>
                                       ) : currentData.spend < lastModification.spendAtModification ? (
                                          <span className="ml-1.5 text-xs text-red-600 inline-flex items-center">
                                             <TrendingDown className="h-3 w-3 mr-0.5" />
                                             {formatCurrency(currentData.spend - lastModification.spendAtModification)}
                                          </span>
                                       ) : null}
                                    </div>
                                 </div>

                                 <div>
                                    <div className="flex items-center mb-1">
                                       <TrendingUp className="h-4 w-4 text-gray-400 mr-1" />
                                       <span className="text-xs text-gray-500">ROAS</span>
                                    </div>
                                    <div className="text-sm font-medium">
                                       {lastModification.roasAtModification.toFixed(2)}x
                                       {currentData.max_roas !== lastModification.roasAtModification && (
                                          <span className={`ml-1.5 text-xs ${currentData.max_roas > lastModification.roasAtModification ? "text-green-600" : "text-red-600"} inline-flex items-center`}>
                                             {currentData.max_roas > lastModification.roasAtModification ? (
                                                <>
                                                   <TrendingUp className="h-3 w-3 mr-0.5" />+{(currentData.max_roas - lastModification.roasAtModification).toFixed(2)}
                                                </>
                                             ) : (
                                                <>
                                                   <TrendingDown className="h-3 w-3 mr-0.5" />
                                                   {(currentData.max_roas - lastModification.roasAtModification).toFixed(2)}
                                                </>
                                             )}
                                          </span>
                                       )}
                                    </div>
                                 </div>

                                 <div>
                                    <div className="flex items-center mb-1">
                                       <Layers className="h-4 w-4 text-gray-400 mr-1" />
                                       <span className="text-xs text-gray-500">Ventas</span>
                                    </div>
                                    <div className="text-sm font-medium">
                                       {lastModification.salesAtModification}
                                       {salesVariation !== 0 && (
                                          <span className={`ml-1.5 text-xs ${salesVariation > 0 ? "text-green-600" : "text-red-600"} inline-flex items-center`}>
                                             {salesVariation > 0 ? (
                                                <>
                                                   <TrendingUp className="h-3 w-3 mr-0.5" />+{salesVariation}
                                                </>
                                             ) : (
                                                <>
                                                   <TrendingDown className="h-3 w-3 mr-0.5" />
                                                   {salesVariation}
                                                </>
                                             )}
                                          </span>
                                       )}
                                    </div>
                                 </div>

                                 <div>
                                    <div className="flex items-center mb-1">
                                       <DollarSign className="h-4 w-4 text-gray-400 mr-1" />
                                       <span className="text-xs text-gray-500">Ganancia</span>
                                    </div>
                                    <div className="text-sm font-medium">
                                       {formatCurrency(lastModification.profitAtModification)}
                                       {profitVariation !== 0 && (
                                          <span className={`ml-1.5 text-xs ${profitVariation > 0 ? "text-green-600" : "text-red-600"} inline-flex items-center`}>
                                             {profitVariation > 0 ? (
                                                <>
                                                   <TrendingUp className="h-3 w-3 mr-0.5" />+{formatCurrency(profitVariation)}
                                                </>
                                             ) : (
                                                <>
                                                   <TrendingDown className="h-3 w-3 mr-0.5" />
                                                   {formatCurrency(profitVariation)}
                                                </>
                                             )}
                                          </span>
                                       )}
                                    </div>
                                 </div>
                              </div>
                           </div>

                           {/* Impacto de la modificación */}
                           <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
                              <h4 className="text-sm font-medium text-gray-900 mb-3 border-b pb-2">Impacto de la modificación</h4>
                              <div className="space-y-3">
                                 <div className="flex items-center">
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center mr-3 ${profitVariation >= 0 ? "bg-green-100" : "bg-red-100"}`}>{profitVariation >= 0 ? <TrendingUp className="h-5 w-5 text-green-600" /> : <TrendingDown className="h-5 w-5 text-red-600" />}</div>
                                    <div>
                                       <div className="text-xs text-gray-500">Variación de ganancia</div>
                                       <div className={`text-sm font-semibold ${profitVariation >= 0 ? "text-green-600" : "text-red-600"}`}>
                                          {profitVariation >= 0 ? "+" : ""}
                                          {formatCurrency(profitVariation)}
                                       </div>
                                    </div>
                                 </div>

                                 <div className="flex items-center">
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center mr-3 ${salesVariation >= 0 ? "bg-green-100" : "bg-red-100"}`}>{salesVariation >= 0 ? <TrendingUp className="h-5 w-5 text-green-600" /> : <TrendingDown className="h-5 w-5 text-red-600" />}</div>
                                    <div>
                                       <div className="text-xs text-gray-500">Variación de ventas</div>
                                       <div className={`text-sm font-semibold ${salesVariation >= 0 ? "text-green-600" : "text-red-600"}`}>
                                          {salesVariation >= 0 ? "+" : ""}
                                          {salesVariation} {salesVariation !== 0 ? `(${((salesVariation / lastModification.salesAtModification) * 100).toFixed(1)}%)` : ""}
                                       </div>
                                    </div>
                                 </div>

                                 <div className="flex items-center">
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center mr-3 ${currentData.max_roas >= lastModification.roasAtModification ? "bg-green-100" : "bg-red-100"}`}>{currentData.max_roas >= lastModification.roasAtModification ? <TrendingUp className="h-5 w-5 text-green-600" /> : <TrendingDown className="h-5 w-5 text-red-600" />}</div>
                                    <div>
                                       <div className="text-xs text-gray-500">Variación de ROAS</div>
                                       <div className={`text-sm font-semibold ${currentData.max_roas >= lastModification.roasAtModification ? "text-green-600" : "text-red-600"}`}>
                                          {currentData.max_roas >= lastModification.roasAtModification ? "+" : ""}
                                          {(currentData.max_roas - lastModification.roasAtModification).toFixed(2)}x
                                       </div>
                                    </div>
                                 </div>
                              </div>
                           </div>
                        </div>
                     </div>
                  )}

                  {/* Análisis e Historial */}
                  {loading ? (
                     <div className="h-40 flex items-center justify-center">
                        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
                     </div>
                  ) : (
                     <>
                        {/* Gráfica de ROAS */}
                        {historicalData.length > 0 && (
                           <div className="bg-white p-4 rounded-lg mb-6 border border-gray-200">
                              <h3 className="text-sm font-medium text-gray-900 mb-4">Variación del ROAS</h3>
                              <div className="h-64">
                                 <ResponsiveContainer width="100%" height="100%">
                                    <ComposedChart data={chartData} margin={{ top: 15, right: 30, left: 20, bottom: 5 }}>
                                       <CartesianGrid strokeDasharray="3 3" />
                                       <XAxis dataKey="formattedDate" />
                                       <YAxis yAxisId="left" orientation="left" label={{ value: "ROAS", angle: -90, position: "insideLeft" }} domain={[0, "auto"]} />
                                       <YAxis yAxisId="right" orientation="right" tickFormatter={(value) => formatCurrency(value)} label={{ value: "Monto", angle: 90, position: "insideRight" }} />
                                       <Tooltip content={<CustomTooltip />} />
                                       <Legend />

                                       {/* Área coloreada para diferenciar ganancia y pérdida */}
                                       <defs>
                                          <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                                             <stop offset="0%" stopColor="#DCFCE7" stopOpacity={0.3} />
                                             <stop offset="100%" stopColor="#DCFCE7" stopOpacity={0} />
                                          </linearGradient>
                                          <linearGradient id="colorLoss" x1="0" y1="0" x2="0" y2="1">
                                             <stop offset="0%" stopColor="#FEE2E2" stopOpacity={0.3} />
                                             <stop offset="100%" stopColor="#FEE2E2" stopOpacity={0} />
                                          </linearGradient>
                                       </defs>

                                       {/* Área de ganancia (ROAS > 1) */}
                                       <Area yAxisId="left" type="monotone" dataKey="roas" fill="url(#colorProfit)" stroke="none" activeDot={false} baseValue={1} fillOpacity={1} />

                                       {/* Línea de referencia para ROAS = 1 */}
                                       <ReferenceLine
                                          yAxisId="left"
                                          y={1}
                                          stroke="#DC2626"
                                          strokeWidth={2}
                                          strokeDasharray="5 2"
                                          label={{
                                             value: "",
                                             position: "insideBottomRight",
                                             fill: "#991B1B",
                                             fontSize: 11,
                                             fontWeight: "bold",
                                          }}
                                       />

                                       {/* ROAS line with custom dots */}
                                       <Line yAxisId="left" type="monotone" dataKey="roas" stroke="#F97316" name="ROAS" strokeWidth={2} dot={<CustomizedDot />} activeDot={{ r: 6, fill: "#EA580C" }} />
                                       <Line yAxisId="right" type="monotone" dataKey="revenue" stroke="#3B82F6" name="Revenue" strokeWidth={2} />
                                       <Bar yAxisId="right" dataKey="spend" fill="#059669" name="Gasto" barSize={20} />
                                    </ComposedChart>
                                 </ResponsiveContainer>
                              </div>

                              {/* Leyenda adicional para los puntos y la línea de referencia */}
                              <div className="flex flex-wrap justify-center mt-2 gap-4">
                                 <div className="flex items-center">
                                    <div className="w-3 h-3 rounded-full bg-green-500 mr-1"></div>
                                    <span className="text-xs text-gray-600">ROAS ≥ 1 (Ganancia)</span>
                                 </div>
                                 <div className="flex items-center">
                                    <div className="w-3 h-3 rounded-full bg-red-500 mr-1"></div>
                                    <span className="text-xs text-gray-600">ROAS &lt; 1 (Pérdida)</span>
                                 </div>
                                 <div className="flex items-center">
                                    <div className="w-8 h-0.5 bg-red-600 mr-1 border-dashed"></div>
                                    <span className="text-xs text-gray-600">Línea de equilibrio (ROAS = 1)</span>
                                 </div>
                              </div>
                           </div>
                        )}

                        {/* Sección IA y datos históricos */}
                        <div className="flex flex-col gap-4">
                           {/* Botón de análisis IA */}
                           <button onClick={requestAiAnalysis} disabled={analyzing} className="flex items-center justify-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors disabled:opacity-50">
                              {analyzing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Brain className="h-5 w-5" />}
                              {analyzing ? "Analizando..." : "Analizar con IA"}
                           </button>

                           {/* Recomendación de IA */}
                           {aiRecommendation && (
                              <div className="p-3 sm:p-4 bg-purple-50 border border-purple-200 rounded-lg">
                                 <h4 className="text-sm font-medium text-purple-900 mb-2">Recomendación de IA:</h4>
                                 <p className="text-sm text-purple-800">{aiRecommendation}</p>
                              </div>
                           )}

                           {/* Historial - Toggle para móvil */}
                           <div className="sm:hidden">
                              <button onClick={() => setShowHistorical(!showHistorical)} className="w-full flex items-center justify-between px-4 py-2 bg-gray-100 text-gray-800 rounded-md hover:bg-gray-200">
                                 <div className="flex items-center gap-2">
                                    <Calendar className="h-4 w-4" />
                                    <span className="font-medium">Datos Históricos</span>
                                 </div>
                                 {showHistorical ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
                              </button>
                           </div>

                           {/* Tabla Historial para versión móvil (colapsable) */}
                           {(showHistorical || window.innerWidth >= 640) && (
                              <div className="mt-2 sm:mt-4">
                                 <h3 className="hidden sm:block text-lg font-medium text-gray-900 mb-3">Rendimiento Histórico</h3>

                                 <div className="overflow-x-auto -mx-4 sm:mx-0">
                                    <div className="inline-block min-w-full align-middle">
                                       <table className="min-w-full divide-y divide-gray-200">
                                          <thead className="bg-gray-50">
                                             <tr>
                                                <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fecha</th>
                                                <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Gasto</th>
                                                <th className="px-4 sm:px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Ventas</th>
                                                <th className="px-4 sm:px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Revenue</th>
                                                <th className="px-4 sm:px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Ganancia/Pérdida</th>
                                                <th className="px-4 sm:px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">ROAS</th>
                                             </tr>
                                          </thead>
                                          <tbody className="bg-white divide-y divide-gray-200">
                                             {historicalData.map((day) =>
                                                day.ads.map((ad, adIndex) => {
                                                   const rowString = formatBogotaDate(parseBogotaDate(day.fecha));
                                                   const isToday = rowString === todayString;
                                                   // Calcular revenue y ganancia para cada anuncio
                                                   const maxSales = Math.max(ad.sales, ad.tracked_sales);
                                                   const revenue = maxSales * REVENUE_PER_SALE;
                                                   const profit = revenue - ad.spend;
                                                   const adKey = `${day.fecha}-${ad.ad_id}`;
                                                   const decisionStatus = adDecisionStatuses[adKey] || "keep";

                                                   return (
                                                      <tr key={`${day.fecha}-${ad.ad_id}`} className="hover:bg-gray-50">
                                                         <td className="px-4 sm:px-6 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                                                            {adIndex === 0 && (
                                                               <div className="flex items-center gap-2">
                                                                  {formatDate(day.fecha)}
                                                                  {isToday && <span className="text-xs font-semibold text-green-700 bg-green-100 px-1 rounded">Hoy</span>}
                                                               </div>
                                                            )}
                                                         </td>
                                                         <td className="px-4 sm:px-6 py-3 whitespace-nowrap text-sm text-gray-500">{formatCurrency(ad.spend)}</td>
                                                         <td className="px-4 sm:px-6 py-3 whitespace-nowrap text-sm text-gray-500 text-center">
                                                            <div className="hidden sm:block">
                                                               {ad.sales} / {ad.tracked_sales}
                                                            </div>
                                                            <div className="sm:hidden">{ad.sales}</div>
                                                         </td>
                                                         <td className="px-4 sm:px-6 py-3 whitespace-nowrap text-sm text-gray-500 text-center">{formatCurrency(revenue)}</td>
                                                         <td className="px-4 sm:px-6 py-3 whitespace-nowrap text-sm text-center">
                                                            <span className={`font-medium ${profit >= 0 ? "text-green-600" : "text-red-600"}`}>
                                                               {profit >= 0 ? "+" : "-"}
                                                               {formatCurrency(Math.abs(profit))}
                                                            </span>
                                                         </td>
                                                         <td className="px-4 sm:px-6 py-3 whitespace-nowrap">
                                                            <div className="flex items-center justify-center">
                                                               {/* Mostramos solo el indicador para evitar duplicidad */}
                                                               <RoasIndicator value={ad.max_roas} status={decisionStatus} />
                                                            </div>
                                                         </td>
                                                      </tr>
                                                   );
                                                })
                                             )}
                                             {historicalData.length === 0 && (
                                                <tr>
                                                   <td colSpan={6} className="px-4 sm:px-6 py-4 text-center text-sm text-gray-500">
                                                      No hay datos históricos disponibles
                                                   </td>
                                                </tr>
                                             )}
                                          </tbody>
                                       </table>
                                    </div>
                                 </div>
                              </div>
                           )}
                        </div>
                     </>
                  )}
               </div>
            )}

            {/* Contenido de la pestaña de Vista Previa */}
            {activeTab === "preview" && (
               <div className="p-4 sm:p-6">
                  <div className="bg-white border border-gray-200 rounded-lg">
                     <div className="p-4 border-b border-gray-200 flex justify-between items-center">
                        <h3 className="text-sm font-medium text-gray-900">Vista previa del anuncio</h3>
                        <button onClick={fetchAdPreview} className="text-sm text-indigo-600 hover:text-indigo-800" disabled={loadingPreview}>
                           {loadingPreview ? (
                              <span className="flex items-center">
                                 <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                 Cargando...
                              </span>
                           ) : (
                              "Actualizar"
                           )}
                        </button>
                     </div>

                     <div className="p-4">
                        {loadingPreview ? (
                           <div className="h-96 flex items-center justify-center">
                              <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
                           </div>
                        ) : adPreview ? (
                           <div className="flex justify-center">
                              <div dangerouslySetInnerHTML={{ __html: adPreview }} className="ad-preview-container" />
                           </div>
                        ) : (
                           <div className="h-96 flex items-center justify-center text-gray-500">Haz clic en "Vista previa" para ver el anuncio</div>
                        )}
                     </div>
                  </div>
               </div>
            )}
         </div>
      </Modal>
   );
}