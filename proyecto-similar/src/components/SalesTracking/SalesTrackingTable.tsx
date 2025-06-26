import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { PlusCircle, Trash2, Check, X } from 'lucide-react';

interface TrackedSale {
  id: string;
  whatsapp: string;
  purchase_date: string;
  purchase_time: string;
  campaign: string;
  ad_set: string;
  ad: string;
  ad_id: string;
  api_verified: boolean;
}

export function SalesTrackingTable() {
  const [sales, setSales] = useState<TrackedSale[]>([]);
  const [loading, setLoading] = useState(true);
  const [newSale, setNewSale] = useState<Partial<TrackedSale>>({
    whatsapp: '',
    purchase_date: new Date().toISOString().split('T')[0],
    purchase_time: new Date().toTimeString().split(' ')[0],
    campaign: 'NO REF',
    ad_set: 'NO REF',
    ad: 'NO REF',
    ad_id: 'NO REF',
  });

  const fetchSales = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('tracked_sales')
        .select('*')
        .order('purchase_date', { ascending: false })
        .order('purchase_time', { ascending: false });

      if (error) throw error;
      setSales(data || []);
    } catch (error) {
      console.error('Error fetching sales:', error);
      alert('Error al cargar las ventas');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSales();
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setNewSale(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { error } = await supabase
        .from('tracked_sales')
        .insert([newSale]);

      if (error) throw error;

      setNewSale({
        whatsapp: '',
        purchase_date: new Date().toISOString().split('T')[0],
        purchase_time: new Date().toTimeString().split(' ')[0],
        campaign: 'NO REF',
        ad_set: 'NO REF',
        ad: 'NO REF',
        ad_id: 'NO REF',
      });

      fetchSales();
    } catch (error) {
      console.error('Error adding sale:', error);
      alert('Error al agregar la venta');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Estás seguro de que deseas eliminar esta venta?')) return;

    try {
      const { error } = await supabase
        .from('tracked_sales')
        .delete()
        .eq('id', id);

      if (error) throw error;
      fetchSales();
    } catch (error) {
      console.error('Error deleting sale:', error);
      alert('Error al eliminar la venta');
    }
  };

  return (
    <div className="bg-white shadow-sm rounded-lg overflow-hidden">
      <div className="px-4 py-5 sm:px-6">
        <h2 className="text-lg font-medium text-gray-900">Seguimiento de Ventas</h2>
      </div>

      <form onSubmit={handleSubmit} className="border-t border-gray-200 px-4 py-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">WhatsApp</label>
            <input
              type="text"
              name="whatsapp"
              value={newSale.whatsapp}
              onChange={handleInputChange}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Fecha</label>
            <input
              type="date"
              name="purchase_date"
              value={newSale.purchase_date}
              onChange={handleInputChange}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Hora</label>
            <input
              type="time"
              name="purchase_time"
              value={newSale.purchase_time}
              onChange={handleInputChange}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Campaña</label>
            <input
              type="text"
              name="campaign"
              value={newSale.campaign}
              onChange={handleInputChange}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Conjunto</label>
            <input
              type="text"
              name="ad_set"
              value={newSale.ad_set}
              onChange={handleInputChange}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Anuncio</label>
            <input
              type="text"
              name="ad"
              value={newSale.ad}
              onChange={handleInputChange}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">ID del Anuncio</label>
            <input
              type="text"
              name="ad_id"
              value={newSale.ad_id}
              onChange={handleInputChange}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            />
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              className="w-full bg-indigo-600 text-white py-2 px-4 rounded-md hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2"
            >
              <PlusCircle className="h-5 w-5" />
              Agregar Venta
            </button>
          </div>
        </div>
      </form>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">WhatsApp</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fecha</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Hora</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Campaña</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Conjunto</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Anuncio</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID Anuncio</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">API</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {loading ? (
              <tr>
                <td colSpan={9} className="px-6 py-4 text-center">Cargando...</td>
              </tr>
            ) : (
              sales.map((sale) => (
                <tr key={sale.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{sale.whatsapp}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{sale.purchase_date}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{sale.purchase_time}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{sale.campaign}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{sale.ad_set}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{sale.ad}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{sale.ad_id}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {sale.api_verified ? (
                      <Check className="h-5 w-5 text-green-500" />
                    ) : (
                      <X className="h-5 w-5 text-red-500" />
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <button
                      onClick={() => handleDelete(sale.id)}
                      className="text-red-600 hover:text-red-900"
                    >
                      <Trash2 className="h-5 w-5" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}