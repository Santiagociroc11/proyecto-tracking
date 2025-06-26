import React from 'react';
import { Settings } from 'lucide-react';

interface SetupPromptProps {
  onConfigClick: () => void;
}

export function SetupPrompt({ onConfigClick }: SetupPromptProps) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="max-w-md w-full mx-auto p-8">
        <div className="bg-white shadow-lg rounded-lg p-6 text-center">
          <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Settings className="w-8 h-8 text-indigo-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Bienvenido al Panel de Facebook Ads</h2>
          <p className="text-gray-600 mb-6">
            Para comenzar, por favor configura las credenciales de tu cuenta de Facebook Ads.
          </p>
          <button
            onClick={onConfigClick}
            className="w-full bg-indigo-600 text-white py-2 px-4 rounded-md hover:bg-indigo-700 transition-colors"
          >
            Configurar Cuenta
          </button>
        </div>
      </div>
    </div>
  );
}