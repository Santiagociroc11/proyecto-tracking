import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import CreateProduct from './pages/CreateProduct';
import ProductDetails from './pages/ProductDetails';
import Settings from './pages/Settings';
import AdminCreateUser from './pages/AdminCreateUser';
import Header from './components/Header';
import PrivateRoute from './components/PrivateRoute';

export default function AppRoutes() {
  const { user, loading, signOut } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  return (
    <Router>
      <Routes>
        {/* Rutas Públicas */}
        <Route path="/login" element={<Login />} />
        <Route path="/create-user" element={<AdminCreateUser />} />

        {/* Rutas Privadas */}
        <Route 
          path="/*" 
          element={
            <PrivateRoute>
              <MainApp />
            </PrivateRoute>
          } 
        />
      </Routes>
    </Router>
  );
}

// Componente para agrupar las rutas y layout principal de la app autenticada
function MainApp() {
  const { user, signOut } = useAuth();
  const isAdmin = user?.role === 'admin';

  return (
    <div className="min-h-screen bg-gray-50">
      <Header onLogout={signOut} isAdmin={!!isAdmin} />
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/products/new" element={<CreateProduct />} />
        <Route path="/products/:id" element={<ProductDetails />} />
        <Route path="/settings" element={<Settings />} />
        {isAdmin && (
          <Route path="/admin/create-user-auth" element={<AdminCreateUser />} />
        )}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}