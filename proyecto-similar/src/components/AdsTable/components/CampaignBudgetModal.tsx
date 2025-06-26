import React, { useState, useEffect } from 'react';
import { Modal } from '../../Modal/Modal';
import { Loader2, DollarSign, Layers, X } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useFacebookConfig } from '../../../hooks/useFacebookConfig';

interface CampaignBudgetModalProps {
  isOpen: boolean;
  onClose: () => void;
  campaignId: string;
  campaignName: string;
  currentBudget: number; // This should be the campaign's current budget
  currentData: {
    spend: number;
    roas: number;
    sales: number;
    tracked_sales: number;
    profit_loss: number;
  };
  onSave: () => void; // Callback after saving
  formatCurrency: (value: number) => string;
}

export function CampaignBudgetModal({
  isOpen,
  onClose,
  campaignId,
  campaignName,
  currentBudget,
  currentData,
  onSave,
  formatCurrency,
}: CampaignBudgetModalProps) {
  const { activeAccount } = useFacebookConfig();
  const [newCampaignBudget, setNewCampaignBudget] = useState<number>(currentBudget);
  const [updating, setUpdating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setNewCampaignBudget(currentBudget);
      setErrorMessage(null);
    }
  }, [isOpen, currentBudget]);

  const handleSave = async () => {
    if (newCampaignBudget === currentBudget || isNaN(newCampaignBudget) || newCampaignBudget < 0) {
      setErrorMessage('Presupuesto inválido o sin cambios.');
      return;
    }

    if (!activeAccount) {
      setErrorMessage('No hay cuenta activa configurada. Por favor, configura una cuenta de Facebook.');
      return;
    }

    setUpdating(true);
    setErrorMessage(null);

    try {
      // Corregir la petición a la API de Facebook
      const baseUrl = 'https://graph.facebook.com';
      const version = 'v23.0';
      const url = `${baseUrl}/${version}/${campaignId}`;

      // Usar URLSearchParams para enviar los datos como form-data
      const params = new URLSearchParams({
        access_token: activeAccount.access_token,
        daily_budget: (newCampaignBudget * 100).toString(), // Facebook API expects budget in cents
      });

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      const result = await response.json();

      if (!response.ok) {
        console.error('Error response from Facebook API:', result);
        throw new Error(result.error?.message || `Facebook API error: ${response.status} - ${response.statusText}`);
      }

      if (result.success || result.id === campaignId) {
        // Registrar la modificación en la base de datos
        try {
          const { data: { user }, error: userError } = await supabase.auth.getUser();
          if (userError || !user) {
            console.warn('No se pudo obtener el usuario para registrar la modificación');
          } else {
            // Usar los datos actuales pasados como prop
            const { error: modificationError } = await supabase
              .from('budget_modifications')
              .insert({
                adset_id: `campaign_${campaignId}`, // Prefijo para identificar que es una campaña
                previous_budget: currentBudget,
                new_budget: newCampaignBudget,
                reason: '[CAMPAÑA CBO] Modificación manual de presupuesto',
                user_id: user.id,
                spend_at_modification: currentData.spend,
                roas_at_modification: currentData.roas,
                sales_at_modification: Math.max(currentData.sales, currentData.tracked_sales),
                profit_at_modification: currentData.profit_loss,
              });

            if (modificationError) {
              console.error('Error registrando modificación:', modificationError);
            }
          }
        } catch (modError) {
          console.error('Error al registrar la modificación:', modError);
        }

        onSave();
        onClose();
      } else {
        console.error('Unexpected response format:', result);
        throw new Error('Respuesta inesperada de la API de Facebook.');
      }
    } catch (error: any) {
      console.error('Failed to update campaign budget:', error);
      setErrorMessage(error.message || 'Ocurrió un error al conectar con la API de Facebook.');
    } finally {
      setUpdating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-lg">
      <div className="relative">
        {/* Modal Header */}
        <div className="flex items-start justify-between p-5 border-b rounded-t bg-gray-50">
          <h3 className="text-xl font-semibold text-gray-800 flex items-center">
            <Layers className="w-6 h-6 mr-3 text-green-600" />
            Editar Presupuesto de Campaña
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 bg-transparent hover:bg-gray-200 hover:text-gray-900 rounded-lg text-sm ml-auto inline-flex items-center"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-4">
          {!activeAccount && (
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-md">
              <p className="text-sm text-yellow-800">
                No hay cuenta activa configurada. Por favor, configura una cuenta de Facebook.
              </p>
            </div>
          )}
          
          <p className="text-sm text-gray-600">
            Estás editando el presupuesto para la campaña: <strong>{campaignName}</strong> (ID: {campaignId})
          </p>
          
          <div>
            <label htmlFor="currentCampaignBudget" className="block text-sm font-medium text-gray-700">
              Presupuesto Actual de Campaña:
            </label>
            <p id="currentCampaignBudget" className="text-lg font-semibold text-blue-600">
              {formatCurrency(currentBudget)}
            </p>
          </div>

          <div>
            <label htmlFor="newCampaignBudget" className="block text-sm font-medium text-gray-700 mb-1">
              Nuevo Presupuesto de Campaña:
            </label>
            <input
              type="number"
              id="newCampaignBudget"
              value={newCampaignBudget}
              onChange={(e) => setNewCampaignBudget(parseFloat(e.target.value))}
              disabled={updating || !activeAccount}
              className="w-full p-2 border rounded-md focus:ring-green-500 focus:border-green-500 disabled:bg-gray-100"
              min="0"
              step="0.01"
            />
            <p className="text-xs text-gray-500 mt-1">
              El presupuesto se enviará en centavos a Facebook (${newCampaignBudget} = {Math.round(newCampaignBudget * 100)} centavos)
            </p>
          </div>
          
          {/* Consider showing ad sets affected if adSetsInCampaign is passed */}
          {/* Example: 
          <div>
            <p className="text-sm font-medium text-gray-700">Conjuntos de anuncios afectados:</p>
            <ul className="list-disc list-inside text-sm text-gray-500 max-h-32 overflow-y-auto">
              {adSetsInCampaign.map(adSet => <li key={adSet.id}>{adSet.name}</li>)}
            </ul>
          </div>
          */}

          {errorMessage && (
            <p className="text-sm text-red-600 bg-red-50 p-3 rounded-md">{errorMessage}</p>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-end p-4 border-t space-x-2">
          <button
            onClick={onClose}
            disabled={updating}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={updating || newCampaignBudget === currentBudget || isNaN(newCampaignBudget) || newCampaignBudget < 0 || !activeAccount}
            className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 flex items-center"
          >
            {updating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <DollarSign className="w-4 h-4 mr-2" />}
            Guardar Presupuesto de Campaña
          </button>
        </div>
      </div>
    </Modal>
  );
} 