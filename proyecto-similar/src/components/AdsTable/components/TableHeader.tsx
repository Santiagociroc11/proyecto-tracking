import React from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { SortField, SortConfig } from '../types';

interface TableHeaderProps {
  children: React.ReactNode;
  field: SortField;
  sortConfig: SortConfig;
  onSort: (field: SortField) => void;
}

export function TableHeader({ children, field, sortConfig, onSort }: TableHeaderProps) {
  const SortIcon = () => {
    if (sortConfig.primary.field === field) {
      return sortConfig.primary.direction === 'asc' 
        ? <ChevronUp className="w-4 h-4" />
        : <ChevronDown className="w-4 h-4" />;
    }
    if (sortConfig.secondary?.field === field) {
      return sortConfig.secondary.direction === 'asc'
        ? <ChevronUp className="w-4 h-4 opacity-50" />
        : <ChevronDown className="w-4 h-4 opacity-50" />;
    }
    return null;
  };

  return (
    <th
      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
      onClick={() => onSort(field)}
    >
      <div className="flex items-center gap-1">
        {children}
        <SortIcon />
      </div>
    </th>
  );
}