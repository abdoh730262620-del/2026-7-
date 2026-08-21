
import React, { useState, useEffect } from 'react';
import { usageMonitor, UsageData } from '../lib/usageMonitor';
import { Activity, ArrowUp, ArrowDown, AlertTriangle, CheckCircle, Database } from 'lucide-react';

const READ_LIMIT = 50000;
const WRITE_LIMIT = 20000;

export default function UsageDashboard() {
  const [stats, setStats] = useState<UsageData[]>([]);
  const [today, setToday] = useState<UsageData | null>(null);

  useEffect(() => {
    setStats(usageMonitor.getAllStats());
    setToday(usageMonitor.getTodayStats());

    // Refresh every minute
    const interval = setInterval(() => {
      setToday(usageMonitor.getTodayStats());
      setStats(usageMonitor.getAllStats());
    }, 60000);

    return () => clearInterval(interval);
  }, []);

  if (!today) return null;

  const readPercent = Math.min(100, (today.reads / READ_LIMIT) * 100);
  const writePercent = Math.min(100, (today.writes / WRITE_LIMIT) * 100);

  const getStatusColor = (percent: number) => {
    if (percent > 90) return 'text-red-600 bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-900/30';
    if (percent > 70) return 'text-amber-600 bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-900/30';
    return 'text-emerald-600 bg-emerald-50 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-900/30';
  };

  const getBarColor = (percent: number) => {
    if (percent > 90) return 'bg-red-500';
    if (percent > 70) return 'bg-amber-500';
    return 'bg-emerald-500';
  };

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Database className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white">مراقب استهلاك البيانات (Firestore)</h3>
        </div>
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-slate-800 px-2 py-1 rounded-full uppercase tracking-wider">
          إحصائيات اليوم
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Reads Card */}
        <div className="bg-white dark:bg-slate-900 border dark:border-slate-800 rounded-xl p-5 shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">عمليات القراءة (Reads)</p>
              <h4 className="text-2xl font-bold text-gray-900 dark:text-white">{today.reads.toLocaleString()}</h4>
            </div>
            <div className={`p-2 rounded-lg border ${getStatusColor(readPercent)}`}>
              <ArrowDown className="w-5 h-5" />
            </div>
          </div>
          
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-medium">
              <span className="text-gray-500 dark:text-gray-400">من إجمالي {READ_LIMIT.toLocaleString()}</span>
              <span className={readPercent > 90 ? 'text-red-600' : 'text-gray-700 dark:text-gray-300'}>{readPercent.toFixed(1)}%</span>
            </div>
            <div className="w-full bg-gray-100 dark:bg-slate-800 rounded-full h-2">
              <div 
                className={`h-2 rounded-full transition-all duration-500 ${getBarColor(readPercent)}`} 
                style={{ width: `${readPercent}%` }}
              />
            </div>
          </div>
          
          {readPercent > 80 && (
            <div className="mt-4 flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 p-3 rounded-lg border border-amber-100 dark:border-amber-900/30">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <p>لقد اقتربت من استهلاك الحد اليومي لعمليات القراءة. سيتم تعطيل جلب البيانات مؤقتاً عند الوصول للحد الأقصى.</p>
            </div>
          )}
        </div>

        {/* Writes Card */}
        <div className="bg-white dark:bg-slate-900 border dark:border-slate-800 rounded-xl p-5 shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">عمليات الكتابة (Writes)</p>
              <h4 className="text-2xl font-bold text-gray-900 dark:text-white">{today.writes.toLocaleString()}</h4>
            </div>
            <div className={`p-2 rounded-lg border ${getStatusColor(writePercent)}`}>
              <ArrowUp className="w-5 h-5" />
            </div>
          </div>
          
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-medium">
              <span className="text-gray-500 dark:text-gray-400">من إجمالي {WRITE_LIMIT.toLocaleString()}</span>
              <span className={writePercent > 90 ? 'text-red-600' : 'text-gray-700 dark:text-gray-300'}>{writePercent.toFixed(1)}%</span>
            </div>
            <div className="w-full bg-gray-100 dark:bg-slate-800 rounded-full h-2">
              <div 
                className={`h-2 rounded-full transition-all duration-500 ${getBarColor(writePercent)}`} 
                style={{ width: `${writePercent}%` }}
              />
            </div>
          </div>

          {writePercent > 80 && (
            <div className="mt-4 flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 p-3 rounded-lg border border-amber-100 dark:border-amber-900/30">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <p>لقد اقتربت من استهلاك الحد اليومي لعمليات الكتابة. سيتم تعطيل حفظ البيانات مؤقتاً عند الوصول للحد الأقصى.</p>
            </div>
          )}
        </div>
      </div>

      {/* History Table */}
      {stats.length > 1 && (
        <div className="bg-white dark:bg-slate-900 border dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
          <div className="bg-gray-50 dark:bg-slate-800/50 px-5 py-3 border-b dark:border-slate-800">
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200">السجل التاريخي (آخر {stats.length} أيام)</h4>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-right">
              <thead>
                <tr className="text-xs font-semibold text-gray-500 dark:text-gray-400 border-b dark:border-slate-800">
                  <th className="px-5 py-3">التاريخ</th>
                  <th className="px-5 py-3">القراءات</th>
                  <th className="px-5 py-3">الكتابات</th>
                  <th className="px-5 py-3 text-center">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y dark:divide-slate-800 text-sm">
                {stats.slice(1, 10).map((day) => (
                  <tr key={day.date} className="hover:bg-gray-50 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="px-5 py-3 font-medium text-gray-700 dark:text-gray-300">{day.date}</td>
                    <td className="px-5 py-3 text-gray-600 dark:text-gray-400">{day.reads.toLocaleString()}</td>
                    <td className="px-5 py-3 text-gray-600 dark:text-gray-400">{day.writes.toLocaleString()}</td>
                    <td className="px-5 py-3 text-center">
                      {(day.reads > READ_LIMIT * 0.9 || day.writes > WRITE_LIMIT * 0.9) ? (
                        <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400 font-medium">
                          <AlertTriangle className="w-4 h-4" /> مرتفع
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                          <CheckCircle className="w-4 h-4" /> طبيعي
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/30 rounded-lg p-4 flex items-start gap-3">
        <Activity className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-blue-900 dark:text-blue-300 mb-1">كيف يتم احتساب هذا الاستهلاك؟</p>
          <p className="text-xs text-blue-800 dark:text-blue-400 leading-relaxed">
            يتم احتساب العمليات برمجياً داخل المتصفح لكل مستخدم على حدة. تشمل "القراءات" عدد المستندات التي تم جلبها عند فتح التقارير أو لوحة التحكم، بينما تشمل "الكتابات" كل فاتورة جديدة أو تعديل يتم حفظه. ملاحظة: الأرقام الفعلية في الفايربيز قد تختلف قليلاً.
          </p>
        </div>
      </div>
    </div>
  );
}
