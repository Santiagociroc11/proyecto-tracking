import React, { useEffect } from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
}

export function Modal({ isOpen, onClose, children, className = '' }: ModalProps) {
  // Prevent body scrolling when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-black bg-opacity-50 transition-opacity" onClick={onClose} />
      <div className="flex min-h-full items-center justify-center p-2 sm:p-4">
        <div className={`relative transform overflow-hidden rounded-lg bg-white text-left shadow-xl transition-all sm:my-8 w-full max-w-[95vw] sm:max-w-[90vw] md:max-w-[80vw] lg:max-w-[70vw] ${className}`}>
          {children}
        </div>
      </div>
    </div>
  );
}