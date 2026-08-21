
import { format } from 'date-fns';

export interface UsageData {
  reads: number;
  writes: number;
  date: string;
}

const USAGE_KEY = 'firestore_usage_stats';

export const usageMonitor = {
  getTodayStats(): UsageData {
    const today = format(new Date(), 'yyyy-MM-dd');
    const stored = localStorage.getItem(USAGE_KEY);
    const stats: Record<string, UsageData> = stored ? JSON.parse(stored) : {};
    
    if (!stats[today]) {
      stats[today] = { reads: 0, writes: 0, date: today };
      this.saveStats(stats);
    }
    
    return stats[today];
  },

  getAllStats(): UsageData[] {
    const stored = localStorage.getItem(USAGE_KEY);
    const stats: Record<string, UsageData> = stored ? JSON.parse(stored) : {};
    return Object.values(stats).sort((a, b) => b.date.localeCompare(a.date));
  },

  trackRead(count: number = 1) {
    const today = format(new Date(), 'yyyy-MM-dd');
    const stored = localStorage.getItem(USAGE_KEY);
    const stats: Record<string, UsageData> = stored ? JSON.parse(stored) : {};
    
    if (!stats[today]) {
      stats[today] = { reads: 0, writes: 0, date: today };
    }
    
    stats[today].reads += count;
    this.saveStats(stats);
  },

  trackWrite(count: number = 1) {
    const today = format(new Date(), 'yyyy-MM-dd');
    const stored = localStorage.getItem(USAGE_KEY);
    const stats: Record<string, UsageData> = stored ? JSON.parse(stored) : {};
    
    if (!stats[today]) {
      stats[today] = { reads: 0, writes: 0, date: today };
    }
    
    stats[today].writes += count;
    this.saveStats(stats);
  },

  saveStats(stats: Record<string, UsageData>) {
    // Keep only last 30 days
    const keys = Object.keys(stats).sort().reverse();
    const limitedStats: Record<string, UsageData> = {};
    keys.slice(0, 30).forEach(k => {
      limitedStats[k] = stats[k];
    });
    localStorage.setItem(USAGE_KEY, JSON.stringify(limitedStats));
  }
};
