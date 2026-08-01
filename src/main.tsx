import * as React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ThemeProvider } from './context/ThemeContext';
import ErrorBoundary from './ErrorBoundary';
import './index.css';

// --- DIAGNOSTIC LOG LISTENER SYSTEM ---
type LogEntry = {
  id: number;
  time: string;
  type: 'error' | 'warn' | 'info';
  message: string;
  details?: string;
};

const diagnosticLogs: LogEntry[] = [];
let logCounter = 0;
let uiInitialized = false;

function addDiagnosticLog(type: 'error' | 'warn' | 'info', message: string, details?: string) {
  const entry: LogEntry = {
    id: ++logCounter,
    time: new Date().toLocaleTimeString(),
    type,
    message,
    details,
  };
  diagnosticLogs.push(entry);
  updateDiagnosticUI(entry);
}

// Override console.error and console.warn to capture diagnostics
const origError = console.error;
const origWarn = console.warn;

console.error = function (...args: any[]) {
  origError.apply(console, args);
  const msg = args.map(a => (typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a))).join(' ');
  addDiagnosticLog('error', msg);
};

console.warn = function (...args: any[]) {
  origWarn.apply(console, args);
  const msg = args.map(a => (typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a))).join(' ');
  addDiagnosticLog('warn', msg);
};

// Global window error listeners
window.addEventListener('error', (event) => {
  const details = event.error ? (event.error.stack || String(event.error)) : `${event.filename}:${event.lineno}:${event.colno}`;
  addDiagnosticLog('error', `[WindowError] ${event.message || 'Error occurred'}`, details);
});

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason ? (event.reason.stack || JSON.stringify(event.reason)) : 'Unhandled Promise Rejection';
  addDiagnosticLog('error', '[UnhandledRejection] Promise Rejected', String(reason));
});

// UI Container for Floating Diagnostics
let overlayElement: HTMLDivElement | null = null;
let toastElement: HTMLDivElement | null = null;

