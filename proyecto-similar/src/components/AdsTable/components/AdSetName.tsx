import React from 'react';

interface AdSetNameProps {
  name: string;
  onClick?: () => void;
}

export function AdSetName({ name, onClick }: AdSetNameProps) {
  return (
    <div 
      className="max-w-[200px] cursor-pointer hover:text-indigo-600 transition-colors" 
      onClick={onClick}
    >
      <span className="font-medium text-gray-900 break-words whitespace-normal hover:text-indigo-600">{name}</span>
    </div>
  );
}