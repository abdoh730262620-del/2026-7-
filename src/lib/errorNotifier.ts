import { logUserAction } from './logger';

export interface GlobalAppError {
  id: string;
  title: string;
  message: string;
  errorDetails?: string | null;
  timestamp: number;
  iconType?: 'error' | 'warning' | 'network' | 'firebase';
  source?: string;
}

type ErrorListener = (currentError: GlobalAppError | null, allErrors: GlobalAppError[]) => void;

class ErrorNotifier {
  private static errors: GlobalAppError[] = [];
  private static currentError: GlobalAppError | null = null;
  private static listeners: Set<ErrorListener> = new Set();

  /**
   * Triggers a global error modal notification with icon support.
   */
  public static notify(
    title: string,
    message: string,
    details?: unknown,
    iconType: 'error' | 'warning' | 'network' | 'firebase' = 'error',
    source?: string
  ) {
    let errorDetails: string | null = null;
    if (details) {
      if (details instanceof Error) {
        errorDetails = `${details.message}\n${details.stack || ''}`;
      } else if (typeof details === 'object') {
        try {
          errorDetails = JSON.stringify(details, null, 2);
        } catch {
          errorDetails = String(details);
        }
      } else {
        errorDetails = String(details);
      }
    }

    const newError: GlobalAppError = {
      id: `err_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      title,
      message,
      errorDetails,
      timestamp: Date.now(),
      iconType,
      source
    };

    // Prevent duplicate flooding of the exact same message within 2 seconds
    if (this.currentError && this.currentError.message === message && (Date.now() - this.currentError.timestamp) < 2000) {
      return;
    }

    this.errors.unshift(newError);
    if (this.errors.length > 25) {
      this.errors.pop();
    }

    this.currentError = newError;
    this.emitChange();

    // Log to action logs for tracking
    try {
      logUserAction('نظام التنبيهات', `خطأ في التطبيق: [${title}] ${message}`);
    } catch {
      // Ignore logging failure
    }
  }

  public static clearCurrent() {
    this.currentError = null;
    this.emitChange();
  }

  public static clearAll() {
    this.errors = [];
    this.currentError = null;
    this.emitChange();
  }

  public static getCurrentError(): GlobalAppError | null {
    return this.currentError;
  }

  public static getAllErrors(): GlobalAppError[] {
    return [...this.errors];
  }

  public static subscribe(listener: ErrorListener): () => void {
    this.listeners.add(listener);
    listener(this.currentError, this.errors);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private static emitChange() {
    this.listeners.forEach(fn => {
      try {
        fn(this.currentError, this.errors);
      } catch (e) {
        console.error("Error in error notifier listener:", e);
      }
    });
  }
}

// Attach global browser window error listeners
if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    // Ignore benign browser/Vite resize observer or extension noise
    if (
      event.message && 
      !event.message.includes('ResizeObserver') && 
      !event.message.includes('vite: WebSocket')
    ) {
      ErrorNotifier.notify(
        'خطأ في النظام (Uncaught Exception)',
        event.message || 'حدث خطأ مفاجئ أثناء تشغيل التطبيق.',
        event.error || event.filename,
        'error',
        'نافذة المتصفح'
      );
    }
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const msg = reason instanceof Error ? reason.message : typeof reason === 'string' ? reason : 'حدث خطأ في عملية خلفية غير معالجة';
    
    // Ignore background websocket errors
    if (typeof msg === 'string' && (msg.includes('WebSocket') || msg.includes('vite'))) {
      return;
    }

    ErrorNotifier.notify(
      'خطأ في معالجة العملية (Promise Rejection)',
      msg,
      reason,
      'warning',
      'عملية خلفية'
    );
  });
}

export { ErrorNotifier };
