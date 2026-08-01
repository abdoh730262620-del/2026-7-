import React, { useState, useEffect } from 'react';
import { Sparkles, X } from 'lucide-react';
import { subscribeToCenterToast, ToastOptions } from '../lib/toastService';

export function CenterToastContainer() {
  const [currentToast, setCurrentToast] = useState<ToastOptions | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeToCenterToast((toast) => {
      setCurrentToast(toast);
      setVisible(true);

      const durationMs = typeof toast.duration === 'number' 
        ? toast.duration 
        : toast.duration === 'short' ? 2500 : 4000;

      const timer = setTimeout(() => {
        setVisible(false);
        setTimeout(() => setCurrentToast(null), 300);
      }, durationMs);

      return () => clearTimeout(timer);
    });

    return () => unsubscribe();
  }, []);

  if (!currentToast) return null;

  return (
    <div 
      className={`fixed inset-0 pointer-events-none z-[9999] flex items-center justify-center p-4 transition-all duration-300 ${
        visible ? 'opacity-100 scale-100' : 'opacity-0 scale-90'
      }`}
      dir="rtl"
    >
      <div className="pointer-events-auto bg-slate-900/90 dark:bg-slate-950/95 backdrop-blur-md text-white px-6 py-4 rounded-2xl shadow-2xl border border-slate-700/80 max-w-sm sm:max-w-md w-full flex items-center gap-3 text-center justify-between transition-transform transform">
        <div className="flex items-center gap-3 text-right">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shrink-0 shadow-md">
            <Sparkles className="w-5 h-5 text-amber-300 animate-spin-slow" />
          </div>
          <div>
            <p className="text-sm font-black text-white leading-snug">
              {currentToast.text}
            </p>
          </div>
        </div>

        <button 
          onClick={() => setVisible(false)}
          className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors shrink-0"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