function renderDiagnosticDOM() {
  if (uiInitialized || typeof document === 'undefined') return;
  if (!document.body) {
    window.addEventListener('DOMContentLoaded', renderDiagnosticDOM);
    return;
  }
  uiInitialized = true;

  // 1. Toast Notification Container (Top)
  toastElement = document.createElement('div');
  toastElement.id = '__diagnostic_toast__';
  toastElement.style.cssText = `
    position: fixed;
    top: 12px;
    left: 12px;
    right: 12px;
    z-index: 999999;
    display: none;
    background: #1e1b4b;
    border: 1px solid #6366f1;
    color: #f8fafc;
    padding: 12px 16px;
    border-radius: 12px;
    box-shadow: 0 10px 25px -5px rgba(0,0,0,0.5);
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 13px;
    direction: rtl;
    text-align: right;
  `;
  document.body.appendChild(toastElement);

  // 2. Full Modal Logs Viewer (Overlay)
  overlayElement = document.createElement('div');
  overlayElement.id = '__diagnostic_overlay__';
  overlayElement.style.cssText = `
    position: fixed;
    inset: 0;
    z-index: 999998;
    background: rgba(15, 23, 42, 0.95);
    backdrop-filter: blur(8px);
    color: #f8fafc;
    display: none;
    flex-direction: column;
    padding: 16px;
    font-family: monospace;
    font-size: 12px;
    direction: ltr;
  `;

  overlayElement.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;border-bottom:1px solid #334155;padding-bottom:10px;direction:rtl">
      <div style="display:flex;align-items:center;gap:8px">
        <span style="background:#ef4444;color:#fff;font-size:11px;font-weight:bold;padding:2px 8px;border-radius:12px">تشخيص النظام</span>
        <span style="font-weight:bold;font-size:14px;color:#f8fafc">سجل أخطاء التطبيق (Logs)</span>
      </div>
      <div style="display:flex;gap:8px">
        <button id="__diag_copy_btn__" style="background:#2563eb;color:#fff;border:none;padding:6px 12px;border-radius:6px;font-size:12px;cursor:pointer">نسخ السجلات</button>
        <button id="__diag_clear_btn__" style="background:#475569;color:#fff;border:none;padding:6px 12px;border-radius:6px;font-size:12px;cursor:pointer">مسح</button>
        <button id="__diag_close_btn__" style="background:#dc2626;color:#fff;border:none;padding:6px 12px;border-radius:6px;font-size:12px;cursor:pointer">إغلاق</button>
      </div>
    </div>
    <div id="__diag_logs_container__" style="flex:1;overflow-y:auto;background:#090d16;padding:12px;border-radius:8px;border:1px solid #1e293b;white-space:pre-wrap;word-break:break-all"></div>
  `;
  document.body.appendChild(overlayElement);

  // Floating Trigger Button (Bottom Left)
  const triggerBtn = document.createElement('button');
  triggerBtn.id = '__diag_trigger_btn__';
  triggerBtn.style.cssText = `
    position: fixed;
    bottom: 16px;
    left: 16px;
    z-index: 999997;
    background: #1e293b;
    border: 1px solid #475569;
    color: #38bdf8;
    padding: 8px 12px;
    border-radius: 20px;
    font-size: 11px;
    font-weight: bold;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    display: flex;
    align-items: center;
    gap: 6px;
  `;
  triggerBtn.innerHTML = `🩺 التشخيص (<span id="__diag_count__">0</span>)`;
  triggerBtn.onclick = () => {
    if (overlayElement) {
      overlayElement.style.display = overlayElement.style.display === 'none' ? 'flex' : 'none';
      refreshLogsInDOM();
    }
  };
  document.body.appendChild(triggerBtn);

  // Setup button handlers
  document.getElementById('__diag_close_btn__')?.addEventListener('click', () => {
    if (overlayElement) overlayElement.style.display = 'none';
  });

  document.getElementById('__diag_clear_btn__')?.addEventListener('click', () => {
    diagnosticLogs.length = 0;
    refreshLogsInDOM();
    updateTriggerCount();
  });

  document.getElementById('__diag_copy_btn__')?.addEventListener('click', () => {
    const text = diagnosticLogs.map(l => `[${l.time}] [${l.type.toUpperCase()}] ${l.message}\n${l.details || ''}`).join('\n---\n');
    navigator.clipboard.writeText(text).then(() => {
      alert('تم نسخ السجلات بنجاح!');
    }).catch(() => {
      alert('تعذر النسخ تلقائياً. يمكنك تحديد النص ونسخه يدوياً.');
    });
  });

  refreshLogsInDOM();
}

function updateTriggerCount() {
  const countEl = document.getElementById('__diag_count__');
  if (countEl) {
    const errorCount = diagnosticLogs.filter(l => l.type === 'error').length;
    countEl.textContent = String(errorCount || diagnosticLogs.length);
    countEl.style.color = errorCount > 0 ? '#ef4444' : '#38bdf8';
  }
}

function refreshLogsInDOM() {
  const container = document.getElementById('__diag_logs_container__');
  if (!container) return;
  if (diagnosticLogs.length === 0) {
    container.innerHTML = '<span style="color:#64748b">لا توجد أخطاء مسجلة حتى الآن. التطبيق يعمل بشكل طبيعي.</span>';
    return;
  }
  container.innerHTML = diagnosticLogs.map(l => `
    <div style="margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid #1e293b">
      <span style="color:#94a3b8">[${l.time}]</span> 
      <span style="color:${l.type === 'error' ? '#f87171' : '#facc15'};font-weight:bold">[${l.type.toUpperCase()}]</span> 
      <span style="color:#f1f5f9">${escapeHtml(l.message)}</span>
      ${l.details ? `<pre style="margin-top:4px;color:#cbd5e1;font-size:11px;background:#0f172a;padding:6px;border-radius:4px;overflow-x:auto">${escapeHtml(l.details)}</pre>` : ''}
    </div>
  `).join('');
  container.scrollTop = container.scrollHeight;
}

function updateDiagnosticUI(entry: LogEntry) {
  if (typeof document === 'undefined') return;
  if (!uiInitialized) renderDiagnosticDOM();

  updateTriggerCount();

  // Show Toast if Error occurs
  if (entry.type === 'error' && toastElement) {
    toastElement.style.display = 'block';
    toastElement.style.borderColor = '#ef4444';
    toastElement.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
        <div style="flex:1">
          <div style="color:#f87171;font-weight:bold;margin-bottom:2px">⚠️ تنبيه تشخيص أخطاء التطبيق</div>
          <div style="font-size:12px;color:#e2e8f0;max-height:40px;overflow:hidden;text-overflow:ellipsis">${escapeHtml(entry.message)}</div>
        </div>
        <button id="__toast_view_btn__" style="background:#2563eb;color:#fff;border:none;padding:6px 12px;border-radius:6px;font-size:11px;cursor:pointer;white-space:nowrap">عرض التفاصيل</button>
      </div>
    `;
    document.getElementById('__toast_view_btn__')?.addEventListener('click', () => {
      toastElement!.style.display = 'none';
      if (overlayElement) {
        overlayElement.style.display = 'flex';
        refreshLogsInDOM();
      }
    });

    // Auto dismiss toast after 8s
    setTimeout(() => {
      if (toastElement) toastElement.style.display = 'none';
    }, 8000);
  }

  if (overlayElement && overlayElement.style.display !== 'none') {
    refreshLogsInDOM();
  }
}

function escapeHtml(str: string) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Ensure DOM overlay is ready as early as possible
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderDiagnosticDOM);
  } else {
    renderDiagnosticDOM();
  }
}

addDiagnosticLog('info', 'بدء تشغيل وحدة التشخيص وتتبع الأخطاء.');

// Verify Local Storage & Memory Integrity prior to mounting React
try {
  const testKey = '__app_init_test__';
  localStorage.setItem(testKey, 'ok');
  localStorage.removeItem(testKey);
  addDiagnosticLog('info', 'اختبار سلامة التخزين المحلي (LocalStorage) تم بنجاح.');
} catch (e: any) {
  addDiagnosticLog('warn', 'التخزين المحلي غير متاح أو مقيد:', String(e));
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  addDiagnosticLog('error', 'العنصر الرئيسي #root غير موجود في الصفحة!');
} else {
  try {
    addDiagnosticLog('info', 'جاري تحميل واجهة React...');
    const root = createRoot(rootElement);
    root.render(
      <React.StrictMode>
        <ErrorBoundary>
          <ThemeProvider>
            <App />
          </ThemeProvider>
        </ErrorBoundary>
      </React.StrictMode>
    );
    addDiagnosticLog('info', 'تم تحميل واجهة React بنجاح.');
  } catch (err: any) {
    addDiagnosticLog('error', 'خطأ أثناء تحميل React DOM root:', String(err?.stack || err));
  }
}

