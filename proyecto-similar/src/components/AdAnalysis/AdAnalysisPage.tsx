import React from 'react';
import { Header } from '../Layout/Header';
import { AdAnalysis } from './AdAnalysis';

export function AdAnalysisPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main className="max-w-8xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6 md:py-8 space-y-4 sm:space-y-6 md:space-y-8">
        <AdAnalysis />
      </main>
    </div>
  );
} 