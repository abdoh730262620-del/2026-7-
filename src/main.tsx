import * as React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ThemeProvider } from './context/ThemeContext';
import ErrorBoundary from './ErrorBoundary';
import './index.css';

// System Runtime Early Logger & Exception Handler
console.log('[SystemInit] App main.tsx execution started at:', new Date().toISOString());

// Capture Global Unhandled Errors
window.addEventListener('error', (event) => {
  console.error('[RuntimeError] Global Window Error:', {
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
    error: event.error,
  });
});

// Capture Global Unhandled Promise Rejections
window.addEventListener('unhandledrejection', (event) => {
  console.error('[RuntimeError] Unhandled Promise Rejection:', {
    reason: event.reason,
  });
});

// Verify Local Storage & Memory Integrity prior to mounting React
try {
  const testKey = '__app_init_test__';
  localStorage.setItem(testKey, 'ok');
  localStorage.removeItem(testKey);
  console.log('[SystemInit] Storage integrity verified successfully.');
} catch (e) {
  console.warn('[SystemInit] LocalStorage unavailable or restricted:', e);
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  console.error('[CriticalError] Root element #root was not found in document!');
} else {
  try {
    console.log('[SystemInit] Mounting React DOM root...');
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
    console.log('[SystemInit] React DOM root mounted successfully.');
  } catch (err) {
    console.error('[CriticalError] Fatal error during React DOM root rendering:', err);
  }
}
