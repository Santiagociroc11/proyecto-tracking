export const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2
  }).format(value);
};

export const formatNumber = (value: number) => {
  return new Intl.NumberFormat('es-ES').format(value);
};