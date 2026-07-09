import React from 'react';
import { useTheme } from '../../context/ThemeContext';
import { Palette, Layout, Check, Sparkles } from 'lucide-react';

export default function Addons() {
    const { style, setStyle, themeColor, setThemeColor } = useTheme();

    const styles = [
        { 
            id: 'modern', 
            label: 'المودرن (عصري)', 
            desc: 'ظلال ناعمة وزوايا مستديرة جداً', 
            preview: 'rounded-xl border-gray-200 dark:border-slate-700' 
        },
        { 
            id: 'classic', 
            label: 'الكلاسيك (عملي)', 
            desc: 'زوايا حادة ومظهر رسمي للمؤسسات', 
            preview: 'rounded-md border-gray-300 dark:border-slate-600 shadow-none' 
        },
        { 
            id: 'glass', 
            label: 'الزجاجي (Glassmorphism)', 
            desc: 'مؤثرات شفافية وبلورية خلف العناصر', 
            preview: 'rounded-xl border-purple-300/40 bg-purple-600/10 backdrop-blur-sm' 
        }
    ] as const;

    const themes = [
        { 
            id: 'classic', 
            label: 'الأسود الكلاسيكي', 
            colorStyle: { backgroundColor: '#000000' },
            desc: 'مظهر احترافي باللونين الأسود والأبيض الصريحين لسرعة القراءة والتركيز' 
        },
        { 
            id: 'blue', 
            label: 'الأزرق الملكي', 
            colorStyle: { backgroundColor: '#2563eb' },
            desc: 'اللون الافتراضي الهادئ والموثوق الأكثر ملاءمة لمعظم الأنشطة التجارية' 
        },
        { 
            id: 'green', 
            label: 'الأخضر الزمردي', 
            colorStyle: { backgroundColor: '#16a34a' },
            desc: 'مثالي ماليًا ومريح للعين يعكس النجاح، التوازن وحركات المحاسبة والمبيعات' 
        },
        { 
            id: 'purple', 
            label: 'البنفسجي الأنيق', 
            colorStyle: { backgroundColor: '#9333ea' },
            desc: 'تصميم رقمي فاخر مفعم بالعصرية والتكنولوجيا والذكاء الاصطناعي' 
        },
        { 
            id: 'red', 
            label: 'الأحمر القرمزي', 
            colorStyle: { backgroundColor: '#dc2626' },
            desc: 'لون مفعم الجرأة والطاقة، ممتاز للمطاعم ومحلات العروض السريعة' 
        },
        { 
            id: 'amber', 
            label: 'البرتقالي الدافئ', 
            colorStyle: { backgroundColor: '#d97706' },
            desc: 'مظهر ترابي ومريح يعطي طابعًا مألوفًا دافئًا ومميزًا لخيارات الفاتورة' 
        }
    ] as const;

    return (
        <div className="pb-8 pt-2 px-2 max-w-4xl mx-auto w-full">
            <div className="flex items-center gap-3 mb-6 flex-wrap">
                <div className="flex flex-col">
                    <h1 className="text-lg md:text-xl font-bold text-black dark:text-white flex items-center gap-2">
                        <Sparkles className="text-amber-500" size={20} />
                        الإضافات والمظهر وثيمات الألوان
                    </h1>
                    <p className="text-xs text-gray-500 dark:text-gray-400 font-bold">خصص طابعك البصري ونمط الأزرار بما يتناسب مع هويتك بمحلك التجاري</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* UI Style Section */}
                <section className="bg-white dark:bg-slate-950 p-5 rounded-xl border border-gray-200 dark:border-slate-800 flex flex-col gap-4 shadow-sm">
                    <div className="flex items-center gap-2 font-bold text-black dark:text-white text-sm">
                        <Layout size={18} className="text-blue-600 dark:text-blue-400" />
                        <span>نمط التصميم (UI Style)</span>
                    </div>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 -mt-2">يتحكم في انحناءات البراويز وتأثيرات العمق للعناصر:</p>
                    <div className="flex flex-col gap-3 flex-1">
                        {styles.map(s => (
                            <button
                                key={s.id}
                                onClick={() => setStyle(s.id)}
                                className={`p-4 rounded-xl border transition-all text-right flex items-center gap-3 relative cursor-pointer
                                    ${style === s.id 
                                        ? 'border-blue-600 bg-blue-50/20 dark:bg-blue-950/20 dark:border-blue-500' 
                                        : 'border-gray-200 bg-white dark:bg-slate-900 dark:border-slate-800 hover:border-gray-400 dark:hover:border-slate-700'}
                                `}
                            >
                                <div className={`w-10 h-7 border shrink-0 ${s.preview}`}></div>
                                <div className="flex-1">
                                    <div className="font-bold text-black dark:text-white text-sm flex items-center justify-between">
                                        {s.label}
                                        {style === s.id && <Check className="text-blue-600 dark:text-blue-400 font-bold" size={16} />}
                                    </div>
                                    <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">{s.desc}</div>
                                </div>
                            </button>
                        ))}
                    </div>
                </section>
                
                {/* UI Theme Color Selector Section */}
                <section className="bg-white dark:bg-slate-950 p-5 rounded-xl border border-gray-200 dark:border-slate-800 flex flex-col gap-4 shadow-sm">
                    <div className="flex items-center gap-2 font-bold text-black dark:text-white text-sm">
                        <Palette size={18} className="text-pink-600 dark:text-pink-400" />
                        <span>ثيمات الألوان والواجهة (Theme Colors)</span>
                    </div>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 -mt-2">اختر نظام الألوان الرئيسي وسيتم تلوين جميع الأزرار، والتبويبات، واللمسات فوراً:</p>
                    <div className="flex flex-col gap-2.5 flex-1 max-h-[420px] overflow-y-auto pr-1">
                        {themes.map(t => (
                            <button
                                key={t.id}
                                onClick={() => setThemeColor(t.id)}
                                className={`p-3.5 rounded-xl border transition-all text-right flex items-center gap-3.5 relative cursor-pointer
                                    ${themeColor === t.id 
                                        ? 'border-blue-600 bg-blue-50/20 dark:bg-blue-950/20 dark:border-blue-500 shadow-sm' 
                                        : 'border-gray-200 bg-white dark:bg-slate-900 dark:border-slate-800 hover:border-gray-400 dark:hover:border-slate-700'}
                                `}
                            >
                                <div 
                                    className="w-7 h-7 rounded-full border border-gray-200 dark:border-slate-700 shrink-0 shadow-inner flex items-center justify-center text-white" 
                                    style={t.colorStyle}
                                >
                                    {themeColor === t.id && <Check size={14} className="stroke-[3.5px]" />}
                                </div>
                                <div className="flex-1">
                                    <div className="font-bold text-black dark:text-white text-sm flex items-center justify-between">
                                        {t.label}
                                    </div>
                                    <div className="text-[10.5px] text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">{t.desc}</div>
                                </div>
                            </button>
                        ))}
                    </div>
                </section>
            </div>
        </div>
    );
}

