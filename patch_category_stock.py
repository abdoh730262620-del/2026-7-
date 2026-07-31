import sys

with open('src/pages/CardsManagement.tsx', 'r') as f:
    content = f.read()

target = """                                    <div className="w-full pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs font-black">
                                        <span className="text-[10px] text-slate-400">الرصيد:</span>
                                        <span className="px-2 py-0.5 rounded-lg bg-purple-50 dark:bg-purple-950 text-purple-700 dark:text-purple-300 text-xs">
                                            {cat.availableCount || 0} كارت
                                        </span>
                                    </div>"""

replacement = """                                    <div className="w-full pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs font-black">
                                        <span className="text-[10px] text-slate-400">الرصيد:</span>
                                        <span className={`px-2 py-0.5 rounded-lg text-xs ${
                                            (cat.availableCount || 0) <= 20 
                                            ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400 animate-pulse' 
                                            : 'bg-purple-50 dark:bg-purple-950 text-purple-700 dark:text-purple-300'
                                        }`}>
                                            {cat.availableCount || 0} كارت
                                            {(cat.availableCount || 0) <= 20 && ' (ناقص)'}
                                        </span>
                                    </div>"""

content = content.replace(target, replacement)

with open('src/pages/CardsManagement.tsx', 'w') as f:
    f.write(content)

