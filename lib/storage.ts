import AsyncStorage from '@react-native-async-storage/async-storage';

export interface ScanRecord {
  id: string;
  title?: string;
  imageUri: string;
  extractedText: string;
  notionPageId?: string;
  notionPageTitle?: string;
  diagramUris?: string[];
  createdAt: string;
  status: 'processing' | 'extracted' | 'uploaded' | 'failed';
}

const SCANS_KEY = '@notesync_scans';

export async function getScans(): Promise<ScanRecord[]> {
  try {
    const data = await AsyncStorage.getItem(SCANS_KEY);
    if (!data) return [];
    return JSON.parse(data);
  } catch {
    return [];
  }
}

export async function saveScan(scan: ScanRecord): Promise<void> {
  const scans = await getScans();
  scans.unshift(scan);
  await AsyncStorage.setItem(SCANS_KEY, JSON.stringify(scans));
}

export async function updateScan(id: string, updates: Partial<ScanRecord>): Promise<void> {
  const scans = await getScans();
  const index = scans.findIndex(s => s.id === id);
  if (index >= 0) {
    scans[index] = { ...scans[index], ...updates };
    await AsyncStorage.setItem(SCANS_KEY, JSON.stringify(scans));
  }
}

export async function deleteScan(id: string): Promise<void> {
  const scans = await getScans();
  await AsyncStorage.setItem(SCANS_KEY, JSON.stringify(scans.filter(s => s.id !== id)));
}
