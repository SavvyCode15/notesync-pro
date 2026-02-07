import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Platform,
  Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import Colors from '@/constants/colors';
import { getApiUrl } from '@/lib/query-client';

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const bottomInset = Platform.OS === 'web' ? 34 : insets.bottom;

  const [notionStatus, setNotionStatus] = useState<'loading' | 'connected' | 'disconnected'>('loading');
  const [notionUser, setNotionUser] = useState<string>('');

  useEffect(() => {
    checkNotionStatus();
  }, []);

  async function checkNotionStatus() {
    setNotionStatus('loading');
    try {
      const baseUrl = getApiUrl();
      const url = new URL('/api/notion/status', baseUrl);
      const response = await fetch(url.toString());
      const data = await response.json();

      if (data.connected) {
        setNotionStatus('connected');
        setNotionUser(data.user || 'Connected');
      } else {
        setNotionStatus('disconnected');
      }
    } catch {
      setNotionStatus('disconnected');
    }
  }

  const steps = [
    {
      number: '1',
      title: 'Create a Notion Integration',
      description: 'Go to notion.so/my-integrations and create a new internal integration. Give it a name like "NoteSync".',
    },
    {
      number: '2',
      title: 'Copy the API Token',
      description: 'After creating the integration, copy the "Internal Integration Secret" token.',
    },
    {
      number: '3',
      title: 'Add Token to App',
      description: 'Add the token as a secret named NOTION_API_KEY in this app\'s Secrets panel.',
    },
    {
      number: '4',
      title: 'Share Pages with Integration',
      description: 'In Notion, open each page you want to use, click "..." menu, go to "Connections", and add your NoteSync integration.',
    },
  ];

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      <Animated.View entering={FadeIn.duration(300)} style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={({ pressed }) => [styles.backButton, pressed && { opacity: 0.6 }]}
        >
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 40 }} />
      </Animated.View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 40 + bottomInset }]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeInDown.delay(100).duration(400)} style={styles.statusCard}>
          <View style={styles.statusHeader}>
            <View style={styles.notionIconWrap}>
              <Feather name="book-open" size={20} color={Colors.accent} />
            </View>
            <View style={styles.statusInfo}>
              <Text style={styles.statusLabel}>Notion Connection</Text>
              {notionStatus === 'loading' ? (
                <ActivityIndicator size="small" color={Colors.accent} />
              ) : notionStatus === 'connected' ? (
                <View style={styles.statusBadge}>
                  <View style={[styles.statusDot, { backgroundColor: Colors.success }]} />
                  <Text style={[styles.statusValue, { color: Colors.success }]}>
                    {notionUser}
                  </Text>
                </View>
              ) : (
                <View style={styles.statusBadge}>
                  <View style={[styles.statusDot, { backgroundColor: Colors.danger }]} />
                  <Text style={[styles.statusValue, { color: Colors.danger }]}>Not Connected</Text>
                </View>
              )}
            </View>
          </View>
          {notionStatus === 'connected' && (
            <Pressable
              style={({ pressed }) => [styles.refreshButton, pressed && { opacity: 0.7 }]}
              onPress={checkNotionStatus}
            >
              <Feather name="refresh-cw" size={14} color={Colors.textSecondary} />
              <Text style={styles.refreshText}>Refresh Status</Text>
            </Pressable>
          )}
        </Animated.View>

        {notionStatus !== 'connected' && (
          <>
            <Animated.View entering={FadeInDown.delay(200).duration(400)}>
              <Text style={styles.sectionTitle}>Setup Guide</Text>
              <Text style={styles.sectionSubtitle}>
                Follow these steps to connect your Notion workspace.
              </Text>
            </Animated.View>

            {steps.map((step, index) => (
              <Animated.View
                key={step.number}
                entering={FadeInDown.delay(250 + index * 80).duration(400)}
                style={styles.stepCard}
              >
                <View style={styles.stepNumberWrap}>
                  <Text style={styles.stepNumber}>{step.number}</Text>
                </View>
                <View style={styles.stepContent}>
                  <Text style={styles.stepTitle}>{step.title}</Text>
                  <Text style={styles.stepDescription}>{step.description}</Text>
                </View>
              </Animated.View>
            ))}

            <Animated.View entering={FadeInDown.delay(600).duration(400)}>
              <Pressable
                style={({ pressed }) => [styles.linkButton, pressed && { opacity: 0.8 }]}
                onPress={() => Linking.openURL('https://www.notion.so/my-integrations')}
              >
                <Feather name="external-link" size={16} color={Colors.accent} />
                <Text style={styles.linkButtonText}>Open Notion Integrations</Text>
              </Pressable>
            </Animated.View>
          </>
        )}

        <Animated.View entering={FadeInDown.delay(700).duration(400)} style={styles.aboutSection}>
          <Text style={styles.aboutTitle}>About NoteSync</Text>
          <Text style={styles.aboutText}>
            Scan handwritten notes, convert them with AI, and send directly to your Notion workspace. Bridge the gap between pen-and-paper learning and your digital knowledge base.
          </Text>
          <Text style={styles.versionText}>Version 1.0.0</Text>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 17,
    color: Colors.text,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  statusCard: {
    backgroundColor: Colors.surface,
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 28,
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  notionIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.accent + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusInfo: {
    flex: 1,
    gap: 4,
  },
  statusLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: Colors.textSecondary,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusValue: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
  },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-end',
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: Colors.surfaceElevated,
  },
  refreshText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.textSecondary,
  },
  sectionTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 20,
    color: Colors.text,
    marginBottom: 6,
  },
  sectionSubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 20,
    lineHeight: 20,
  },
  stepCard: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 14,
  },
  stepNumberWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.accent + '20',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumber: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
    color: Colors.accent,
  },
  stepContent: {
    flex: 1,
    gap: 4,
  },
  stepTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: Colors.text,
  },
  stepDescription: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 19,
  },
  linkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: Colors.accent + '15',
    marginTop: 10,
    marginBottom: 28,
  },
  linkButtonText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: Colors.accent,
  },
  aboutSection: {
    backgroundColor: Colors.surface,
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    marginTop: 12,
  },
  aboutTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
    color: Colors.text,
    marginBottom: 8,
  },
  aboutText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 20,
    marginBottom: 12,
  },
  versionText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.textTertiary,
  },
});
