let pendingScanData: {
  imageUri: string;
  imageBase64: string;
  scanId: string;
} | null = null;

let pendingUploadData: {
  scanId: string;
  extractedText: string;
  title?: string;
} | null = null;

export function setPendingScan(data: typeof pendingScanData) {
  pendingScanData = data;
}

export function getPendingScan() {
  return pendingScanData;
}

export function clearPendingScan() {
  pendingScanData = null;
}

export function setPendingUpload(data: typeof pendingUploadData) {
  pendingUploadData = data;
}

export function getPendingUpload() {
  return pendingUploadData;
}

export function clearPendingUpload() {
  pendingUploadData = null;
}
