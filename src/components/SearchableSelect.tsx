import React, { useState, useRef, useEffect } from 'react';
import { Search, X } from 'lucide-react';

interface SearchableSelectProps {
    value: string;
    onChange: (value: string) => void;
    options: string[];
    placeholder?: string;
    className?: string;
    inputClassName?: string;
}

export default function SearchableSelect({ value, onChange, options, placeholder = 'بحث...', className = '', inputClassName = '' }: SearchableSelectProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [searchText, setSearchText] = useState(value);
    const wrapperRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setSearchText(value);
    }, [value]);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const filteredOptions = options.filter(opt => 
        opt.toLowerCase().includes(searchText.toLowerCase())
    );

    return (
        <div ref={wrapperRef} className={`relative ${className}`}>
            <div className="relative flex items-center">
                <input
                    type="text"
                    value={searchText}
                    onChange={(e) => {
                        setSearchText(e.target.value);
                        setIsOpen(true);
                        // Also update parent if user is typing, or we can only update on select.
                        // Let's update parent immediately so it works like a free-text input too.
                        onChange(e.target.value);
                    }}
                    onFocus={() => setIsOpen(true)}
                    placeholder={placeholder}
                    className={`w-full p-3.5 text-sm font-bold border-2 border-gray-200 bg-white shadow-sm rounded-xl focus:border-blue-500 focus:ring-4 focus:ring-gray-200 transition outline-none placeholder:text-gray-400 pl-10 ${inputClassName || 'text-black dark:text-gray-100'}`}
                />
                <Search className="absolute right-3.5 text-gray-400" size={18} />
                {searchText && (
                    <button 
                        onClick={() => { setSearchText(''); onChange(''); setIsOpen(true); }}
                        className="absolute left-3.5 text-gray-400 hover:text-red-500 transition-colors"
                    >
                        <X size={18} />
                    </button>
                )}
            </div>
            
            {isOpen && filteredOptions.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-60 overflow-y-auto">
                    {filteredOptions.map((opt, idx) => (
                        <div 
                            key={idx}
                            onClick={() => {
                                onChange(opt);
                                setSearchText(opt);
                                setIsOpen(false);
                            }}
                            className={`p-3 text-sm font-bold hover:bg-white cursor-pointer border-b border-gray-50 last:border-0 transition-colors ${inputClassName || 'text-black dark:text-gray-100'}`}
                        >
                            {opt}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
