import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw, Home, ShieldAlert } from 'lucide-react';
import { ErrorNotifier } from "./lib/errorNotifier";

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught React error:", error, errorInfo);
    ErrorNotifier.notify(
      'خطأ في واجهة المستخدم',
      error.message || 'حدث خطأ غير متوقع أثناء عرض هذه الصفحة.',
      errorInfo.componentStack,
      'error',
      'واجهة التفاعلات'
    );
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 text-right dir-rtl">
          <div className="max-w-md w-full bg-slate-900 border border-rose-900/50 rounded-3xl p-6 shadow-2xl text-center flex flex-col items-center">
            <div className="w-16 h-16 rounded-3xl bg-rose-950/80 border border-rose-800 flex items-center justify-center text-rose-400 mb-4 shadow-lg shadow-rose-900/40">
              <AlertTriangle className="w-8 h-8 animate-bounce" />
            </div>

            <span className="text-xs font-black tracking-widest text-rose-400 uppercase bg-rose-950/60 border border-rose-800/80 px-3 py-1 rounded-full mb-2">
              تنبيه استثناء الواجهة
            </span>

            <h2 className="text-xl font-black text-white mb-2">
              عذراً، حدث خطأ أثناء تحميل الصفحة
            </h2>

            <p className="text-xs text-slate-300 font-bold bg-slate-950/70 p-3 rounded-2xl border border-slate-800 w-full mb-6 leading-relaxed dir-ltr text-left overflow-x-auto max-h-32">
              {this.state.error?.message || 'Unknown runtime render error'}
            </p>

            <div className="flex items-center gap-3 w-full">
              <button
                onClick={() => window.location.reload()}
                className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-extrabold text-xs rounded-xl flex items-center justify-center gap-2 transition shadow-lg shadow-rose-600/30 cursor-pointer"
              >
                <RefreshCw size={16} />
                تحديث الصفحة
              </button>
              
              <button
                onClick={() => window.location.href = '/'}
                className="py-3 px-4 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 font-extrabold text-xs rounded-xl flex items-center justify-center gap-2 transition cursor-pointer"
              >
                <Home size={16} />
                الرئيسية
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

