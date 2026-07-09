import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface BackupSettings {
    autoBackupEnabled: boolean;
    autoBackupInterval: '5_min' | '1_hour' | 'daily' | 'on_change';
    maxBackupsCount: number;
    destinations: {
        local: boolean;
        email: boolean;
        cloud: boolean;
        fileSystem: boolean;
    };
    targetEmail: string;
}

interface BackupStore {
    settings: BackupSettings;
    updateSettings: (settings: Partial<BackupSettings>) => void;
}

export const useBackupStore = create<BackupStore>()(
    persist(
        (set) => ({
            settings: {
                autoBackupEnabled: false,
                autoBackupInterval: '1_hour',
                maxBackupsCount: 24,
                destinations: {
                    local: true,
                    email: false,
                    cloud: false,
                    fileSystem: false,
                },
                targetEmail: '',
            },
            updateSettings: (newSettings) => 
                set((state) => ({ 
                    settings: { ...state.settings, ...newSettings } 
                })),
        }),
        {
            name: 'backup-settings-v1',
        }
    )
);
