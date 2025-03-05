import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Link } from 'react-router-dom';
import { LogOut, Activity } from 'lucide-react';

export default function Header() {
  const { signOut } = useAuth();

  return (
    <header className="bg-gradient-to-r from-indigo-600 to-purple-600">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center">
            <Link to="/dashboard" className="flex items-center">
              <Activity className="h-8 w-8 text-white" />
              <span className="ml-2 text-white text-xl font-bold">HotAPI</span>
              <span className="ml-1 text-gray-300 text-sm">by Automscc</span>
            </Link>
          </div>
          <div className="flex items-center">
            <button
              onClick={() => signOut()}
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-indigo-700 hover:bg-indigo-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-indigo-600 focus:ring-white"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Cerrar Sesión
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}