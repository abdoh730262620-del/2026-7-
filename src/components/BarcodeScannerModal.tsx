import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Camera, X, Flashlight, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface BarcodeScannerModalProps {
    isOpen: boolean;
    onClose: () => void;
    onScan: (barcode: string) => void;
    title?: string;
    subtitle?: string;
}

export const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({
    isOpen,
    onClose,
    onScan,
    title = 'قارئ الباركود بالنظام البصري',
    subtitle = 'وجه كاميرا الجهاز نحو الباركود أو رمز QR لإدخال المنتج تلقائياً'
}) => {
    const [scannerError, setScannerError] = useState<string | null>(null);
    const [lastScanned, setLastScanned] = useState<string | null>(null);
    const [manualCode, setManualCode] = useState('');
    const [isTorchOn, setIsTorchOn] = useState(false);
    const [cameras, setCameras] = useState<Array<{ id: string; label: string }>>([]);
    const [selectedCameraId, setSelectedCameraId] = useState<string>('');
    const [isScanningActive, setIsScanningActive] = useState(false);
    const [continuousMode, setContinuousMode] = useState(true);

    const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
    const scannerDivId = 'html5-barcode-scanner-viewport';

    // Beep sound effect synthesizer using Web Audio API (works 100% offline!)
    const playScanBeep = () => {
        try {
            const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
            if (!AudioContext) return;
            const ctx = new AudioContext();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.type = 'sine';
            osc.frequency.setValueAtTime(1200, ctx.currentTime);
            gain.gain.setValueAtTime(0.3, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.15);

            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.15);
        } catch (e) {
            console.log('Audio beep notice:', e);
        }

        if (navigator.vibrate) {
            navigator.vibrate(100);
        }
    };

    const stopScanner = async () => {
        if (html5QrCodeRef.current) {
            try {
                if (html5QrCodeRef.current.isScanning) {
                    await html5QrCodeRef.current.stop();
                }
                html5QrCodeRef.current.clear();
            } catch (err) {
                console.warn('Error stopping QR scanner:', err);
            } finally {
                html5QrCodeRef.current = null;
                setIsScanningActive(false);
                setIsTorchOn(false);
            }
        }
    };

    const startScanner = async (cameraId?: string) => {
        await stopScanner();
        setScannerError(null);

        try {
            // Get available camera devices
            const devices = await Html5Qrcode.getCameras();
            if (!devices || devices.length === 0) {
                setScannerError('لم يتم العثور على أي كاميرا متصلة بالجهاز.');
                return;
            }
            setCameras(devices.map(d => ({ id: d.id, label: d.label || `كاميرا ${d.id}` })));

            const targetCamera = cameraId || selectedCameraId || devices[devices.length - 1].id;
            setSelectedCameraId(targetCamera);

            const html5QrCode = new Html5Qrcode(scannerDivId);
            html5QrCodeRef.current = html5QrCode;

            const config = {
                fps: 15,
                qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
                    const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
                    return {
                        width: Math.floor(minEdge * 0.85),
                        height: Math.floor(minEdge * 0.55)
                    };
                },
                aspectRatio: 1.333333
            };

            await html5QrCode.start(
                targetCamera ? { deviceId: { exact: targetCamera } } : { facingMode: 'environment' },
                config,
                (decodedText) => {
                    if (!decodedText) return;
                    playScanBeep();
                    setLastScanned(decodedText);
                    onScan(decodedText.trim());

                    if (!continuousMode) {
                        onClose();
                    } else {
                        // Flash effect on UI
                        setTimeout(() => setLastScanned(null), 1800);
                    }
                },
                () => {
                    // Ignore transient scanning frame read failures
                }
            );

            setIsScanningActive(true);
        } catch (err: any) {
            console.error('Camera Scanner start error:', err);
            setScannerError('تعذر الوصول للكاميرا. يرجى التاكد من منح الإذن لاستخدام الكاميرا.');
            setIsScanningActive(false);
        }
    };

    const toggleTorch = async () => {
        if (!html5QrCodeRef.current || !isScanningActive) return;
        try {
            const newTorchState = !isTorchOn;
            await html5QrCodeRef.current.applyVideoConstraints({
                advanced: [{ torch: newTorchState } as any]
            });
            setIsTorchOn(newTorchState);
        } catch (err) {
            console.warn('Torch toggle not supported on this device camera', err);
        }
    };

    const handleSwitchCamera = () => {
        if (cameras.length <= 1) return;
        const currentIndex = cameras.findIndex(c => c.id === selectedCameraId);
        const nextIndex = (currentIndex + 1) % cameras.length;
        const nextCam = cameras[nextIndex].id;
        setSelectedCameraId(nextCam);
        startScanner(nextCam);
    };

    const handleManualSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!manualCode.trim()) return;
        playScanBeep();
        onScan(manualCode.trim());
        setLastScanned(manualCode.trim());
        setManualCode('');
        if (!continuousMode) {
            onClose();
        } else {
            setTimeout(() => setLastScanned(null), 1800);
        }
    };

    useEffect(() => {
        if (isOpen) {
            // Small timeout to allow DOM element to render properly
            const timer = setTimeout(() => {
                startScanner();
            }, 250);
            return () => {
                clearTimeout(timer);
                stopScanner();
            };
        } else {
            stopScanner();
        }
    }, [isOpen]);

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 text-right">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800 flex flex-col max-h-[92vh]"
                >
                    {/* Header */}
                    <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-2xl bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold">
                                <Camera className="w-5 h-5" />
                            </div>
                            <div>
                                <h3 className="font-extrabold text-base text-slate-800 dark:text-slate-100">
                                    {title}
                                </h3>
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                    {subtitle}
                                </p>
                            </div>
                        </div>

                        <button
                            onClick={onClose}
                            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-700/50 rounded-full transition"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Content */}
                    <div className="p-4 sm:p-5 flex-1 overflow-y-auto space-y-4">
                        {/* Camera Box */}
                        <div className="relative rounded-2xl overflow-hidden bg-slate-950 border-2 border-slate-200 dark:border-slate-800 aspect-video flex items-center justify-center shadow-inner">
                            <div id={scannerDivId} className="w-full h-full object-cover"></div>

                            {/* Scan Frame Overlay overlay graphic */}
                            {isScanningActive && (
                                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                                    <div className="w-64 h-36 border-2 border-indigo-400/70 rounded-xl relative shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]">
                                        <div className="absolute top-0 left-0 w-4 h-4 border-t-4 border-l-4 border-indigo-500 -mt-1 -ml-1 rounded-tl"></div>
                                        <div className="absolute top-0 right-0 w-4 h-4 border-t-4 border-r-4 border-indigo-500 -mt-1 -mr-1 rounded-tr"></div>
                                        <div className="absolute bottom-0 left-0 w-4 h-4 border-b-4 border-l-4 border-indigo-500 -mb-1 -ml-1 rounded-bl"></div>
                                        <div className="absolute bottom-0 right-0 w-4 h-4 border-b-4 border-r-4 border-indigo-500 -mb-1 -mr-1 rounded-br"></div>
                                        <div className="absolute inset-x-2 top-1/2 h-0.5 bg-red-500/80 shadow-[0_0_8px_#ef4444] animate-pulse"></div>
                                    </div>
                                </div>
                            )}

                            {/* Camera Action Buttons */}
                            {isScanningActive && (
                                <div className="absolute top-3 right-3 flex items-center gap-2 z-10">
                                    <button
                                        type="button"
                                        onClick={toggleTorch}
                                        className={`p-2.5 rounded-xl backdrop-blur-md transition shadow-md ${
                                            isTorchOn 
                                                ? 'bg-amber-500 text-white' 
                                                : 'bg-black/50 text-white/80 hover:bg-black/70 hover:text-white'
                                        }`}
                                        title="الفلاش"
                                    >
                                        <Flashlight className="w-4 h-4" />
                                    </button>

                                    {cameras.length > 1 && (
                                        <button
                                            type="button"
                                            onClick={handleSwitchCamera}
                                            className="p-2.5 rounded-xl bg-black/50 backdrop-blur-md text-white/80 hover:bg-black/70 hover:text-white transition shadow-md"
                                            title="تبديل الكاميرا"
                                        >
                                            <RefreshCw className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                            )}

                            {/* Scanner Error */}
                            {scannerError && (
                                <div className="absolute inset-0 bg-slate-900/90 p-6 flex flex-col items-center justify-center text-center space-y-3 z-20">
                                    <AlertCircle className="w-10 h-10 text-amber-500" />
                                    <p className="text-sm text-slate-300 font-bold max-w-xs">{scannerError}</p>
                                    <button
                                        onClick={() => startScanner()}
                                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl transition shadow"
                                    >
                                        إعادة محاولة الاتصال بالكاميرا
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Last Scanned Banner */}
                        {lastScanned && (
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 p-3 rounded-2xl flex items-center justify-between text-emerald-800 dark:text-emerald-300"
                            >
                                <div className="flex items-center gap-2">
                                    <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                                    <div className="text-xs">
                                        <span className="font-bold block">تم المسح بنجاح:</span>
                                        <span className="font-mono text-sm tracking-wider font-extrabold">{lastScanned}</span>
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {/* Settings & Manual Barcode Entry */}
                        <div className="bg-slate-50 dark:bg-slate-800/40 p-3.5 rounded-2xl border border-slate-100 dark:border-slate-800 space-y-3">
                            <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300">
                                <span className="font-bold">المسح المستمر (إضافة عدة أصناف):</span>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={continuousMode}
                                        onChange={(e) => setContinuousMode(e.target.checked)}
                                        className="sr-only peer"
                                    />
                                    <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:right-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-slate-600 peer-checked:bg-indigo-600"></div>
                                </label>
                            </div>

                            <form onSubmit={handleManualSubmit} className="flex gap-2">
                                <input
                                    type="text"
                                    value={manualCode}
                                    onChange={(e) => setManualCode(e.target.value)}
                                    placeholder="أو ادخل رقم الباركود يدوياً..."
                                    className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-3 py-2 rounded-xl text-xs font-mono outline-none focus:border-indigo-500 dark:text-slate-100"
                                />
                                <button
                                    type="submit"
                                    className="bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 text-white px-4 py-2 rounded-xl text-xs font-bold transition shrink-0"
                                >
                                    إضافة
                                </button>
                            </form>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex justify-end">
                        <button
                            type="button"
                            onClick={onClose}
                            className="w-full sm:w-auto px-6 py-2.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 rounded-xl text-xs font-extrabold transition"
                        >
                            إغلاق
                        </button>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};
