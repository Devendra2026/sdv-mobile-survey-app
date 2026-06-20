/**
 * Design tokens for the Property Survey app.
 *
 * Brand: SDV Edutech blue (#003B8E primary, #D50000 accent).
 * 52px primary touch targets, gloves/glare-friendly contrast.
 *
 * Light/dark variants exposed via `useTheme()`; classnames use Tailwind
 * tokens defined in `tailwind.config.js` that mirror these constants.
 */
import { createContext, use, useMemo } from 'react';
import { useColorScheme, View } from 'react-native';

export interface ThemeTokens {
  brand: {
    primary: string;
    primarySoft: string;
    accent: string;
  };
  bg: { page: string; surface: string; sheet: string };
  ink: {
    primary: string;
    secondary: string;
    tertiary: string;
    disabled: string;
    onBrand: string;
  };
  border: { default: string; subtle: string };
  status: {
    success: string;
    successSoft: string;
    warning: string;
    warningSoft: string;
    danger: string;
    dangerSoft: string;
    info: string;
    infoSoft: string;
  };
  radius: { sm: number; md: number; lg: number; xl: number };
  space: (n: number) => number;
}

const LIGHT: ThemeTokens = {
  brand: { primary: '#003B8E', primarySoft: '#EAF2FE', accent: '#D50000' },
  bg: { page: '#F5F7FA', surface: '#FFFFFF', sheet: '#FFFFFF' },
  ink: {
    primary: '#0B1220',
    secondary: '#3A4252',
    tertiary: '#6B7280',
    disabled: '#9AA3AF',
    onBrand: '#FFFFFF',
  },
  border: { default: '#D6DBE3', subtle: '#E5E8EE' },
  status: {
    success: '#16A34A',
    successSoft: '#DCFCE7',
    warning: '#D97706',
    warningSoft: '#FEF3C7',
    danger: '#DC2626',
    dangerSoft: '#FEE2E2',
    info: '#2563EB',
    infoSoft: '#DBEAFE',
  },
  radius: { sm: 8, md: 12, lg: 16, xl: 24 },
  space: (n) => n * 4,
};

const DARK: ThemeTokens = {
  ...LIGHT,
  bg: { page: '#0A0E16', surface: '#121826', sheet: '#1B2230' },
  ink: {
    primary: '#F3F5F9',
    secondary: '#C0C7D2',
    tertiary: '#8B95A4',
    disabled: '#5B6577',
    onBrand: '#FFFFFF',
  },
  border: { default: '#283246', subtle: '#1E2738' },
};

interface Ctx {
  theme: ThemeTokens;
  scheme: 'light' | 'dark';
}

const ThemeCtx = createContext<Ctx>({ theme: LIGHT, scheme: 'light' });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const scheme = useColorScheme() ?? 'light';
  const value = useMemo<Ctx>(() => ({ theme: scheme === 'dark' ? DARK : LIGHT, scheme }), [scheme]);
  return (
    <ThemeCtx.Provider value={value}>
      <View className={scheme === 'dark' ? 'dark flex-1' : 'flex-1'} style={{ flex: 1 }}>
        {children}
      </View>
    </ThemeCtx.Provider>
  );
}

export function useTheme() {
  return use(ThemeCtx);
}
