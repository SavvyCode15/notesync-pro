import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  FadeIn,
  FadeOut,
  FadeInDown,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as WebBrowser from 'expo-web-browser';
import * as ExpoLinking from 'expo-linking';
import { router } from 'expo-router';
import Colors from '@/constants/colors';
import { getApiUrl } from '@/lib/query-client';
import { useAuth } from '@/lib/auth-context';

/** Returns the per-user AsyncStorage key for the onboarding completion flag */
export function getOnboardingKey(userId: string) {
  return `@notesync_onboarded_${userId}`;
}

// ── Slide data ────────────────────────────────────────────────
type Slide = {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  iconBg: string;
  title: string;
  subtitle: string;
  isActionSlide?: boolean;
};

const SLIDES: Slide[] = [
  {
    id: 'welcome',
    icon: 'sparkles',
    iconColor: Colors.accent,
    iconBg: Colors.accent + '25',
    title: 'Welcome to NoteSync',
    subtitle: 'Turn any handwritten note into a clean, structured Notion page — in seconds. No typing. No hassle.',
  },
  {
    id: 'scan',
    icon: 'camera',
    iconColor: Colors.info,
    iconBg: Colors.info + '25',
    title: 'Snap & Extract',
    subtitle: 'Point your camera at any handwritten page. Our AI reads every word — even messy, faint pencil — and formats it beautifully.',
  },
  {
    id: 'multipage',
    icon: 'documents',
    iconColor: Colors.success,
    iconBg: Colors.success + '25',
    title: 'Multi-Page Ready',
    subtitle: 'Select up to 10 pages from your gallery at once. We compile them into one clean Notion document with page headings.',
  },
  {
    id: 'notion',
    icon: 'link',
    iconColor: Colors.accent,
    iconBg: Colors.accent + '20',
    title: 'Connect Notion',
    subtitle: 'Link your Notion workspace so NoteSync can send notes directly into any of your pages. Takes under 30 seconds.',
    isActionSlide: true,
  },
];

