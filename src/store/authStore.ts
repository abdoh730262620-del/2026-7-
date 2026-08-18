import { create } from 'zustand';
import { User as FirebaseUser, onAuthStateChanged } from 'firebase/auth';
import { auth } from '../lib/firebase';

export type AppRole = 'admin' | 'cashier' | 'inventory' | 'salesman' | 'network_worker';

export interface ModulePermissions {
    view: boolean;
    add: boolean;
    edit: boolean;
    delete: boolean;
    return?: boolean;
}

export interface AppPermissions {
    sales?: ModulePermissions;
    purchases?: ModulePermissions;
    cash?: ModulePermissions;
    expenses?: ModulePermissions;
    products?: ModulePermissions;
    customers?: ModulePermissions;
    suppliers?: ModulePermissions;
    users?: ModulePermissions;
    settings?: ModulePermissions;
    reports?: ModulePermissions;
    quotations?: ModulePermissions;
    vouchers?: ModulePermissions;
    cards?: ModulePermissions;
    cards_stock?: ModulePermissions;
    cards_categories?: ModulePermissions;
    cards_distributors?: ModulePermissions;
    cards_sellers?: ModulePermissions;
    cards_sales_report?: ModulePermissions;
    cards_cashbox?: ModulePermissions;
    cards_vouchers?: ModulePermissions;
    cards_exchanges?: ModulePermissions;
    
    // Legacy mapping support for existing users
    edit?: boolean;
    add?: boolean;
    delete?: boolean;
    backup?: boolean;
    [key: string]: any;
}

export interface AppUser {
    uid: string;
    email: string;
    name: string;
    role: AppRole;
    isActive: boolean;
    permissions: AppPermissions;
    password?: string;
    tenantId?: string;
    salary?: number;
}

interface AuthState {
    user: any | null; // Keep for compatibility if needed, but we'll use appUser
    appUser: AppUser | null;
    isLoading: boolean;
    setUser: (user: any | null) => void;
    setAppUser: (appUser: AppUser | null) => void;
    setLoading: (isLoading: boolean) => void;
    login: (user: AppUser) => void;
    logout: () => void;
    checkSession: () => Promise<FirebaseUser | null>;
    hasPermission: (module: keyof Omit<AppPermissions, 'edit' | 'add' | 'delete' | 'backup'>, action: keyof ModulePermissions) => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
    user: null,
    appUser: null,
    isLoading: true,
    setUser: (user) => set({ user }),
    setAppUser: (user) => {
        if (user) {
            const resolvedTenantId = 'single_store';
            set({ appUser: { ...user, tenantId: resolvedTenantId } });
        } else {
            set({ appUser: null });
        }
    },
    setLoading: (isLoading) => set({ isLoading }),
    login: (user) => {
        const resolvedTenantId = 'single_store';
        const userWithTenant = { ...user, tenantId: resolvedTenantId };
        try {
            localStorage.setItem('app_session', JSON.stringify({ uid: user.uid, timestamp: Date.now() }));
            // Save the correct store identifier email (if admin, user.email, if staff, the owner tenantId email)
            const storeEmail = user.role === 'admin' ? user.email : userWithTenant.tenantId;
            if (storeEmail) {
                localStorage.setItem('remembered_email', storeEmail);
            }
            if (user.name) {
                localStorage.setItem('remembered_staff_username', user.name);
            }
            if (user.password) {
                localStorage.setItem('remembered_password', user.password);
            }
            localStorage.setItem('remembered_login_tab', user.role === 'admin' ? 'admin' : 'staff');
            
            // Auto bypass AppLock upon deliberate login/register action
            sessionStorage.setItem(`unlocked_${user.uid}`, 'true');
        } catch (e) {
            console.warn('localStorage/sessionStorage not available', e);
        }
        set({ appUser: userWithTenant, user: { uid: user.uid, email: user.email } as any, isLoading: false });
    },
    logout: async () => {
        try {
            await auth.signOut();
            localStorage.removeItem('app_session');
        } catch (e) {
            console.warn('Error during logout:', e);
        }
        set({ appUser: null, user: null, isLoading: false });
    },
    checkSession: async () => {
        return new Promise((resolve) => {
            const unsubscribe = onAuthStateChanged(auth, (user) => {
                unsubscribe();
                resolve(user);
            });
        });
    },
    hasPermission: (module, action) => {
        const { appUser } = get();
        if (!appUser) return false;
        if (appUser.role === 'admin') return true;
        
        const modulePerms = appUser.permissions?.[module];
        if (modulePerms) {
            return !!modulePerms[action as keyof ModulePermissions];
        }
        
        // Legacy fallback
        if (action === 'view') return true;
        if (action === 'add') return !!appUser.permissions?.add;
        if (action === 'edit') return !!appUser.permissions?.edit;
        if (action === 'delete') return !!appUser.permissions?.delete;
        
        return false;
    }
}));
