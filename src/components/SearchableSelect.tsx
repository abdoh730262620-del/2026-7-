import React, { useState, useRef, useEffect } from 'react';
import { Search, ChevronDown } from 'lucide-react';

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

export default function SearchableSelect({ options, value, onChange, placeholder = "اختر...", required = false }: Props) {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const wrapperRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [wrapperRef]);

    const normalizedOptions: Option[] = options.map(opt => {
        if (typeof opt === 'string') {
            return { id: opt, label: opt };
        }
        return opt;
    });

    const selectedOption = normalizedOptions.find(o => o.id === value);
    
    const filteredOptions = normalizedOptions.filter(o => 
        o.label.toLowerCase().includes(search.toLowerCase()) || 
        (o.subLabel && o.subLabel.toLowerCase().includes(search.toLowerCase()))
    );

    return (
        <div ref={wrapperRef} className="relative w-full">
            <div 
                className={`w-full bg-slate-50 dark:bg-slate-800 border ${required && !value ? 'border-rose-300 dark:border-rose-800' : 'border-slate-200 dark:border-slate-700'} rounded-2xl p-3 text-xs font-bold text-slate-900 dark:text-white flex justify-between items-center cursor-pointer hover:border-indigo-400 transition-colors`}
                onClick={() => setIsOpen(!isOpen)}
            >
                <span className={!selectedOption ? "text-slate-400" : ""}>
                    {selectedOption ? selectedOption.label : placeholder}
                </span>
                <ChevronDown size={16} className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </div>
            
            {isOpen && (
                <div className="absolute z-50 w-full mt-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl overflow-hidden max-h-60 flex flex-col">
                    <div className="p-2 border-b border-slate-100 dark:border-slate-800 sticky top-0 bg-white dark:bg-slate-900 z-10">
                        <div className="relative">
                            <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input 
                                type="text" 
                                placeholder="ابحث..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-2 pl-2 pr-8 text-xs font-bold outline-none focus:border-indigo-500"
                            />
                        </div>
                    </div>
                    <div className="overflow-y-auto p-1.5 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-700">
                        <div 
                            className="p-3 text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl cursor-pointer text-slate-500 transition-colors"
                            onClick={() => {
                                onChange('');
                                setIsOpen(false);
                            }}
                        >
                            {placeholder}
                        </div>
                        {filteredOptions.length === 0 ? (
                            <div className="p-4 text-center text-xs text-slate-400 font-bold">لا توجد نتائج</div>
                        ) : (
                            filteredOptions.map(opt => (
                                <div 
                                    key={opt.id}
                                    className={`p-3 text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl cursor-pointer flex justify-between items-center transition-colors ${value === opt.id ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300' : 'text-slate-700 dark:text-slate-300'}`}
                                    onClick={() => {
                                        onChange(opt.id);
                                        setIsOpen(false);
                                    }}
                                >
                                    <span>{opt.label}</span>
                                    {opt.subLabel && <span className="text-[10px] text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-lg">{opt.subLabel}</span>}
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
