import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import CreateProduct from './pages/CreateProduct';
import ProductDetails from './pages/ProductDetails';
import Settings from './pages/Settings';
import PrivateRoute from './components/PrivateRoute';
import Header from './components/Header';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <div className="min-h-screen bg-gray-50">
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/dashboard" element={
              <PrivateRoute>
                <>
                  <Header />
                  <Dashboard />
                </>
              </PrivateRoute>
            } />
            <Route path="/products/new" element={
              <PrivateRoute>
                <>
                  <Header />
                  <CreateProduct />
                </>
              </PrivateRoute>
            } />
            <Route path="/products/:id" element={
              <PrivateRoute>
                <>
                  <Header />
                  <ProductDetails />
                </>
              </PrivateRoute>
            } />
            <Route path="/settings" element={
              <PrivateRoute>
                <>
                  <Header />
                  <Settings />
                </>
              </PrivateRoute>
            } />
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </div>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App