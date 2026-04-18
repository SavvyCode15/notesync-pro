import React, { useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Dimensions,
  Platform,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown, FadeInUp } from 'react-native-reanimated';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as WebBrowser from 'expo-web-browser';
import * as ExpoLinking from 'expo-linking';
import { router } from 'expo-router';
import Colors from '@/constants/colors';
import { getApiUrl } from '@/lib/query-client';
import { useAuth } from '@/lib/auth-context';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

/** Returns the per-user AsyncStorage key for the onboarding completion flag */
export function getOnboardingKey(userId: string) {
  return `@notesync_onboarded_${userId}`;
}

// ── Slide data ───────────────────────────────────────────────
type Slide = {
  id: string;
  icon: string;
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
    iconBg: Colors.accent + '20',
    title: 'Welcome to NoteSync',
    subtitle:
      'Turn any handwritten note into a clean, structured Notion page — in seconds. No typing. No hassle.',
  },
  {
    id: 'scan',
    icon: 'camera',
    iconColor: Colors.info,
    iconBg: Colors.info + '20',
    title: 'Snap & Extract',
    subtitle:
      'Point your camera at any handwritten page. Our AI reads every word — even messy, faint pencil — and formats it beautifully.',
  },
  {
    id: 'multipage',
    icon: 'documents',
    iconColor: Colors.success,
    iconBg: Colors.success + '20',
    title: 'Multi-Page Ready',
    subtitle:
      'Select up to 10 pages from your gallery at once. We compile them all into one clean Notion document with page headings.',
  },
  {
    id: 'notion',
    icon: 'link',
    iconColor: '#ffffff',
    iconBg: '#333',
    title: 'Connect Notion',
    subtitle:
      'Link your Notion workspace so NoteSync can send notes directly into any of your pages. Takes under 30 seconds.',
    isActionSlide: true,
  },
];

