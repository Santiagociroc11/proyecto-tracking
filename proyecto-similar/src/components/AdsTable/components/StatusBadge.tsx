import React from 'react';

const statusColors = {
  'ACTIVE': 'bg-green-100 text-green-800',
  'PAUSED': 'bg-yellow-100 text-yellow-800',
  'UNKNOWN': 'bg-gray-100 text-gray-800'
} as const;

const statusText = {
  'ACTIVE': 'Activo',
  'PAUSED': 'Pausado',
  'UNKNOWN': 'Desconocido'
} as const;

type Status = keyof typeof statusColors;

interface StatusBadgeProps {
  status: Status;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[status] || statusColors.UNKNOWN}`}>
      {statusText[status] || statusText.UNKNOWN}
    </span>
  );
}