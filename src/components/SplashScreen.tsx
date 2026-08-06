import React from 'react';
import { Sparkles, ShieldCheck, RefreshCw, AlertTriangle, Database } from 'lucide-react';

interface SplashScreenProps {
  statusMessage?: string;
  progress?: number;
  error?: string | null;
  onRetry?: () => void;
  onClearStorage?: () => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({
  statusMessage = 'جاري تهيئة الذاكرة وقواعد البيانات...',
  progress = 60,
  error = null,
  onRetry,
  onClearStorage,
}) => {
  return (
    <div className="fixed inset-0 z-[9999] bg-white text-slate-800 flex flex-col items-center justify-between p-6 dir-rtl select-none font-sans">
      {/* Background Decorative Glow using the Theme Color */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-[var(--theme-primary)]/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/2 -translate-x-1/2 translate-y-1/2 w-96 h-96 bg-[var(--theme-primary)]/5 rounded-full blur-3xl pointer-events-none" />

      {/* Top Header */}
      <div className="w-full flex items-center justify-between max-w-md pt-4 opacity-80">
        <div className="flex items-center gap-2">
          <ShieldCheck size={18} className="text-emerald-600" />
          <span className="text-xs font-black tracking-wider text-slate-700">نظام المبيعات الذكي</span>
        </div>
        <span className="text-[10px] font-mono text-slate-500 font-bold bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-full">
          v1.0.0
        </span>
      </div>

      {/* Main Center Content */}
      <div className="w-full max-w-sm flex flex-col items-center text-center my-auto space-y-6 z-10">
        {/* Animated App Icon Logo with dynamic theme style */}
        <div className="relative">
          <div className="w-24 h-24 rounded-3xl bg-[var(--theme-primary)] p-0.5 shadow-2xl shadow-[var(--theme-primary)]/20 animate-pulse">
            <div className="w-full h-full bg-white rounded-[22px] flex items-center justify-center">
              <Sparkles className="w-12 h-12 text-[var(--theme-primary)] animate-spin-slow" />
            </div>
          </div>
          <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-xl bg-emerald-500 border-2 border-white flex items-center justify-center text-white font-black shadow-md">
            <Database size={16} />
          </div>
        </div>

        {/* Title */}
        <div className="space-y-1.5">
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">نظام إدارة المبيعات والحسابات</h1>
          <p className="text-xs font-bold text-slate-500">تهيئة بيئة التشغيل والتخزين المحلي</p>
        </div>

        {/* Status / Progress or Error Box */}
        {error ? (
          <div className="w-full bg-rose-50 border border-rose-200 rounded-2xl p-4 text-right space-y-3 animate-in fade-in duration-300">
            <div className="flex items-center gap-2 text-rose-600 font-black text-xs">
              <AlertTriangle size={18} className="shrink-0" />
              <span>فشل في مرحلة البدء والتهيئة</span>
            </div>
            <p className="text-[11px] font-mono text-rose-700 dir-ltr text-left overflow-x-auto bg-white p-2.5 rounded-xl border border-rose-100 max-h-24 leading-relaxed">
              {error}
            </p>
            <div className="flex items-center gap-2 pt-1">
              {onRetry && (
                <button
                  onClick={onRetry}
                  className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-black text-xs rounded-xl flex items-center justify-center gap-1.5 transition shadow-lg shadow-rose-600/30"
                >
                  <RefreshCw size={14} />
                  <span>إعادة المحاولة</span>
                </button>
              )}
              {onClearStorage && (
                <button
                  onClick={onClearStorage}
                  className="px-3 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition"
                >
                  تنظيف الجلسة
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="w-full space-y-3">
            {/* Progress Bar */}
            <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden border border-slate-200 p-0.5">
              <div
                className="bg-[var(--theme-primary)] h-full rounded-full transition-all duration-300 ease-out"
                style={{ width: `${Math.min(100, Math.max(10, progress))}%` }}
              />
            </div>

            {/* Status Message */}
            <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 px-1">
              <span className="flex items-center gap-1.5 text-[var(--theme-primary)]">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--theme-primary)] animate-ping" />
                {statusMessage}
              </span>
              <span className="font-mono text-slate-600">{progress}%</span>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Footer */}
      <div className="w-full text-center pb-2">
        <p className="text-[10px] font-bold text-slate-400">آمن ومحمي بنظام التشفير والتخزين السحابي</p>
      </div>
    </div>
  );
};
