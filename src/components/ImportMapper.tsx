import React, { useState, useEffect } from 'react';
import { X, CheckCircle, AlertCircle } from 'lucide-react';

interface ImportField {
    key: string;
    label: string;
    required?: boolean;
}

interface ImportMapperProps {
    isOpen: boolean;
    onClose: () => void;
    onImport: (mappedData: any[]) => void;
    headers: string[];
    rows: any[];
    fields: ImportField[];
}

export default function ImportMapper({ isOpen, onClose, onImport, headers, rows, fields }: ImportMapperProps) {
    // Maps system field key -> Excel header
    const [mapping, setMapping] = useState<Record<string, string>>({});

    // Auto-map based on common names if possible
    useEffect(() => {
        if (isOpen && headers.length > 0) {
            const autoMap: Record<string, string> = {};
            fields.forEach(field => {
                // Determine index-based position matching (First = barcode, Second = name, Third = price, Fourth = cost, Fifth = quantity)
                if (field.key === 'barcode' && headers[0]) {
                    autoMap[field.key] = headers[0];
                } else if (field.key === 'name' && headers[1]) {
                    autoMap[field.key] = headers[1];
                } else if (field.key === 'price' && headers[2]) {
                    autoMap[field.key] = headers[2];
                } else if (field.key === 'cost' && headers[3]) {
                    autoMap[field.key] = headers[3];
                } else if (field.key === 'quantity' && headers[4]) {
                    autoMap[field.key] = headers[4];
                } else {
                    const possibleMatches = [
                        field.label, 
                        field.key, 
                        field.label.split(' ')[0],
                        // adding possible arabic matches
                        field.key === 'name' ? 'الاسم' : '',
                        field.key === 'name' ? 'اسم' : '',
                        field.key === 'barcode' ? 'الباركود' : '',
                        field.key === 'price' ? 'السعر' : '',
                        field.key === 'cost' ? 'التكلفة' : '',
                        field.key === 'quantity' ? 'الكمية' : '',
                        field.key === 'category' ? 'التصنيف' : '',
                        field.key === 'phone' ? 'الهاتف' : '',
                        field.key === 'phone' ? 'رقم الهاتف' : '',
                        field.key === 'address' ? 'العنوان' : '',
                        field.key === 'balance' ? 'الرصيد' : ''
                    ].map(s => s?.toLowerCase());

                    const match = headers.find(h => possibleMatches.includes(h.toLowerCase().trim()));
                    if (match) {
                        autoMap[field.key] = match;
                    }
                }
            });
            setMapping(autoMap);
        }
    }, [isOpen, headers, fields]);

    if (!isOpen) return null;

    const handleImport = () => {
        // Validate required fields
        const missing = fields.filter(f => f.required && !mapping[f.key]);
        if (missing.length > 0) {
            alert(`يرجى تحديد الحقول الإلزامية: ${missing.map(m => m.label).join(', ')}`);
            return;
        }

        const mappedData = rows.map(row => {
            const mappedRow: any = {};
            for (const field of fields) {
                const excelHeader = mapping[field.key];
                if (excelHeader && row[excelHeader] !== undefined) {
                    mappedRow[field.key] = row[excelHeader];
                }
            }
            return mappedRow;
        });

        onImport(mappedData);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 overflow-y-auto">
            <div className="bg-white rounded-2xl w-full max-w-3xl shadow-xl flex flex-col my-8">
                <div className="p-4 md:p-6 border-b border-gray-100 flex justify-between items-center bg-white dark:bg-slate-900 rounded-t-2xl">
                    <div>
                        <h2 className="text-base md:text-xl font-bold text-black dark:text-white">مطابقة حقول البيانات</h2>
                        <p className="text-sm text-black mt-1">يرجى مطابقة الحقول في نظامنا مع أعمدة ملف الإكسل لتتم عملية الاستيراد بشكل صحيح.</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white rounded-full transition"><X size={20} /></button>
                </div>

                <div className="p-4 md:p-6 flex-1 max-h-[60vh] overflow-y-auto">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {fields.map(field => (
                            <div key={field.key} className="bg-white dark:bg-slate-900 p-4 border border-gray-200 rounded-xl relative">
                                {field.required && <span className="absolute top-4 left-4 text-red-500 text-xs font-bold bg-white px-2 py-1 border border-red-100 rounded-lg">مطلوب</span>}
                                <label className="block text-sm font-bold text-black dark:text-gray-200 mb-2">{field.label}</label>
                                <select 
                                    className="w-full border border-gray-300 rounded-xl p-3 outline-none focus:border-blue-500 bg-white"
                                    value={mapping[field.key] || ''}
                                    onChange={e => setMapping(prev => ({ ...prev, [field.key]: e.target.value }))}
                                >
                                    <option value="">-- تجاهل هذا الحقل --</option>
                                    {headers.map((header, index) => (
                                        <option key={`${header}-${index}`} value={header}>{header}</option>
                                    ))}
                                </select>
                                {mapping[field.key] && (
                                    <div className="mt-2 text-xs text-green-600 flex items-center gap-1 font-semibold">
                                        <CheckCircle size={14} /> تم الربط مع: {mapping[field.key]}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>

                    {/* Preview first row */}
                    {rows.length > 0 && Object.keys(mapping).length > 0 && (
                        <div className="mt-4 md:mt-8 border border-gray-200 bg-white dark:bg-slate-800 rounded-xl p-4">
                            <h3 className="text-sm font-bold text-blue-900 mb-3 flex items-center gap-2">
                                <AlertCircle size={16} /> معاينة لبيانات أول صف سيتم استيرادها:
                            </h3>
                            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                                {fields.filter(f => mapping[f.key]).map(f => (
                                    <div key={f.key} className="bg-white p-2 rounded border border-gray-200 text-sm">
                                        <span className="text-black font-semibold">{f.label}:</span>{' '}
                                        <span className="text-black dark:text-white font-mono">{String(rows[0][mapping[f.key]] || 'فارغ')}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <div className="p-4 md:p-6 border-t border-gray-100 bg-white dark:bg-slate-900 rounded-b-2xl flex justify-end gap-3">
                    <button 
                        onClick={onClose}
                        className="px-4 md:px-6 py-3 font-semibold text-black dark:text-gray-300 bg-white border border-gray-200 hover:bg-white rounded-xl transition"
                    >
                        إلغاء
                    </button>
                    <button 
                        onClick={handleImport}
                        className="px-4 md:px-6 py-3 font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition shadow-sm"
                    >
                        استيراد ({rows.length} سجل)
                    </button>
                </div>
            </div>
        </div>
    );
}
