import React, { useState, useEffect } from 'react';
import { Session } from '@supabase/supabase-js';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Header } from './components/Layout/Header';
import { ConfigModal } from './components/ConfigModal/ConfigModal';
import { Dashboard } from './components/Dashboard/Dashboard';
import { AdAnalysisPage } from './components/AdAnalysis/AdAnalysisPage';
import { SetupPrompt } from './components/Setup/SetupPrompt';
import { Auth } from './components/Auth/Auth';
import { useAdsData } from './hooks/useAdsData';
import { useFacebookConfig } from './hooks/useFacebookConfig';
import { supabase } from './lib/supabase';

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [configChecked, setConfigChecked] = useState(false);
  
  const {
    config,
    accessToken,
    accountId,
    saving,
    setAccessToken,
    setAccountId,
    fetchConfig,
    saveConfig
  } = useFacebookConfig();

  const {
    adData,
    loading,
    totalSpend,
    averageRoas,
    totalSales,
    totalReach,
    totalRoasWithNoRef,
    totalSalesWithNoRef,
    noRefSalesCount,
    otherAdsSalesCount,
    nonActiveAdsSalesCount,
    fetchData
  } = useAdsData();

  useEffect(() => {
    async function initSession() {
      setIsLoading(true);
      const { data } = await supabase.auth.getSession();
      setSession(data.session);
      setIsLoading(false);
    }

    initSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    async function getConfig() {
      if (session) {
        await fetchConfig();
        setConfigChecked(true);
      }
    }
    getConfig();
  }, [session]);

  const handleSaveConfig = async () => {
    const success = await saveConfig();
    if (success) {
      setShowConfig(false);
      fetchData();
    }
  };

  const handleConfigClick = () => {
    setShowConfig(true);
  };

  // Muestra un estado de carga mientras se verifica la autenticación o la configuración
  if (isLoading || (session && !configChecked)) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500 mx-auto"></div>
          <p className="mt-3 text-gray-600">Cargando...</p>
        </div>
      </div>
    );
  }

  // Muestra el componente de autenticación si no hay sesión
  if (!session) {
    return <Auth />;
  }

  const renderMainContent = () => {
    if (!config) {
      return <SetupPrompt onConfigClick={handleConfigClick} />;
    }
    
    return (
      <Router>
        <Routes>
          <Route 
            path="/" 
            element={
              <div className="min-h-screen bg-gray-50">
                <Header onConfigClick={handleConfigClick} />
                <Dashboard
                  data={adData}
                  loading={loading}
                  totalSpend={totalSpend}
                  averageRoas={averageRoas}
                  totalRoasWithNoRef={totalRoasWithNoRef}
                  totalSales={totalSales}
                  totalSalesWithNoRef={totalSalesWithNoRef}
                  totalReach={totalReach}
                  noRefSalesCount={noRefSalesCount}
                  otherAdsSalesCount={otherAdsSalesCount}
                  nonActiveAdsSalesCount={nonActiveAdsSalesCount}
                  onRefresh={fetchData}
                />
              </div>
            } 
          />
          <Route path="/ad-analysis" element={<AdAnalysisPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    );
  };

  return (
    <>
      <ConfigModal
        isOpen={showConfig}
        onClose={() => setShowConfig(false)}
        accessToken={accessToken}
        accountId={accountId}
        onAccessTokenChange={setAccessToken}
        onAccountIdChange={setAccountId}
        onSave={handleSaveConfig}
        saving={saving}
      />

      {renderMainContent()}
    </>
  );
}

export default App;