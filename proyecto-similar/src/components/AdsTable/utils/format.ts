import React from 'react';

export function truncateAdSetName(name: string): { display: string; tooltip: string } {
  const cleanName = name.trim();
  if (cleanName.length <= 10) return { display: cleanName, tooltip: cleanName };
  
  const start = cleanName.slice(0, 8);
  const end = cleanName.slice(-6);
  
  return {
    display: `${start} ... ${end}`,
    tooltip: cleanName
  };
}