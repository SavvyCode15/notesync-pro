import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TextInput,
  Pressable,
  ActivityIndicator,
  Alert,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons, Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, FadeInDown, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Colors from '@/constants/colors';
import { getPendingScan, setPendingUpload } from '@/lib/pending-scan';
import { getScans, updateScan } from '@/lib/storage';
import { getApiUrl } from '@/lib/query-client';
import { useAuth } from '@/lib/auth-context';

export default function PreviewScreen() {
  const insets = useSafeAreaInsets();
  const { token, user } = useAuth();
  const params = useLocalSearchParams<{ scanId?: string; viewOnly?: string }>();
  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const bottomInset = Platform.OS === 'web' ? 34 : insets.bottom;

  const [imageUri, setImageUri] = useState<string>('');
  const [extractedText, setExtractedText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanId, setScanId] = useState('');
  const [isViewOnly, setIsViewOnly] = useState(false);

  const pulseOpacity = useSharedValue(0.4);
  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulseOpacity.value }));

  useEffect(() => {
    pulseOpacity.value = withRepeat(withTiming(1, { duration: 800 }), -1, true);
  }, []);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    if (params.viewOnly === 'true' && params.scanId) {
      setIsViewOnly(true);
      const scans = await getScans();
      const scan = scans.find(s => s.id === params.scanId);
      if (scan) {
        setImageUri(scan.imageUri);
        setExtractedText(scan.extractedText);
        setScanId(scan.id);
      }
      return;
    }

    const pending = getPendingScan();
    if (!pending) {
      router.back();
      return;
    }

    setImageUri(pending.imageUri);
    setScanId(pending.scanId);

    if (pending.imageBase64) {
      processImage(pending.imageBase64, pending.scanId);
    }
  }

  async function processImage(base64: string, id: string) {
    setIsProcessing(true);
    setError(null);

    try {
      if (!user?.groqConnected) {
        Alert.alert(
          'Groq API Key Required',
          'Please add your Groq API key in Settings to scan notes.',
          [
            { text: 'Go to Settings', onPress: () => router.push('/settings') },
            { text: 'Cancel', style: 'cancel' },
          ]
        );
        setIsProcessing(false);
        return;
      }

      const baseUrl = getApiUrl();
      const url = new URL('/api/scan', baseUrl);

      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ image: base64 }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to process image');
      }

      const data = await response.json();
      setExtractedText(data.text);

      await updateScan(id, {
        extractedText: data.text,
        status: 'extracted',
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong';
      setError(msg);
      await updateScan(id, { status: 'failed' });
    } finally {
      setIsProcessing(false);
    }
  }

  function handleSendToNotion() {
    if (!extractedText.trim()) {
      Alert.alert('No Content', 'There is no text to send to Notion.');
      return;
    }
    setPendingUpload({ scanId, extractedText });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/select-page');
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      <View style={[styles.container, { paddingTop: topInset }]}>
        <Animated.View entering={FadeIn.duration(300)} style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            style={({ pressed }) => [styles.backButton, pressed && { opacity: 0.6 }]}
          >
            <Ionicons name="chevron-back" size={24} color={Colors.text} />
          </Pressable>
          <Text style={styles.headerTitle}>
            {isProcessing ? 'Processing...' : isViewOnly ? 'Scan Details' : 'Review Notes'}
          </Text>
          <View style={{ width: 40 }} />
        </Animated.View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: 100 + bottomInset }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {imageUri ? (
            <Animated.View entering={FadeInDown.delay(100).duration(400)} style={styles.imageContainer}>
              <Image
                source={{ uri: imageUri }}
                style={styles.image}
                contentFit="cover"
                transition={300}
              />
              <View style={styles.imageOverlay}>
                <Feather name="image" size={14} color={Colors.textSecondary} />
                <Text style={styles.imageLabel}>Original scan</Text>
              </View>
            </Animated.View>
          ) : null}

          {isProcessing ? (
            <Animated.View entering={FadeInDown.delay(200).duration(400)} style={styles.processingCard}>
              <Animated.View style={[styles.processingPulse, pulseStyle]}>
                <Ionicons name="sparkles" size={32} color={Colors.accent} />
              </Animated.View>
              <Text style={styles.processingTitle}>Reading your handwriting...</Text>
              <Text style={styles.processingSubtext}>
                AI is analyzing your notes and converting them into structured digital text.
              </Text>
              <ActivityIndicator color={Colors.accent} style={{ marginTop: 16 }} />
            </Animated.View>
          ) : error ? (
            <Animated.View entering={FadeInDown.delay(200).duration(400)} style={styles.errorCard}>
              <Ionicons name="alert-circle-outline" size={32} color={Colors.danger} />
              <Text style={styles.errorTitle}>Processing Failed</Text>
              <Text style={styles.errorText}>{error}</Text>
              <Pressable
                style={({ pressed }) => [styles.retryButton, pressed && { opacity: 0.8 }]}
                onPress={() => {
                  const pending = getPendingScan();
                  if (pending?.imageBase64) {
                    processImage(pending.imageBase64, scanId);
                  }
                }}
              >
                <Feather name="refresh-cw" size={16} color={Colors.text} />
                <Text style={styles.retryText}>Try Again</Text>
              </Pressable>
            </Animated.View>
          ) : extractedText ? (
            <Animated.View entering={FadeInDown.delay(200).duration(400)}>
              <View style={styles.textHeader}>
                <Ionicons name="document-text" size={16} color={Colors.accent} />
                <Text style={styles.textHeaderLabel}>Extracted Content</Text>
              </View>
              <View style={styles.textEditorContainer}>
                <TextInput
                  style={styles.textEditor}
                  value={extractedText}
                  onChangeText={setExtractedText}
                  multiline
                  editable={!isViewOnly}
                  textAlignVertical="top"
                  placeholderTextColor={Colors.textTertiary}
                  selectionColor={Colors.accent}
                />
              </View>
              {!isViewOnly && (
                <Text style={styles.editHint}>
                  You can edit the text above before sending to Notion
                </Text>
              )}
            </Animated.View>
          ) : null}
        </ScrollView>

        {!isProcessing && extractedText && !isViewOnly ? (
          <Animated.View
            entering={FadeInDown.delay(300).duration(300)}
            style={[styles.bottomBar, { paddingBottom: 16 + bottomInset }]}
          >
            <Pressable
              style={({ pressed }) => [styles.sendButton, pressed && { transform: [{ scale: 0.97 }] }]}
              onPress={handleSendToNotion}
            >
              <Ionicons name="paper-plane" size={20} color={Colors.background} />
              <Text style={styles.sendButtonText}>Send to Notion</Text>
            </Pressable>
          </Animated.View>
        ) : null}
      </View>
    </KeyboardAvoidingView>
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  imageContainer: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 20,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  image: {
    width: '100%',
    height: 200,
  },
  imageOverlay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  imageLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.textSecondary,
  },
  processingCard: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  processingPulse: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.accent + '18',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  processingTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 18,
    color: Colors.text,
    marginBottom: 8,
  },
  processingSubtext: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  errorCard: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.danger + '30',
  },
  errorTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 18,
    color: Colors.text,
    marginTop: 12,
    marginBottom: 6,
  },
  errorText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: Colors.surfaceElevated,
  },
  retryText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: Colors.text,
  },
  textHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  textHeaderLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: Colors.accent,
  },
  textEditorContainer: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    minHeight: 300,
  },
  textEditor: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: Colors.text,
    lineHeight: 22,
    padding: 16,
    minHeight: 300,
  },
  editHint: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.textTertiary,
    marginTop: 8,
    textAlign: 'center',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: Colors.background,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  sendButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: Colors.accent,
    paddingVertical: 16,
    borderRadius: 14,
  },
  sendButtonText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
    color: Colors.background,
  },
});
