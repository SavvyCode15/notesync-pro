import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import Colors from '@/constants/colors';
import { getPendingUpload, clearPendingUpload } from '@/lib/pending-scan';
import { updateScan } from '@/lib/storage';
import { getApiUrl } from '@/lib/query-client';
import { useAuth } from '@/lib/auth-context';

interface NotionPage {
  id: string;
  title: string;
  icon: string | null;
  lastEdited: string;
  url: string;
}

export default function SelectPageScreen() {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const bottomInset = Platform.OS === 'web' ? 34 : insets.bottom;

  const [pages, setPages] = useState<NotionPage[]>([]);
  const [filteredPages, setFilteredPages] = useState<NotionPage[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);

  useEffect(() => {
    fetchPages();
  }, []);

  useEffect(() => {
    if (searchQuery.trim()) {
      const lower = searchQuery.toLowerCase();
      setFilteredPages(pages.filter(p => p.title.toLowerCase().includes(lower)));
    } else {
      setFilteredPages(pages);
    }
  }, [searchQuery, pages]);

  async function fetchPages() {
    setIsLoading(true);
    setError(null);
    try {
      const baseUrl = getApiUrl();
      const url = new URL('/api/notion/pages', baseUrl);
      const response = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        const data = await response.json();
        if (response.status === 401) {
          setError('Notion is not configured. Please add your API key in Settings.');
        } else {
          setError(data.error || 'Failed to fetch pages');
        }
        return;
      }

      const data = await response.json();
      setPages(data.pages || []);
    } catch (err) {
      setError('Unable to connect. Check your internet connection.');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleUpload(page: NotionPage) {
    const uploadData = getPendingUpload();
    if (!uploadData) {
      Alert.alert('Error', 'No content to upload.');
      return;
    }

    setSelectedPageId(page.id);
    setIsUploading(true);

    try {
      const baseUrl = getApiUrl();
      const url = new URL('/api/notion/upload', baseUrl);
      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          pageId: page.id,
          content: uploadData.extractedText,
        }),
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      await updateScan(uploadData.scanId, {
        status: 'uploaded',
        notionPageId: page.id,
        notionPageTitle: page.title,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setUploadSuccess(true);
      clearPendingUpload();

      setTimeout(() => {
        router.dismissAll();
        router.replace('/');
      }, 1500);
    } catch (err) {
      Alert.alert('Upload Failed', 'Could not upload to Notion. Please try again.');
      await updateScan(uploadData.scanId, { status: 'failed' });
    } finally {
      setIsUploading(false);
      setSelectedPageId(null);
    }
  }

  if (uploadSuccess) {
    return (
      <View style={[styles.container, { paddingTop: topInset }]}>
        <Animated.View entering={FadeIn.duration(400)} style={styles.successContainer}>
          <View style={styles.successIcon}>
            <Ionicons name="checkmark-circle" size={64} color={Colors.success} />
          </View>
          <Text style={styles.successTitle}>Uploaded!</Text>
          <Text style={styles.successText}>Your notes have been sent to Notion.</Text>
        </Animated.View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      <Animated.View entering={FadeIn.duration(300)} style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={({ pressed }) => [styles.closeButton, pressed && { opacity: 0.6 }]}
        >
          <Ionicons name="close" size={24} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Select Notion Page</Text>
        <View style={{ width: 40 }} />
      </Animated.View>

      <View style={styles.searchContainer}>
        <Feather name="search" size={18} color={Colors.textTertiary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search pages..."
          placeholderTextColor={Colors.textTertiary}
          value={searchQuery}
          onChangeText={setSearchQuery}
          selectionColor={Colors.accent}
          autoCapitalize="none"
        />
        {searchQuery ? (
          <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={Colors.textTertiary} />
          </Pressable>
        ) : null}
      </View>

      {isLoading ? (
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={Colors.accent} />
          <Text style={styles.loadingText}>Fetching your pages...</Text>
        </View>
      ) : error ? (
        <View style={styles.centerContent}>
          <Ionicons name="warning-outline" size={40} color={Colors.danger} />
          <Text style={styles.errorTitle}>{error}</Text>
          <Pressable
            style={({ pressed }) => [styles.retryButton, pressed && { opacity: 0.8 }]}
            onPress={fetchPages}
          >
            <Feather name="refresh-cw" size={16} color={Colors.text} />
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : filteredPages.length === 0 ? (
        <View style={styles.centerContent}>
          <Feather name="file-text" size={40} color={Colors.textTertiary} />
          <Text style={styles.emptyText}>
            {searchQuery ? 'No pages found' : 'No pages available'}
          </Text>
          <Text style={styles.emptySubtext}>
            Make sure your pages are shared with the NoteSync integration in Notion.
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredPages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.listContent, { paddingBottom: 20 + bottomInset }]}
          showsVerticalScrollIndicator={false}
          renderItem={({ item, index }) => (
            <Animated.View entering={FadeInDown.delay(index * 40).duration(300)}>
              <Pressable
                style={({ pressed }) => [
                  styles.pageItem,
                  pressed && { backgroundColor: Colors.surfaceHighlight },
                  isUploading && selectedPageId === item.id && styles.pageItemUploading,
                ]}
                onPress={() => {
                  if (!isUploading) {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    handleUpload(item);
                  }
                }}
                disabled={isUploading}
              >
                <View style={styles.pageIcon}>
                  {item.icon ? (
                    <Text style={styles.pageEmoji}>{item.icon}</Text>
                  ) : (
                    <Ionicons name="document-outline" size={20} color={Colors.textSecondary} />
                  )}
                </View>
                <View style={styles.pageInfo}>
                  <Text style={styles.pageTitle} numberOfLines={1}>{item.title}</Text>
                  <Text style={styles.pageDate}>
                    {new Date(item.lastEdited).toLocaleDateString('en-US', {
                      month: 'short', day: 'numeric', year: 'numeric'
                    })}
                  </Text>
                </View>
                {isUploading && selectedPageId === item.id ? (
                  <ActivityIndicator size="small" color={Colors.accent} />
                ) : (
                  <Ionicons name="chevron-forward" size={18} color={Colors.textTertiary} />
                )}
              </Pressable>
            </Animated.View>
          )}
        />
      )}
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
  closeButton: {
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
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    marginHorizontal: 20,
    marginBottom: 16,
    paddingHorizontal: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchInput: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    color: Colors.text,
    paddingVertical: 12,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    gap: 12,
  },
  loadingText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 8,
  },
  errorTitle: {
    fontFamily: 'Inter_500Medium',
    fontSize: 15,
    color: Colors.text,
    textAlign: 'center',
    lineHeight: 22,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: Colors.surfaceElevated,
    marginTop: 4,
  },
  retryText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: Colors.text,
  },
  emptyText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 16,
    color: Colors.text,
  },
  emptySubtext: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  listContent: {
    paddingHorizontal: 20,
  },
  pageItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 12,
  },
  pageItemUploading: {
    borderColor: Colors.accent + '40',
  },
  pageIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: Colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageEmoji: {
    fontSize: 20,
  },
  pageInfo: {
    flex: 1,
    gap: 2,
  },
  pageTitle: {
    fontFamily: 'Inter_500Medium',
    fontSize: 15,
    color: Colors.text,
  },
  pageDate: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.textTertiary,
  },
  successContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  successIcon: {
    marginBottom: 20,
  },
  successTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 24,
    color: Colors.text,
    marginBottom: 8,
  },
  successText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
});
