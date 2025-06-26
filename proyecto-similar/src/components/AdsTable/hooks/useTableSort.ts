import { useState, useCallback } from 'react';
import { SortConfig, SortField } from '../types';

export function useTableSort(initialConfig: SortConfig) {
  const [sortConfig, setSortConfig] = useState<SortConfig>(initialConfig);

  const handleSort = useCallback((field: SortField) => {
    setSortConfig(current => {
      if (field === current.primary.field) {
        return {
          ...current,
          primary: {
            field,
            direction: current.primary.direction === 'asc' ? 'desc' : 'asc'
          }
        };
      }
      
      return {
        primary: {
          field,
          direction: 'desc'
        },
        secondary: current.primary
      };
    });
  }, []);

  return { sortConfig, handleSort };
}