import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Settings, LogOut, BarChart3, TrendingUp, ChevronDown } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useFacebookConfig } from '../../hooks/useFacebookConfig';

interface HeaderProps {
  onConfigClick?: () => void;
}

export function Header({ onConfigClick }: HeaderProps) {
  const location = useLocation();
  const { accounts, activeAccount, setActiveAccountById } = useFacebookConfig();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  const handleAccountChange = (accountId: string) => {
    setActiveAccountById(accountId);
  };

  return (
    <header className="bg-white shadow-sm border-b border-gray-200">
      <div className="max-w-8xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center space-x-8">
            <div className="flex-shrink-0">
              <h1 className="text-xl font-bold text-indigo-600">ADS Analyst</h1>
            </div>
            
            <nav className="hidden md:flex space-x-8">
              <Link
                to="/"
                className={`flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  location.pathname === '/' 
                    ? 'bg-indigo-100 text-indigo-700' 
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                }`}
              >
                <BarChart3 className="h-4 w-4 mr-2" />
                Dashboard
              </Link>
              <Link
                to="/ad-analysis"
                className={`flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  location.pathname === '/ad-analysis' 
                    ? 'bg-indigo-100 text-indigo-700' 
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                }`}
              >
                <TrendingUp className="h-4 w-4 mr-2" />
                Análisis
              </Link>
            </nav>
          </div>

          <div className="flex items-center space-x-4">
            {/* Account Selector */}
            {accounts.length > 1 && (
              <div className="relative">
                <select
                  value={activeAccount?.id || ''}
                  onChange={(e) => handleAccountChange(e.target.value)}
                  className="appearance-none bg-white border border-gray-300 rounded-md pl-3 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.account_name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              </div>
            )}

            {/* Active Account Display */}
            {activeAccount && accounts.length === 1 && (
              <div className="hidden sm:flex items-center text-sm text-gray-600">
                <span className="font-medium">{activeAccount.account_name}</span>
              </div>
            )}

            <button
              onClick={onConfigClick}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
              title="Configuración"
            >
              <Settings className="h-5 w-5" />
            </button>
            
            <button
              onClick={handleSignOut}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
              title="Cerrar sesión"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Navigation */}
      <div className="md:hidden border-t border-gray-200">
        <div className="flex">
          <Link
            to="/"
            className={`flex-1 flex items-center justify-center px-3 py-3 text-sm font-medium ${
              location.pathname === '/' 
                ? 'bg-indigo-100 text-indigo-700 border-b-2 border-indigo-500' 
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            <BarChart3 className="h-4 w-4 mr-2" />
            Dashboard
          </Link>
          <Link
            to="/ad-analysis"
            className={`flex-1 flex items-center justify-center px-3 py-3 text-sm font-medium ${
              location.pathname === '/ad-analysis' 
                ? 'bg-indigo-100 text-indigo-700 border-b-2 border-indigo-500' 
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            <TrendingUp className="h-4 w-4 mr-2" />
            Análisis
          </Link>
        </div>

        {/* Mobile Account Selector */}
        {accounts.length > 1 && (
          <div className="px-4 py-2 bg-gray-50 border-t border-gray-200">
            <select
              value={activeAccount?.id || ''}
              onChange={(e) => handleAccountChange(e.target.value)}
              className="w-full bg-white border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.account_name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    </header>
  );
}