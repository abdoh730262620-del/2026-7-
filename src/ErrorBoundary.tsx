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

  private handleHardRefresh = async () => {
    try {
      const { clearFirestoreCache } = await import("./lib/firebase");
      await clearFirestoreCache();
    } catch (e) {
      console.warn("Failed to clear firestore cache during hard refresh:", e);
    }
    
    // Clear other common stores
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch (e) {}
    
    window.location.reload();
  };

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

            <p className="text-xs text-slate-300 font-bold bg-slate-950/70 p-3 rounded-2xl border border-slate-800 w-full mb-4 leading-relaxed dir-ltr text-left overflow-x-auto max-h-32">
              {this.state.error?.message || 'Unknown runtime render error'}
            </p>

            <div className="flex flex-col gap-3 w-full">
              <button
                onClick={() => window.location.reload()}
                className="w-full py-3 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-extrabold text-xs rounded-xl flex items-center justify-center gap-2 transition shadow-lg shadow-rose-600/30 cursor-pointer"
              >
                <RefreshCw size={16} />
                تحديث الصفحة
              </button>

              <button
                onClick={this.handleHardRefresh}
                className="w-full py-3 bg-slate-800 hover:bg-slate-700 active:scale-95 text-rose-400 font-extrabold text-xs rounded-xl flex items-center justify-center gap-2 transition border border-rose-900/30 cursor-pointer"
              >
                <ShieldAlert size={16} />
                مسح التخزين المؤقت وإعادة التحميل القسري
              </button>
              
              <button
                onClick={() => window.location.href = '/'}
                className="w-full py-3 px-4 bg-slate-900 hover:bg-slate-800 active:scale-95 text-slate-400 font-extrabold text-xs rounded-xl flex items-center justify-center gap-2 transition border border-slate-800 cursor-pointer"
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

