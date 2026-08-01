import * as React from 'react';

type ThemeMode = 'light' | 'dark';
type ThemeStyle = 'modern' | 'classic' | 'glass';
export type ThemeColor = 'classic' | 'blue' | 'green' | 'purple' | 'red' | 'amber';

interface ThemeContextType {
    mode: ThemeMode;
    style: ThemeStyle;
    themeColor: ThemeColor;
    setMode: (mode: ThemeMode) => void;
    setStyle: (style: ThemeStyle) => void;
    setThemeColor: (color: ThemeColor) => void;
    toggleMode: () => void;
}

const ThemeContext = React.createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const mode: ThemeMode = 'light';
    const [style, setStyle] = React.useState<ThemeStyle>(() => {
        try {
            return (localStorage.getItem('theme-style') as ThemeStyle) || 'modern';
        } catch (e) {
            return 'modern';
        }
    });

    const [themeColor, setThemeColor] = React.useState<ThemeColor>(() => {
        try {
            return (localStorage.getItem('theme-color') as ThemeColor) || 'blue';
        } catch (e) {
            return 'blue';
        }
    });

    React.useEffect(() => {
        const root = window.document.documentElement;
        root.classList.remove('dark');
        root.style.colorScheme = 'light';
    }, []);

    React.useEffect(() => {
        try {
            localStorage.setItem('theme-style', style);
        } catch (e) {}
        // Remove old style classes
        document.body.classList.remove('style-modern', 'style-classic', 'style-glass');
        document.body.classList.add(`style-${style}`);
    }, [style]);

    React.useEffect(() => {
        try {
            localStorage.setItem('theme-color', themeColor);
        } catch (e) {}
        
        const root = window.document.documentElement;
        // Remove existing theme classes
        root.classList.remove('theme-classic', 'theme-blue', 'theme-green', 'theme-purple', 'theme-red', 'theme-amber');
        // Add new theme class
        root.classList.add(`theme-${themeColor}`);
    }, [themeColor]);

    const toggleMode = () => {};
    const setMode = () => {};

    return (
        <ThemeContext.Provider value={{ mode, style, themeColor, setMode, setStyle, setThemeColor, toggleMode }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    const context = React.useContext(ThemeContext);
    if (!context) throw new Error('useTheme must be used within a ThemeProvider');
    return context;
}

