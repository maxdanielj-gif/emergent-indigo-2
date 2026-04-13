import { initializeApp, getApps, deleteApp, FirebaseApp } from 'firebase/app';
import {
  getFirestore, doc, setDoc, getDoc, Firestore, serverTimestamp,
} from 'firebase/firestore';
import { getStorage, ref as storageRef, uploadString, getDownloadURL, FirebaseStorage } from 'firebase/storage';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut as fbSignOut,
  onAuthStateChanged, User as FirebaseUser, Auth,
} from 'firebase/auth';

export type { FirebaseUser };

// ── Types ─────────────────────────────────────────────────────────────────────
export interface KnowledgeBaseFile {
  name: string;
  content: string;
}

export interface FirebaseRuntimeConfig {
  apiKey?:            string | null;
  authDomain?:        string | null;
  projectId?:         string | null;
  storageBucket?:     string | null;
  messagingSenderId?: string | null;
  appId?:             string | null;
}

// ── Build config: env vars are the fallback, runtime values take priority ─────
function buildConfig(runtime?: FirebaseRuntimeConfig) {
  return {
    apiKey:            runtime?.apiKey            || import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain:        runtime?.authDomain        || import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId:         runtime?.projectId         || import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket:     runtime?.storageBucket     || import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: runtime?.messagingSenderId || import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId:             runtime?.appId             || import.meta.env.VITE_FIREBASE_APP_ID,
  };
}

function isConfigured(config: ReturnType<typeof buildConfig>): boolean {
  return !!(config.apiKey && config.projectId && config.appId);
}

// ── Global Firebase instances ─────────────────────────────────────────────────
let currentApp:     FirebaseApp      | null = null;
let currentDb:      Firestore        | null = null;
let currentStorage: FirebaseStorage  | null = null;
let currentAuth:    Auth             | null = null;
let lastConfigKey = '';

function getApp(runtime?: FirebaseRuntimeConfig): FirebaseApp {
  const config    = buildConfig(runtime);
  const configKey = JSON.stringify(config);

  if (!isConfigured(config)) {
    throw new Error(
      'Firebase is not fully configured. Fill in all Firebase keys in Settings → Firebase Configuration.'
    );
  }

  if (configKey !== lastConfigKey) {
    if (currentApp) { try { deleteApp(currentApp); } catch {} }
    currentApp     = initializeApp(config, `indigo-${Date.now()}`);
    currentDb      = getFirestore(currentApp);
    currentStorage = null; // reset on config change
    currentAuth    = null; // reset on config change
    lastConfigKey  = configKey;
  }

  return currentApp!;
}

function getDb(runtime?: FirebaseRuntimeConfig): Firestore {
  const app = getApp(runtime);
  if (!currentDb) currentDb = getFirestore(app);
  return currentDb!;
}

// ── Auth helpers ─────────────────────────────────────────────────────────────
function getAuthInstance(runtime?: FirebaseRuntimeConfig): Auth {
  const app = getApp(runtime);
  if (!currentAuth) currentAuth = getAuth(app);
  return currentAuth;
}

export async function signInWithGoogle(runtime?: FirebaseRuntimeConfig): Promise<FirebaseUser> {
  const auth     = getAuthInstance(runtime);
  const provider = new GoogleAuthProvider();
  const result   = await signInWithPopup(auth, provider);
  return result.user;
}

export async function signOutUser(runtime?: FirebaseRuntimeConfig): Promise<void> {
  const auth = getAuthInstance(runtime);
  await fbSignOut(auth);
}

export function onAuthStateChange(
  callback: (user: FirebaseUser | null) => void,
  runtime?: FirebaseRuntimeConfig,
): () => void {
  const auth = getAuthInstance(runtime);
  return onAuthStateChanged(auth, callback);
}

// ── Firestore sanitizer: removes undefined values (Firestore rejects them) ────
// Also converts Date objects, NaN, and Infinity to safe types.
function sanitize(value: any): any {
  if (value === undefined) return null;
  if (value === null) return null;
  if (typeof value === 'number') {
    if (!isFinite(value)) return null; // NaN and Infinity are not valid Firestore values
    return value;
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(sanitize);
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, sanitize(v)])
  );
}

