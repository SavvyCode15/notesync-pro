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
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, FadeInDown, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Colors from '@/constants/colors';
import { getPendingScan, setPendingUpload } from '@/lib/pending-scan';
import { getScans, updateScan, type ScanRecord } from '@/lib/storage';
import { getApiUrl } from '@/lib/query-client';
import { useAuth } from '@/lib/auth-context';
import { MermaidDiagram, extractMermaidBlocks } from '@/components/MermaidDiagram';

export default function PreviewScreen() {
  const insets = useSafeAreaInsets();
  const { token, user } = useAuth();
  const params = useLocalSearchParams<{ scanId?: string; viewOnly?: string }>();
  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const bottomInset = Platform.OS === 'web' ? 34 : insets.bottom;

  const [imageUri, setImageUri] = useState<string>('');
  const [imageBase64, setImageBase64] = useState<string>('');
  const [extractedText, setExtractedText] = useState('');
  const [noteTitle, setNoteTitle] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanId, setScanId] = useState('');
  const [isViewOnly, setIsViewOnly] = useState(false);
  const [diagramUris, setDiagramUris] = useState<string[]>([]);
  const [diagramBase64s, setDiagramBase64s] = useState<string[]>([]);
  const [scanStatus, setScanStatus] = useState<ScanRecord['status'] | null>(null);

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
        setNoteTitle(scan.title || 'Untitled Note');
        setScanId(scan.id);
        setDiagramUris(scan.diagramUris || []);
        setScanStatus(scan.status);
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
    if (pending.diagramUris) setDiagramUris(pending.diagramUris);
    if (pending.diagramBase64s) setDiagramBase64s(pending.diagramBase64s);

    if (pending.imageBase64) {
      setImageBase64(pending.imageBase64);
      // Pass extra pages (from multi-select gallery) into the OCR pipeline
      processImage(pending.imageBase64, pending.scanId, pending.diagramBase64s || []);
    }
  }

  async function processImage(base64: string, id: string, additionalImages: string[] = []) {
    setIsProcessing(true);
    setError(null);
    try {
      const baseUrl = getApiUrl();
      const response = await fetch(new URL('/api/scan', baseUrl).toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ image: base64, additionalImages }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        if (errData.error === 'SCAN_LIMIT_REACHED') {
          Alert.alert(
            'Daily Limit Reached',
            errData.message || 'You have used all free scans for today.',
            [
              { text: 'Add My Own Key', onPress: () => router.push('/settings') },
              { text: 'OK', style: 'cancel' },
            ]
          );
          setIsProcessing(false);
          return;
        }
        throw new Error(errData.error || 'Failed to process image');
      }

      const data = await response.json();
      setExtractedText(data.text);
      if (data.title) setNoteTitle(data.title);

      // Update local storage so the Home Screen list shows the actual title and preview instead of "Processing..."
      await updateScan(id, { title: data.title || 'Untitled Note', extractedText: data.text, status: 'extracted' });

      // Save scan to DB including the base64 image and any extra pages for the Notion image proxy
      await fetch(new URL('/api/scans', baseUrl).toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          id,
          imageUri,
          imageBase64: base64,
          title: data.title || 'Untitled Note',
          extractedText: data.text,
          status: 'extracted',
          diagramBase64s: additionalImages.length > 0 ? additionalImages : undefined,
        }),
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong';
      setError(msg);
    } finally {
      setIsProcessing(false);
    }
  }

  function handleSendToNotion() {
    if (!extractedText.trim()) {
      Alert.alert('No Content', 'There is no text to send to Notion.');
      return;
    }
    setPendingUpload({ scanId, extractedText, title: noteTitle, diagramUris, diagramBase64s });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/select-page');
  }

  async function handleAddDiagram() {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission needed', 'Please grant camera access to add diagrams.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: 'images', quality: 0.8 });
      if (!result.canceled && result.assets[0].uri) {
        // Compress and force JPEG to avoid HEIC issues on server
        const processed = await ImageManipulator.manipulateAsync(
          result.assets[0].uri,
          [{ resize: { width: Math.min(1500, result.assets[0].width || 1500) } }],
          { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG, base64: true }
        );

        if (!processed.base64) return;
        const uri = processed.uri;
        const b64 = processed.base64;
        const newUris = [...diagramUris, uri];
        const newB64s = [...diagramBase64s, b64];
        setDiagramUris(newUris);
        setDiagramBase64s(newB64s);

        // Save immediately to DB proxy so Notion upload succeeds without delay
        await fetch(new URL(`/api/scans/${scanId}`, getApiUrl()).toString(), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ diagramBase64s: newB64s }),
        });

        // Update local storage
        await updateScan(scanId, { diagramUris: newUris });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (e) {
      console.log('Error adding diagram:', e);
      Alert.alert('Error', 'Failed to capture diagram');
    }
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

          {diagramUris.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.diagramCarousel}>
              {diagramUris.map((uri, i) => (
                <View key={i} style={styles.diagramThumbnailContainer}>
                  <Image source={{ uri }} style={styles.diagramThumbnail} contentFit="cover" />
                  <View style={styles.diagramBadge}><Text style={styles.diagramBadgeText}>{i + 1}</Text></View>
                </View>
              ))}
            </ScrollView>
          )}

          {!isProcessing && !isViewOnly && (
            <Pressable style={({ pressed }) => [styles.addDiagramButton, pressed && { opacity: 0.8 }]} onPress={handleAddDiagram}>
              <Ionicons name="camera-outline" size={20} color={Colors.accent} />
              <Text style={styles.addDiagramText}>Add Diagram / Sketch</Text>
            </Pressable>
          )}

          {isProcessing ? (
            <Animated.View entering={FadeInDown.delay(200).duration(400)} style={styles.processingCard}>
              <Animated.View style={[styles.processingPulse, pulseStyle]}>
                <Ionicons name="sparkles" size={32} color={Colors.accent} />
              </Animated.View>
              <Text style={styles.processingTitle}>
                {diagramBase64s.length > 0
                  ? `Reading ${diagramBase64s.length + 1} pages...`
                  : 'Reading your handwriting...'}
              </Text>
              <Text style={styles.processingSubtext}>
                {diagramBase64s.length > 0
                  ? `AI is analyzing all ${diagramBase64s.length + 1} pages and compiling them into one note.`
                  : 'AI is analyzing your notes and converting them into structured digital text.'}
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

              {/* Mermaid diagram previews */}
              {extractMermaidBlocks(extractedText).map((code, i) => (
                <MermaidDiagram key={i} code={code} index={i} />
              ))}
            </Animated.View>
          ) : null}
        </ScrollView>

        {!isProcessing && extractedText ? (
          <Animated.View
            entering={FadeInDown.delay(300).duration(300)}
            style={[styles.bottomBar, { paddingBottom: 16 + bottomInset }]}
          >
            {scanStatus === 'uploaded' ? (
              <View style={styles.uploadedBadge}>
                <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
                <Text style={styles.uploadedBadgeText}>Already in Notion</Text>
              </View>
            ) : (
              <Pressable
                style={({ pressed }) => [styles.sendButton, pressed && { transform: [{ scale: 0.97 }] }]}
                onPress={handleSendToNotion}
              >
                <Ionicons name="paper-plane" size={20} color={Colors.background} />
                <Text style={styles.sendButtonText}>Send to Notion</Text>
              </Pressable>
            )}
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
  diagramCarousel: {
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  diagramThumbnailContainer: {
    width: 80,
    height: 80,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  diagramThumbnail: {
    width: '100%',
    height: '100%',
  },
  diagramBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    backgroundColor: Colors.accent,
    borderRadius: 8,
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  diagramBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  addDiagramButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceHighlight,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    borderStyle: 'dashed',
    marginTop: 8,
    marginBottom: 24,
    gap: 8,
  },
  addDiagramText: {
    color: Colors.accent,
    fontSize: 15,
    fontWeight: '600',
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
  uploadedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.success + '15',
    paddingVertical: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.success + '30',
  },
  uploadedBadgeText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
    color: Colors.success,
  },
});
