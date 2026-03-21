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
  TextInput,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import Colors from '@/constants/colors';
import { getApiUrl } from '@/lib/query-client';
import { useAuth } from '@/lib/auth-context';

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { user, token, logout, refreshUser } = useAuth();
  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const bottomInset = Platform.OS === 'web' ? 34 : insets.bottom;

  const [notionStatus, setNotionStatus] = useState<'loading' | 'connected' | 'disconnected'>('loading');
  const [notionUser, setNotionUser] = useState<string>('');
  const [showManualKey, setShowManualKey] = useState(false);
  const [notionKey, setNotionKey] = useState('');
  const [savingKey, setSavingKey] = useState(false);

  const [showGroqInput, setShowGroqInput] = useState(false);
  const [groqKey, setGroqKey] = useState('');
  const [savingGroqKey, setSavingGroqKey] = useState(false);
  const groqConnected = user?.groqConnected ?? false;

  const [scanUsage, setScanUsage] = useState<{ used: number; limit: number } | null>(null);

  useEffect(() => {
    if (token) {
      checkNotionStatus();
      fetchScanUsage();
    }
  }, [token]);

  async function fetchScanUsage() {
    if (!token) return;
    try {
      const resp = await fetch(new URL('/api/user/scan-usage', getApiUrl()).toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (resp.ok) {
        const data = await resp.json();
        setScanUsage({ used: data.used, limit: data.limit });
      }
    } catch { }
  }

  async function checkNotionStatus() {
    if (!token) return;
    setNotionStatus('loading');
    try {
      const baseUrl = getApiUrl();
      const resp = await fetch(new URL('/api/notion/status', baseUrl).toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await resp.json();
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

  async function handleSaveNotionKey() {
    if (!notionKey.trim()) {
      Alert.alert('Missing key', 'Please paste your Notion integration token.');
      return;
    }
    setSavingKey(true);
    try {
      const resp = await fetch(new URL('/api/user/notion-key', getApiUrl()).toString(), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ notionApiKey: notionKey.trim() }),
      });
      if (!resp.ok) throw new Error('Failed');
      setNotionKey('');
      setShowManualKey(false);
      await refreshUser();
      await checkNotionStatus();
    } catch {
      Alert.alert('Error', 'Failed to save the Notion key. Please try again.');
    } finally {
      setSavingKey(false);
    }
  }

  async function handleConnectWithNotion() {
    if (!token) return;
    const apiUrl = getApiUrl();
    const authUrl = `${apiUrl}/api/notion/auth?token=${token}`;

    // Use WebBrowser instead of Linking to force an in-app browser.
    // This prevents the native Notion app from intercepting the URL and breaking the flow.
    await WebBrowser.openBrowserAsync(authUrl);
  }

  async function handleDisconnectNotion() {
    Alert.alert('Disconnect Notion', 'Remove your Notion connection?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect',
        style: 'destructive',
        onPress: async () => {
          try {
            const baseUrl = getApiUrl();
            await fetch(new URL('/api/user/notion-key', baseUrl).toString(), {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${token}` },
            });
            await refreshUser();
            setNotionStatus('disconnected');
            setNotionUser('');
          } catch {
            Alert.alert('Error', 'Failed to disconnect Notion.');
          }
        },
      },
    ]);
  }

  async function handleSaveGroqKey() {
    if (!groqKey.trim()) {
      Alert.alert('Missing key', 'Please paste your Groq API key.');
      return;
    }
    setSavingGroqKey(true);
    try {
      const baseUrl = getApiUrl();
      const resp = await fetch(new URL('/api/user/groq-key', baseUrl).toString(), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ groqApiKey: groqKey.trim() }),
      });
      if (!resp.ok) throw new Error('Failed');
      setGroqKey('');
      setShowGroqInput(false);
      await refreshUser();
    } catch {
      Alert.alert('Error', 'Failed to save the Groq key. Please try again.');
    } finally {
      setSavingGroqKey(false);
    }
  }

  async function handleDisconnectGroq() {
    Alert.alert('Disconnect Groq', 'Remove your Groq API key?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            const baseUrl = getApiUrl();
            await fetch(new URL('/api/user/groq-key', baseUrl).toString(), {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${token}` },
            });
            await refreshUser();
          } catch {
            Alert.alert('Error', 'Failed to remove Groq key.');
          }
        },
      },
    ]);
  }

  async function handleLogout() {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: logout },
    ]);
  }

  const setupSteps = [
    { number: '1', title: 'Create a Notion Integration', description: 'Go to notion.so/my-integrations and create a new internal integration. Name it "NoteSync".' },
    { number: '2', title: 'Copy the Secret Token', description: 'After creating the integration, copy the "Internal Integration Secret" token.' },
    { number: '3', title: 'Paste it above', description: 'Tap "Connect Notion" and paste your token to link your workspace.' },
    { number: '4', title: 'Share Pages with Integration', description: 'In Notion, open each page → click "..." → Connections → add your NoteSync integration.' },
  ];

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      <Animated.View entering={FadeIn.duration(300)} style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={({ pressed }) => [styles.backButton, pressed && { opacity: 0.6 }]}>
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 40 }} />
      </Animated.View>

      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: 40 + bottomInset }]} showsVerticalScrollIndicator={false}>
        {/* Account card */}
        <Animated.View entering={FadeInDown.delay(80).duration(400)} style={styles.accountCard}>
          <View style={styles.accountIcon}>
            <Ionicons name="person-circle-outline" size={36} color={Colors.accent} />
          </View>
          <View style={styles.accountInfo}>
            {user?.name ? <Text style={styles.accountName}>{user.name}</Text> : null}
            <Text style={styles.accountEmail}>{user?.email}</Text>
          </View>
          <Pressable onPress={handleLogout} hitSlop={8} style={({ pressed }) => [styles.logoutButton, pressed && { opacity: 0.7 }]}>
            <Ionicons name="log-out-outline" size={20} color={Colors.danger} />
          </Pressable>
        </Animated.View>

        {/* Scan Usage Card (free tier) */}
        {scanUsage !== null && (
          <Animated.View entering={FadeInDown.delay(130).duration(400)} style={styles.usageCard}>
            <View style={styles.usageHeader}>
              <Ionicons name="scan-outline" size={18} color={scanUsage.used >= scanUsage.limit ? Colors.danger : Colors.accent} />
              <Text style={styles.usageTitle}>Free Daily Scans</Text>
              <Text style={[styles.usageCount, scanUsage.used >= scanUsage.limit && { color: Colors.danger }]}>
                {scanUsage.used} / {scanUsage.limit}
              </Text>
            </View>
            <View style={styles.usageBarBg}>
              <View
                style={[styles.usageBarFill, {
                  width: `${Math.min(1, scanUsage.used / scanUsage.limit) * 100}%` as any,
                  backgroundColor: scanUsage.used >= scanUsage.limit ? Colors.danger : Colors.accent,
                }]}
              />
            </View>
            <Text style={styles.usageHint}>
              {scanUsage.used >= scanUsage.limit
                ? `All ${scanUsage.limit} free scans used today. Add your Groq key below for unlimited access.`
                : `${scanUsage.limit - scanUsage.used} free scan${scanUsage.limit - scanUsage.used !== 1 ? 's' : ''} remaining today`}
            </Text>
          </Animated.View>
        )}

        {/* Notion connection card */}
        <Animated.View entering={FadeInDown.delay(160).duration(400)} style={styles.statusCard}>
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
                  <Text style={[styles.statusValue, { color: Colors.success }]}>{notionUser}</Text>
                </View>
              ) : (
                <View style={styles.statusBadge}>
                  <View style={[styles.statusDot, { backgroundColor: Colors.danger }]} />
                  <Text style={[styles.statusValue, { color: Colors.danger }]}>Not Connected</Text>
                </View>
              )}
            </View>
          </View>

          {notionStatus === 'connected' ? (
            <View style={styles.connectedActions}>
              <Pressable style={({ pressed }) => [styles.actionButton, pressed && { opacity: 0.7 }]} onPress={checkNotionStatus}>
                <Feather name="refresh-cw" size={14} color={Colors.textSecondary} />
                <Text style={styles.actionButtonText}>Refresh</Text>
              </Pressable>
              <Pressable style={({ pressed }) => [styles.actionButton, styles.actionButtonDanger, pressed && { opacity: 0.7 }]} onPress={handleDisconnectNotion}>
                <Feather name="x" size={14} color={Colors.danger} />
                <Text style={[styles.actionButtonText, { color: Colors.danger }]}>Disconnect</Text>
              </Pressable>
            </View>
          ) : (
            <>
              {/* Primary: OAuth button */}
              <Pressable style={({ pressed }) => [styles.connectButton, pressed && { opacity: 0.8 }]} onPress={handleConnectWithNotion}>
                <Feather name="link" size={16} color={Colors.accent} />
                <Text style={styles.connectButtonText}>Connect with Notion</Text>
              </Pressable>

              {/* Fallback: manual key paste */}
              {!showManualKey ? (
                <Pressable onPress={() => setShowManualKey(true)} style={styles.advancedToggle}>
                  <Text style={styles.advancedToggleText}>Advanced: use API key instead</Text>
                </Pressable>
              ) : (
                <View style={styles.keyInputContainer}>
                  <TextInput
                    style={styles.keyInput}
                    placeholder="Paste your Notion integration token..."
                    placeholderTextColor={Colors.textTertiary}
                    value={notionKey}
                    onChangeText={setNotionKey}
                    autoCapitalize="none"
                    autoCorrect={false}
                    selectionColor={Colors.accent}
                  />
                  <View style={styles.keyInputActions}>
                    <Pressable style={({ pressed }) => [styles.keyActionButton, pressed && { opacity: 0.7 }]} onPress={() => { setShowManualKey(false); setNotionKey(''); }}>
                      <Text style={styles.keyActionCancel}>Cancel</Text>
                    </Pressable>
                    <Pressable style={({ pressed }) => [styles.keyActionButton, styles.keyActionSave, pressed && { opacity: 0.8 }]} onPress={handleSaveNotionKey} disabled={savingKey}>
                      {savingKey ? <ActivityIndicator size="small" color={Colors.background} /> : <Text style={styles.keyActionSaveText}>Save</Text>}
                    </Pressable>
                  </View>
                </View>
              )}
            </>
          )}
        </Animated.View>

        {/* Groq OCR card */}
        <Animated.View entering={FadeInDown.delay(200).duration(400)} style={styles.statusCard}>
          <View style={styles.statusHeader}>
            <View style={styles.notionIconWrap}>
              <Ionicons name="flash-outline" size={20} color={Colors.accent} />
            </View>
            <View style={styles.statusInfo}>
              <Text style={styles.statusLabel}>Groq AI (OCR)</Text>
              <View style={styles.statusBadge}>
                <View style={[styles.statusDot, { backgroundColor: groqConnected ? Colors.success : Colors.danger }]} />
                <Text style={[styles.statusValue, { color: groqConnected ? Colors.success : Colors.danger }]}>
                  {groqConnected ? 'Key Saved' : 'Not Connected'}
                </Text>
              </View>
            </View>
          </View>

          {groqConnected ? (
            <View style={styles.connectedActions}>
              <Pressable style={({ pressed }) => [styles.actionButton, styles.actionButtonDanger, pressed && { opacity: 0.7 }]} onPress={handleDisconnectGroq}>
                <Feather name="x" size={14} color={Colors.danger} />
                <Text style={[styles.actionButtonText, { color: Colors.danger }]}>Remove Key</Text>
              </Pressable>
            </View>
          ) : (
            <>
              {!showGroqInput ? (
                <Pressable style={({ pressed }) => [styles.connectButton, pressed && { opacity: 0.8 }]} onPress={() => setShowGroqInput(true)}>
                  <Feather name="key" size={16} color={Colors.accent} />
                  <Text style={styles.connectButtonText}>Add Groq Key</Text>
                </Pressable>
              ) : (
                <View style={styles.keyInputContainer}>
                  <TextInput
                    style={styles.keyInput}
                    placeholder="Paste your Groq API key (gsk_...)"
                    placeholderTextColor={Colors.textTertiary}
                    value={groqKey}
                    onChangeText={setGroqKey}
                    autoCapitalize="none"
                    autoCorrect={false}
                    selectionColor={Colors.accent}
                  />
                  <View style={styles.keyInputActions}>
                    <Pressable style={({ pressed }) => [styles.keyActionButton, pressed && { opacity: 0.7 }]} onPress={() => { setShowGroqInput(false); setGroqKey(''); }}>
                      <Text style={styles.keyActionCancel}>Cancel</Text>
                    </Pressable>
                    <Pressable style={({ pressed }) => [styles.keyActionButton, styles.keyActionSave, pressed && { opacity: 0.8 }]} onPress={handleSaveGroqKey} disabled={savingGroqKey}>
                      {savingGroqKey ? <ActivityIndicator size="small" color={Colors.background} /> : <Text style={styles.keyActionSaveText}>Save</Text>}
                    </Pressable>
                  </View>
                </View>
              )}
            </>
          )}
        </Animated.View>

        {/* Setup guide (shown when not connected) */}
        {notionStatus !== 'connected' && !showManualKey && (
          <>
            <Animated.View entering={FadeInDown.delay(240).duration(400)}>
              <Text style={styles.sectionTitle}>Setup Guide</Text>
              <Text style={styles.sectionSubtitle}>Follow these steps to connect your Notion workspace.</Text>
            </Animated.View>
            {setupSteps.map((step, index) => (
              <Animated.View key={step.number} entering={FadeInDown.delay(280 + index * 70).duration(400)} style={styles.stepCard}>
                <View style={styles.stepNumberWrap}><Text style={styles.stepNumber}>{step.number}</Text></View>
                <View style={styles.stepContent}>
                  <Text style={styles.stepTitle}>{step.title}</Text>
                  <Text style={styles.stepDescription}>{step.description}</Text>
                </View>
              </Animated.View>
            ))}
            <Animated.View entering={FadeInDown.delay(580).duration(400)}>
              <Pressable style={({ pressed }) => [styles.linkButton, pressed && { opacity: 0.8 }]} onPress={() => Linking.openURL('https://www.notion.so/my-integrations')}>
                <Feather name="external-link" size={16} color={Colors.accent} />
                <Text style={styles.linkButtonText}>Open Notion Integrations</Text>
              </Pressable>
              <Pressable style={({ pressed }) => [styles.linkButton, { marginTop: 10 }, pressed && { opacity: 0.8 }]} onPress={() => Linking.openURL('https://console.groq.com')}>
                <Feather name="external-link" size={16} color={Colors.accent} />
                <Text style={styles.linkButtonText}>Get Free Groq API Key</Text>
              </Pressable>
            </Animated.View>
          </>
        )}

        {/* About */}
        <Animated.View entering={FadeInDown.delay(700).duration(400)} style={styles.aboutSection}>
          <Text style={styles.aboutTitle}>About NoteSync</Text>
          <Text style={styles.aboutText}>Scan handwritten notes, convert them with AI, and send directly to your Notion workspace. Bridge the gap between pen-and-paper learning and your digital knowledge base.</Text>
          <Text style={styles.versionText}>Version 1.0.0</Text>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  backButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 17, color: Colors.text },
  scrollContent: { paddingHorizontal: 20, paddingTop: 12 },
  accountCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, borderRadius: 18, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: Colors.border, gap: 12 },
  accountIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: Colors.accent + '15', alignItems: 'center', justifyContent: 'center' },
  accountInfo: { flex: 1 },
  accountName: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: Colors.text },
  accountEmail: { fontFamily: 'Inter_400Regular', fontSize: 13, color: Colors.textSecondary },
  logoutButton: { padding: 8 },
  usageCard: {
    backgroundColor: Colors.surface,
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 16,
    gap: 10,
  },
  usageHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  usageTitle: { fontFamily: 'Inter_500Medium', fontSize: 14, color: Colors.textSecondary, flex: 1 },
  usageCount: { fontFamily: 'Inter_700Bold', fontSize: 14, color: Colors.accent },
  usageBarBg: { height: 6, borderRadius: 3, backgroundColor: Colors.surfaceElevated, overflow: 'hidden' },
  usageBarFill: { height: '100%', borderRadius: 3 },
  usageHint: { fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.textTertiary },
  advancedToggle: { alignSelf: 'center', marginTop: 10 },
  advancedToggleText: { fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.textTertiary, textDecorationLine: 'underline' },
  statusCard: { backgroundColor: Colors.surface, borderRadius: 18, padding: 18, borderWidth: 1, borderColor: Colors.border, marginBottom: 24 },
  statusHeader: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  notionIconWrap: { width: 44, height: 44, borderRadius: 12, backgroundColor: Colors.accent + '15', alignItems: 'center', justifyContent: 'center' },
  statusInfo: { flex: 1, gap: 4 },
  statusLabel: { fontFamily: 'Inter_500Medium', fontSize: 14, color: Colors.textSecondary },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusValue: { fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  connectedActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  actionButton: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: Colors.surfaceElevated },
  actionButtonDanger: { backgroundColor: Colors.danger + '10' },
  actionButtonText: { fontFamily: 'Inter_500Medium', fontSize: 13, color: Colors.textSecondary },
  connectButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 14, paddingVertical: 12, borderRadius: 12, backgroundColor: Colors.accent + '15', borderWidth: 1, borderColor: Colors.accent + '30' },
  connectButtonText: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: Colors.accent },
  keyInputContainer: { marginTop: 14 },
  keyInput: { backgroundColor: Colors.surfaceElevated, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 14, paddingVertical: 12, fontFamily: 'Inter_400Regular', fontSize: 13, color: Colors.text, marginBottom: 10 },
  keyInputActions: { flexDirection: 'row', gap: 10 },
  keyActionButton: { flex: 1, paddingVertical: 11, borderRadius: 10, alignItems: 'center', backgroundColor: Colors.surfaceElevated },
  keyActionSave: { backgroundColor: Colors.accent },
  keyActionCancel: { fontFamily: 'Inter_500Medium', fontSize: 14, color: Colors.textSecondary },
  keyActionSaveText: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: Colors.background },
  sectionTitle: { fontFamily: 'Inter_700Bold', fontSize: 20, color: Colors.text, marginBottom: 6 },
  sectionSubtitle: { fontFamily: 'Inter_400Regular', fontSize: 14, color: Colors.textSecondary, marginBottom: 20, lineHeight: 20 },
  stepCard: { flexDirection: 'row', backgroundColor: Colors.surface, borderRadius: 14, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: Colors.border, gap: 14 },
  stepNumberWrap: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.accent + '20', alignItems: 'center', justifyContent: 'center' },
  stepNumber: { fontFamily: 'Inter_700Bold', fontSize: 14, color: Colors.accent },
  stepContent: { flex: 1, gap: 4 },
  stepTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: Colors.text },
  stepDescription: { fontFamily: 'Inter_400Regular', fontSize: 13, color: Colors.textSecondary, lineHeight: 19 },
  linkButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12, backgroundColor: Colors.accent + '15', marginTop: 10, marginBottom: 28 },
  linkButtonText: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: Colors.accent },
  aboutSection: { backgroundColor: Colors.surface, borderRadius: 18, padding: 20, borderWidth: 1, borderColor: Colors.border, marginTop: 12 },
  aboutTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 16, color: Colors.text, marginBottom: 8 },
  aboutText: { fontFamily: 'Inter_400Regular', fontSize: 13, color: Colors.textSecondary, lineHeight: 20, marginBottom: 12 },
  versionText: { fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.textTertiary },
});
