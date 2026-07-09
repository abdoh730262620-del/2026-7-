import React, { useState, useEffect } from 'react';
import { X, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface ReturnInvoiceModalProps {
    isOpen: boolean;
    onClose: () => void;
    invoice: any;
    onConfirmFullReturn: () => void;
    onConfirmPartialReturn: (returnedItems: any[]) => void;
    type?: string;
}

export default function ReturnInvoiceModal({ isOpen, onClose, invoice, onConfirmFullReturn, onConfirmPartialReturn, type }: ReturnInvoiceModalProps) {
    const [mode, setMode] = useState<'select' | 'partial'>('select');
    const [returnQuantities, setReturnQuantities] = useState<Record<number, number>>({});

    useEffect(() => {
        if (isOpen && invoice) {
             setMode('select');
             const initialQs: Record<number, number> = {};
             (invoice.items || []).forEach((_: any, idx: number) => {
                  initialQs[idx] = 0;
             });
             setReturnQuantities(initialQs);
        }
    }, [isOpen, invoice]);

    if (!isOpen || !invoice) return null;

    const handleQuantityChange = (index: number, quantity: string, maxQuantity: number) => {
        let val = Number(quantity);
        if (val < 0) val = 0;
        if (val > maxQuantity) val = maxQuantity;
        setReturnQuantities(prev => ({ ...prev, [index]: val }));
    };

    const handleConfirmPartial = () => {
        const returnedItems = invoice.items.map((item: any, idx: number) => {
            return {
                ...item,
                returnedQuantity: returnQuantities[idx] || 0
            };
        }).filter((item: any) => item.returnedQuantity > 0);

        if (returnedItems.length === 0) {
            alert('يجب تحديد كمية استرجاع لمنتج واحد على الأقل.');
            return;
        }

        onConfirmPartialReturn(returnedItems);
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.95, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 10 }}
                        className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-lg overflow-hidden border border-gray-100 dark:border-slate-800 shadow-2xl"
                        dir="rtl"
                    >
                        <div className="p-5 flex justify-between items-center border-b border-gray-100 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-900/50">
                            <h2 className="text-xl font-bold text-black dark:text-white">خيارات الاسترجاع</h2>
                            <button onClick={onClose} className="p-2 hover:bg-gray-200 dark:hover:bg-slate-800 rounded-full transition-colors cursor-pointer">
                                <X size={20} className="text-gray-500" />
                            </button>
                        </div>

                        <div className="p-6">
                            {mode === 'select' ? (
                                <div className="space-y-4">
                                    <p className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-4">
                                        كيف تود استرجاع الفاتورة رقم <span className="font-mono text-black dark:text-white bg-gray-100 dark:bg-slate-800 px-2 py-0.5 rounded">{invoice.invoiceNumber}</span>؟
                                    </p>
                                    <button 
                                        onClick={() => onConfirmFullReturn()}
                                        className="w-full p-4 border-2 border-rose-100 dark:border-rose-900/30 hover:border-rose-500 dark:hover:border-rose-500 bg-rose-50/50 dark:bg-rose-900/10 rounded-2xl flex flex-col items-center justify-center gap-2 transition-all cursor-pointer shadow-sm hover:shadow-md"
                                    >
                                        <span className="font-bold text-rose-700 dark:text-rose-400 text-lg">استرجاع الفاتورة كاملة</span>
                                        <span className="text-xs text-rose-600/70 dark:text-rose-400/90 font-medium">سيتم استرجاع جميع الأصناف والمبالغ المدفوعة</span>
                                    </button>
                                    <button 
                                        onClick={() => setMode('partial')}
                                        className="w-full p-4 border-2 border-indigo-100 dark:border-indigo-900/30 hover:border-indigo-500 dark:hover:border-indigo-500 bg-indigo-50/50 dark:bg-indigo-900/10 rounded-2xl flex flex-col items-center justify-center gap-2 transition-all cursor-pointer shadow-sm hover:shadow-md"
                                    >
                                        <span className="font-bold text-indigo-700 dark:text-indigo-400 text-lg">استرجاع منتج محدد (جزء من الفاتورة)</span>
                                        <span className="text-xs text-indigo-600/70 dark:text-indigo-400/90 font-medium">تحديد المنتجات المرتجعة والكميات المطلوبة</span>
                                    </button>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-100 dark:border-slate-800">
                                         <h3 className="font-bold text-sm text-black dark:text-white">اختر المنتجات والكمية المرتجعة:</h3>
                                         <button onClick={() => setMode('select')} className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 cursor-pointer">العودة للخيارات</button>
                                    </div>
                                    <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-2 custom-scrollbar pb-2">
                                        {invoice.items.map((item: any, idx: number) => (
                                            <div key={idx} className="p-3 border border-gray-200 dark:border-slate-800 rounded-xl bg-gray-50/50 dark:bg-slate-800/30 flex items-center justify-between gap-4">
                                                <div className="flex-1">
                                                    <div className="font-bold text-sm text-black dark:text-white line-clamp-2 leading-tight">
                                                        {item.name}
                                                    </div>
                                                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1.5 flex items-center gap-2">
                                                        <span>الكمية: <b className="font-mono text-black dark:text-white">{item.quantity}</b></span>
                                                        <span className="text-gray-300 dark:text-slate-600">|</span>
                                                        <span>السعر: <b className="font-mono text-black dark:text-white">{item.price}</b></span>
                                                    </div>
                                                </div>
                                                <div className="w-24 shrink-0">
                                                    <label className="block text-[10px] font-bold text-gray-500 mb-1 text-center">الكمية المرتجعة</label>
                                                    <input 
                                                        type="number" 
                                                        min="0"
                                                        max={item.quantity}
                                                        value={returnQuantities[idx] || ''}
                                                        onChange={(e) => handleQuantityChange(idx, e.target.value, item.quantity)}
                                                        className="w-full border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg px-2 py-2 text-center font-mono font-bold focus:border-indigo-500 outline-none text-black dark:text-white transition-all focus:ring-2 focus:ring-indigo-500/20"
                                                        onClick={(e) => (e.target as HTMLInputElement).select()}
                                                    />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    
                                    <div className="mt-4 pt-4 border-t border-gray-100 dark:border-slate-800">
                                        <button 
                                            onClick={handleConfirmPartial}
                                            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 rounded-xl transition-colors flex items-center justify-center gap-2 shadow-md hover:shadow-lg cursor-pointer text-sm"
                                        >
                                            <Check size={18} />
                                            تأكيد الاسترجاع وتحديث الفاتورة
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
