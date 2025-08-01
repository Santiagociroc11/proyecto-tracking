import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import CreateProduct from './pages/CreateProduct';
import ProductDetails from './pages/ProductDetails';
import Settings from './pages/Settings';
import AdminCreateUser from './pages/AdminCreateUser';
import Header from './components/Header';
import PrivateRoute from './components/PrivateRoute';
import PublicCreateUser from './pages/PublicCreateUser';
import LandingPage from './pages/LandingPage';

export default function AppRoutes() {
  const { user, loading, signOut } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/landing" element={<LandingPage />} />
        <Route path="/create-user-public" element={<PublicCreateUser />} />
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<LandingPage />} />
        <Route path="*" element={<LandingPage />} />
      </Routes>
    );
  }

  const isAdmin = user.role === 'admin';

  return (
    <div className="min-h-screen bg-gray-50">
      <Header onLogout={signOut} isAdmin={isAdmin} />
      <Routes>
        <Route path="/" element={
          <PrivateRoute>
            <Dashboard />
          </PrivateRoute>
        } />
        <Route path="/products/new" element={
          <PrivateRoute>
            <CreateProduct />
          </PrivateRoute>
        } />
        <Route path="/products/:id" element={
          <PrivateRoute>
            <ProductDetails />
          </PrivateRoute>
        } />
        <Route path="/settings" element={
          <PrivateRoute>
            <Settings />
          </PrivateRoute>
        } />
        {isAdmin && (
          <Route path="/admin/create-user" element={
            <PrivateRoute>
              <AdminCreateUser />
            </PrivateRoute>
          } />
        )}
        <Route path="/landing" element={<Navigate to="/" replace />} />
        <Route path="/create-user-public" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}