// ── Strip large base64 images before sending to Firestore ─────────────────────
// Reference images (user/AI photos) can be hundreds of KB each. Firestore has a
// 1 MiB document limit and chokes on very large string values. These images are
// stored locally and don't need to travel to the cloud in a text backup.
function stripImages(data: any): any {
  if (!data || typeof data !== 'object') return data;

  const strip = (obj: any): any => {
    if (!obj || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(strip);
    const result: any = {};
    for (const [key, val] of Object.entries(obj)) {
      // Drop any field named referenceImage (user photo, AI photo)
      if (key === 'referenceImage') {
        result[key] = null;
        continue;
      }
      result[key] = strip(val);
    }
    return result;
  };

  return strip(data);
}

// ── Backup app data to Firestore ──────────────────────────────────────────────
export async function backupToFirestore(
  userId: string,
  data: any,
  runtime?: FirebaseRuntimeConfig,
): Promise<void> {
  if (!userId?.trim()) throw new Error("A User ID is required. Set one in Settings → Cloud Sync.");

  const db = getDb(runtime);
  const { gallery, ...rawData } = data;
  const galleryIds = Array.isArray(gallery) ? gallery.map((g: any) => g.id) : [];

  // Strip fields that are too large or contain non-serialisable values
  // (binary attachment content, base64 images) before sending to Firestore.
  // This applies whether called from the manual backup button or real-time sync.
  const prepareProfile = (profile: any) => {
    if (!profile || typeof profile !== 'object') return profile;
    return {
      ...profile,
      chatHistory:     undefined, // may contain binary image attachments
      sessions:        undefined, // large array, backed up via manual export
      activeSessionId: undefined,
    };
  };

  const prepared = {
    ...rawData,
    aiProfile:     prepareProfile(rawData.aiProfile),
    savedPersonas: Array.isArray(rawData.savedPersonas)
      ? rawData.savedPersonas.map(prepareProfile)
      : rawData.savedPersonas,
  };

  const safeData = sanitize(stripImages(prepared));

  await setDoc(doc(db, 'indigo_backups', userId.trim()), {
    ...safeData,
    galleryIds,
    backedUpAt:    serverTimestamp(),
    backupVersion: 2,
  });
}

// ── Restore app data from Firestore ──────────────────────────────────────────
export async function restoreFromFirestore(
  userId: string,
  runtime?: FirebaseRuntimeConfig,
): Promise<any | null> {
  if (!userId?.trim()) throw new Error("A User ID is required. Set one in Settings → Cloud Sync.");

  const db   = getDb(runtime);
  const snap = await getDoc(doc(db, 'indigo_backups', userId.trim()));
  if (!snap.exists()) return null;
  return snap.data();
}

// ── Upload gallery images to Firebase Storage ─────────────────────────────────
export async function uploadGalleryToFirebaseStorage(
  userId: string,
  gallery: Array<{ id?: string; url: string; prompt?: string; provider?: string; createdAt?: number }>,
  runtime?: FirebaseRuntimeConfig,
  onProgress?: (done: number, total: number) => void,
): Promise<number> {
  if (!userId?.trim()) throw new Error("A User ID is required. Set one in Settings → Cloud Sync.");

  const app = getApp(runtime);
  if (!currentStorage) currentStorage = getStorage(app);
  const storage = currentStorage;
  const db = getDb(runtime);

  const validItems = gallery.filter(item => item.url && item.url.startsWith('data:'));
  if (validItems.length === 0) throw new Error("No local gallery images found to upload.");

  let uploaded = 0;
  const manifest: Array<{ id: string; path: string; downloadUrl: string; prompt?: string; provider?: string }> = [];

  for (let i = 0; i < validItems.length; i++) {
    const item = validItems[i];
    const mimeMatch = item.url.match(/data:image\/([^;]+);/);
    const ext = mimeMatch ? mimeMatch[1].replace('+xml', '') : 'png';
    const base64 = item.url.includes(',') ? item.url.split(',')[1] : item.url;
    const itemId = item.id || `item_${i}_${Date.now()}`;
    const path = `${userId.trim()}/gallery/${itemId}.${ext}`;

    const fileRef = storageRef(storage, path);
    await uploadString(fileRef, base64, 'base64', { contentType: `image/${ext}` });
    // Store the download URL so restore doesn't need to re-derive it
    const downloadUrl = await getDownloadURL(fileRef);
    manifest.push({ id: itemId, path, downloadUrl, prompt: item.prompt, provider: item.provider });
    uploaded++;

    if (onProgress) onProgress(uploaded, validItems.length);
  }

  // Store manifest in Firestore
  await setDoc(doc(db, 'indigo_gallery_manifests', userId.trim()), {
    uploadedAt:  serverTimestamp(),
    count:       uploaded,
    items:       manifest,
    version:     1,
  });

  return uploaded;
}

// ── Restore gallery images from Firebase Storage ──────────────────────────────
export async function restoreGalleryFromFirebaseStorage(
  userId: string,
  runtime?: FirebaseRuntimeConfig,
  onProgress?: (done: number, total: number) => void,
): Promise<Array<{ id: string; url: string; prompt?: string; provider?: string }>> {
  if (!userId?.trim()) throw new Error("A User ID is required. Set one in Settings → Cloud Sync.");

  const db   = getDb(runtime);
  const snap = await getDoc(doc(db, 'indigo_gallery_manifests', userId.trim()));
  if (!snap.exists()) throw new Error("No gallery backup found for this user ID. Back up your gallery first.");

  const data  = snap.data();
  const items = (data.items as Array<{ id: string; path: string; downloadUrl?: string; prompt?: string; provider?: string }>) || [];

  if (items.length === 0) throw new Error("The gallery backup exists but contains no images.");

  const app = getApp(runtime);
  if (!currentStorage) currentStorage = getStorage(app);
  const storage = currentStorage;

  const restored: Array<{ id: string; url: string; prompt?: string; provider?: string }> = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    // Prefer the stored downloadUrl; fall back to deriving from Storage path
    let downloadUrl = item.downloadUrl;
    if (!downloadUrl) {
      const fileRef = storageRef(storage, item.path);
      downloadUrl = await getDownloadURL(fileRef);
    }

    // Fetch the image and convert to a local data URL
    const response = await fetch(downloadUrl!);
    if (!response.ok) throw new Error(`Failed to download image ${i + 1}: HTTP ${response.status}`);
    const blob    = await response.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('Failed to read image data'));
      reader.readAsDataURL(blob);
    });

    restored.push({ id: item.id, url: dataUrl, prompt: item.prompt, provider: item.provider });
    if (onProgress) onProgress(i + 1, items.length);
  }

  return restored;
}

