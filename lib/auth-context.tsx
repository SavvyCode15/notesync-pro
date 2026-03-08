import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApiUrl } from '@/lib/query-client';
import { router } from 'expo-router';

export interface AuthUser {
    id: string;
    email: string;
    name: string | null;
    notionConnected: boolean;
    groqConnected: boolean;
}

interface AuthContextType {
    user: AuthUser | null;
    token: string | null;
    isLoading: boolean;
    login: (email: string, password: string) => Promise<void>;
    register: (email: string, password: string, name?: string) => Promise<void>;
    logout: () => Promise<void>;
    refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

const TOKEN_KEY = '@notesync_token';
const USER_KEY = '@notesync_user';

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<AuthUser | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        loadStoredAuth();
    }, []);

    async function loadStoredAuth() {
        try {
            const [storedToken, storedUser] = await Promise.all([
                AsyncStorage.getItem(TOKEN_KEY),
                AsyncStorage.getItem(USER_KEY),
            ]);
            if (storedToken && storedUser) {
                setToken(storedToken);
                setUser(JSON.parse(storedUser));
                // Refresh in background to pick up any changes
                refreshUserWithToken(storedToken).catch(() => { });
            }
        } catch {
            // ignore storage errors
        } finally {
            setIsLoading(false);
        }
    }

    async function refreshUserWithToken(t: string) {
        try {
            const baseUrl = getApiUrl();
            const resp = await fetch(new URL('/api/auth/me', baseUrl).toString(), {
                headers: { Authorization: `Bearer ${t}` },
            });
            if (resp.ok) {
                const u = await resp.json();
                setUser(u);
                await AsyncStorage.setItem(USER_KEY, JSON.stringify(u));
            } else {
                await clearAuth();
            }
        } catch {
            // Network error — keep existing cached user
        }
    }

    async function refreshUser() {
        if (token) await refreshUserWithToken(token);
    }

    async function clearAuth() {
        setUser(null);
        setToken(null);
        await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
    }

    async function login(email: string, password: string) {
        const baseUrl = getApiUrl();
        const resp = await fetch(new URL('/api/auth/login', baseUrl).toString(), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || 'Login failed');
        await AsyncStorage.setItem(TOKEN_KEY, data.token);
        await AsyncStorage.setItem(USER_KEY, JSON.stringify(data.user));
        setToken(data.token);
        setUser(data.user);
    }

    async function register(email: string, password: string, name?: string) {
        const baseUrl = getApiUrl();
        const resp = await fetch(new URL('/api/auth/register', baseUrl).toString(), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, name }),
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || 'Registration failed');
        await AsyncStorage.setItem(TOKEN_KEY, data.token);
        await AsyncStorage.setItem(USER_KEY, JSON.stringify(data.user));
        setToken(data.token);
        setUser(data.user);
    }

    async function logout() {
        await clearAuth();
        router.replace('/auth');
    }

    return (
        <AuthContext.Provider value={{ user, token, isLoading, login, register, logout, refreshUser }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used within AuthProvider');
    return ctx;
}
