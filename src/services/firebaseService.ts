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

  // Strip fields that Firestore cannot handle (binary attachments, base64 images,
  // and large content like knowledgeBase which has its own Storage upload flow).
  const prepareProfile = (profile: any) => {
    if (!profile || typeof profile !== 'object') return profile;
    const { chatHistory, sessions, activeSessionId, referenceImage, ...rest } = profile;
    return rest;
  };

  const preparedAiProfile = prepareProfile(rawData.aiProfile);
  const preparedPersonas  = Array.isArray(rawData.savedPersonas)
    ? rawData.savedPersonas.map(prepareProfile)
    : [];

  // Firestore rejects nested arrays ("Property array contains an invalid nested
  // entity") and has a hard 1 MB document limit. We sidestep both by serialising
  // every complex / potentially large field to a JSON string — Firestore only ever
  // sees scalars. The restore function parses them back.
  const safeString = (val: any): string => {
    try {
      return JSON.stringify(stripImages({ value: val }).value ?? val) ?? 'null';
    } catch {
      return 'null';
    }
  };

  await setDoc(doc(db, 'indigo_backups', userId.trim()), {
    // Complex objects → JSON strings (avoids nested-array errors)
    aiProfile:     safeString(preparedAiProfile),
    savedPersonas: safeString(preparedPersonas),
    userProfile:   safeString(rawData.userProfile),
    journal:       safeString(rawData.journal),
    memories:      safeString(rawData.memories),
    // knowledgeBase is intentionally excluded — it can be very large and has its
    // own dedicated Firebase Storage upload/restore flow (Settings → Cloud Sync).
    // Simple scalar values — store directly
    apiKey:              rawData.apiKey              ?? null,
    anthropicApiKey:     rawData.anthropicApiKey     ?? null,
    elevenLabsApiKey:    rawData.elevenLabsApiKey    ?? null,
    geminiApiKey:        rawData.geminiApiKey        ?? null,
    wavespeedApiKey:     rawData.wavespeedApiKey     ?? null,
    autoSaveChat:        rawData.autoSaveChat        ?? false,
    autoBackupSchedule:  rawData.autoBackupSchedule  ?? 'off',
    realTimeSyncEnabled: rawData.realTimeSyncEnabled ?? false,
    galleryIds,
    backedUpAt:    serverTimestamp(),
    backupVersion: 3,
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

  const raw = snap.data();

  // backupVersion 3+: complex fields were stored as JSON strings — parse them back.
  // Earlier versions stored raw objects, so return as-is for backwards compatibility.
  if ((raw.backupVersion ?? 1) >= 3) {
    const parse = (field: any, fallback: any) => {
      if (typeof field !== 'string') return fallback;
      try { return JSON.parse(field); } catch { return fallback; }
    };
    return {
      ...raw,
      aiProfile:     parse(raw.aiProfile,     {}),
      savedPersonas: parse(raw.savedPersonas, []),
      userProfile:   parse(raw.userProfile,   {}),
      journal:       parse(raw.journal,       []),
      memories:      parse(raw.memories,      []),
      // knowledgeBase is not stored in this document — restore it separately
      // via Settings → Cloud Sync → Restore Knowledge Base.
      knowledgeBase: [],
    };
  }

  return raw;
}

// ── Upload gallery images to Firebase Storage ─────────────────────────────────
// Wraps a Promise with a timeout so Firebase Storage hangs don't block forever.
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(
      `Timed out after ${ms / 1000}s during "${label}". ` +
      `Check your Firebase Storage Bucket URL in Settings — it should look like ` +
      `"your-project.firebasestorage.app" or "your-project.appspot.com". ` +
      `Also check that Firebase Storage security rules allow writes.`
    )), ms);
    promise.then(v => { clearTimeout(timer); resolve(v); },
                 e => { clearTimeout(timer); reject(e); });
  });
}

export async function uploadGalleryToFirebaseStorage(
  userId: string,
  gallery: Array<{ id?: string; url: string; prompt?: string; provider?: string; createdAt?: number }>,
  runtime?: FirebaseRuntimeConfig,
  onProgress?: (done: number, total: number) => void,
): Promise<number> {
  if (!userId?.trim()) throw new Error("A User ID is required. Set one in Settings → Cloud Sync.");

  const storageBucket = runtime?.storageBucket || import.meta.env.VITE_FIREBASE_STORAGE_BUCKET;
  if (!storageBucket?.trim()) {
    throw new Error(
      "Firebase Storage Bucket is not set. Fill in the Storage Bucket field in Settings → Firebase Configuration. " +
      "It should look like: your-project.firebasestorage.app"
    );
  }

  const app = getApp(runtime);
  // Always get a fresh Storage instance using the explicit bucket URL to avoid
  // silent mismatches when currentStorage was initialised with a different bucket.
  const storage = getStorage(app, `gs://${storageBucket.replace(/^gs:\/\//, '').trim()}`);
  const db = getDb(runtime);

  const validItems = gallery.filter(item => item.url && item.url.startsWith('data:'));
  if (validItems.length === 0) throw new Error(
    "No local gallery images found to upload. " +
    "Images must be stored locally (as data: URLs) to be backed up."
  );

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

    // 60-second timeout per image — if uploadString hangs, surface a clear error
    // instead of silently blocking forever.
    await withTimeout(
      uploadString(fileRef, base64, 'base64', { contentType: `image/${ext}` }),
      60_000,
      `uploading image ${i + 1}/${validItems.length}`
    );
    const downloadUrl = await withTimeout(
      getDownloadURL(fileRef),
      15_000,
      `getting download URL for image ${i + 1}`
    );
    manifest.push({ id: itemId, path, downloadUrl, prompt: item.prompt ?? null, provider: item.provider ?? null });
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
