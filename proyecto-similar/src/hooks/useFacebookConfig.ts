import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export interface FacebookAccount {
  id: string;
  account_name: string;
  access_token: string;
  account_id: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function useFacebookConfig() {
  const [accounts, setAccounts] = useState<FacebookAccount[]>([]);
  const [activeAccount, setActiveAccount] = useState<FacebookAccount | null>(null);
  const [accessToken, setAccessToken] = useState('');
  const [accountId, setAccountId] = useState('');
  const [accountName, setAccountName] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  // Fetch all accounts for the current user
  const fetchAccounts = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) return;

      const { data, error } = await supabase
        .from('facebook_accounts')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setAccounts(data || []);
      
      // Set active account
      const active = data?.find(acc => acc.is_active);
      if (active) {
        setActiveAccount(active);
        setAccessToken(active.access_token);
        setAccountId(active.account_id);
        setAccountName(active.account_name);
      }
    } catch (error) {
      console.error('Error fetching Facebook accounts:', error);
    } finally {
      setLoading(false);
    }
  };

  // Legacy method for backward compatibility
  const fetchConfig = async () => {
    await fetchAccounts();
  };

  // Save new account or update existing
  const saveAccount = async (isUpdate = false, accountToUpdateId?: string) => {
    if (!accessToken.trim() || !accountId.trim() || !accountName.trim()) {
      throw new Error('Todos los campos son requeridos');
    }

    try {
      setSaving(true);
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) throw new Error('Usuario no autenticado');

      if (isUpdate && accountToUpdateId) {
        // Update existing account
        const { error } = await supabase
          .from('facebook_accounts')
          .update({
            account_name: accountName,
            access_token: accessToken,
            account_id: accountId,
            updated_at: new Date().toISOString()
          })
          .eq('id', accountToUpdateId)
          .eq('user_id', user.id);

        if (error) throw error;
      } else {
        // Create new account
        const { error } = await supabase
          .from('facebook_accounts')
          .insert({
            user_id: user.id,
            account_name: accountName,
            access_token: accessToken,
            account_id: accountId,
            is_active: accounts.length === 0 // First account is active by default
          });

        if (error) throw error;
      }

      await fetchAccounts();
      return true;
    } catch (error) {
      console.error('Error saving Facebook account:', error);
      throw error;
    } finally {
      setSaving(false);
    }
  };

  // Legacy method for backward compatibility
  const saveConfig = async () => {
    try {
      await saveAccount();
      return true;
    } catch (error) {
      return false;
    }
  };

  // Set active account
  const setActiveAccountById = async (accountId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Deactivate all accounts
      await supabase
        .from('facebook_accounts')
        .update({ is_active: false })
        .eq('user_id', user.id);

      // Activate selected account
      const { error } = await supabase
        .from('facebook_accounts')
        .update({ is_active: true })
        .eq('id', accountId)
        .eq('user_id', user.id);

      if (error) throw error;

      await fetchAccounts();
    } catch (error) {
      console.error('Error setting active account:', error);
    }
  };

  // Delete account
  const deleteAccount = async (accountId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from('facebook_accounts')
        .delete()
        .eq('id', accountId)
        .eq('user_id', user.id);

      if (error) throw error;

      await fetchAccounts();
    } catch (error) {
      console.error('Error deleting account:', error);
    }
  };

  // Clear form
  const clearForm = () => {
    setAccessToken('');
    setAccountId('');
    setAccountName('');
  };

  // Load account data for editing
  const loadAccountForEdit = (account: FacebookAccount) => {
    setAccessToken(account.access_token);
    setAccountId(account.account_id);
    setAccountName(account.account_name);
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  return {
    // New multi-account properties
    accounts,
    activeAccount,
    accountName,
    setAccountName,
    loading,
    fetchAccounts,
    saveAccount,
    setActiveAccountById,
    deleteAccount,
    clearForm,
    loadAccountForEdit,
    
    // Legacy properties for backward compatibility
    config: activeAccount,
    accessToken,
    accountId,
    saving,
    setAccessToken,
    setAccountId,
    fetchConfig,
    saveConfig
  };
}