// ── Upload knowledge base files to Firebase Storage ───────────────────────────
export async function uploadKnowledgeBaseToFirebaseStorage(
  userId: string,
  files: KnowledgeBaseFile[],
  runtime?: FirebaseRuntimeConfig,
  onProgress?: (done: number, total: number) => void,
): Promise<number> {
  if (!userId?.trim()) throw new Error("A User ID is required. Set one in Settings → Cloud Sync.");

  const app = getApp(runtime);
  if (!currentStorage) currentStorage = getStorage(app);
  const storage = currentStorage;
  const db = getDb(runtime);

  const validFiles = files.filter(f => f.name && f.content != null);
  if (validFiles.length === 0) return 0;

  let uploaded = 0;
  const manifest: Array<{ name: string; path: string; size: number }> = [];

  for (let i = 0; i < validFiles.length; i++) {
    const file = validFiles[i];
    // Sanitise filename for use as a Storage path segment
    const safeName = file.name.replace(/[^a-zA-Z0-9._\-]/g, '_');
    const path = `${userId.trim()}/knowledge-base/${safeName}`;

    const fileRef = storageRef(storage, path);
    await uploadString(fileRef, file.content, 'raw', { contentType: 'text/plain; charset=utf-8' });
    manifest.push({ name: file.name, path, size: file.content.length });
    uploaded++;

    if (onProgress) onProgress(uploaded, validFiles.length);
  }

  // Merge with existing manifest so incremental uploads don't wipe old files
  const existing = await getDoc(doc(db, 'indigo_kb_manifests', userId.trim()));
  const existingFiles: typeof manifest = existing.exists()
    ? (existing.data().files || []).filter((f: any) => !manifest.find(m => m.name === f.name))
    : [];

  await setDoc(doc(db, 'indigo_kb_manifests', userId.trim()), {
    updatedAt: serverTimestamp(),
    count:     existingFiles.length + uploaded,
    files:     [...existingFiles, ...manifest],
    version:   1,
  });

  return uploaded;
}

// ── Restore knowledge base files from Firebase Storage ────────────────────────
export async function restoreKnowledgeBaseFromFirebaseStorage(
  userId: string,
  runtime?: FirebaseRuntimeConfig,
  onProgress?: (done: number, total: number) => void,
): Promise<KnowledgeBaseFile[]> {
  if (!userId?.trim()) throw new Error("A User ID is required. Set one in Settings → Cloud Sync.");

  const db   = getDb(runtime);
  const snap = await getDoc(doc(db, 'indigo_kb_manifests', userId.trim()));
  if (!snap.exists()) throw new Error("No knowledge base backup found for this user ID.");

  const data  = snap.data();
  const files = (data.files as Array<{ name: string; path: string }>) || [];
  if (files.length === 0) throw new Error("The knowledge base backup exists but contains no files.");

  const app = getApp(runtime);
  if (!currentStorage) currentStorage = getStorage(app);
  const storage = currentStorage;

  const restored: KnowledgeBaseFile[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const fileRef = storageRef(storage, file.path);
    const downloadUrl = await getDownloadURL(fileRef);

    const response = await fetch(downloadUrl);
    if (!response.ok) throw new Error(`Failed to download "${file.name}": HTTP ${response.status}`);
    const content = await response.text();

    restored.push({ name: file.name, content });
    if (onProgress) onProgress(i + 1, files.length);
  }

  return restored;
}
