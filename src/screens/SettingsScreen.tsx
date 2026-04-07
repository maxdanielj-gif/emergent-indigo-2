import React, { useRef, useState } from 'react';
import { gzipSync, strToU8 } from 'fflate';
import { useApp } from '../context/AppContext';
import { useChat } from '../context/ChatContext';
import { requestNotificationPermission } from '../services/webPushService';
import { showNativeNotification } from '../services/notificationService';
import { processFile } from '../services/ocrService';
import { Download, Upload, Trash2, Bell, FileText, Key, HelpCircle, Save, Database, MapPin, Copy, Smartphone, Cloud, RefreshCw, Clock, Shield, Edit2 } from 'lucide-react';

const SettingsScreen: React.FC = () => {
  const {
    importData, knowledgeBase, addToKnowledgeBase,
    asyncApiKey, setAsyncApiKey,
    anthropicApiKey, setAnthropicApiKey,
    elevenLabsApiKey, setElevenLabsApiKey,
    geminiApiKey, setGeminiApiKey,
    freepikApiKey, setFreepikApiKey,
    wavespeedApiKey, setWavespeedApiKey,
    stabilityApiKey, setStabilityApiKey,
    openRouterApiKey, setOpenRouterApiKey,
    cartesiaApiKey, setCartesiaApiKey,
    emergentLlmKey, setEmergentLlmKey,
    mongoUri, setMongoUri,
    setShowTutorial,
    autoSaveChat, setAutoSaveChat, autoSaveChatInterval, setAutoSaveChatInterval,
    autoJsonBackup, setAutoJsonBackup, autoJsonBackupInterval, setAutoJsonBackupInterval,
    resetApp, aiProfile, userProfile,
    notificationsEnabled, setNotificationsEnabled,
    fcmToken, setFcmToken,
    exportData, addToast,
    showTimestamps, setShowTimestamps,
    timeZone, setTimeZone,
    userId, setUserId,
    isSyncing, setIsSyncing,
    isSyncEnabled, setIsSyncEnabled,
    syncFrequency, setSyncFrequency,
    updateAIProfile,
    isDebuggerEnabled, setIsDebuggerEnabled,
    firebaseBackup, firebaseRestore, firebaseGalleryBackup, firebaseGalleryRestore,
    firebaseApiKey, firebaseAuthDomain, firebaseProjectId,
    firebaseStorageBucket, firebaseMessagingSenderId, firebaseAppId,
    firebaseVapidKey, firebaseServiceAccountKey,
    setFirebaseConfig, setFirebaseServiceAccountKey,
    lastCloudSyncTime, setLastCloudSyncTime,
    lastFirebaseBackupTime, setLastFirebaseBackupTime,
    lastGalleryBackupTime, setLastGalleryBackupTime,
    autoBackupSchedule, setAutoBackupSchedule,
    realTimeSyncEnabled, setRealTimeSyncEnabled,
    gallery,
  } = useApp();

  const { chatHistory, addChatMessage, setChatHistory, sessions, setSessions, activeSessionId, setActiveSessionId } = useChat();

  const fileInputRef  = useRef<HTMLInputElement>(null);
  const kbInputRef    = useRef<HTMLInputElement>(null);

  const [localAsyncApiKey,        setLocalAsyncApiKey]        = useState(asyncApiKey || '');
  const [localAnthropicApiKey,    setLocalAnthropicApiKey]    = useState(anthropicApiKey || '');
  const [localElevenLabsApiKey,   setLocalElevenLabsApiKey]   = useState(elevenLabsApiKey || '');
  const [localGeminiApiKey,       setLocalGeminiApiKey]       = useState(geminiApiKey || '');
  const [localFreepikApiKey,    setLocalFreepikApiKey]    = useState(freepikApiKey    || '');
  const [localWavespeedApiKey,  setLocalWavespeedApiKey]  = useState(wavespeedApiKey  || '');
  const [localStabilityApiKey,  setLocalStabilityApiKey]  = useState(stabilityApiKey  || '');
  const [localOpenRouterApiKey, setLocalOpenRouterApiKey] = useState(openRouterApiKey || '');
  const [localCartesiaApiKey,   setLocalCartesiaApiKey]   = useState(cartesiaApiKey   || '');
  const [localEmergentLlmKey,   setLocalEmergentLlmKey]   = useState(emergentLlmKey   || '');
  const [localMongoUri,         setLocalMongoUri]         = useState(mongoUri         || '');
  const [isApplyingMongo,       setIsApplyingMongo]       = useState(false);
  const [isFirebaseBackingUp,  setIsFirebaseBackingUp]  = useState(false);
  const [isFirebaseRestoring,  setIsFirebaseRestoring]  = useState(false);
  const [isGalleryBackingUp,   setIsGalleryBackingUp]   = useState(false);
  const [galleryBackupProgress, setGalleryBackupProgress] = useState<{done: number; total: number} | null>(null);
  const [isGalleryRestoring,   setIsGalleryRestoring]   = useState(false);
  const [galleryRestoreProgress, setGalleryRestoreProgress] = useState<{done: number; total: number} | null>(null);
  const [isFullRestoring,      setIsFullRestoring]      = useState(false);
  const [fullRestoreStep,      setFullRestoreStep]       = useState<string | null>(null);
  const [showRestoreConfirm,   setShowRestoreConfirm]   = useState(false);

  // Local state for Firebase config fields (never bind inputs directly to context state)
  const [localFbApiKey,       setLocalFbApiKey]       = useState(firebaseApiKey       || '');
  const [localFbAuthDomain,   setLocalFbAuthDomain]   = useState(firebaseAuthDomain   || '');
  const [localFbProjectId,    setLocalFbProjectId]    = useState(firebaseProjectId    || '');
  const [localFbStorageBucket,setLocalFbStorageBucket]= useState(firebaseStorageBucket|| '');
  const [localFbSenderId,     setLocalFbSenderId]     = useState(firebaseMessagingSenderId || '');
  const [localFbAppId,        setLocalFbAppId]        = useState(firebaseAppId        || '');
  const [localFbVapidKey,     setLocalFbVapidKey]     = useState(firebaseVapidKey     || '');
  const [localFbServiceKey,   setLocalFbServiceKey]   = useState(firebaseServiceAccountKey || '');

  // Sync local firebase fields when context loads from IndexedDB
  React.useEffect(() => { setLocalFbApiKey(firebaseApiKey || ''); },              [firebaseApiKey]);
  React.useEffect(() => { setLocalFbAuthDomain(firebaseAuthDomain || ''); },      [firebaseAuthDomain]);
  React.useEffect(() => { setLocalFbProjectId(firebaseProjectId || ''); },        [firebaseProjectId]);
  React.useEffect(() => { setLocalFbStorageBucket(firebaseStorageBucket || ''); },[firebaseStorageBucket]);
  React.useEffect(() => { setLocalFbSenderId(firebaseMessagingSenderId || ''); }, [firebaseMessagingSenderId]);
  React.useEffect(() => { setLocalFbAppId(firebaseAppId || ''); },                [firebaseAppId]);
  React.useEffect(() => { setLocalFbVapidKey(firebaseVapidKey || ''); },          [firebaseVapidKey]);
  React.useEffect(() => { setLocalFbServiceKey(firebaseServiceAccountKey || ''); },[firebaseServiceAccountKey]);

  // Sync local key fields once the context loads saved values from IndexedDB
  React.useEffect(() => { setLocalAnthropicApiKey(anthropicApiKey || ''); }, [anthropicApiKey]);
  React.useEffect(() => { setLocalAsyncApiKey(asyncApiKey || ''); }, [asyncApiKey]);
  React.useEffect(() => { setLocalElevenLabsApiKey(elevenLabsApiKey || ''); }, [elevenLabsApiKey]);
  React.useEffect(() => { setLocalGeminiApiKey(geminiApiKey || ''); }, [geminiApiKey]);
  React.useEffect(() => { setLocalFreepikApiKey(freepikApiKey || ''); }, [freepikApiKey]);
  React.useEffect(() => { setLocalWavespeedApiKey(wavespeedApiKey || ''); }, [wavespeedApiKey]);
  React.useEffect(() => { setLocalStabilityApiKey(stabilityApiKey || ''); }, [stabilityApiKey]);
  React.useEffect(() => { setLocalOpenRouterApiKey(openRouterApiKey || ''); }, [openRouterApiKey]);
  React.useEffect(() => { setLocalCartesiaApiKey(cartesiaApiKey || ''); }, [cartesiaApiKey]);
  React.useEffect(() => { setLocalEmergentLlmKey(emergentLlmKey || ''); }, [emergentLlmKey]);
  React.useEffect(() => { setLocalMongoUri(mongoUri || ''); }, [mongoUri]);
  const [localSyncId,          setLocalSyncId]          = useState(userId || '');
  const [recoveryId,           setRecoveryId]           = useState('');
  const [isExporting,          setIsExporting]          = useState(false);
  const [isImporting,          setIsImporting]          = useState(false);
  const [showOverwriteConfirm, setShowOverwriteConfirm] = useState(false);
  const [isTestingProactive,   setIsTestingProactive]   = useState(false);

  // Keep local sync ID in step with context userId
  React.useEffect(() => { if (userId) setLocalSyncId(userId); }, [userId]);

  // ── Sync & Recovery ──────────────────────────────────────────────
  const handleSync = async () => {
    setIsSyncing(true);
    addToast({ title: 'Sync', message: 'Syncing to cloud…', type: 'info' });
    try {
      const data = await exportData(chatHistory, sessions, activeSessionId);
      const compressed = gzipSync(strToU8(JSON.stringify({ userId: localSyncId, data })));
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: compressed,
      });
      if (!res.ok) throw new Error('Sync failed');
      setLastCloudSyncTime(Date.now());
      addToast({ title: 'Sync', message: 'Data synced to cloud!', type: 'success' });
    } catch (e: any) {
      addToast({ title: 'Sync Failed', message: e.message || 'Unknown error', type: 'error' });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleRecover = async () => {
    if (!recoveryId.trim()) {
      addToast({ title: 'Recovery', message: 'Enter a Sync ID first.', type: 'warning' });
      return;
    }
    setIsSyncing(true);
    try {
      const res = await fetch(`/api/sync/${recoveryId}`);
      if (!res.ok) throw new Error('Recovery failed');
      const data = await res.json();
      importData(JSON.stringify(data), setChatHistory, setSessions, setActiveSessionId);
      addToast({ title: 'Recovery', message: 'Data recovered from cloud!', type: 'success' });
    } catch (e: any) {
      addToast({ title: 'Recovery Failed', message: e.message || 'Unknown error', type: 'error' });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSaveSyncId = () => {
    if (!localSyncId.trim()) {
      addToast({ title: 'Settings', message: 'Sync ID cannot be empty.', type: 'warning' });
      return;
    }
    setUserId(localSyncId.trim());
    localStorage.setItem('indigo_user_id', localSyncId.trim());
    addToast({ title: 'Saved', message: 'Sync ID updated.', type: 'success' });
  };

  // ── API keys ─────────────────────────────────────────────────────
  const handleSaveAnthropicKey = () => {
    setAnthropicApiKey(localAnthropicApiKey.trim() || null);
    addToast({ title: 'Saved', message: 'Anthropic API key saved.', type: 'success' });
  };

  const handleSaveAsyncKey = () => {
    setAsyncApiKey(localAsyncApiKey.trim() || null);
    addToast({ title: 'Saved', message: 'Async API key saved.', type: 'success' });
  };

  const handleSaveElevenLabsKey = () => {
    setElevenLabsApiKey(localElevenLabsApiKey.trim() || null);
    addToast({ title: 'Saved', message: 'ElevenLabs API key saved.', type: 'success' });
  };

  const handleSaveGeminiKey = () => {
    setGeminiApiKey(localGeminiApiKey.trim() || null);
    addToast({ title: 'Saved', message: 'Gemini API key saved.', type: 'success' });
  };

  const handleSaveFreepikKey = () => {
    setFreepikApiKey(localFreepikApiKey.trim() || null);
    addToast({ title: 'Saved', message: 'Freepik API key saved.', type: 'success' });
  };
  const handleSaveWavespeedKey = () => {
    setWavespeedApiKey(localWavespeedApiKey.trim() || null);
    addToast({ title: 'Saved', message: 'WaveSpeed API key saved.', type: 'success' });
  };
  const handleSaveStabilityKey = () => {
    setStabilityApiKey(localStabilityApiKey.trim() || null);
    addToast({ title: 'Saved', message: 'Stability AI key saved.', type: 'success' });
  };
  const handleSaveOpenRouterKey = () => {
    setOpenRouterApiKey(localOpenRouterApiKey.trim() || null);
    addToast({ title: 'Saved', message: 'OpenRouter key saved.', type: 'success' });
  };
  const handleSaveCartesiaKey = () => {
    setCartesiaApiKey(localCartesiaApiKey.trim() || null);
    addToast({ title: 'Saved', message: 'Cartesia key saved.', type: 'success' });
  };
  const handleSaveEmergentLlmKey = () => {
    setEmergentLlmKey(localEmergentLlmKey.trim() || null);
    addToast({ title: 'Saved', message: 'Emergent LLM key saved.', type: 'success' });
  };

  const handleSaveFirebaseConfig = () => {
    setFirebaseConfig({
      apiKey:            localFbApiKey.trim()        || null,
      authDomain:        localFbAuthDomain.trim()    || null,
      projectId:         localFbProjectId.trim()     || null,
      storageBucket:     localFbStorageBucket.trim() || null,
      messagingSenderId: localFbSenderId.trim()      || null,
      appId:             localFbAppId.trim()          || null,
      vapidKey:          localFbVapidKey.trim()       || null,
    });
    setFirebaseServiceAccountKey(localFbServiceKey.trim() || null);
    addToast({ title: 'Firebase Config Saved', message: 'Firebase configuration saved and ready for backup/restore.', type: 'success' });
  };
  const handleApplyMongoUri = async () => {
    if (!localMongoUri.trim()) return;
    setIsApplyingMongo(true);
    try {
      const res = await fetch('/api/config/set-mongo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mongoUrl: localMongoUri.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setMongoUri(localMongoUri.trim());
      addToast({ title: 'MongoDB updated', message: data.message, type: 'success' });
    } catch (e: any) {
      addToast({ title: 'MongoDB update failed', message: e.message, type: 'error' });
    } finally {
      setIsApplyingMongo(false);
    }
  };

  const handleFirebaseBackup = async () => {
    // Pre-flight: check Firebase config fields are filled
    if (!localFbApiKey || !localFbProjectId || !localFbAppId) {
      addToast({ title: 'Firebase not configured', message: 'Fill in API Key, Project ID and App ID in the Firebase Configuration section above, then save.', type: 'error' });
      return;
    }
    if (!userId) {
      addToast({ title: 'User ID required', message: 'Set a User ID in the Cloud Sync section before backing up.', type: 'error' });
      return;
    }
    setIsFirebaseBackingUp(true);
    addToast({ title: 'Backup starting…', message: 'Packaging full app data for Firebase…', type: 'info' });
    try {
      // exportData produces the COMPLETE data package (personas, chat, memories, journal, settings)
      const fullData = await exportData(chatHistory, sessions, activeSessionId);
      await firebaseBackup(fullData);
      setLastFirebaseBackupTime(Date.now());
      addToast({ title: 'Backup complete', message: `Full app data backed up to Firebase Firestore for user: ${userId}`, type: 'success' });
    } catch (e: any) {
      addToast({ title: 'Backup failed', message: e.message || 'Could not back up to Firebase. Check your Firebase config.', type: 'error' });
    } finally {
      setIsFirebaseBackingUp(false);
    }
  };

  const handleFirebaseRestore = async () => {
    setIsFirebaseRestoring(true);
    try {
      const backup = await firebaseRestore();
      if (!backup) {
        addToast({ title: 'No backup found', message: `No Firebase backup found for user ID: ${userId}`, type: 'warning' });
        return;
      }
      // Restore the sync data to MongoDB
      if (backup.data && userId) {
        const res = await fetch('/api/db/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, data: backup.data }),
        });
        if (res.ok) {
          addToast({ title: 'Restore complete', message: 'Data restored from Firebase backup. Reload the page to see changes.', type: 'success' });
        } else {
          addToast({ title: 'Partial restore', message: 'Firebase backup found but cloud sync restore failed. Try the JSON import.', type: 'warning' });
        }
      } else {
        addToast({ title: 'Backup found', message: `Firebase backup found but no data payload. Saved ${backup.backedUpAt ? new Date(backup.backedUpAt).toLocaleString() : 'N/A'}.`, type: 'info' });
      }
    } catch (e: any) {
      addToast({ title: 'Restore failed', message: e.message || 'Could not reach Firebase.', type: 'error' });
    } finally {
      setIsFirebaseRestoring(false);
    }
  };

  // ── Notifications ────────────────────────────────────────────────
  // Helper: format a timestamp as "X minutes/hours/days ago"
  const timeAgo = (ts: number | null): string | null => {
    if (!ts) return null;
    const diff = Date.now() - ts;
    if (diff < 60_000) return 'just now';
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return `${Math.floor(diff / 86_400_000)}d ago`;
  };

  const handleGalleryFirebaseBackup = async () => {
    if (!localFbApiKey || !localFbProjectId || !localFbAppId) {
      addToast({ title: 'Firebase not configured', message: 'Fill in API Key, Project ID and App ID in Firebase Configuration and save first.', type: 'error' });
      return;
    }
    if (!userId) {
      addToast({ title: 'User ID required', message: 'Set a User ID in Cloud Sync before backing up.', type: 'error' });
      return;
    }
    if (!localFbStorageBucket) {
      addToast({ title: 'Storage Bucket required', message: 'Fill in the Firebase Storage Bucket field (e.g. your-project.appspot.com) in Firebase Configuration.', type: 'error' });
      return;
    }
    setIsGalleryBackingUp(true);
    setGalleryBackupProgress(null);
    addToast({ title: 'Gallery backup starting…', message: `Uploading ${gallery.length} image(s) to Firebase Storage…`, type: 'info' });
    try {
      const count = await firebaseGalleryBackup((done, total) => {
        setGalleryBackupProgress({ done, total });
      });
      setLastGalleryBackupTime(Date.now());
      addToast({ title: 'Gallery backup complete', message: `${count} image(s) uploaded to Firebase Storage.`, type: 'success' });
    } catch (e: any) {
      addToast({ title: 'Gallery backup failed', message: e.message || 'Could not upload gallery to Firebase.', type: 'error' });
    } finally {
      setIsGalleryBackingUp(false);
      setGalleryBackupProgress(null);
    }
  };

  // ── Full restore: Firestore (all app data) + Storage (gallery images) ────────
  const handleFullFirebaseRestore = async () => {
    if (!localFbApiKey || !localFbProjectId || !localFbAppId) {
      addToast({ title: 'Firebase not configured', message: 'Fill in API Key, Project ID and App ID in Firebase Configuration and save first.', type: 'error' });
      return;
    }
    if (!userId) {
      addToast({ title: 'User ID required', message: 'Set a User ID in Cloud Sync before restoring.', type: 'error' });
      return;
    }
    setIsFullRestoring(true);
    setFullRestoreStep(null);
    try {
      // Step 1: Restore app data (personas, chat, memories, journal, settings) from Firestore
      setFullRestoreStep('Step 1 / 2 — Downloading app data from Firestore…');
      const rawData = await firebaseRestore();
      if (!rawData) throw new Error('No backup found for this User ID in Firestore. Create a backup first.');
      // importData applies ALL state: AI profile, personas, chat history, sessions,
      // journal, memories, knowledge base, user profile, and settings
      importData(JSON.stringify(rawData), setChatHistory, setSessions, setActiveSessionId);

      // Step 2: Restore gallery images from Firebase Storage (if Storage bucket is set)
      let galleryMsg = '';
      if (localFbStorageBucket) {
        setFullRestoreStep('Step 2 / 2 — Downloading gallery images from Firebase Storage…');
        try {
          const added = await firebaseGalleryRestore((done, total) => {
            setFullRestoreStep(`Step 2 / 2 — Gallery: ${done} / ${total} images downloaded…`);
          });
          galleryMsg = added > 0 ? ` ${added} gallery image(s) restored.` : ' Gallery already up to date.';
        } catch (galleryErr: any) {
          // Gallery restore failure is non-fatal — app data was already restored
          galleryMsg = ' (Gallery restore skipped: ' + (galleryErr.message || 'no backup found') + ')';
        }
      } else {
        galleryMsg = ' Gallery not restored (Storage Bucket not configured).';
      }

      addToast({
        title: 'Restore complete',
        message: `App data restored from Firebase.${galleryMsg}`,
        type: 'success',
      });
    } catch (e: any) {
      addToast({ title: 'Restore failed', message: e.message || 'Could not restore from Firebase.', type: 'error' });
    } finally {
      setIsFullRestoring(false);
      setFullRestoreStep(null);
      setShowRestoreConfirm(false);
    }
  };

  const handleGalleryFirebaseRestore = async () => {    if (!localFbApiKey || !localFbProjectId || !localFbAppId) {
      addToast({ title: 'Firebase not configured', message: 'Fill in API Key, Project ID and App ID in Firebase Configuration and save first.', type: 'error' });
      return;
    }
    if (!userId) {
      addToast({ title: 'User ID required', message: 'Set a User ID in Cloud Sync before restoring.', type: 'error' });
      return;
    }
    if (!localFbStorageBucket) {
      addToast({ title: 'Storage Bucket required', message: 'Fill in the Firebase Storage Bucket field to restore gallery images.', type: 'error' });
      return;
    }
    setIsGalleryRestoring(true);
    setGalleryRestoreProgress(null);
    addToast({ title: 'Gallery restore starting…', message: 'Downloading images from Firebase Storage…', type: 'info' });
    try {
      const added = await firebaseGalleryRestore((done, total) => {
        setGalleryRestoreProgress({ done, total });
      });
      addToast({
        title: 'Gallery restored',
        message: added > 0
          ? `${added} new image(s) added to your gallery.`
          : 'No new images — all backed-up images are already in your gallery.',
        type: 'success',
      });
    } catch (e: any) {
      addToast({ title: 'Gallery restore failed', message: e.message || 'Could not restore gallery from Firebase.', type: 'error' });
    } finally {
      setIsGalleryRestoring(false);
      setGalleryRestoreProgress(null);
    }
  };

  // Format next auto-backup time
  const nextBackupIn = (): string | null => {
    if (autoBackupSchedule === 'off' || !lastFirebaseBackupTime) return null;
    const INTERVAL = autoBackupSchedule === 'daily' ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
    const due = lastFirebaseBackupTime + INTERVAL;
    const diff = due - Date.now();
    if (diff <= 0) return 'due now';
    if (diff < 3_600_000) return `${Math.ceil(diff / 60_000)}m`;
    if (diff < 86_400_000) return `${Math.ceil(diff / 3_600_000)}h`;
    return `${Math.ceil(diff / 86_400_000)}d`;
  };

  const handleNotificationToggle = async () => {
    if (typeof Notification === 'undefined') {
      addToast({ title: 'Not Supported', message: 'Notifications not supported in this browser.', type: 'warning' });
      return;
    }
    const next = !notificationsEnabled;
    setNotificationsEnabled(next);
    if (next) {
      const perm = await Notification.requestPermission();
      if (perm === 'granted') {
        addToast({ title: 'Enabled', message: 'Notifications enabled.', type: 'success' });
      } else {
        addToast({ title: 'Permission Denied', message: 'Enable notifications in browser settings.', type: 'warning' });
        setNotificationsEnabled(false);
      }
    }
  };

  const handleEnablePush = async () => {
    const result = await requestNotificationPermission(userId || undefined);
    if (result.success && result.endpoint) {
      setFcmToken(result.endpoint);
      addToast({ title: 'Push Enabled', message: result.message, type: 'success' });
    } else {
      addToast({ title: 'Push Failed', message: result.message, type: 'error' });
    }
  };

  const handleTestPush = async () => {
    try {
      const res = await fetch('/api/notifications/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, title: 'indigo AI', body: 'Test push notification!' }),
      });
      if (res.ok) {
        addToast({ title: 'Test Sent', message: 'Push notification sent.', type: 'success' });
      } else {
        const err = await res.json();
        addToast({ title: 'Test Failed', message: err.error || 'Failed', type: 'error' });
      }
    } catch (e: any) {
      addToast({ title: 'Test Failed', message: e.message, type: 'error' });
    }
  };

  // ── Proactive message test ────────────────────────────────────────
  const handleTestProactiveMessage = async () => {
    setIsTestingProactive(true);
    addToast({ title: 'Proactive Message', message: 'Generating…', type: 'info' });
    try {
      const res = await fetch('/api/proactive-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatHistory: chatHistory.slice(-5),
          aiProfile, userProfile,
          anthropicApiKey: anthropicApiKey || undefined,
          userId,
        }),
      });
      if (res.ok) {
        const { message } = await res.json();
        if (message && message !== 'IN_PROGRESS') {
          addChatMessage({ id: `proactive-${Date.now()}`, role: 'model', content: message, timestamp: Date.now() });
          addToast({ title: 'Proactive Message', message: 'Message generated.', type: 'success' });
        }
      } else {
        const err = await res.json();
        addToast({ title: 'Failed', message: err.error || 'Unknown error', type: 'error' });
      }
    } catch (e: any) {
      addToast({ title: 'Error', message: e.message, type: 'error' });
    } finally {
      setIsTestingProactive(false);
    }
  };

  // ── Export / Import ───────────────────────────────────────────────
  const handleExport = async () => {
    setIsExporting(true);
    addToast({ title: 'Exporting', message: 'Preparing backup…', type: 'info' });
    try {
      const data = await exportData(chatHistory, sessions, activeSessionId);
      const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      const ts   = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
      a.download = `${aiProfile.name}_backup_${ts}.json`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); setIsExporting(false); }, 100);
      addToast({ title: 'Exported', message: 'Backup downloaded.', type: 'success' });
    } catch {
      addToast({ title: 'Export Failed', message: 'Failed to export.', type: 'error' });
      setIsExporting(false);
    }
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsImporting(true);
    addToast({ title: 'Importing', message: 'Restoring data…', type: 'info' });
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        if (ev.target?.result) importData(ev.target.result as string, setChatHistory, setSessions, setActiveSessionId);
      } finally { setIsImporting(false); }
    };
    reader.onerror = () => { addToast({ title: 'Import Failed', message: 'Could not read file.', type: 'error' }); setIsImporting(false); };
    reader.readAsText(file);
  };

  // ── Knowledge base ────────────────────────────────────────────────
  const handleKBUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setIsImporting(true);
    addToast({ title: 'Knowledge Base', message: `Processing ${files.length} file(s)…`, type: 'info' });
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const processed = await processFile(file, file.name, anthropicApiKey || undefined);
        for (const p of processed) addToKnowledgeBase({ name: p.name, content: p.content || '' });
      }
      addToast({ title: 'Knowledge Base', message: 'All files processed.', type: 'success' });
    } catch {
      addToast({ title: 'Upload Failed', message: 'Failed to process files.', type: 'error' });
    } finally { setIsImporting(false); }
  };

  // ── Browser tools ─────────────────────────────────────────────────
  const handleLocation = () => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (p) => addToast({ title: 'Location', message: `${p.coords.latitude.toFixed(4)}, ${p.coords.longitude.toFixed(4)}`, type: 'info' }),
        (err) => addToast({ title: 'Location Error', message: err.message, type: 'error' })
      );
    } else {
      addToast({ title: 'Not Supported', message: 'Geolocation not available.', type: 'warning' });
    }
  };

  const handleStorageCheck = async () => {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      const { usage, quota } = await navigator.storage.estimate();
      const usedMB  = ((usage  || 0) / 1024 / 1024).toFixed(1);
      const totalMB = ((quota  || 0) / 1024 / 1024).toFixed(0);
      addToast({ title: 'Storage', message: `${usedMB} MB used of ~${totalMB} MB`, type: 'info' });
    } else {
      addToast({ title: 'Not Supported', message: 'Storage estimation not available.', type: 'warning' });
    }
  };

  const handleClipboardCopy = async () => {
    setIsExporting(true);
    try {
      const data = await exportData(chatHistory, sessions, activeSessionId);
      await navigator.clipboard.writeText(JSON.stringify(data));
      addToast({ title: 'Copied', message: 'Data copied to clipboard.', type: 'success' });
    } catch {
      addToast({ title: 'Failed', message: 'Clipboard copy failed.', type: 'error' });
    } finally { setIsExporting(false); }
  };

  // ── JSX ───────────────────────────────────────────────────────────
  return (
    <div className="w-full h-full p-4 overflow-y-auto bg-transparent">
      <h2 className="text-2xl font-bold mb-6 text-indigo-600 dark:text-indigo-400">Settings</h2>

      {isSyncing && (
        <div className="w-full h-1 bg-indigo-100 dark:bg-indigo-900 rounded-full overflow-hidden mb-4">
          <div className="h-full bg-indigo-600 animate-pulse w-full" />
        </div>
      )}

      <div className="space-y-8">

        {/* ── API Keys ── */}
        <section>
          <h3 className="text-lg font-semibold text-indigo-900 dark:text-indigo-100 mb-4 border-b border-indigo-200 dark:border-indigo-800 pb-2">API Keys</h3>
          <div className="space-y-4">

            {/* Anthropic */}
            <div>
              <label className="block text-sm font-medium text-indigo-700 dark:text-indigo-300 mb-1">
                Anthropic API Key <span className="text-indigo-400 dark:text-indigo-500 font-normal">(required for AI chat)</span>
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-400" />
                  <input
                    type="password"
                    value={localAnthropicApiKey}
                    onChange={(e) => setLocalAnthropicApiKey(e.target.value)}
                    placeholder="sk-ant-…"
                    className="app-input pl-9"
                  />
                </div>
                <button onClick={handleSaveAnthropicKey} className="app-btn-primary">Save</button>
              </div>
              <p className="text-xs text-indigo-500 dark:text-indigo-400 mt-1">
                Get a key at <a href="https://console.anthropic.com" target="_blank" rel="noreferrer" className="underline">console.anthropic.com</a>.
                If the server has a key set, you can leave this blank.
              </p>
            </div>

            {/* Async */}
            <div>
              <label className="block text-sm font-medium text-indigo-700 dark:text-indigo-300 mb-1">
                Async API Key <span className="text-indigo-400 dark:text-indigo-500 font-normal">(required for Async TTS)</span>
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-400" />
                  <input
                    type="password"
                    value={localAsyncApiKey}
                    onChange={(e) => setLocalAsyncApiKey(e.target.value)}
                    placeholder="Your Async API key"
                    className="app-input pl-9"
                  />
                </div>
                <button onClick={handleSaveAsyncKey} className="app-btn-primary">Save</button>
              </div>
            </div>

            {/* ElevenLabs */}
            <div>
              <label className="block text-sm font-medium text-indigo-700 dark:text-indigo-300 mb-1">
                ElevenLabs API Key <span className="text-indigo-400 dark:text-indigo-500 font-normal">(optional — for ElevenLabs TTS)</span>
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-400" />
                  <input
                    type="password"
                    value={localElevenLabsApiKey}
                    onChange={(e) => setLocalElevenLabsApiKey(e.target.value)}
                    placeholder="Your ElevenLabs API key"
                    className="app-input pl-9"
                  />
                </div>
                <button onClick={handleSaveElevenLabsKey} className="app-btn-primary">Save</button>
              </div>
              <p className="text-xs text-indigo-500 dark:text-indigo-400 mt-1">
                Get a key at <a href="https://elevenlabs.io" target="_blank" rel="noreferrer" className="underline">elevenlabs.io</a>. Used as an alternative TTS engine in Voice Settings.
              </p>
            </div>

            {/* Gemini */}
            <div>
              <label className="block text-sm font-medium text-indigo-700 dark:text-indigo-300 mb-1">
                Gemini API Key <span className="text-indigo-400 dark:text-indigo-500 font-normal">(optional — for Gemini chat models)</span>
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-400" />
                  <input
                    type="password"
                    value={localGeminiApiKey}
                    onChange={(e) => setLocalGeminiApiKey(e.target.value)}
                    placeholder="Your Gemini API key"
                    className="app-input pl-9"
                  />
                </div>
                <button onClick={handleSaveGeminiKey} className="app-btn-primary">Save</button>
              </div>
              <p className="text-xs text-indigo-500 dark:text-indigo-400 mt-1">
                Get a key at <a href="https://aistudio.google.com" target="_blank" rel="noreferrer" className="underline">aistudio.google.com</a>. Enables Gemini models in AI Profile settings, and auto-fallback if Claude is unavailable.
              </p>
            </div>

            {/* Freepik */}
            <div>
              <label className="block text-sm font-medium text-indigo-700 dark:text-indigo-300 mb-1">
                Freepik API Key <span className="text-indigo-400 dark:text-indigo-500 font-normal">(required for image generation)</span>
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-400" />
                  <input
                    type="password"
                    value={localFreepikApiKey}
                    onChange={(e) => setLocalFreepikApiKey(e.target.value)}
                    placeholder="Your Freepik API key"
                    className="app-input pl-9"
                  />
                </div>
                <button onClick={handleSaveFreepikKey} className="app-btn-primary">Save</button>
              </div>
              <p className="text-xs text-indigo-500 dark:text-indigo-400 mt-1">
                Get a key at <a href="https://www.freepik.com/developers/dashboard" target="_blank" rel="noreferrer" className="underline">freepik.com/developers</a>. Enables AI image generation. New accounts get $5 in free credits.
              </p>
            </div>

            {/* WaveSpeed */}
            <div>
              <label className="block text-sm font-medium text-indigo-700 dark:text-indigo-300 mb-1">
                WaveSpeed API Key <span className="text-indigo-400 dark:text-indigo-500 font-normal">(for WaveSpeed image/video models)</span>
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-400" />
                  <input
                    type="password"
                    value={localWavespeedApiKey}
                    onChange={(e) => setLocalWavespeedApiKey(e.target.value)}
                    placeholder="Your WaveSpeed API key"
                    className="app-input pl-9"
                  />
                </div>
                <button onClick={handleSaveWavespeedKey} className="app-btn-primary">Save</button>
              </div>
              <p className="text-xs text-indigo-500 dark:text-indigo-400 mt-1">
                Get a key at <a href="https://wavespeed.ai/accesskey" target="_blank" rel="noreferrer" className="underline">wavespeed.ai/accesskey</a>. Enables WaveSpeed image editing and video generation. Requires a top-up to activate.
              </p>
            </div>

            {/* OpenRouter */}
            <div>
              <label className="block text-sm font-medium text-indigo-700 dark:text-indigo-300 mb-1">
                OpenRouter API Key <span className="text-indigo-400 dark:text-indigo-500 font-normal">(for 200+ LLM models)</span>
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-400" />
                  <input type="password" value={localOpenRouterApiKey}
                    onChange={(e) => setLocalOpenRouterApiKey(e.target.value)}
                    placeholder="sk-or-..."
                    data-testid="openrouter-api-key-input"
                    className="app-input pl-9" />
                </div>
                <button onClick={handleSaveOpenRouterKey} data-testid="openrouter-api-key-save" className="app-btn-primary">Save</button>
              </div>
              <p className="text-xs text-indigo-500 dark:text-indigo-400 mt-1">
                Get a key at <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer" className="underline">openrouter.ai/keys</a>. Routes to Claude, GPT, Llama, Mistral, DeepSeek and more.
              </p>
            </div>

            {/* Cartesia */}
            <div>
              <label className="block text-sm font-medium text-indigo-700 dark:text-indigo-300 mb-1">
                Cartesia API Key <span className="text-indigo-400 dark:text-indigo-500 font-normal">(for Cartesia TTS)</span>
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-400" />
                  <input type="password" value={localCartesiaApiKey}
                    onChange={(e) => setLocalCartesiaApiKey(e.target.value)}
                    placeholder="Your Cartesia API key"
                    data-testid="cartesia-api-key-input"
                    className="app-input pl-9" />
                </div>
                <button onClick={handleSaveCartesiaKey} data-testid="cartesia-api-key-save" className="app-btn-primary">Save</button>
              </div>
              <p className="text-xs text-indigo-500 dark:text-indigo-400 mt-1">
                Get a key at <a href="https://play.cartesia.ai/keys" target="_blank" rel="noreferrer" className="underline">play.cartesia.ai/keys</a>. Fast, realistic neural TTS.
              </p>
            </div>

            {/* Emergent LLM Key */}
            <div>
              <label className="block text-sm font-medium text-indigo-700 dark:text-indigo-300 mb-1">
                Emergent LLM Key <span className="text-indigo-400 dark:text-indigo-500 font-normal">(universal key override)</span>
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-400" />
                  <input type="password" value={localEmergentLlmKey}
                    onChange={(e) => setLocalEmergentLlmKey(e.target.value)}
                    placeholder="Override the built-in Emergent key"
                    data-testid="emergent-llm-key-input"
                    className="app-input pl-9" />
                </div>
                <button onClick={handleSaveEmergentLlmKey} data-testid="emergent-llm-key-save" className="app-btn-primary">Save</button>
              </div>
              <p className="text-xs text-indigo-500 dark:text-indigo-400 mt-1">
                Overrides the built-in Emergent universal key for OpenAI, Claude, and Gemini calls. Leave blank to use the platform default.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-indigo-700 dark:text-indigo-300 mb-1">
                Stability AI Key <span className="text-indigo-400 dark:text-indigo-500 font-normal">(for SD3.5 — minimal content restrictions)</span>
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-400" />
                  <input
                    type="password"
                    value={localStabilityApiKey}
                    onChange={(e) => setLocalStabilityApiKey(e.target.value)}
                    placeholder="sk-..."
                    data-testid="stability-api-key-input"
                    className="app-input pl-9"
                  />
                </div>
                <button onClick={handleSaveStabilityKey} data-testid="stability-api-key-save" className="app-btn-primary">Save</button>
              </div>
              <p className="text-xs text-indigo-500 dark:text-indigo-400 mt-1">
                Get a key at <a href="https://platform.stability.ai/account/keys" target="_blank" rel="noreferrer" className="underline">platform.stability.ai</a>. Enables Stable Image Core and SD3.5 generation.
              </p>
            </div>

          </div>
        </section>

        {/* ── Cloud Sync ── */}
        <section>
          <h3 className="text-lg font-semibold text-indigo-900 dark:text-indigo-100 mb-4 border-b border-indigo-200 dark:border-indigo-800 pb-2">Cloud Sync & Recovery</h3>
          <div className="space-y-4">

            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm text-indigo-900 dark:text-indigo-100 block">Enable Auto-Sync</span>
                <span className="text-xs text-indigo-500 dark:text-indigo-400">Sync to cloud automatically.</span>
              </div>
              <button
                onClick={() => setIsSyncEnabled(!isSyncEnabled)}
                className={`w-10 h-6 rounded-full transition-colors ${isSyncEnabled ? 'bg-indigo-600' : 'bg-indigo-200 dark:bg-indigo-800'}`}
              >
                <div className={`w-4 h-4 rounded-full bg-white transition-transform mx-auto ${isSyncEnabled ? 'translate-x-2' : '-translate-x-2'}`} />
              </button>
            </div>

            {isSyncEnabled && (
              <div className="flex items-center gap-2">
                <label className="text-sm text-indigo-700 dark:text-indigo-300 whitespace-nowrap">Every</label>
                <input
                  type="number" min="1"
                  value={syncFrequency}
                  onChange={(e) => setSyncFrequency(parseInt(e.target.value) || 5)}
                  className="app-input w-20 text-center"
                />
                <label className="text-sm text-indigo-700 dark:text-indigo-300">minutes</label>
              </div>
            )}

            {/* Sync ID */}
            <div>
              <label className="block text-xs font-semibold text-indigo-700 dark:text-indigo-300 uppercase tracking-wider mb-1">Your Sync ID</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={localSyncId}
                  onChange={(e) => setLocalSyncId(e.target.value)}
                  placeholder="Custom Sync ID"
                  className="app-input flex-1 font-mono text-sm"
                />
                <button onClick={handleSaveSyncId} title="Save ID" className="app-btn-primary px-3">
                  <Save className="w-4 h-4" />
                </button>
                <button
                  onClick={() => { navigator.clipboard.writeText(localSyncId); addToast({ title: 'Copied', message: 'Sync ID copied.', type: 'success' }); }}
                  title="Copy ID" className="app-btn-ghost px-3"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs text-indigo-500 dark:text-indigo-400 mt-1 italic">Save this ID — you'll need it to recover on another device.</p>
            </div>

            <div>
              <button
                onClick={handleSync}
                disabled={isSyncing}
                className="app-btn-primary w-full flex items-center justify-center gap-2"
              >
                <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                {isSyncing ? 'Syncing…' : 'Sync Now'}
              </button>
              {lastCloudSyncTime && (
                <p className="text-xs text-indigo-400 dark:text-indigo-500 mt-1 text-center">
                  Last synced: {timeAgo(lastCloudSyncTime)}
                </p>
              )}
            </div>

            {/* Recovery */}
            <div>
              <label className="block text-xs font-semibold text-indigo-700 dark:text-indigo-300 uppercase tracking-wider mb-1">Data Recovery</label>
              <p className="text-xs text-indigo-500 dark:text-indigo-400 mb-2">Restore your data from the cloud using a Sync ID.</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={recoveryId}
                  onChange={(e) => setRecoveryId(e.target.value)}
                  placeholder="Enter Sync ID to recover"
                  className="app-input flex-1 font-mono text-sm"
                />
                <button
                  onClick={() => { if (!recoveryId) return; if (chatHistory.length > 0) setShowOverwriteConfirm(true); else handleRecover(); }}
                  disabled={isSyncing || !recoveryId}
                  className="app-btn-primary flex items-center gap-1"
                >
                  <Download className="w-4 h-4" />
                  Recover
                </button>
              </div>
            </div>

          </div>
        </section>

        {/* ── MongoDB Configuration ── */}
        <section>
          <h3 className="text-lg font-semibold text-indigo-900 dark:text-indigo-100 mb-4 border-b border-indigo-200 dark:border-indigo-800 pb-2">MongoDB Configuration</h3>
          <div className="space-y-3">
            <p className="text-sm text-indigo-600 dark:text-indigo-400">
              Override the built-in MongoDB connection. Use your own Atlas cluster URI for persistent personal storage.
            </p>
            <div>
              <label className="block text-sm font-medium text-indigo-700 dark:text-indigo-300 mb-1">
                MongoDB Connection URI
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Database className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-400" />
                  <input
                    type="password"
                    value={localMongoUri}
                    onChange={(e) => setLocalMongoUri(e.target.value)}
                    placeholder="mongodb+srv://user:pass@cluster.mongodb.net/dbname"
                    data-testid="mongo-uri-input"
                    className="app-input pl-9 font-mono text-xs"
                  />
                </div>
                <button
                  onClick={handleApplyMongoUri}
                  disabled={isApplyingMongo || !localMongoUri.trim()}
                  data-testid="mongo-uri-apply"
                  className="app-btn-primary disabled:opacity-50 flex items-center gap-1.5">
                  {isApplyingMongo ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" />Applying…</> : 'Apply'}
                </button>
              </div>
              <p className="text-xs text-indigo-500 dark:text-indigo-400 mt-1">
                Reconnects immediately and saves to server config. Leave blank to use the default built-in MongoDB.
              </p>
            </div>

            {/* MongoDB Export / Import */}
            <div className="border-t border-indigo-100 dark:border-indigo-800 pt-3 space-y-2">
              <p className="text-sm font-medium text-indigo-700 dark:text-indigo-300">Export / Import MongoDB Data</p>
              <p className="text-xs text-indigo-500 dark:text-indigo-400">Download all your cloud-synced data as a JSON file, or restore from a previous export.</p>
              <div className="flex gap-2">
                <button
                  data-testid="mongo-export-btn"
                  onClick={async () => {
                    if (!userId) { addToast({ title: 'Export failed', message: 'No user ID found. Enable sync first.', type: 'error' }); return; }
                    const res = await fetch(`/api/db/export/${userId}`);
                    if (!res.ok) { addToast({ title: 'Export failed', message: await res.text(), type: 'error' }); return; }
                    const blob = await res.blob();
                    const url  = URL.createObjectURL(blob);
                    const a    = document.createElement('a');
                    a.href     = url; a.download = `indigo-mongodb-backup-${Date.now()}.json`;
                    a.click(); URL.revokeObjectURL(url);
                    addToast({ title: 'Export complete', message: 'MongoDB data downloaded.', type: 'success' });
                  }}
                  className="app-btn-secondary flex items-center gap-1.5">
                  <Download className="w-3.5 h-3.5" /> Export JSON
                </button>
                <label className="app-btn-secondary flex items-center gap-1.5 cursor-pointer">
                  <Upload className="w-3.5 h-3.5" /> Import JSON
                  <input type="file" accept=".json" className="hidden" onChange={async (e) => {
                    const file = e.target.files?.[0]; if (!file) return;
                    if (!userId) { addToast({ title: 'Import failed', message: 'No user ID found.', type: 'error' }); return; }
                    try {
                      const text = await file.text();
                      const parsed = JSON.parse(text);
                      const data = parsed.data || parsed; // support both wrapped and raw
                      const res = await fetch('/api/db/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, data }) });
                      if (!res.ok) { addToast({ title: 'Import failed', message: (await res.json()).error, type: 'error' }); return; }
                      addToast({ title: 'Import complete', message: 'Data restored from backup. Reload the page to see changes.', type: 'success' });
                    } catch { addToast({ title: 'Import failed', message: 'Invalid JSON file.', type: 'error' }); }
                    e.target.value = '';
                  }} />
                </label>
              </div>
            </div>
          </div>
        </section>

        {/* ── Firebase Configuration ── */}
        <section>
          <h3 className="text-lg font-semibold text-indigo-900 dark:text-indigo-100 mb-4 border-b border-indigo-200 dark:border-indigo-800 pb-2">Firebase Configuration</h3>
          <div className="space-y-4">
            <p className="text-sm text-indigo-600 dark:text-indigo-400">
              Enter your Firebase project credentials to enable cloud backup. Find these in the{' '}
              <a href="https://console.firebase.google.com" target="_blank" rel="noreferrer" className="underline font-medium">Firebase Console</a>{' '}
              → Project Settings → Your apps → SDK config.
            </p>

            {/* 2-col grid for short fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { label: 'API Key',              key: 'apiKey',            val: localFbApiKey,       set: setLocalFbApiKey,       ph: 'AIzaSy...' },
                { label: 'Auth Domain',          key: 'authDomain',        val: localFbAuthDomain,   set: setLocalFbAuthDomain,   ph: 'project.firebaseapp.com' },
                { label: 'Project ID',           key: 'projectId',         val: localFbProjectId,    set: setLocalFbProjectId,    ph: 'my-project-id' },
                { label: 'Storage Bucket',       key: 'storageBucket',     val: localFbStorageBucket,set: setLocalFbStorageBucket,ph: 'project.firebasestorage.app' },
                { label: 'Messaging Sender ID',  key: 'messagingSenderId', val: localFbSenderId,     set: setLocalFbSenderId,     ph: '123456789012' },
                { label: 'App ID',               key: 'appId',             val: localFbAppId,        set: setLocalFbAppId,        ph: '1:123:web:abc123' },
                { label: 'VAPID Key',            key: 'vapidKey',          val: localFbVapidKey,     set: setLocalFbVapidKey,     ph: 'BJ...' },
              ].map(({ label, key, val, set, ph }) => (
                <div key={key}>
                  <label className="block text-xs font-medium text-indigo-700 dark:text-indigo-300 mb-1">{label}</label>
                  <input
                    type="text"
                    value={val}
                    onChange={(e) => set(e.target.value)}
                    placeholder={ph}
                    data-testid={`firebase-${key}-input`}
                    className="app-input font-mono text-xs"
                  />
                </div>
              ))}
            </div>

            {/* Service Account Key — full-width textarea */}
            <div>
              <label className="block text-xs font-medium text-indigo-700 dark:text-indigo-300 mb-1">
                Service Account Key <span className="font-normal text-indigo-400">(optional — for server-side operations)</span>
              </label>
              <textarea
                value={localFbServiceKey}
                onChange={(e) => setLocalFbServiceKey(e.target.value)}
                placeholder={'{\n  "type": "service_account",\n  "project_id": "...",\n  ...\n}'}
                rows={4}
                data-testid="firebase-serviceAccountKey-input"
                className="w-full p-2 border border-indigo-300 dark:border-indigo-700 rounded-xl bg-white dark:bg-indigo-950 text-indigo-900 dark:text-indigo-100 text-xs font-mono focus:ring-2 focus:ring-indigo-500 outline-none resize-y"
              />
            </div>

            <button
              onClick={handleSaveFirebaseConfig}
              data-testid="firebase-config-save"
              className="w-full py-2.5 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition-colors text-sm">
              Save Firebase Configuration
            </button>

            {/* Backup / Restore */}
            <div className="pt-2 border-t border-indigo-100 dark:border-indigo-800 space-y-3">
              <p className="text-sm text-indigo-600 dark:text-indigo-400">
                Back up your <strong>full app data</strong> (personas, chat, memories, journal, settings) to Firestore. Use the same User ID on any device to restore.
              </p>
              {!userId && (
                <div className="p-3 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-xl text-sm text-amber-700 dark:text-amber-300">
                  Set a User ID in Cloud Sync &amp; Recovery above before backing up.
                </div>
              )}

              {/* App data backup / check */}
              <div>
                <p className="text-xs font-medium text-indigo-700 dark:text-indigo-300 mb-1.5">App Data (Firestore)</p>
                <div className="flex gap-3">
                  <button onClick={handleFirebaseBackup} disabled={isFirebaseBackingUp || !userId}
                    data-testid="firebase-backup-btn"
                    className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 text-sm">
                    {isFirebaseBackingUp ? <><RefreshCw className="w-4 h-4 animate-spin" />Backing up…</> : 'Backup to Firestore'}
                  </button>
                  <button onClick={handleFirebaseRestore} disabled={isFirebaseRestoring || !userId}
                    data-testid="firebase-restore-btn"
                    className="flex-1 py-2.5 bg-white dark:bg-indigo-900 border border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300 rounded-xl font-medium hover:bg-indigo-50 dark:hover:bg-indigo-800 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 text-sm">
                    {isFirebaseRestoring ? <><RefreshCw className="w-4 h-4 animate-spin" />Checking…</> : 'Check Backup'}
                  </button>
                </div>
                {lastFirebaseBackupTime && (
                  <p className="text-xs text-indigo-400 dark:text-indigo-500 mt-1 text-center">
                    Last backed up: {timeAgo(lastFirebaseBackupTime)}
                  </p>
                )}
              </div>

              {/* Full restore on new device */}
              <div className="border-t border-indigo-100 dark:border-indigo-800 pt-3">
                <p className="text-xs font-medium text-indigo-700 dark:text-indigo-300 mb-1">Restore Everything to This Device</p>
                <p className="text-xs text-indigo-500 dark:text-indigo-400 mb-2">
                  Downloads and applies your full backup: AI personas, chat history, memories, journal, settings, and gallery images.
                  <strong className="text-amber-600 dark:text-amber-400"> This overwrites current app data.</strong>
                </p>
                {!showRestoreConfirm ? (
                  <button
                    onClick={() => setShowRestoreConfirm(true)}
                    disabled={!userId || isFullRestoring}
                    data-testid="full-restore-trigger-btn"
                    className="w-full py-2.5 bg-amber-500 text-white rounded-xl font-medium hover:bg-amber-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 text-sm">
                    Restore All Data from Firebase
                  </button>
                ) : (
                  <div className="p-3 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-xl space-y-2">
                    {isFullRestoring ? (
                      <div className="flex flex-col items-center gap-2 py-2">
                        <RefreshCw className="w-5 h-5 animate-spin text-indigo-500" />
                        <p className="text-xs text-indigo-700 dark:text-indigo-300 text-center">{fullRestoreStep || 'Preparing…'}</p>
                      </div>
                    ) : (
                      <>
                        <p className="text-sm font-medium text-amber-700 dark:text-amber-300">Are you sure?</p>
                        <p className="text-xs text-amber-600 dark:text-amber-400">This will overwrite all current app data with your Firebase backup.</p>
                        <div className="flex gap-2 pt-1">
                          <button onClick={handleFullFirebaseRestore}
                            data-testid="full-restore-confirm-btn"
                            className="flex-1 py-2 bg-amber-500 text-white rounded-xl text-sm font-medium hover:bg-amber-600 transition-colors">
                            Yes, Restore Now
                          </button>
                          <button onClick={() => setShowRestoreConfirm(false)}
                            className="flex-1 py-2 border border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 rounded-xl text-sm font-medium hover:bg-amber-50 dark:hover:bg-amber-900 transition-colors">
                            Cancel
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Gallery backup to Firebase Storage */}
              <div className="border-t border-indigo-100 dark:border-indigo-800 pt-3">
                <p className="text-xs font-medium text-indigo-700 dark:text-indigo-300 mb-1">Gallery Images (Firebase Storage)</p>
                <p className="text-xs text-indigo-500 dark:text-indigo-400 mb-2">
                  Upload/download individual gallery images to Firebase Storage. Requires <strong>Storage Bucket</strong> to be configured above.
                  {gallery.length > 0 ? ` You have ${gallery.length} image(s) in your local gallery.` : ' Your gallery is currently empty.'}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {/* Backup */}
                  <div>
                    <button
                      onClick={handleGalleryFirebaseBackup}
                      disabled={isGalleryBackingUp || !userId || gallery.length === 0}
                      data-testid="firebase-gallery-backup-btn"
                      className="w-full py-2.5 bg-indigo-500 text-white rounded-xl font-medium hover:bg-indigo-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 text-sm">
                      {isGalleryBackingUp ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          {galleryBackupProgress
                            ? `Uploading ${galleryBackupProgress.done} / ${galleryBackupProgress.total}…`
                            : 'Preparing…'}
                        </>
                      ) : 'Backup Gallery'}
                    </button>
                    {lastGalleryBackupTime && (
                      <p className="text-xs text-indigo-400 dark:text-indigo-500 mt-1 text-center">
                        Last backup: {timeAgo(lastGalleryBackupTime)}
                      </p>
                    )}
                  </div>
                  {/* Restore */}
                  <div>
                    <button
                      onClick={handleGalleryFirebaseRestore}
                      disabled={isGalleryRestoring || !userId}
                      data-testid="firebase-gallery-restore-btn"
                      className="w-full py-2.5 bg-white dark:bg-indigo-900 border border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300 rounded-xl font-medium hover:bg-indigo-50 dark:hover:bg-indigo-800 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 text-sm">
                      {isGalleryRestoring ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          {galleryRestoreProgress
                            ? `${galleryRestoreProgress.done} / ${galleryRestoreProgress.total}`
                            : 'Fetching…'}
                        </>
                      ) : 'Restore Gallery'}
                    </button>
                    <p className="text-[10px] text-indigo-400 dark:text-indigo-500 mt-1 text-center">Downloads images back to this device</p>
                  </div>
                </div>
              </div>

              {/* Real-time sync */}
              <div className="border-t border-indigo-100 dark:border-indigo-800 pt-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <p className="text-xs font-medium text-indigo-700 dark:text-indigo-300">Real-time Sync</p>
                    <p className="text-xs text-indigo-500 dark:text-indigo-400 mt-0.5">
                      Syncs personas, memories, journal and settings to Firestore within 30 seconds of any change.
                      New gallery images upload to Firebase Storage instantly.
                      Requires Firebase to be configured above.
                    </p>
                  </div>
                  <button
                    data-testid="real-time-sync-toggle"
                    onClick={() => setRealTimeSyncEnabled(!realTimeSyncEnabled)}
                    className={`relative flex-shrink-0 w-12 h-6 rounded-full transition-colors ${realTimeSyncEnabled ? 'bg-indigo-600' : 'bg-indigo-200 dark:bg-indigo-700'}`}>
                    <span className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${realTimeSyncEnabled ? 'translate-x-6' : 'translate-x-0'}`} />
                  </button>
                </div>
                {realTimeSyncEnabled && (
                  <p className="text-[10px] text-green-600 dark:text-green-400 mt-1.5">
                    Real-time sync is active. Changes will upload to Firestore within 30s. New images upload immediately.
                  </p>
                )}
              </div>

              {/* Auto-backup schedule */}
              <div className="border-t border-indigo-100 dark:border-indigo-800 pt-3">
                <p className="text-xs font-medium text-indigo-700 dark:text-indigo-300 mb-1">Auto-Backup Schedule (App Data)</p>
                <p className="text-xs text-indigo-500 dark:text-indigo-400 mb-2">
                  Automatically backs up app data to Firestore in the background. Requires Firebase to be configured and a User ID set.
                  A push notification is sent on completion if notifications are enabled.
                </p>
                <div className="flex gap-2">
                  {(['off', 'daily', 'weekly'] as const).map(opt => (
                    <button
                      key={opt}
                      data-testid={`auto-backup-${opt}`}
                      onClick={() => setAutoBackupSchedule(opt)}
                      className={`flex-1 py-2 rounded-xl border text-sm font-medium transition-colors capitalize
                        ${autoBackupSchedule === opt
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-white dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 border-indigo-300 dark:border-indigo-700 hover:bg-indigo-50 dark:hover:bg-indigo-800'}`}>
                      {opt}
                    </button>
                  ))}
                </div>
                {autoBackupSchedule !== 'off' && (
                  <p className="text-xs text-indigo-400 dark:text-indigo-500 mt-1.5">
                    {lastFirebaseBackupTime
                      ? `Last backup: ${timeAgo(lastFirebaseBackupTime)} · Next in: ${nextBackupIn() ?? '…'}`
                      : 'First backup will run shortly after the app loads.'}
                  </p>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* ── Knowledge Base ── */}
        <section>
          <h3 className="text-lg font-semibold text-indigo-900 dark:text-indigo-100 mb-4 border-b border-indigo-200 dark:border-indigo-800 pb-2">Knowledge Base</h3>
          <button
            onClick={() => kbInputRef.current?.click()}
            disabled={isImporting}
            className="flex items-center justify-center w-full p-4 border-2 border-dashed border-indigo-200 dark:border-indigo-700 rounded-lg bg-white dark:bg-indigo-950 hover:bg-indigo-50 dark:hover:bg-indigo-900 transition-colors text-indigo-600 dark:text-indigo-400 disabled:opacity-50"
          >
            {isImporting ? <RefreshCw className="w-5 h-5 mr-2 animate-spin" /> : <Upload className="w-5 h-5 mr-2" />}
            {isImporting ? 'Processing…' : 'Upload Documents'}
          </button>
          <input ref={kbInputRef} type="file" onChange={handleKBUpload} multiple
            accept=".txt,.md,.pdf,.json,.csv,.xml,.html,.js,.ts,.py,.go,.rb,.sql,.yml,.yaml"
            className="hidden" />
          <p className="text-xs text-indigo-500 dark:text-indigo-400 mt-2 text-center">
            Supported: .txt .md .pdf .json .csv .xml .html .js .ts .py and more
          </p>
          {knowledgeBase.length > 0 && (
            <ul className="mt-3 space-y-1 max-h-48 overflow-y-auto">
              {knowledgeBase.map((file, i) => (
                <li key={i} className="flex items-center text-xs text-indigo-700 dark:text-indigo-300 bg-white dark:bg-indigo-900 p-2 rounded border border-indigo-100 dark:border-indigo-800">
                  <FileText className="w-3 h-3 mr-2 flex-shrink-0 text-indigo-400" />
                  <span className="truncate flex-1">{file.name}</span>
                  <span className="ml-2 text-indigo-400 flex-shrink-0">
                    {file.content.length > 1024 ? `${(file.content.length / 1024).toFixed(0)} KB` : `${file.content.length} B`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ── Data Management ── */}
        <section>
          <h3 className="text-lg font-semibold text-indigo-900 dark:text-indigo-100 mb-4 border-b border-indigo-200 dark:border-indigo-800 pb-2">Data Management</h3>
          <p className="text-xs text-indigo-500 dark:text-indigo-400 mb-3">JSON backups do not include images or videos.</p>
          <div className="grid grid-cols-2 gap-3">
            <button onClick={handleExport} disabled={isExporting}
              className="flex items-center justify-center p-3 border border-indigo-200 dark:border-indigo-700 rounded-lg bg-white dark:bg-indigo-900 hover:bg-indigo-50 dark:hover:bg-indigo-800 transition-colors disabled:opacity-50 text-sm text-indigo-700 dark:text-indigo-300">
              {isExporting ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
              {isExporting ? 'Exporting…' : 'Export JSON'}
            </button>
            <button onClick={() => fileInputRef.current?.click()} disabled={isImporting}
              className="flex items-center justify-center p-3 border border-indigo-200 dark:border-indigo-700 rounded-lg bg-white dark:bg-indigo-900 hover:bg-indigo-50 dark:hover:bg-indigo-800 transition-colors disabled:opacity-50 text-sm text-indigo-700 dark:text-indigo-300">
              {isImporting ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
              {isImporting ? 'Importing…' : 'Import JSON'}
            </button>
          </div>
          <input ref={fileInputRef} type="file" onChange={handleImport} accept=".json" className="hidden" />
        </section>

        {/* ── Preferences ── */}
        <section>
          <h3 className="text-lg font-semibold text-indigo-900 dark:text-indigo-100 mb-4 border-b border-indigo-200 dark:border-indigo-800 pb-2">Preferences</h3>
          <div className="space-y-4">

            {/* JSON backup interval */}
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm text-indigo-900 dark:text-indigo-100 block">Auto JSON Backup</span>
                <span className="text-xs text-indigo-500 dark:text-indigo-400">Interval in minutes (0 to disable).</span>
              </div>
              <div className="flex items-center gap-2">
                <input type="number" min="0" value={autoJsonBackupInterval}
                  onChange={(e) => setAutoJsonBackupInterval(Number(e.target.value))}
                  className="app-input w-20 text-center text-sm" />
                <button onClick={() => setAutoJsonBackup(!autoJsonBackup)}
                  className={`w-10 h-6 rounded-full transition-colors ${autoJsonBackup ? 'bg-indigo-600' : 'bg-indigo-200 dark:bg-indigo-800'}`}>
                  <div className={`w-4 h-4 rounded-full bg-white transition-transform mx-auto ${autoJsonBackup ? 'translate-x-2' : '-translate-x-2'}`} />
                </button>
              </div>
            </div>

            {/* Proactive test */}
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm text-indigo-900 dark:text-indigo-100 block">Test Proactive Message</span>
                <span className="text-xs text-indigo-500 dark:text-indigo-400">Send one immediately.</span>
              </div>
              <button onClick={handleTestProactiveMessage} disabled={isTestingProactive}
                className="app-btn-primary flex items-center gap-1 text-sm">
                {isTestingProactive && <RefreshCw className="w-3 h-3 animate-spin" />}
                {isTestingProactive ? 'Generating…' : 'Test'}
              </button>
            </div>

            {/* In-app notifications toggle */}
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm text-indigo-900 dark:text-indigo-100 block">In-App Notifications</span>
                <span className="text-xs text-indigo-500 dark:text-indigo-400">Show toast notifications inside the app.</span>
              </div>
              <button onClick={handleNotificationToggle}
                className={`w-10 h-6 rounded-full transition-colors ${notificationsEnabled ? 'bg-indigo-600' : 'bg-indigo-200 dark:bg-indigo-800'}`}>
                <div className={`w-4 h-4 rounded-full bg-white transition-transform mx-auto ${notificationsEnabled ? 'translate-x-2' : '-translate-x-2'}`} />
              </button>
            </div>

            {/* Timestamps */}
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm text-indigo-900 dark:text-indigo-100 block">Message Timestamps</span>
                <span className="text-xs text-indigo-500 dark:text-indigo-400">Show date/time on each message.</span>
              </div>
              <button onClick={() => setShowTimestamps(!showTimestamps)}
                className={`w-10 h-6 rounded-full transition-colors ${showTimestamps ? 'bg-indigo-600' : 'bg-indigo-200 dark:bg-indigo-800'}`}>
                <div className={`w-4 h-4 rounded-full bg-white transition-transform mx-auto ${showTimestamps ? 'translate-x-2' : '-translate-x-2'}`} />
              </button>
            </div>

            {/* Mobile Debugger toggle */}
            <div className="flex items-center justify-between py-2">
              <div>
                <span className="text-sm text-indigo-900 dark:text-indigo-100 block">🐛 Mobile Debugger</span>
                <span className="text-xs text-indigo-500 dark:text-indigo-400">Shows a floating bug button for viewing logs and running JS.</span>
              </div>
              <button onClick={() => setIsDebuggerEnabled(!isDebuggerEnabled)}
                className={`w-10 h-6 rounded-full transition-colors flex-shrink-0 ${isDebuggerEnabled ? 'bg-indigo-600' : 'bg-indigo-200 dark:bg-indigo-800'}`}>
                <div className={`w-4 h-4 rounded-full bg-white transition-transform mx-auto ${isDebuggerEnabled ? 'translate-x-2' : '-translate-x-2'}`} />
              </button>
            </div>

            {/* Time zone */}
            <div>
              <label className="text-sm text-indigo-900 dark:text-indigo-100 block mb-1">Time Zone</label>
              <select value={timeZone} onChange={(e) => setTimeZone(e.target.value)} className="app-input">
                {Intl.supportedValuesOf('timeZone').map((tz) => (
                  <option key={tz} value={tz}>{tz}</option>
                ))}
              </select>
            </div>

          </div>
        </section>

        {/* ── Browser Tools ── */}
        <section>
          <h3 className="text-lg font-semibold text-indigo-900 dark:text-indigo-100 mb-4 border-b border-indigo-200 dark:border-indigo-800 pb-2">Browser Tools</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <button onClick={handleLocation}
              className="flex flex-col items-center justify-center p-4 border border-indigo-200 dark:border-indigo-800 rounded-xl bg-white dark:bg-indigo-950 hover:bg-indigo-50 dark:hover:bg-indigo-900 transition-all">
              <MapPin className="w-5 h-5 mb-1 text-indigo-400" />
              <span className="text-xs text-indigo-700 dark:text-indigo-300">Location</span>
            </button>
            <button onClick={handleClipboardCopy} disabled={isExporting}
              className="flex flex-col items-center justify-center p-4 border border-indigo-200 dark:border-indigo-800 rounded-xl bg-white dark:bg-indigo-950 hover:bg-indigo-50 dark:hover:bg-indigo-900 transition-all disabled:opacity-50">
              {isExporting ? <RefreshCw className="w-5 h-5 mb-1 text-indigo-400 animate-spin" /> : <Copy className="w-5 h-5 mb-1 text-indigo-400" />}
              <span className="text-xs text-indigo-700 dark:text-indigo-300">Copy Data</span>
            </button>
            <button onClick={handleStorageCheck}
              className="flex flex-col items-center justify-center p-4 border border-indigo-200 dark:border-indigo-800 rounded-xl bg-white dark:bg-indigo-950 hover:bg-indigo-50 dark:hover:bg-indigo-900 transition-all">
              <Database className="w-5 h-5 mb-1 text-indigo-400" />
              <span className="text-xs text-indigo-700 dark:text-indigo-300">Storage</span>
            </button>
            <button onClick={handleEnablePush}
              className="flex flex-col items-center justify-center p-4 border border-indigo-200 dark:border-indigo-800 rounded-xl bg-white dark:bg-indigo-950 hover:bg-indigo-50 dark:hover:bg-indigo-900 transition-all">
              <Smartphone className="w-5 h-5 mb-1 text-indigo-400" />
              <span className="text-xs text-indigo-700 dark:text-indigo-300">Enable Push</span>
            </button>
            <button onClick={handleTestPush}
              className="flex flex-col items-center justify-center p-4 border border-indigo-200 dark:border-indigo-800 rounded-xl bg-white dark:bg-indigo-950 hover:bg-indigo-50 dark:hover:bg-indigo-900 transition-all">
              <Bell className="w-5 h-5 mb-1 text-indigo-400" />
              <span className="text-xs text-indigo-700 dark:text-indigo-300">Test Push</span>
            </button>
          </div>
          {fcmToken && (
            <p className="mt-3 text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
              Push subscription active
            </p>
          )}
        </section>

        {/* ── Help ── */}
        <section>
          <h3 className="text-lg font-semibold text-indigo-900 dark:text-indigo-100 mb-4 border-b border-indigo-200 dark:border-indigo-800 pb-2">Help</h3>
          <button onClick={() => setShowTutorial(true)}
            className="app-btn-ghost w-full flex items-center justify-center gap-2">
            <HelpCircle className="w-5 h-5" />
            Start Tutorial
          </button>
        </section>

        {/* ── Danger Zone ── */}
        <section>
          <h3 className="text-lg font-semibold text-red-600 dark:text-red-400 mb-4 border-b border-red-100 dark:border-red-900/30 pb-2">Danger Zone</h3>
          <button
            onClick={async () => {
              if (window.confirm('This will wipe all local data and reset the app. Are you sure?')) {
                try { await resetApp(); }
                catch { addToast({ title: 'Reset Failed', message: 'Failed to reset.', type: 'error' }); }
              }
            }}
            className="flex items-center text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 font-medium text-sm"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Reset All Data
          </button>
          <p className="text-xs text-indigo-500 dark:text-indigo-400 mt-1">Cannot be undone.</p>
        </section>

      </div>

      {/* Overwrite confirm modal */}
      {showOverwriteConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-indigo-950 p-6 rounded-2xl shadow-2xl max-w-sm w-full border border-indigo-100 dark:border-indigo-800">
            <h3 className="text-lg font-bold mb-3 text-indigo-900 dark:text-indigo-100">Overwrite current chat?</h3>
            <p className="mb-5 text-sm text-indigo-600 dark:text-indigo-400">You have an active chat. Recovering will replace it with cloud data.</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowOverwriteConfirm(false)} className="app-btn-ghost">Cancel</button>
              <button onClick={() => { setShowOverwriteConfirm(false); handleRecover(); }} className="app-btn-primary">Overwrite</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SettingsScreen;
