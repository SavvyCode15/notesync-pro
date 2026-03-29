import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  Pressable,
  Alert,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, Feather } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Haptics from 'expo-haptics';
import * as Crypto from 'expo-crypto';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import Colors from '@/constants/colors';
import { getScans, saveScan, deleteScan, updateScan, type ScanRecord } from '@/lib/storage';
import { setPendingScan } from '@/lib/pending-scan';
import { useAuth } from '@/lib/auth-context';
import { getApiUrl } from '@/lib/query-client';

function ScanCardItem({ item, onDelete }: { item: ScanRecord; onDelete: (id: string) => void }) {
  const date = new Date(item.createdAt);
  const formattedDate = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const formattedTime = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const preview = item.extractedText?.slice(0, 120)?.replace(/\n/g, ' ') || 'Processing...';

  const statusColor = item.status === 'uploaded' ? Colors.success
    : item.status === 'failed' ? Colors.danger
      : item.status === 'processing' ? Colors.info
        : Colors.accentLight;

  const statusLabel = item.status === 'uploaded' ? 'Uploaded'
    : item.status === 'failed' ? 'Failed'
      : item.status === 'processing' ? 'Processing'
        : 'Ready';

  return (
    <Pressable
      style={({ pressed }) => [styles.scanCard, pressed && { opacity: 0.85 }]}
      onPress={() => {
        if (item.status === 'extracted' || item.status === 'uploaded' || item.status === 'failed') {
          setPendingScan({ imageUri: item.imageUri, imageBase64: '', scanId: item.id });
          router.push({ pathname: '/preview', params: { scanId: item.id, viewOnly: 'true' } });
        }
      }}
      onLongPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        Alert.alert('Delete Scan', 'Remove this scan from your history?', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: () => onDelete(item.id) },
        ]);
      }}
    >
      <View style={styles.cardHeader}>
        <View style={styles.cardDateRow}>
          <Feather name="clock" size={12} color={Colors.textTertiary} />
          <Text style={styles.cardDate}>{formattedDate} {formattedTime}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
        </View>
      </View>
      <Text style={styles.cardTitle} numberOfLines={1}>
        {item.title || (item.status === 'processing' ? 'Processing...' : 'Untitled Note')}
      </Text>
      <Text style={styles.cardPreview} numberOfLines={2}>{preview}</Text>
      {item.notionPageTitle ? (
        <View style={styles.cardFooter}>
          <Ionicons name="document-text-outline" size={13} color={Colors.accent} />
          <Text style={styles.cardPageName} numberOfLines={1}>{item.notionPageTitle}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const [scans, setScans] = useState<ScanRecord[]>([]);
  const [showOptions, setShowOptions] = useState(false);
  const [loading, setLoading] = useState(false);

  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const bottomInset = Platform.OS === 'web' ? 34 : insets.bottom;

  useFocusEffect(
    useCallback(() => {
      loadScans();
    }, [])
  );

  async function loadScans() {
    // Show local cache immediately for instant UI
    const localData = await getScans();
    setScans(localData);

    // Then sync from server so cross-device history is always fresh
    if (!token) return;
    try {
      const baseUrl = getApiUrl();
      const resp = await fetch(new URL('/api/scans', baseUrl).toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) return;
      const { scans: serverScans } = await resp.json();
      if (!Array.isArray(serverScans) || serverScans.length === 0) return;

      // Map server snake_case → local camelCase ScanRecord
      const localIds = new Set(localData.map((s: ScanRecord) => s.id));
      for (const s of serverScans) {
        const record: ScanRecord = {
          id: s.id,
          title: s.title || undefined,
          imageUri: s.image_uri || '',
          extractedText: s.extracted_text || '',
          notionPageId: s.notion_page_id || undefined,
          notionPageTitle: s.notion_page_title || undefined,
          createdAt: s.created_at
            ? new Date(s.created_at * 1000).toISOString()
            : new Date().toISOString(),
          status: s.status || 'extracted',
        };
        if (localIds.has(record.id)) {
          // Update status/title in case it changed on another device
          await updateScan(record.id, {
            status: record.status,
            notionPageId: record.notionPageId,
            notionPageTitle: record.notionPageTitle,
            title: record.title,
          });
        } else {
          // New record from another device — save it locally
          await saveScan(record);
        }
      }

      // Re-read local storage after merge so the UI is fully up to date
      const merged = await getScans();
      setScans(merged);
    } catch {
      // Network unavailable — local cache is already shown, no action needed
    }
  }

  async function handleDelete(id: string) {
    await deleteScan(id);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    loadScans();
  }

  async function handleCapture(useCamera: boolean) {
    setShowOptions(false);
    setLoading(true);

    try {
      if (useCamera) {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('Permission Needed', 'Camera permission is required to scan notes.');
          setLoading(false);
          return;
        }
      }

      const result = useCamera
        ? await ImagePicker.launchCameraAsync({
          mediaTypes: ['images'],
          quality: 0.8,
          base64: true,
        })
        : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          quality: 0.8,
          base64: true,
          allowsMultipleSelection: true,
          selectionLimit: 10,
        });

      if (result.canceled || !result.assets?.[0]) {
        setLoading(false);
        return;
      }

      // Process all images to standard JPEG + 1500px width to avoid slow HEIC conversions on Render free tier
      const processedAssets = await Promise.all(
        result.assets.map(a =>
          ImageManipulator.manipulateAsync(
            a.uri,
            [{ resize: { width: Math.min(1500, a.width || 1500) } }],
            { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG, base64: true }
          )
        )
      );

      const primaryAsset = processedAssets[0];
      const extraAssets = processedAssets.slice(1);
      const scanId = Crypto.randomUUID();

      const newScan: ScanRecord = {
        id: scanId,
        imageUri: primaryAsset.uri,
        title: 'Untitled Note',
        extractedText: '',
        createdAt: new Date().toISOString(),
        status: 'processing',
      };
      await saveScan(newScan);

      setPendingScan({
        imageUri: primaryAsset.uri,
        imageBase64: primaryAsset.base64 || '',
        scanId,
        // Extra pages are passed through as additional pages for multi-page OCR
        diagramUris: extraAssets.map(a => a.uri),
        diagramBase64s: extraAssets.map(a => a.base64 || '').filter(Boolean),
      });

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      router.push('/preview');
    } catch (error) {
      Alert.alert('Error', 'Failed to capture image. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      <Animated.View entering={FadeIn.duration(400)} style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>NoteSync</Text>
          <Text style={styles.headerSubtitle}>Handwritten to Notion</Text>
        </View>
        <Pressable
          onPress={() => router.push('/settings')}
          hitSlop={12}
          style={({ pressed }) => [styles.headerButton, pressed && { opacity: 0.6 }]}
        >
          <Ionicons name="settings-outline" size={22} color={Colors.textSecondary} />
        </Pressable>
      </Animated.View>

      {scans.length === 0 ? (
        <Animated.View entering={FadeInDown.delay(200).duration(500)} style={styles.emptyState}>
          <View style={styles.emptyIconWrap}>
            <Ionicons name="scan-outline" size={48} color={Colors.accent} />
          </View>
          <Text style={styles.emptyTitle}>No scans yet</Text>
          <Text style={styles.emptyText}>
            Capture your handwritten notes and let AI convert them into clean digital text for Notion.
          </Text>
        </Animated.View>
      ) : (
        <FlatList
          data={scans}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <ScanCardItem item={item} onDelete={handleDelete} />}
          contentContainerStyle={[styles.listContent, { paddingBottom: 100 + bottomInset }]}
          showsVerticalScrollIndicator={false}
        />
      )}

      {showOptions && (
        <Pressable style={styles.backdrop} onPress={() => setShowOptions(false)}>
          <Animated.View entering={FadeInDown.duration(200)} style={[styles.optionsSheet, { bottom: 100 + bottomInset }]}>
            <Pressable
              style={({ pressed }) => [styles.optionButton, pressed && { backgroundColor: Colors.surfaceHighlight }]}
              onPress={() => handleCapture(true)}
            >
              <Ionicons name="camera-outline" size={22} color={Colors.accent} />
              <Text style={styles.optionText}>Take Photo</Text>
            </Pressable>
            <View style={styles.optionDivider} />
            <Pressable
              style={({ pressed }) => [styles.optionButton, pressed && { backgroundColor: Colors.surfaceHighlight }]}
              onPress={() => handleCapture(false)}
            >
              <Ionicons name="images-outline" size={22} color={Colors.accent} />
              <Text style={styles.optionText}>Choose from Gallery</Text>
            </Pressable>
          </Animated.View>
        </Pressable>
      )}

      <View style={[styles.fabContainer, { bottom: 24 + bottomInset }]}>
        <Pressable
          style={({ pressed }) => [
            styles.fab,
            pressed && { transform: [{ scale: 0.92 }] },
            loading && { opacity: 0.6 },
          ]}
          onPress={() => {
            if (!loading) {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              setShowOptions(!showOptions);
            }
          }}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={Colors.background} size="small" />
          ) : (
            <Ionicons name={showOptions ? "close" : "scan"} size={28} color={Colors.background} />
          )}
        </Pressable>
      </View>
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 20,
  },
  headerTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 28,
    color: Colors.accent,
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 48,
    paddingBottom: 100,
  },
  emptyIconWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: Colors.accent + '15',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  emptyTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 20,
    color: Colors.text,
    marginBottom: 8,
  },
  emptyText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingTop: 4,
  },
  scanCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  cardDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  cardDate: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.textTertiary,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    gap: 5,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
  },
  cardTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: Colors.text,
    marginBottom: 4,
  },
  cardPreview: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: Colors.text,
    lineHeight: 20,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  cardPageName: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: Colors.accent,
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    zIndex: 10,
  },
  optionsSheet: {
    position: 'absolute',
    right: 24,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: 16,
    overflow: 'hidden',
    minWidth: 220,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  optionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 18,
    gap: 12,
  },
  optionText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 15,
    color: Colors.text,
  },
  optionDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginHorizontal: 16,
  },
  fabContainer: {
    position: 'absolute',
    right: 24,
    zIndex: 20,
  },
  fab: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
});
