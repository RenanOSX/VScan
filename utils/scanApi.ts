import { Platform } from 'react-native';

export const BASE_URL =
  Platform.OS === 'web' ? 'http://localhost:5000' : 'http://192.168.15.84:5000';

export const ENDPOINTS = {
  google_vision: '/scan',
  tesseract: '/scan_tesseract',
  append: '/append',
} as const;

export type ScanType = keyof typeof ENDPOINTS;

export type FileInfo = {
  uri: string;
  name: string;
  size?: number;
  mimeType?: string;
};

const mimeFromExt = (ext: string) => {
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  return 'application/octet-stream';
};

export const callBackend = async (file: FileInfo, scanType: ScanType) => {
  const endpoint = ENDPOINTS[scanType];

  try {
    if (Platform.OS === 'web') {
      const base64 = file.uri.split(',')[1];
      const res = await fetch(`${BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64 }),
      });
      return res.json();
    }

    const form = new FormData();
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    const type = file.mimeType ?? mimeFromExt(ext);

    form.append('file', { uri: file.uri, name: file.name, type } as any);

    const res = await fetch(`${BASE_URL}${endpoint}`, {
      method: 'POST',
      body: form,
    });
    return res.json();
  } catch {
    return null;
  }
};

export const appendData = async (fields: any, itens: any[]) => {
  try {
    const res = await fetch(`${BASE_URL}${ENDPOINTS.append}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields, itens }),
    });
    const json = await res.json();
    return !!json.success;
  } catch {
    return false;
  }
};