// ── Main component ────────────────────────────────────────────
export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const { user, token, refreshUser } = useAuth();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [notionConnecting, setNotionConnecting] = useState(false);
  const [notionConnected, setNotionConnected] = useState(false);
  const [slideKey, setSlideKey] = useState(0); // change to re-trigger entry animations

  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const bottomInset = Platform.OS === 'web' ? 34 : insets.bottom;

  const slide = SLIDES[currentIndex];
  const isLastSlide = currentIndex === SLIDES.length - 1;

  // Detect Notion connection success via deep link
  useEffect(() => {
    const handler = ({ url }: { url: string }) => {
      if (url.startsWith('notesync://notion-connected')) {
        setNotionConnecting(false);
        setNotionConnected(true);
        refreshUser();
      }
    };
    const sub = Linking.addEventListener('url', handler);
    return () => sub.remove();
  }, [refreshUser]);

  // Pick up if user already had Notion connected
  useEffect(() => {
    if (user?.notionConnected) setNotionConnected(true);
  }, [user]);

  function goToSlide(index: number) {
    setCurrentIndex(index);
    setSlideKey(k => k + 1); // bump key so Animated.View re-mounts and re-runs entry anim
  }

  function handleNext() {
    if (currentIndex < SLIDES.length - 1) {
      goToSlide(currentIndex + 1);
    }
  }

  async function handleConnectNotion() {
    if (!token) return;
    setNotionConnecting(true);
    try {
      const apiUrl = getApiUrl();
      const returnUrl = ExpoLinking.createURL('notion-connected');
      const authUrl = `${apiUrl}/api/notion/auth?token=${token}&returnUrl=${encodeURIComponent(returnUrl)}`;
      await WebBrowser.openBrowserAsync(authUrl);
    } catch {
      setNotionConnecting(false);
    }
  }

  async function finishOnboarding() {
    if (user?.id) {
      await AsyncStorage.setItem(getOnboardingKey(user.id), 'true');
    }
    router.replace('/');
  }

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>

      {/* Skip — top right, hidden on last slide */}
      {!isLastSlide && (
        <Animated.View entering={FadeIn.duration(300)} style={styles.skipRow}>
          <Pressable onPress={finishOnboarding} hitSlop={16}>
            <Text style={styles.skipText}>Skip</Text>
          </Pressable>
        </Animated.View>
      )}

      {/* ── Slide content (re-keyed on each transition) ── */}
      <Animated.View
        key={slideKey}
        entering={FadeInDown.duration(380)}
        exiting={FadeOut.duration(150)}
        style={styles.slideContent}
      >
        {/* Icon bubble */}
        <View style={[styles.iconBubble, { backgroundColor: slide.iconBg }]}>
          <Ionicons name={slide.icon} size={52} color={slide.iconColor} />
        </View>

        {/* Title */}
        <Text style={styles.title}>{slide.title}</Text>

        {/* Subtitle */}
        <Text style={styles.subtitle}>{slide.subtitle}</Text>

        {/* Notion action slide */}
        {slide.isActionSlide && (
          <View style={styles.actionArea}>
            {notionConnected ? (
              <View style={styles.connectedBox}>
                <Ionicons name="checkmark-circle" size={24} color={Colors.success} />
                <Text style={styles.connectedText}>Notion connected!</Text>
              </View>
            ) : (
              <Pressable
                style={({ pressed }) => [
                  styles.connectButton,
                  pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] },
                  notionConnecting && { opacity: 0.6 },
                ]}
                onPress={handleConnectNotion}
                disabled={notionConnecting}
              >
                {notionConnecting
                  ? <ActivityIndicator size="small" color={Colors.background} />
                  : <Ionicons name="open-outline" size={18} color={Colors.background} />}
                <Text style={styles.connectButtonText}>
                  {notionConnecting ? 'Opening Notion…' : 'Connect with Notion'}
                </Text>
              </Pressable>
            )}

            {notionConnected ? (
              <Pressable
                style={({ pressed }) => [styles.startButton, pressed && { opacity: 0.85 }]}
                onPress={finishOnboarding}
              >
                <Text style={styles.startButtonText}>Start Scanning →</Text>
              </Pressable>
            ) : (
              <Pressable onPress={finishOnboarding} hitSlop={12}>
                <Text style={styles.skipLinkText}>I'll connect later from Settings</Text>
              </Pressable>
            )}
          </View>
        )}
      </Animated.View>

      {/* ── Bottom bar: dots + Next button ── */}
      <View style={[styles.bottomBar, { paddingBottom: 20 + bottomInset }]}>
        {/* Dots */}
        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <Pressable key={i} onPress={() => goToSlide(i)} hitSlop={8}>
              <View style={[styles.dot, i === currentIndex && styles.dotActive]} />
            </Pressable>
          ))}
        </View>

        {/* Next / hidden on last slide */}
        {!isLastSlide && (
          <Pressable
            style={({ pressed }) => [
              styles.nextButton,
              pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] },
            ]}
            onPress={handleNext}
          >
            <Text style={styles.nextButtonText}>Next</Text>
            <Ionicons name="arrow-forward" size={17} color={Colors.background} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  skipRow: {
    alignItems: 'flex-end',
    paddingHorizontal: 24,
    paddingBottom: 4,
  },
  skipText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 15,
    color: Colors.textTertiary,
  },

  // ── Slide ─────────────────────────────────────────
  slideContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 36,
  },
  iconBubble: {
    width: 120,
    height: 120,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 40,
  },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: 28,
    color: Colors.text,
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 36,
  },
  subtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 16,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 26,
  },

  // ── Notion action slide ─────────────────────────
  actionArea: {
    marginTop: 40,
    width: '100%',
    alignItems: 'center',
    gap: 14,
  },
  connectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: Colors.text,
    paddingVertical: 16,
    borderRadius: 14,
    width: '100%',
  },
  connectButtonText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
    color: Colors.background,
  },
  connectedBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: Colors.success + '18',
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.success + '40',
    width: '100%',
  },
  connectedText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
    color: Colors.success,
  },
  startButton: {
    backgroundColor: Colors.accent,
    paddingVertical: 16,
    borderRadius: 14,
    width: '100%',
    alignItems: 'center',
  },
  startButtonText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
    color: Colors.background,
  },
  skipLinkText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: Colors.textTertiary,
    textDecorationLine: 'underline',
  },

  // ── Bottom bar ──────────────────────────────────
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  dots: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.surfaceHighlight,
  },
  dotActive: {
    width: 24,
    backgroundColor: Colors.accent,
  },
  nextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.accent,
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 12,
  },
  nextButtonText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: Colors.background,
  },
});
