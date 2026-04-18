import { QueryClientProvider } from "@tanstack/react-query";
import { Stack, router } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { Linking } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { queryClient } from "@/lib/query-client";
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { StatusBar } from 'expo-status-bar';
import Colors from '@/constants/colors';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getOnboardingKey } from '@/app/onboarding';

SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const { user, isLoading, refreshUser } = useAuth();

  useEffect(() => {
    if (isLoading) return;
    SplashScreen.hideAsync();
    if (!user) {
      router.replace('/auth');
    } else {
      // Check if this user has completed onboarding
      AsyncStorage.getItem(getOnboardingKey(user.id)).then((done) => {
        if (done) {
          router.replace('/');
        } else {
          router.replace('/onboarding' as any);
        }
      });
    }
  }, [user, isLoading]);

  // Handle deep links from Notion OAuth callback
  useEffect(() => {
    const handler = ({ url }: { url: string }) => {
      if (url.startsWith('notesync://notion-connected')) {
        refreshUser(); // refresh Notion status instantly
      }
    };
    const sub = Linking.addEventListener('url', handler);
    return () => sub.remove();
  }, [refreshUser]);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Colors.background },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="auth" options={{ animation: 'fade' }} />
      <Stack.Screen name="onboarding" options={{ animation: 'fade', gestureEnabled: false }} />
      <Stack.Screen name="preview" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="select-page" options={{ presentation: 'modal' }} />
      <Stack.Screen name="settings" options={{ animation: 'slide_from_right' }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  if (!fontsLoaded && !fontError) return null;

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <KeyboardProvider>
              <StatusBar style="light" />
              <RootNavigator />
            </KeyboardProvider>
          </GestureHandlerRootView>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
