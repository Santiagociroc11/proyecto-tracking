import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LogOut, Activity, Settings, UserPlus, Mail } from 'lucide-react';

interface HeaderProps {
  onLogout: () => void;
  isAdmin: boolean;
}

export default function Header({ onLogout, isAdmin }: HeaderProps) {
  const navigate = useNavigate();
  const userEmail = localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user')!).email : '';

  const handleLogout = () => {
    onLogout();
    navigate('/');
  };

  return (
    <header className="bg-gradient-to-r from-indigo-600 to-purple-600">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center">
            <Link to="/" className="flex items-center">
              <Activity className="h-8 w-8 text-white" />
              <span className="ml-2 text-white text-xl font-bold">HotAPI</span>
              <span className="ml-1 text-gray-300 text-sm">by Automscc</span>
            </Link>
          </div>
          <div className="flex items-center space-x-4">
            {userEmail && (
              <div className="flex items-center text-white">
                <Mail className="h-4 w-4 mr-2" />
                <span className="text-sm">{userEmail}</span>
              </div>
            )}
            {isAdmin && (
              <>
                <span className="text-white bg-indigo-700 px-3 py-1 rounded-full text-sm">
                  Admin
                </span>
                <Link
                  to="/admin/create-user"
                  className="inline-flex items-center px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-indigo-700 hover:bg-indigo-800"
                >
                  <UserPlus className="h-4 w-4 mr-2" />
                  Crear Usuario
                </Link>
              </>
            )}
            <Link
              to="/settings"
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-indigo-700 hover:bg-indigo-800"
            >
              <Settings className="h-4 w-4 mr-2" />
              Ajustes
            </Link>
            <button
              onClick={handleLogout}
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-indigo-700 hover:bg-indigo-800"
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