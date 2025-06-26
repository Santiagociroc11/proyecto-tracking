import React, { useState } from 'react';
import { Modal } from '../Modal/Modal';
import { X, Plus, Edit, Trash2, CheckCircle, Settings } from 'lucide-react';
import { useFacebookConfig, FacebookAccount } from '../../hooks/useFacebookConfig';

interface ConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  accessToken: string;
  accountId: string;
  onAccessTokenChange: (value: string) => void;
  onAccountIdChange: (value: string) => void;
  onSave: () => void;
  saving: boolean;
}

export function ConfigModal({
  isOpen,
  onClose,
  accessToken: legacyAccessToken,
  accountId: legacyAccountId,
  onAccessTokenChange: legacyOnAccessTokenChange,
  onAccountIdChange: legacyOnAccountIdChange,
  onSave: legacyOnSave,
  saving: legacySaving
}: ConfigModalProps) {
  const {
    accounts,
    activeAccount,
    accountName,
    setAccountName,
    accessToken,
    accountId,
    loading,
    saving,
    setAccessToken,
    setAccountId,
    fetchAccounts,
    saveAccount,
    setActiveAccountById,
    deleteAccount,
    clearForm,
    loadAccountForEdit
  } = useFacebookConfig();

  const [view, setView] = useState<'list' | 'form'>('list');
  const [editingAccount, setEditingAccount] = useState<FacebookAccount | null>(null);

  const handleSave = async () => {
    try {
      if (editingAccount) {
        await saveAccount(true, editingAccount.id);
      } else {
        await saveAccount(false);
      }
      clearForm();
      setEditingAccount(null);
      setView('list');
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Error al guardar la cuenta');
    }
  };

  const handleEdit = (account: FacebookAccount) => {
    setEditingAccount(account);
    loadAccountForEdit(account);
    setView('form');
  };

  const handleDelete = async (account: FacebookAccount) => {
    if (confirm(`¿Estás seguro de que deseas eliminar la cuenta "${account.account_name}"?`)) {
      await deleteAccount(account.id);
    }
  };

  const handleAddNew = () => {
    clearForm();
    setEditingAccount(null);
    setView('form');
  };

  const handleSetActive = async (account: FacebookAccount) => {
    await setActiveAccountById(account.id);
  };

  const handleCancel = () => {
    clearForm();
    setEditingAccount(null);
    setView('list');
  };

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="relative">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            {view === 'list' ? 'Cuentas Publicitarias' : (editingAccount ? 'Editar Cuenta' : 'Nueva Cuenta')}
          </h2>
          <button
            onClick={onClose}
            className="rounded-full p-1 hover:bg-gray-100 text-gray-500"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6">
          {view === 'list' ? (
            <div className="space-y-4">
              {/* Header con botón agregar */}
              <div className="flex justify-between items-center">
                <p className="text-sm text-gray-600">
                  Gestiona tus cuentas publicitarias de Facebook
                </p>
                <button
                  onClick={handleAddNew}
                  className="inline-flex items-center px-3 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700 transition-colors"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Agregar Cuenta
                </button>
              </div>

              {/* Lista de cuentas */}
              {loading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-500 mx-auto"></div>
                  <p className="mt-2 text-sm text-gray-600">Cargando cuentas...</p>
                </div>
              ) : accounts.length === 0 ? (
                <div className="text-center py-8">
                  <Settings className="mx-auto h-12 w-12 text-gray-400" />
                  <h3 className="mt-2 text-sm font-medium text-gray-900">No hay cuentas configuradas</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    Comienza agregando tu primera cuenta publicitaria
                  </p>
                  <div className="mt-6">
                    <button
                      onClick={handleAddNew}
                      className="inline-flex items-center px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700 transition-colors"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Agregar Primera Cuenta
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {accounts.map((account) => (
                    <div
                      key={account.id}
                      className={`p-4 rounded-lg border-2 transition-colors ${
                        account.is_active
                          ? 'border-indigo-200 bg-indigo-50'
                          : 'border-gray-200 bg-white hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center">
                            <h3 className="text-sm font-medium text-gray-900">
                              {account.account_name}
                            </h3>
                            {account.is_active && (
                              <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                <CheckCircle className="h-3 w-3 mr-1" />
                                Activa
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 mt-1">
                            ID: {account.account_id}
                          </p>
                          <p className="text-xs text-gray-400 mt-1">
                            Agregada: {new Date(account.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        
                        <div className="flex items-center space-x-2">
                          {!account.is_active && (
                            <button
                              onClick={() => handleSetActive(account)}
                              className="text-xs px-3 py-1 bg-indigo-100 text-indigo-700 rounded-md hover:bg-indigo-200 transition-colors"
                            >
                              Activar
                            </button>
                          )}
                          <button
                            onClick={() => handleEdit(account)}
                            className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                          {accounts.length > 1 && (
                            <button
                              onClick={() => handleDelete(account)}
                              className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {/* Formulario */}
              <div>
                <label htmlFor="account-name" className="block text-sm font-medium text-gray-700 mb-1">
                  Nombre de la Cuenta
                </label>
                <input
                  id="account-name"
                  type="text"
                  value={accountName}
                  onChange={(e) => setAccountName(e.target.value)}
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  placeholder="Mi Cuenta Publicitaria"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Un nombre descriptivo para identificar esta cuenta
                </p>
              </div>

              <div>
                <label htmlFor="access-token" className="block text-sm font-medium text-gray-700 mb-1">
                  Access Token
                </label>
                <textarea
                  id="access-token"
                  value={accessToken}
                  onChange={(e) => setAccessToken(e.target.value)}
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  rows={3}
                  placeholder="EAAx..."
                />
              </div>

              <div>
                <label htmlFor="account-id" className="block text-sm font-medium text-gray-700 mb-1">
                  Account ID
                </label>
                <input
                  id="account-id"
                  type="text"
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  placeholder="act_1234567890"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
                <button
                  onClick={handleCancel}
                  disabled={saving}
                  className="px-4 py-2 bg-white border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 text-sm font-medium"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !accountName.trim() || !accessToken.trim() || !accountId.trim()}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? 'Guardando...' : (editingAccount ? 'Actualizar' : 'Guardar')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}