import React from 'react';
import { ArrowLeft } from 'lucide-react';

export default function PlaceholderPage({ title }: { title: string }) {
    return (
        <div className="flex flex-col gap-4 p-4 md:p-8" dir="rtl">
            <div className="flex items-center gap-4 mb-4">
                <button onClick={() => window.history.back()} className="bg-white dark:bg-slate-800 p-2 rounded-xl text-black dark:text-gray-300 hover:bg-white transition">
                    <ArrowLeft size={24} />
                </button>
                <h1 className="text-xl font-black text-text-main">{title}</h1>
            </div>
            
            <div className="flex shrink-0 items-center justify-center p-10">
                <div className="bg-white p-10 rounded-2xl md:rounded-3xl shadow-sm text-center border border-gray-100 w-full max-w-lg">
                    <div className="w-20 h-20 bg-white dark:bg-slate-800 text-blue-500 rounded-full flex items-center justify-center mx-auto mb-4 md:mb-6">
                        <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"></path></svg>
                    </div>
                    <p className="text-black text-lg">هذا القسم قيد التطوير ولم يتم برمجته بالكامل بعد.</p>
                </div>
            </div>
        </div>
    );
}
