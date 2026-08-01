import React, { useState, useEffect, useRef } from 'react';
import { Search, ChevronDown, X, Check, User, Truck, Layers, Phone } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Option {
    id: string;
    label: string;
    subLabel?: string;
}

interface Props {
    options: (Option | string)[];
    value: string;
    onChange: (val: string) => void;
    placeholder?: string;
    required?: boolean;
    inputClassName?: string;
}

export default function SearchableSelect({ options, value, onChange, placeholder = "اختر أو اكتب الاسم...", required = false, inputClassName = "" }: Props) {
    const [isOpen, setIsOpen] = useState(false);
    const [isFocused, setIsFocused] = useState(false);
    const [typedText, setTypedText] = useState('');
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Normalize options
    const normalizedOptions: Option[] = options.map(opt => {
        if (typeof opt === 'string') {
            return { id: opt, label: opt };
        }
        return opt;
    });

    // Find selected option if value matches an option id or label
    const selectedOption = normalizedOptions.find(o => o.id === value || o.label === value);

    // Synchronize typedText when value changes externally or when not actively editing
    useEffect(() => {
        if (!isFocused) {
            setTypedText(selectedOption ? selectedOption.label : (value || ''));
        }
    }, [value, selectedOption, isFocused]);

    // Filter options based on typed search
    const searchFilter = isFocused ? typedText : '';
    const filteredOptions = normalizedOptions.filter(o => 
        o.label.toLowerCase().includes(searchFilter.toLowerCase()) || 
        (o.subLabel && o.subLabel.toLowerCase().includes(searchFilter.toLowerCase()))
    );

    // Handle click outside to close dropdown
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
                setIsFocused(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Icons helper
    const getIconForPlaceholder = (ph: string) => {
        if (ph.includes('موزع') || ph.includes('عميل')) return <User size={16} className="text-indigo-500 dark:text-indigo-400" />;
        if (ph.includes('مورد')) return <Truck size={16} className="text-emerald-500 dark:text-emerald-400" />;
        return <Layers size={16} className="text-amber-500 dark:text-amber-400" />;
    };

    const getInitials = (name: string) => {
        if (!name) return '';
        return name.trim().charAt(0).toUpperCase();
    };

    const getAvatarColor = (id: string) => {
        const colors = [
            'from-blue-500 to-indigo-600 text-white',
            'from-emerald-500 to-teal-600 text-white',
            'from-purple-500 to-indigo-600 text-white',
            'from-rose-500 to-pink-600 text-white',
            'from-amber-500 to-orange-600 text-white',
            'from-sky-500 to-blue-600 text-white',
        ];
        let hash = 0;
        for (let i = 0; i < id.length; i++) {
            hash = id.charCodeAt(i) + ((hash << 5) - hash);
        }
        const index = Math.abs(hash) % colors.length;
        return colors[index];
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setTypedText(val);
        onChange(val);
        setIsOpen(true);
    };

    const handleOptionSelect = (opt: Option) => {
        onChange(opt.id);
        setTypedText(opt.label);
        setIsOpen(false);
        setIsFocused(false);
    };

    const handleClear = (e: React.MouseEvent) => {
        e.stopPropagation();
        onChange('');
        setTypedText('');
        setIsOpen(false);
        if (inputRef.current) inputRef.current.focus();
    };

    return (
        <div className="w-full relative" dir="rtl" ref={containerRef}>
            {/* Input Box Container */}
            <div 
                className={`relative w-full bg-slate-50 dark:bg-slate-800/80 border ${
                    required && !value 
                        ? 'border-rose-300 dark:border-rose-900/50 bg-rose-50/10' 
                        : isFocused 
                        ? 'border-indigo-500 ring-2 ring-indigo-500/10 dark:border-indigo-400' 
                        : 'border-slate-200 dark:border-slate-700'
                } rounded-2xl transition-all duration-200 shadow-sm flex items-center overflow-hidden`}
            >
                {/* Prefix Icon */}
                <div className="pr-3.5 pl-1.5 flex items-center justify-center text-slate-400 shrink-0">
                    <div className="p-1 rounded-lg bg-white dark:bg-slate-900 shadow-xs border border-slate-100 dark:border-slate-800">
                        {getIconForPlaceholder(placeholder)}
                    </div>
                </div>

                {/* Direct Text Input */}
                <input
                    ref={inputRef}
                    type="text"
                    placeholder={placeholder}
                    value={isFocused ? typedText : (selectedOption ? selectedOption.label : value)}
                    onChange={handleInputChange}
                    onFocus={() => {
                        setIsFocused(true);
                        setTypedText(selectedOption ? selectedOption.label : value);
                        setIsOpen(true);
                    }}
                    onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                            setIsOpen(false);
                            inputRef.current?.blur();
                        } else if (e.key === 'Enter') {
                            setIsOpen(false);
                        }
                    }}
                    className={`w-full bg-transparent py-3 pr-1 pl-2 text-xs font-black text-slate-900 dark:text-white placeholder-slate-400 outline-none ${inputClassName}`}
                />

                {/* Right Action Icons (Clear + Toggle Chevron) */}
                <div className="pl-3 flex items-center gap-1.5 shrink-0">
                    {value && (
                        <button
                            type="button"
                            onClick={handleClear}
                            className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                            title="مسح"
                        >
                            <X size={14} />
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={() => {
                            if (isOpen) {
                                setIsOpen(false);
                            } else {
                                setIsOpen(true);
                                inputRef.current?.focus();
                            }
                        }}
                        className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                    >
                        <ChevronDown size={16} className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
                    </button>
                </div>
            </div>

            {/* Inline Dropdown Suggestions List */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 4, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 4, scale: 0.98 }}
                        transition={{ duration: 0.15 }}
                        className="absolute top-full right-0 left-0 mt-1.5 z-[250] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-h-60 overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-800 flex flex-col gap-1 text-right"
                    >
                        {/* Custom Name notice if user typed something not matching existing options */}
                        {typedText.trim() !== '' && !filteredOptions.some(o => o.label.toLowerCase() === typedText.toLowerCase()) && (
                            <div
                                onClick={() => {
                                    onChange(typedText.trim());
                                    setIsOpen(false);
                                    setIsFocused(false);
                                }}
                                className="p-2.5 rounded-xl border border-dashed border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/40 dark:bg-indigo-950/20 cursor-pointer flex items-center justify-between group hover:bg-indigo-100/50 dark:hover:bg-indigo-900/30 transition-all"
                            >
                                <div className="flex items-center gap-2">
                                    <div className="w-7 h-7 rounded-lg bg-indigo-500 text-white flex items-center justify-center font-bold text-xs shrink-0">
                                        <Check size={14} />
                                    </div>
                                    <div className="text-right">
                                        <p className="font-black text-xs text-indigo-700 dark:text-indigo-300">اعتماد الاسم المكتوب</p>
                                        <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate max-w-[200px]">"{typedText}"</p>
                                    </div>
                                </div>
                                <span className="text-[10px] font-bold text-indigo-500 bg-white dark:bg-slate-900 px-2 py-0.5 rounded-md border border-indigo-100 dark:border-indigo-900">
                                    اسم جديد
                                </span>
                            </div>
                        )}

                        {filteredOptions.length === 0 && typedText.trim() === '' ? (
                            <div className="p-4 text-center text-xs text-slate-400 font-bold">
                                لا توجد اقتراحات. اكتب اسماً لإضافته.
                            </div>
                        ) : filteredOptions.length === 0 ? (
                            <div className="p-3 text-center text-xs text-slate-400 font-bold">
                                لا يوجد اسم مطابقة في القائمة. يمكنك الاستمرار بكتابة الاسم الذي تريده.
                            </div>
                        ) : (
                            filteredOptions.map(opt => {
                                const isSelected = value === opt.id || value === opt.label;
                                const initials = getInitials(opt.label);
                                const avatarGradient = getAvatarColor(opt.id);

                                return (
                                    <div
                                        key={opt.id}
                                        onMouseDown={(e) => {
                                            e.preventDefault(); // Prevent input blur before click registers
                                            handleOptionSelect(opt);
                                        }}
                                        className={`p-2.5 rounded-xl border cursor-pointer flex items-center justify-between transition-all duration-150 ${
                                            isSelected
                                                ? 'bg-indigo-50/70 dark:bg-indigo-950/30 border-indigo-400 dark:border-indigo-500'
                                                : 'bg-white dark:bg-slate-900 border-transparent hover:bg-slate-100/70 dark:hover:bg-slate-800/60'
                                        }`}
                                    >
                                        <div className="flex items-center gap-2.5">
                                            {/* Avatar initial */}
                                            <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${avatarGradient} flex items-center justify-center font-black text-xs shadow-xs shrink-0`}>
                                                {initials}
                                            </div>

                                            <div className="text-right">
                                                <h4 className="font-black text-xs text-slate-900 dark:text-white">
                                                    {opt.label}
                                                </h4>
                                                {opt.subLabel && (
                                                    <div className="flex items-center gap-1 mt-0.5 text-[10px] font-bold text-slate-400 dark:text-slate-500">
                                                        {opt.subLabel.includes('متوفر') ? (
                                                            <span className="bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 px-1.5 py-0.2 rounded text-[9px]">
                                                                {opt.subLabel}
                                                            </span>
                                                        ) : (
                                                            <div className="flex items-center gap-1">
                                                                <Phone size={9} className="text-slate-400" />
                                                                <span dir="ltr">{opt.subLabel}</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {isSelected && (
                                            <div className="w-5 h-5 rounded-full bg-indigo-500 text-white flex items-center justify-center shrink-0">
                                                <Check size={12} strokeWidth={3} />
                                            </div>
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