// ── Main component ────────────────────────────────────────────
export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const { user, token, refreshUser } = useAuth();
  const flatListRef = useRef<FlatList>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [notionConnecting, setNotionConnecting] = useState(false);
  const [notionConnected, setNotionConnected] = useState(false);

  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const bottomInset = Platform.OS === 'web' ? 34 : insets.bottom;

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

  // Also pick up if user already had Notion connected (e.g. re-opening mid-flow)
  useEffect(() => {
    if (user?.notionConnected) setNotionConnected(true);
  }, [user]);

  function scrollToSlide(index: number) {
    flatListRef.current?.scrollToIndex({ index, animated: true });
    setCurrentIndex(index);
  }

  function handleNext() {
    if (currentIndex < SLIDES.length - 1) {
      scrollToSlide(currentIndex + 1);
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

  // ── Render each slide ──────────────────────────────────────
  function renderSlide({ item, index }: { item: Slide; index: number }) {
    const isActive = index === currentIndex;
    const isLast = index === SLIDES.length - 1;

    return (
      <View style={[styles.slide, { width: SCREEN_WIDTH }]}>
        {/* Big icon bubble */}
        <Animated.View
          entering={isActive ? FadeInDown.delay(100).duration(500) : undefined}
          style={[styles.iconBubble, { backgroundColor: item.iconBg }]}
        >
          <Ionicons name={item.icon as any} size={52} color={item.iconColor} />
        </Animated.View>

        {/* Title */}
        <Animated.Text
          entering={isActive ? FadeInUp.delay(200).duration(450) : undefined}
          style={styles.slideTitle}
        >
          {item.title}
        </Animated.Text>

        {/* Subtitle */}
        <Animated.Text
          entering={isActive ? FadeInUp.delay(300).duration(450) : undefined}
          style={styles.slideSubtitle}
        >
          {item.subtitle}
        </Animated.Text>

        {/* Action slide content — Notion connect */}
        {item.isActionSlide && (
          <Animated.View
            entering={isActive ? FadeInUp.delay(400).duration(450) : undefined}
            style={styles.actionArea}
          >
            {notionConnected ? (
              /* ✓ Success state */
              <View style={styles.connectedBox}>
                <Ionicons name="checkmark-circle" size={28} color={Colors.success} />
                <Text style={styles.connectedText}>Notion connected!</Text>
              </View>
            ) : (
              /* Connect button */
              <Pressable
                style={({ pressed }) => [
                  styles.connectButton,
                  pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] },
                  notionConnecting && { opacity: 0.6 },
                ]}
                onPress={handleConnectNotion}
                disabled={notionConnecting}
              >
                {notionConnecting ? (
                  <ActivityIndicator size="small" color={Colors.background} />
                ) : (
                  <Ionicons name="logo-google" size={18} color={Colors.background} />
                )}
                <Text style={styles.connectButtonText}>
                  {notionConnecting ? 'Opening Notion...' : 'Connect with Notion'}
                </Text>
              </Pressable>
            )}

            {/* Skip link */}
            {!notionConnected && (
              <Pressable onPress={finishOnboarding} hitSlop={12} style={styles.skipLink}>
                <Text style={styles.skipLinkText}>I'll connect later from Settings</Text>
              </Pressable>
            )}

            {/* Start scanning CTA — shown after connecting */}
            {notionConnected && (
              <Pressable
                style={({ pressed }) => [
                  styles.startButton,
                  pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] },
                ]}
                onPress={finishOnboarding}
              >
                <Text style={styles.startButtonText}>Start Scanning →</Text>
              </Pressable>
            )}
          </Animated.View>
        )}
      </View>
    );
  }

  // ── Layout ─────────────────────────────────────────────────
  const isLastSlide = currentIndex === SLIDES.length - 1;

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      {/* Skip button — top right (hidden on last slide) */}
      {!isLastSlide && (
        <Animated.View entering={FadeIn.duration(400)} style={styles.skipTopRow}>
          <Pressable onPress={finishOnboarding} hitSlop={12}>
            <Text style={styles.skipTopText}>Skip</Text>
          </Pressable>
        </Animated.View>
      )}

      {/* Slides */}
      <FlatList
        ref={flatListRef}
        data={SLIDES}
        keyExtractor={(s) => s.id}
        horizontal
        pagingEnabled
        scrollEnabled
        showsHorizontalScrollIndicator={false}
        renderItem={renderSlide}
        onMomentumScrollEnd={(e) => {
          const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
          setCurrentIndex(idx);
        }}
        style={{ flex: 1 }}
        contentContainerStyle={{ alignItems: 'center' }}
      />

      {/* Bottom: dots + Next button */}
      <View style={[styles.bottomBar, { paddingBottom: 16 + bottomInset }]}>
        {/* Dot pagination */}
        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <Pressable key={i} onPress={() => scrollToSlide(i)} hitSlop={8}>
              <View
                style={[
                  styles.dot,
                  i === currentIndex && styles.dotActive,
                ]}
              />
            </Pressable>
          ))}
        </View>

        {/* Next button — hidden on last slide */}
        {!isLastSlide && (
          <Pressable
            style={({ pressed }) => [
              styles.nextButton,
              pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] },
            ]}
            onPress={handleNext}
          >
            <Text style={styles.nextButtonText}>Next</Text>
            <Ionicons name="arrow-forward" size={18} color={Colors.background} />
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
  skipTopRow: {
    alignItems: 'flex-end',
    paddingHorizontal: 24,
    paddingBottom: 8,
  },
  skipTopText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 15,
    color: Colors.textTertiary,
  },
  slide: {
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
  slideTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 28,
    color: Colors.text,
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 36,
  },
  slideSubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 16,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 26,
    maxWidth: 320,
  },
  actionArea: {
    marginTop: 44,
    width: '100%',
    alignItems: 'center',
    gap: 16,
  },
  connectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: Colors.text,
    paddingVertical: 16,
    paddingHorizontal: 32,
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
    gap: 10,
    backgroundColor: Colors.success + '18',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.success + '40',
    width: '100%',
    justifyContent: 'center',
  },
  connectedText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
    color: Colors.success,
  },
  startButton: {
    backgroundColor: Colors.accent,
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 14,
    width: '100%',
    alignItems: 'center',
  },
  startButtonText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
    color: Colors.background,
  },
  skipLink: {
    marginTop: 4,
  },
  skipLinkText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: Colors.textTertiary,
    textDecorationLine: 'underline',
  },
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
