import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { gzipSync, strToU8, gunzipSync, strFromU8 } from 'fflate';
import { saveToDB, loadFromDB, deleteFromDB, clearDB } from '../services/db';
import { onForegroundMessage, requestNotificationPermission } from '../services/webPushService';
import { showNativeNotification } from '../services/notificationService';
import { backupToFirestore, restoreFromFirestore, uploadGalleryToFirebaseStorage, restoreGalleryFromFirebaseStorage, uploadKnowledgeBaseToFirebaseStorage, restoreKnowledgeBaseFromFirebaseStorage, signInWithGoogle as fbSignInWithGoogle, signOutUser as fbSignOutUser, onAuthStateChange, FirebaseUser } from '../services/firebaseService';
import { AIProfile, UserProfile, ChatMessage, GalleryItem, JournalEntry, Memory, KnowledgeBaseDocument, ChatSession, ProactiveCommunication } from '../types';

export interface Toast {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  timestamp: number;
}

interface AppState {
  aiProfile: AIProfile;
  savedPersonas: AIProfile[];
  userProfile: UserProfile;
  gallery: GalleryItem[];
  journal: JournalEntry[];
  knowledgeBase: { name: string; content: string }[]; // Simple text files
  memories: Memory[];
  proactiveCommunications: ProactiveCommunication[];
  toasts: Toast[];
  apiKey: string | null;
  autoSaveChat: boolean;
  autoSaveChatInterval: number; // in seconds
  autoJsonBackup: boolean;
  autoJsonBackupInterval: number; // in minutes
  proactiveMessageFrequency: '1h' | '6h' | '12h' | '24h' | 'off' | 'low' | 'medium' | 'high';
  proactiveEmailFrequency: '1h' | '6h' | '12h' | '24h' | 'off' | 'low' | 'medium' | 'high';
  isSyncEnabled: boolean;
  syncFrequency: number;
  notificationsEnabled: boolean;
  fcmToken: string | null;
  showTimestamps: boolean;
  ambientMode: boolean;
  ambientFrequency: '1h' | '6h' | '12h' | '24h' | 'off' | 'low' | 'medium' | 'high';
  aiCanGenerateImages: boolean;
  isDebuggerEnabled: boolean;
  timeZone: string;
  firebaseApiKey: string | null;
  firebaseAuthDomain: string | null;
  firebaseProjectId: string | null;
  firebaseStorageBucket: string | null;
  firebaseAppId: string | null;
  firebaseMessagingSenderId: string | null;
  anthropicApiKey: string | null;
  elevenLabsApiKey: string | null;
  setElevenLabsApiKey: (key: string | null) => void;
  geminiApiKey: string | null;
  setGeminiApiKey: (key: string | null) => void;
  wavespeedApiKey: string | null;
  setWavespeedApiKey: (key: string | null) => void;
  lastInteractionTime: number;
  userId: string;
  isSuccessfullyLoaded: boolean;
  galleryLoaded: boolean;
}

interface AppContextType extends AppState {
  setAIProfile: (profile: AIProfile) => void;
  savePersona: (profile: AIProfile, chatHistory: ChatMessage[], sessions: ChatSession[], activeSessionId: string | null) => void;
  deletePersona: (id: string) => void;
  loadPersona: (id: string, currentChatHistory: ChatMessage[], currentSessions: ChatSession[], currentActiveSessionId: string | null, setChatHistory: (h: ChatMessage[]) => void, setSessions: (s: ChatSession[]) => void, setActiveSessionId: (id: string | null) => void) => void;
  setUserProfile: (profile: UserProfile) => void;
  setUserReferenceImage: (image: string | null) => void;
  setIsSyncEnabled: (enabled: boolean) => void;
  setSyncFrequency: (frequency: number) => void;
  setFcmToken: (token: string | null) => void;
  addToGallery: (item: GalleryItem) => void;
  deleteImageFromGallery: (id: string) => void;
  deleteImagesFromGallery: (ids: string[]) => void;
  updateGalleryItem: (id: string, updates: Partial<GalleryItem>) => void;
  addJournalEntry: (entry: JournalEntry) => void;
  updateJournalEntry: (id: string, updates: Partial<JournalEntry>) => void;
  deleteJournalEntry: (id: string) => void;
  addToKnowledgeBase: (file: { name: string; content: string }) => void;
  addMultipleToKnowledgeBase: (files: { name: string; content: string }[]) => void;
  deleteFromKnowledgeBase: (name: string) => void;
  deleteMultipleFromKnowledgeBase: (names: string[]) => void;
  addMemory: (memory: Memory) => void;
  updateMemory: (id: string, updates: Partial<Memory>) => void;
  deleteMemory: (id: string) => void;
  addProactiveCommunication: (comm: ProactiveCommunication) => void;
  deleteProactiveCommunication: (id: string) => void;
  addToast: (toast: Omit<Toast, 'id' | 'timestamp'>) => void;
  removeToast: (id: string) => void;
  resetApp: () => Promise<void>;
  exportData: (chatHistory: ChatMessage[], sessions: ChatSession[], activeSessionId: string | null) => Promise<any>;
  exportGalleryData: () => Promise<Uint8Array>;
  exportGalleryChunks: (chunkSize?: number, mediaType?: 'image' | 'video') => Promise<Uint8Array[]>;
  importGalleryData: (compressedData: Uint8Array) => Promise<void>;
  importGalleryChunks: (chunks: Uint8Array[]) => Promise<void>;
  syncGalleryToCloud: (mediaType?: 'image' | 'video') => Promise<void>;
  restoreGalleryFromCloud: (mediaType?: 'image' | 'video') => Promise<void>;
  importData: (json: string, setChatHistory: (history: ChatMessage[]) => void, setSessions: (sessions: ChatSession[]) => void, setActiveSessionId: (id: string | null) => void) => void;
  setApiKey: (key: string | null) => void;
  lastCloudSyncTime: number | null;
  lastFirebaseBackupTime: number | null;
  lastGalleryBackupTime: number | null;
  setLastCloudSyncTime: (t: number | null) => void;
  setLastFirebaseBackupTime: (t: number | null) => void;
  setLastGalleryBackupTime: (t: number | null) => void;
  setAnthropicApiKey: (key: string | null) => void;
  showTutorial: boolean;
  setShowTutorial: (show: boolean) => void;
  setAutoSaveChat: (enabled: boolean) => void;
  setAutoSaveChatInterval: (interval: number) => void;
  setAutoJsonBackup: (enabled: boolean) => void;
  setAutoJsonBackupInterval: (interval: number) => void;
  setNotificationsEnabled: (enabled: boolean) => void;
  setShowTimestamps: (show: boolean) => void;
  setProactiveMessageFrequency: (frequency: '1h' | '6h' | '12h' | '24h' | 'off' | 'low' | 'medium' | 'high') => void;
  proactiveEmailFrequency: 'off' | '1h' | '6h' | '12h' | '24h' | 'low' | 'medium' | 'high';
  setProactiveEmailFrequency: (frequency: '1h' | '6h' | '12h' | '24h' | 'off' | 'low' | 'medium' | 'high') => void;
  setAmbientMode: (enabled: boolean) => void;
  setAmbientFrequency: (frequency: '1h' | '6h' | '12h' | '24h' | 'off' | 'low' | 'medium' | 'high') => void;
  setAiCanGenerateImages: (enabled: boolean) => void;
  setIsDebuggerEnabled: (enabled: boolean) => void;
  setTimeZone: (tz: string) => void;
  updateAIProfile: (updates: Partial<AIProfile>) => void;
  fetchWithRetry: (url: string, options: RequestInit, retries?: number, backoff?: number) => Promise<Response>;
  firebaseBackup: (data: any) => Promise<void>;
  firebaseRestore: () => Promise<any | null>;
  firebaseGalleryBackup: (onProgress?: (done: number, total: number) => void) => Promise<number>;
  firebaseGalleryRestore: (onProgress?: (done: number, total: number) => void) => Promise<number>;
  firebaseKBBackup: (onProgress?: (done: number, total: number) => void) => Promise<number>;
  firebaseKBRestore: (onProgress?: (done: number, total: number) => void) => Promise<number>;
  realTimeSyncEnabled: boolean;
  setRealTimeSyncEnabled: (enabled: boolean) => void;
  autoBackupSchedule: 'off' | 'daily' | 'weekly';
  setAutoBackupSchedule: (s: 'off' | 'daily' | 'weekly') => void;
  firebaseApiKey: string | null;
  firebaseAuthDomain: string | null;
  firebaseProjectId: string | null;
  firebaseStorageBucket: string | null;
  firebaseAppId: string | null;
  firebaseMessagingSenderId: string | null;
  setFirebaseConfig: (config: {
    apiKey?: string | null; authDomain?: string | null; projectId?: string | null;
    storageBucket?: string | null; appId?: string | null;
    messagingSenderId?: string | null;
  }) => void;
  isSuccessfullyLoaded: boolean;
  isLoaded: boolean;
  lastInteractionTime: number;
  setLastInteractionTime: (time: number) => void;
  userId: string;
  setUserId: (id: string) => void;
  isSyncing: boolean;
  setIsSyncing: (syncing: boolean) => void;
  galleryLoaded: boolean;
  loadGallery: () => Promise<void>;
  currentUser: FirebaseUser | null;
  authLoading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Initial States
  const [showTutorial, setShowTutorial] = useState(false);
  const [aiProfile, setAIProfileState] = useState<AIProfile>({
    id: 'default',
    name: 'Indigo',
    personality: 'Helpful, creative, and observant.',
    behavioralPatterns: '',
    goals: '',
    coreValues: '',
    likes: '',
    dislikes: '',
    speakingStyle: '',
    backstory: 'I am an AI companion created to assist and inspire.',
    appearance: 'A digital entity with a calming indigo aura.',
    referenceImage: null,
    voiceURI: null,
    voicePitch: 1.0,
    voiceSpeed: 1.0,
    autoReadMessages: false,
    voiceProvider: 'browser',
    responseLength: 'medium',
    responseDetail: 'medium',
    responseTone: 'friendly',
    customParagraphCount: null,
    customWordCount: null,
    proactiveMessageFrequency: 'off',
    proactiveEmailFrequency: 'off',
    proactiveEmailStyle: 'personal',
    proactiveEmailParagraphs: 3,
    proactiveBlogFrequency: 'off',
    proactiveBlogStyle: 'journal',
    proactiveBlogParagraphs: 5,
    proactiveBlogId: null,
    model: 'gemini-2.0-flash',
    temperature: 0.7,
    timeAwareness: true,
    ambientMode: false,
    ambientFrequency: 'off',
    aiCanGenerateImages: false,
    imageStyle: 'none',
    imageGenerationInstructions: [
      "If a character reference image is provided, you MUST use it as the absolute source of truth.",
      "COPY the face, body type, skin tone, hair color, and all physical features EXACTLY from the reference image.",
      "You are ONLY permitted to modify the pose, clothing, facial expression, and eye position.",
      "DO NOT alter the body type (muscularity, bust size, etc.) or facial structure in any way.",
      "If the prompt or description contradicts the reference image, the reference image ALWAYS takes precedence.",
    ],
    aiCanGenerateSpeech: false,
    aiCanUseTools: false,
    aiCanUseWebSearch: false,
    aiCanUseCalendar: false,
    aiCanUseGmail: false,
    aiCanUseYouTube: false,
    aiCanUseGoogleMaps: false,
    aiCanUseBlogger: false,
    aiCanBrowse: false,
    aiCanSendProactiveEmails: false,
    knowsItsAI: true,
    memories: [],
    journal: [],
  });

  const [savedPersonas, setSavedPersonas] = useState<AIProfile[]>([]);

  const [userProfile, setUserProfileState] = useState<UserProfile>({
    name: 'User',
    email: '',
    info: '',
    preferences: '',
    appearance: '',
    referenceImage: null,
  });

  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [galleryLoaded, setGalleryLoaded] = useState(false);

  const loadGallery = async () => {
    if (galleryLoaded) return;
    console.log("Loading gallery items lazily...", Date.now());
    let galleryData = [];
    const galleryIds = await loadFromDB('indigo_app_data_gallery_ids');
    if (galleryIds && Array.isArray(galleryIds)) {
        galleryData = await Promise.all(
            galleryIds.map(async (id: string) => {
                const itemStr = await loadFromDB(`indigo_app_data_gallery_item_${id}`);
                return itemStr ? (typeof itemStr === 'string' ? JSON.parse(itemStr) : itemStr) : null;
            })
        );
        galleryData = galleryData.filter(item => item !== null);
    }
    setGallery(galleryData);
    setGalleryLoaded(true);
    console.log("Gallery items loaded lazily", Date.now());
  };

  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const [knowledgeBase, setKnowledgeBase] = useState<{ name: string; content: string }[]>([]);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [proactiveCommunications, setProactiveCommunications] = useState<ProactiveCommunication[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [apiKey, setApiKeyState] = useState<string | null>(null);
  const [lastCloudSyncTime,      setLastCloudSyncTimeState]      = useState<number | null>(null);
  const [lastFirebaseBackupTime, setLastFirebaseBackupTimeState] = useState<number | null>(null);
  const [lastGalleryBackupTime,  setLastGalleryBackupTimeState]  = useState<number | null>(null);
  const [autoBackupSchedule,     setAutoBackupScheduleState]     = useState<'off' | 'daily' | 'weekly'>('off');
  const [realTimeSyncEnabled,    setRealTimeSyncEnabledState]    = useState(false);
  const [anthropicApiKey, setAnthropicApiKeyState] = useState<string | null>(null);
  const [elevenLabsApiKey, setElevenLabsApiKeyState] = useState<string | null>(null);
  const [geminiApiKey, setGeminiApiKeyState] = useState<string | null>(null);
  const [wavespeedApiKey, setWavespeedApiKeyState] = useState<string | null>(null);
  const [autoSaveChat, setAutoSaveChatState] = useState(true);
  const [autoSaveChatInterval, setAutoSaveChatInterval] = useState(30); // Default 30 seconds
  const [autoJsonBackup, setAutoJsonBackupState] = useState(false);
  const [autoJsonBackupInterval, setAutoJsonBackupInterval] = useState(5); // Default 5 minutes
  const [isSyncEnabled, setIsSyncEnabled] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncFrequency, setSyncFrequency] = useState(5); // Default 5 minutes
  const [notificationsEnabled, setNotificationsEnabledState] = useState(
    typeof Notification !== 'undefined' && Notification.permission === 'granted'
  );
  const [fcmToken, setFcmTokenState] = useState<string | null>(null);
  const [isDebuggerEnabled, setIsDebuggerEnabledState] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('indigo_debugger_enabled') === 'true';
    }
    return false;
  });
  const [showTimestamps, setShowTimestampsState] = useState(true);
  const [timeZone, setTimeZoneState] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [firebaseApiKey,           setFirebaseApiKey]           = useState<string | null>(null);
  const [firebaseAuthDomain,       setFirebaseAuthDomain]       = useState<string | null>(null);
  const [firebaseProjectId,        setFirebaseProjectId]        = useState<string | null>(null);
  const [firebaseStorageBucket,    setFirebaseStorageBucket]    = useState<string | null>(null);
  const [firebaseAppId,            setFirebaseAppId]            = useState<string | null>(null);
  const [firebaseMessagingSenderId,setFirebaseMessagingSenderId]= useState<string | null>(null);

  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [lastInteractionTime, setLastInteractionTime] = useState(Date.now());
  const [userId, setUserId] = useState<string>(() => {
    const storedId = localStorage.getItem('indigo_user_id') || '';
    if (storedId === '1772969457324cxo5dyvni') {
      localStorage.removeItem('indigo_user_id');
      return '';
    }
    return storedId;
  });
  const [isLoaded, setIsLoaded] = useState(false);
  const [isSuccessfullyLoaded, setIsSuccessfullyLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showResetOption, setShowResetOption] = useState(false);
  const MAX_MEMORIES = 20; // Define maximum number of memories

  const initialAIProfileState: AIProfile = {
    id: 'default',
    name: 'Indigo',
    personality: 'Helpful, creative, and observant.',
    behavioralPatterns: '',
    goals: '',
    coreValues: '',
    likes: '',
    dislikes: '',
    speakingStyle: '',
    backstory: 'I am an AI companion created to assist and inspire.',
    appearance: 'A digital entity with a calming indigo aura.',
    referenceImage: null,
    voiceURI: null,
    voicePitch: 1.0,
    voiceSpeed: 1.0,
    autoReadMessages: false,
    voiceProvider: 'browser',
    responseLength: 'medium',
    responseDetail: 'medium',
    responseTone: 'friendly',
    customParagraphCount: null,
    customWordCount: null,
    proactiveMessageFrequency: 'off',
    proactiveEmailFrequency: 'off',
    proactiveBlogFrequency: 'off',
    proactiveBlogId: null,
    llmProvider: 'gemini',
    model: 'gemini-2.0-flash',
    temperature: 0.7,
    timeAwareness: true,
    ambientMode: false,
    ambientFrequency: 'off',
    aiCanGenerateImages: false,
    imageStyle: 'none',
    imageGenerationInstructions: [
      "If a character reference image is provided, you MUST use it as the absolute source of truth.",
      "COPY the face, body type, skin tone, hair color, and all physical features EXACTLY from the reference image.",
      "You are ONLY permitted to modify the pose, clothing, facial expression, and eye position.",
      "DO NOT alter the body type (muscularity, bust size, etc.) or facial structure in any way.",
      "If the prompt or description contradicts the reference image, the reference image ALWAYS takes precedence.",
    ],
    aiCanGenerateSpeech: false,
    aiCanUseTools: false,
    aiCanUseWebSearch: false,
    aiCanUseCalendar: false,
    aiCanUseGmail: false,
    aiCanUseYouTube: false,
    aiCanUseGoogleMaps: false,
    aiCanUseBlogger: false,
    aiCanBrowse: false,
    aiCanSendProactiveEmails: false,
    knowsItsAI: true,
    memories: [],
    journal: [],
  };

  const initialUserProfileState: UserProfile = {
    name: 'User',
    email: '',
    info: '',
    preferences: '',
    appearance: '',
    referenceImage: null,
  };

  // Function to prune or consolidate memories
  const pruneMemories = (currentMemories: Memory[]): Memory[] => {
    if (currentMemories.length <= MAX_MEMORIES) {
      return currentMemories;
    }

    // Separate important memories
    const importantMemories = currentMemories.filter(m => m.isImportant);
    let nonImportantMemories = currentMemories.filter(m => !m.isImportant);

    // If important memories alone exceed limit, prune them too (e.g., oldest important first)
    if (importantMemories.length > MAX_MEMORIES) {
      return importantMemories.sort((a, b) => a.timestamp - b.timestamp).slice(0, MAX_MEMORIES);
    }

    // Sort non-important memories: by strength (ascending), then by lastAccessed (ascending - oldest first)
    nonImportantMemories.sort((a, b) => {
      if (a.strength !== b.strength) {
        return a.strength - b.strength;
      }
      return a.lastAccessed - b.lastAccessed; // Prioritize older/less accessed for pruning
    });

    // Determine how many non-important memories to keep
    const numToKeep = MAX_MEMORIES - importantMemories.length;
    let keptNonImportantMemories = nonImportantMemories.slice(0, numToKeep);

    // Combine and return
    return [...importantMemories, ...keptNonImportantMemories];
  };

  // Load from IndexedDB on mount
  useEffect(() => {
    const loadData = async () => {
        console.log("loadData started", Date.now());
        const timeoutId = setTimeout(() => {
            if (!isLoaded) {
                console.warn("loadData timeout reached");
                setShowResetOption(true);
            }
        }, 30000);

        try {
            let savedData = null;
            
            // Try loading chunked data first
            try {
                console.log("Attempting to load chunked data...", Date.now());
                const coreData = await loadFromDB('indigo_app_data_core');
                if (coreData) {
                    console.log("Core data found, loading parts...", Date.now());
                    const activeProfileStr = await loadFromDB('indigo_app_data_active_profile');
                    const galleryDataStr = await loadFromDB('indigo_app_data_gallery');
                    
                    const activeProfile = activeProfileStr ? (typeof activeProfileStr === 'string' ? JSON.parse(activeProfileStr) : activeProfileStr) : null;
                    
                    // Gallery loading moved to lazy load
                    let galleryData: GalleryItem[] = [];
                    
                    console.log("Skipping gallery load in loadData", Date.now());

                    const personaIds = await loadFromDB('indigo_app_data_persona_ids') || [];
                    console.log("Loading personas...", Date.now());
                    const personasData = [];
                    for (const id of personaIds) {
                        const pStr = await loadFromDB(`indigo_app_data_persona_${id}`);
                        if (pStr) {
                            personasData.push(typeof pStr === 'string' ? JSON.parse(pStr) : pStr);
                        }
                    }
                    console.log("Personas loaded", Date.now());
                    
                    savedData = {
                        ...coreData,
                        aiProfile: activeProfile || coreData.aiProfile,
                        gallery: galleryData || [],
                        savedPersonas: personasData.length > 0 ? personasData : (coreData.savedPersonas || [])
                    };
                    console.log("Chunked data loaded successfully", Date.now());
                }
            } catch (chunkLoadError) {
                console.warn("Failed to load chunked data, continuing with other formats", chunkLoadError);
            }
            
            // Fallback to stringified data
            if (!savedData) {
                try {
                    console.log("Attempting to load stringified chunks...", Date.now());
                    const numChunks = await loadFromDB('indigo_app_data_stringified_chunks');
                    if (numChunks) {
                        console.log(`Found ${numChunks} stringified chunks`, Date.now());
                        let stringifiedData = '';
                        for (let i = 0; i < numChunks; i++) {
                            const chunk = await loadFromDB(`indigo_app_data_stringified_chunk_${i}`);
                            if (chunk) stringifiedData += chunk;
                        }
                        savedData = JSON.parse(stringifiedData);
                        console.log("Stringified chunks loaded successfully", Date.now());
                    } else {
                        console.log("Attempting to load single stringified data...", Date.now());
                        const stringifiedData = await loadFromDB('indigo_app_data_stringified');
                        if (stringifiedData) {
                            savedData = JSON.parse(stringifiedData);
                            console.log("Single stringified data loaded successfully", Date.now());
                        }
                    }
                } catch (stringifiedLoadError) {
                    console.warn("Failed to load stringified data, continuing", stringifiedLoadError);
                }
            }
            
            // Fallback to old format
            if (!savedData) {
                try {
                    console.log("Attempting to load old format data...", Date.now());
                    savedData = await loadFromDB('indigo_app_data');
                    if (savedData) console.log("Old format data loaded successfully", Date.now());
                } catch (oldFormatError) {
                    console.warn("Failed to load old format data", oldFormatError);
                }
            }
            
            if (savedData && typeof savedData === 'object') {
                console.log("Data loaded, initializing state...", Date.now());
                setIsSuccessfullyLoaded(true);
                // Ensure ID exists for legacy data
                const loadedProfile = savedData.aiProfile || initialAIProfileState;
                if (loadedProfile && typeof loadedProfile === 'object' && !loadedProfile.id) loadedProfile.id = 'default';
                
                const loadedUserId = savedData.userId || localStorage.getItem('indigo_user_id') || '';
                setUserId(loadedUserId);
                localStorage.setItem('indigo_user_id', loadedUserId);
                
                setAIProfileState(prev => ({
                    ...initialAIProfileState, // Provide defaults for new fields
                    ...(typeof loadedProfile === 'object' ? loadedProfile : {}),
                    ambientMode: loadedProfile?.ambientMode ?? false,
                    ambientFrequency: loadedProfile?.ambientFrequency || 'off',
                    aiCanGenerateImages: loadedProfile?.aiCanGenerateImages ?? false,
                    aiCanUseWebSearch: loadedProfile?.aiCanUseWebSearch ?? false,
                    aiCanUseCalendar: loadedProfile?.aiCanUseCalendar ?? false,
                    aiCanUseGmail: loadedProfile?.aiCanUseGmail ?? false,
                    aiCanUseYouTube: loadedProfile?.aiCanUseYouTube ?? false,
                    aiCanUseGoogleMaps: loadedProfile?.aiCanUseGoogleMaps ?? false,
                    aiCanSendProactiveEmails: loadedProfile?.aiCanSendProactiveEmails ?? false,
                    imageStyle: loadedProfile?.imageStyle || 'none',
                    imageGenerationInstructions: loadedProfile?.imageGenerationInstructions !== undefined ? loadedProfile.imageGenerationInstructions : initialAIProfileState.imageGenerationInstructions,
                }));

                const loadedSavedPersonas = (Array.isArray(savedData.savedPersonas) ? savedData.savedPersonas : [loadedProfile]).map((p: any) => ({
                  ...initialAIProfileState,
                  ...(typeof p === 'object' ? p : {}),
                  imageGenerationInstructions: p?.imageGenerationInstructions !== undefined ? p.imageGenerationInstructions : initialAIProfileState.imageGenerationInstructions,
                }));
                setSavedPersonas(loadedSavedPersonas);
                setUserProfileState(savedData.userProfile || initialUserProfileState);
                setGallery(Array.isArray(savedData.gallery) ? savedData.gallery : []);
                setJournal(Array.isArray(savedData.journal) ? savedData.journal : []);
                setKnowledgeBase(Array.isArray(savedData.knowledgeBase) ? savedData.knowledgeBase : []);
                setMemories(Array.isArray(savedData.memories) ? savedData.memories : []);
                setProactiveCommunications(Array.isArray(savedData.proactiveCommunications) ? savedData.proactiveCommunications : []);
                setAnthropicApiKeyState(savedData.anthropicApiKey || null);
                setElevenLabsApiKeyState(savedData.elevenLabsApiKey || null);
                setGeminiApiKeyState(savedData.geminiApiKey || null);
                setWavespeedApiKeyState(savedData.wavespeedApiKey || null);

                setLastCloudSyncTimeState(savedData.lastCloudSyncTime || null);
                setLastFirebaseBackupTimeState(savedData.lastFirebaseBackupTime || null);
                setLastGalleryBackupTimeState(savedData.lastGalleryBackupTime || null);
                setAutoBackupScheduleState(savedData.autoBackupSchedule || 'off');
                setRealTimeSyncEnabledState(savedData.realTimeSyncEnabled ?? false);
                setFirebaseApiKey(savedData.firebaseApiKey || null);
                setFirebaseAuthDomain(savedData.firebaseAuthDomain || null);
                setFirebaseProjectId(savedData.firebaseProjectId || null);
                setFirebaseStorageBucket(savedData.firebaseStorageBucket || null);
                setFirebaseAppId(savedData.firebaseAppId || null);
                setFirebaseMessagingSenderId(savedData.firebaseMessagingSenderId || null);

                setApiKeyState(savedData.apiKey || null);
                setFcmTokenState(savedData.fcmToken || null);
                // Keep isDebuggerEnabled local-only to avoid sync issues during dev
                // if (savedData.isDebuggerEnabled !== undefined) {
                //   setIsDebuggerEnabled(savedData.isDebuggerEnabled);
                // }
                setAutoSaveChatState(savedData.autoSaveChat !== undefined ? savedData.autoSaveChat : true);
                setAutoSaveChatInterval(savedData.autoSaveChatInterval !== undefined ? savedData.autoSaveChatInterval : 30);
                setAutoJsonBackupState(savedData.autoJsonBackup !== undefined ? savedData.autoJsonBackup : false);
                setAutoJsonBackupInterval(savedData.autoJsonBackupInterval !== undefined ? savedData.autoJsonBackupInterval : 5);
                setIsSyncEnabled(savedData.isSyncEnabled !== undefined ? savedData.isSyncEnabled : false);
                setSyncFrequency(savedData.syncFrequency !== undefined ? savedData.syncFrequency : 5);
                setNotificationsEnabledState(savedData.notificationsEnabled !== undefined ? savedData.notificationsEnabled : (typeof Notification !== 'undefined' && Notification.permission === 'granted'));
                setTimeZoneState(savedData.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone);
                if (savedData.lastInteractionTime) {
                  setLastInteractionTime(savedData.lastInteractionTime);
                }
            } else {
                // Initialize saved personas with default if empty
                setIsSuccessfullyLoaded(true);
                setSavedPersonas([initialAIProfileState]);
                const storedUserId = localStorage.getItem('indigo_user_id');
                if (storedUserId) {
                    setUserId(storedUserId);
                } else {
                    const newUserId = '';
                    setUserId(newUserId);
                    localStorage.setItem('indigo_user_id', newUserId);
                }
            }
        } catch (e: any) {
            console.error("Failed to load saved data from DB during app initialization:", e);
            setLoadError(e.message || "Unknown error during initialization");
        } finally {
            clearTimeout(timeoutId);
            setIsLoaded(true);
        }
    };
    loadData();
  }, []);

  const saveData = useCallback(async () => {
    if (!isSuccessfullyLoaded) return; // Don't save before initial load is complete

    try {
      const data: AppState = {
          aiProfile,
          savedPersonas,
          userProfile,
          gallery,
          journal,
          knowledgeBase,
          memories,
          proactiveCommunications,
          toasts: [],
          apiKey,
          autoSaveChat,
          autoSaveChatInterval,
          autoJsonBackup,
          autoJsonBackupInterval,
          isSyncEnabled,
          syncFrequency,
          proactiveMessageFrequency: aiProfile.proactiveMessageFrequency,
          proactiveEmailFrequency: aiProfile.proactiveEmailFrequency,
          notificationsEnabled,
          fcmToken,
          showTimestamps,
          isDebuggerEnabled,
          ambientMode: aiProfile.ambientMode,
          ambientFrequency: aiProfile.ambientFrequency,
          aiCanGenerateImages: aiProfile.aiCanGenerateImages,
          timeZone,
          firebaseApiKey,
          firebaseAuthDomain,
          firebaseProjectId,
          firebaseStorageBucket,
          firebaseAppId,
          firebaseMessagingSenderId,
          anthropicApiKey,
          elevenLabsApiKey,
          geminiApiKey,
          wavespeedApiKey,
          lastCloudSyncTime,
          lastFirebaseBackupTime,
          lastGalleryBackupTime,
          autoBackupSchedule,
          realTimeSyncEnabled,
          lastInteractionTime,
          userId,
          isSuccessfullyLoaded,
          galleryLoaded
      };
      
      try {
          // Split data to avoid out of memory errors
          const coreData = { ...data };
          delete coreData.savedPersonas;
          delete coreData.gallery;
          delete coreData.aiProfile;

          await saveToDB('indigo_app_data_core', coreData);
          await saveToDB('indigo_app_data_active_profile', JSON.stringify(aiProfile));
          // Gallery is saved separately in its own useEffect (see below saveData)
          // to avoid hook ordering issues and stale closure problems.

          const personaIds = savedPersonas.map(p => p.id);
          await saveToDB('indigo_app_data_persona_ids', personaIds);
          
          for (const p of savedPersonas) {
              await saveToDB(`indigo_app_data_persona_${p.id}`, JSON.stringify(p));
          }
          
          // Clean up deleted personas
          const existingPersonaIds = await loadFromDB('indigo_app_data_persona_ids') || [];
          for (const id of existingPersonaIds) {
              if (!personaIds.includes(id)) {
                  await deleteFromDB(`indigo_app_data_persona_${id}`);
              }
          }
          
          // Sync removed
      } catch (saveError) {
          console.warn("Failed to save chunked data, falling back to stringified save", saveError);
          try {
              const stringifiedData = JSON.stringify(data);
              const chunkSize = 1024 * 1024 * 5; // 5MB chunks
              const numChunks = Math.ceil(stringifiedData.length / chunkSize);
              await saveToDB('indigo_app_data_stringified_chunks', numChunks);
              for (let i = 0; i < numChunks; i++) {
                  await saveToDB(`indigo_app_data_stringified_chunk_${i}`, stringifiedData.substring(i * chunkSize, (i + 1) * chunkSize));
              }
              const lightData = { ...data, savedPersonas: [], gallery: [], knowledgeBase: [] };
              await saveToDB('indigo_app_data', lightData);
          } catch (stringifyError) {
              console.warn("Failed to stringify data, falling back to direct save", stringifyError);
              await saveToDB('indigo_app_data', data);
          }
      }
    } catch (e) {
      console.error("Failed to save data to DB", e);
    }

    // Debounce save to avoid excessive writes
  }, [aiProfile, savedPersonas, userProfile, gallery, journal, knowledgeBase, memories, apiKey, anthropicApiKey, elevenLabsApiKey, geminiApiKey, wavespeedApiKey, fcmToken, autoSaveChat, autoJsonBackup, isLoaded, lastInteractionTime, userId, firebaseApiKey, firebaseAuthDomain, firebaseProjectId, firebaseStorageBucket, firebaseMessagingSenderId, firebaseAppId]);

  // Debounce save to avoid excessive writes
  useEffect(() => {
    if (!isLoaded) return;
    const timeoutId = setTimeout(saveData, 1000);
    return () => clearTimeout(timeoutId);
  }, [aiProfile, savedPersonas, userProfile, gallery, journal, knowledgeBase, memories, apiKey, anthropicApiKey, elevenLabsApiKey, geminiApiKey, wavespeedApiKey, fcmToken, autoSaveChat, autoJsonBackup, isLoaded, lastInteractionTime, userId, firebaseApiKey, firebaseAuthDomain, firebaseProjectId, firebaseStorageBucket, firebaseMessagingSenderId, firebaseAppId, saveData]);

  // ── Gallery save — completely separate from saveData to avoid hook ordering issues.
  // Only runs when galleryLoaded is true, so it never overwrites with an empty list.
  useEffect(() => {
    if (!galleryLoaded) return; // Never save until gallery has been fully loaded from DB
    const saveGallery = async () => {
      try {
        const galleryIds = gallery.map(item => item.id);
        await saveToDB('indigo_app_data_gallery_ids', galleryIds);
        for (const item of gallery) {
          await saveToDB(`indigo_app_data_gallery_item_${item.id}`, JSON.stringify(item));
        }
        // Clean up items that were deleted
        const existingIds: string[] = (await loadFromDB('indigo_app_data_gallery_ids')) || [];
        for (const id of existingIds) {
          if (!galleryIds.includes(id)) {
            await deleteFromDB(`indigo_app_data_gallery_item_${id}`);
          }
        }
      } catch (e) {
        console.error('Failed to save gallery', e);
      }
    };
    saveGallery();
  }, [gallery, galleryLoaded]);

  // Web Push notification setup — runs once after initial load
  useEffect(() => {
    if (!isLoaded) return;

    const setupNotifications = async () => {
      // Only auto-subscribe if the user already granted permission previously
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;

      const result = await requestNotificationPermission(userId || undefined);
      if (result.success && result.endpoint) {
        // Store endpoint string as our "token" equivalent for display in Settings
        setFcmTokenState(result.endpoint);
      }
    };
    setupNotifications();

    // Listen for push messages that arrive while the app is open
    const unsubscribe = onForegroundMessage((payload) => {
      const title = payload.title || aiProfile.name;
      const body  = payload.body  || 'New message';
      // Show a toast only — the service worker already showed the system notification
      addToast({ title, message: body, type: 'info' });
    });

    return () => { if (unsubscribe) unsubscribe(); };
  }, [isLoaded, userId]);

  // Auto-Save App Data Interval (30s)
  useEffect(() => {
    if (!isLoaded || !autoSaveChat || autoSaveChatInterval <= 0) return;

    const intervalId = setInterval(async () => {
        await saveData();
        console.log(`Auto-saved app data (${autoSaveChatInterval}s interval)`);
    }, autoSaveChatInterval * 1000);

    return () => clearInterval(intervalId);
  }, [isLoaded, autoSaveChat, autoSaveChatInterval, saveData]);

  // Auto JSON Backup Interval - Moved to ChatManager to include chat data
  // Auto Google Drive Backup Interval - Moved to ChatManager to include chat data

  // ── Scheduled Firebase Auto-Backup ────────────────────────────────────────
  // Uses a ref to avoid stale closure issues with lastFirebaseBackupTime
  const lastAutoBackupRef = React.useRef<number | null>(null);
  useEffect(() => {
    lastAutoBackupRef.current = lastFirebaseBackupTime;
  }, [lastFirebaseBackupTime]);

  useEffect(() => {
    if (!isLoaded || autoBackupSchedule === 'off') return;
    if (!userId || !firebaseApiKey || !firebaseProjectId || !firebaseAppId) return;

    const INTERVAL_MS = autoBackupSchedule === 'daily'
      ? 24 * 60 * 60 * 1000
      : 7 * 24 * 60 * 60 * 1000;

    const checkAndBackup = async () => {
      const now = Date.now();
      const last = lastAutoBackupRef.current || 0;
      if (now - last < INTERVAL_MS) return;

      try {
        await backupToFirestore(userId, {
          aiProfile, savedPersonas, userProfile,
          journal, knowledgeBase, memories,
          gallery,
          apiKey, anthropicApiKey, elevenLabsApiKey, geminiApiKey,
          wavespeedApiKey,
          autoSaveChat, autoBackupSchedule,
        }, firebaseRuntimeConfig);
        const ts = Date.now();
        lastAutoBackupRef.current = ts;
        setLastFirebaseBackupTimeState(ts);
        loadFromDB('indigo_app_data_core').then((core: any) => {
          if (core) saveToDB('indigo_app_data_core', { ...core, lastFirebaseBackupTime: ts });
        }).catch(() => {});
        addToast({ title: 'Auto-backup complete', message: `App data backed up to Firebase (${autoBackupSchedule} schedule).`, type: 'success' });
        showNativeNotification(`${aiProfile.name} — Auto-backup complete`, {
          body: 'Your Indigo AI data was backed up to Firebase automatically.',
          icon: '/icon-192.png',
        });
      } catch (e) {
        console.error('Auto-backup failed:', e);
      }
    };

    // Check immediately on mount, then every 10 minutes
    checkAndBackup();
    const id = setInterval(checkAndBackup, 10 * 60 * 1000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, autoBackupSchedule, userId, firebaseApiKey, firebaseProjectId, firebaseAppId]);

  // ── Real-time Firestore sync ───────────────────────────────────────────────
  // Debounces a Firestore backup 30s after any key state change.
  // Gallery images are handled separately (immediate upload in addToGallery).
  // Chat sessions are NOT backed up here (they live in ChatContext); use the
  // manual "Backup to Firestore" button in Settings for a full backup including chat.
  useEffect(() => {
    if (!isLoaded || !realTimeSyncEnabled) return;
    if (!userId?.trim() || !firebaseApiKey || !firebaseProjectId || !firebaseAppId) return;

    const timeoutId = setTimeout(async () => {
      try {
        await backupToFirestore(userId, {
          aiProfile, savedPersonas, userProfile,
          journal, knowledgeBase, memories,
          gallery,
          apiKey, anthropicApiKey, elevenLabsApiKey, geminiApiKey,
          wavespeedApiKey,
          autoSaveChat, autoBackupSchedule, realTimeSyncEnabled,
        }, firebaseRuntimeConfig);
        console.log('[Indigo] Real-time sync → Firestore complete');
      } catch (e) {
        console.error('[Indigo] Real-time sync to Firebase failed:', e);
      }
    }, 30_000);

    return () => clearTimeout(timeoutId);
  }, [
    isLoaded, realTimeSyncEnabled, userId, firebaseApiKey, firebaseProjectId, firebaseAppId,
    aiProfile, savedPersonas, userProfile, journal, knowledgeBase, memories,
  ]);

  // Proactive Message Trigger
  useEffect(() => {
    if (!isLoaded || aiProfile.proactiveMessageFrequency === 'off') return;
    // Handled by ChatManager
  }, [isLoaded, aiProfile.proactiveMessageFrequency, lastInteractionTime, aiProfile, userProfile]);

  // Use a ref to track the last sync time to throttle requests
  const lastSyncTime = React.useRef(Date.now());

  const fetchWithRetry = async (url: string, options: RequestInit, retries = 3, backoff = 1000): Promise<Response> => {
    try {
      // Ensure credentials are included for all requests to handle cookies in iframes
      const fetchOptions = {
        ...options,
        credentials: options.credentials || 'include'
      };
      console.log(`Fetching ${url} with options:`, fetchOptions);
      const response = await fetch(url, fetchOptions);
      console.log(`Fetch response for ${url}:`, response.status, response.statusText);
      if (!response.ok && retries > 0 && response.status >= 500) {
        console.warn(`Fetch failed with status ${response.status}, retrying in ${backoff}ms... (${retries} retries left)`);
        await new Promise(resolve => setTimeout(resolve, backoff));
        return fetchWithRetry(url, options, retries - 1, backoff * 2);
      }
      return response;
    } catch (error) {
      console.error(`Fetch error for ${url}:`, error);
      if (retries > 0) {
        console.warn(`Fetch error: ${error instanceof Error ? error.message : 'Unknown error'}, retrying in ${backoff}ms... (${retries} retries left)`);
        await new Promise(resolve => setTimeout(resolve, backoff));
        return fetchWithRetry(url, options, retries - 1, backoff * 2);
      }
      addToast({ title: "Fetch Error", message: `Fetch error for ${url}: ${error instanceof Error ? error.message : 'Unknown error'}`, type: "error" });
      throw error;
    }
  };


  const setAIProfile = (profile: AIProfile) => setAIProfileState(profile);
  
  const updateAIProfile = (updates: Partial<AIProfile>) => {
    setAIProfileState(prev => ({ ...prev, ...updates }));
  };
  
  const savePersona = (profile: AIProfile, chatHistory: ChatMessage[], sessions: ChatSession[], activeSessionId: string | null) => {
    setSavedPersonas(prev => {
        const existingIndex = prev.findIndex(p => p.id === profile.id);
        if (existingIndex >= 0) {
            const existing = prev[existingIndex];
            
            // If we are saving the currently active persona, use the live state data
            // otherwise use what's in the profile or existing record
            const isActive = profile.id === aiProfile.id;
            
            const updatedProfile = {
                ...profile,
                chatHistory: isActive ? chatHistory : (profile.chatHistory || existing.chatHistory || []),
                sessions: isActive ? sessions : (profile.sessions || existing.sessions || []),
                activeSessionId: isActive ? activeSessionId : (profile.activeSessionId || existing.activeSessionId || null),
                memories: isActive ? memories : (profile.memories || existing.memories || []),
                journal: isActive ? journal : (profile.journal || existing.journal || []),
            };
            const newPersonas = [...prev];
            newPersonas[existingIndex] = updatedProfile;
            
            if (isActive) {
                setAIProfileState(updatedProfile);
            }
            
            return newPersonas;
        } else {
            return [...prev, {
                ...profile,
                chatHistory: profile.chatHistory || [],
                sessions: profile.sessions || [],
                activeSessionId: profile.activeSessionId || null,
                memories: profile.memories || [],
                journal: profile.journal || [],
            }];
        }
    });
    
    // Update current profile state if it matches
    if (aiProfile.id === profile.id) {
        setAIProfileState(prev => ({
            ...profile,
            chatHistory: chatHistory, // Always use live state
            sessions: sessions,
            activeSessionId: activeSessionId,
            memories: memories,
            journal: journal,
        }));
    }
  };

  const deletePersona = (id: string) => {
    setSavedPersonas(prev => prev.filter(p => p.id !== id));
    // If deleting current, switch to another or default
    if (aiProfile.id === id) {
        const remaining = savedPersonas.filter(p => p.id !== id);
        if (remaining.length > 0) {
            setAIProfileState(remaining[0]);
        } else {
            // Reset to default if no personas left
            setAIProfileState(initialAIProfileState);
        }
    }
  };

  const loadPersona = (id: string, currentChatHistory: ChatMessage[], currentSessions: ChatSession[], currentActiveSessionId: string | null, setChatHistory: (h: ChatMessage[]) => void, setSessions: (s: ChatSession[]) => void, setActiveSessionId: (id: string | null) => void) => {
    if (id === aiProfile.id) return; // Already loaded

    // 1. First, capture current state into the savedPersonas list
    setSavedPersonas(prev => prev.map(p => 
      p.id === aiProfile.id 
        ? { ...p, chatHistory: currentChatHistory, memories, journal, sessions: currentSessions, activeSessionId: currentActiveSessionId } 
        : p
    ));

    // 2. Find and load the new persona
    const persona = savedPersonas.find(p => p.id === id);
    if (persona) {
        // Update all active states to the new persona's data
        const personaSessions = persona.sessions || [];
        const personaActiveId = persona.activeSessionId || (personaSessions.length > 0 ? personaSessions[0].id : null);
        
        if (personaSessions.length === 0) {
            // Create a default session if none exist
            const defaultSession: ChatSession = {
                id: 'session-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
                title: 'New Chat',
                messages: persona.chatHistory || [],
                createdAt: Date.now(),
                updatedAt: Date.now(),
            };
            setSessions([defaultSession]);
            setActiveSessionId(defaultSession.id);
            setChatHistory(defaultSession.messages);
        } else {
            setSessions(personaSessions);
            setActiveSessionId(personaActiveId);
            const activeSession = personaSessions.find(s => s.id === personaActiveId);
            setChatHistory(activeSession ? activeSession.messages : []);
        }

        setMemories(persona.memories || []);
        setJournal(persona.journal || []);
        setAIProfileState({
          ...persona,
          imageGenerationInstructions: persona.imageGenerationInstructions !== undefined ? persona.imageGenerationInstructions : initialAIProfileState.imageGenerationInstructions
        });
        
        // Reset interaction time to prevent immediate proactive messages from wrong persona
        setLastInteractionTime(Date.now());
        
        addToast({ 
          title: "Persona Switched", 
          message: `Now chatting with ${persona.name}`, 
          type: "success" 
        });
    }
  };

  const setUserProfile = (profile: UserProfile) => setUserProfileState(profile);

  const setUserReferenceImage = (image: string | null) => {
    setUserProfileState(prev => ({ ...prev, referenceImage: image }));
    saveData();
  };
  
  const addToGallery = React.useCallback((item: GalleryItem) => {
    const stamped = { ...item, personaId: item.personaId ?? aiProfile.id };
    setGallery(prev => [stamped, ...prev]);
    saveData();
    // Immediately upload to Firebase Storage when real-time sync is active
    if (realTimeSyncEnabled && userId?.trim() && firebaseApiKey && firebaseProjectId && firebaseAppId && firebaseStorageBucket) {
      const rtConfig = { apiKey: firebaseApiKey, projectId: firebaseProjectId, appId: firebaseAppId, storageBucket: firebaseStorageBucket };
      uploadGalleryToFirebaseStorage(userId, [stamped], rtConfig).catch(e => {
        console.error('Real-time gallery upload failed:', e);
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveData, aiProfile.id, realTimeSyncEnabled, userId, firebaseApiKey, firebaseProjectId, firebaseAppId, firebaseStorageBucket]);

  const deleteImageFromGallery = (id: string) => {
    setGallery(prev => prev.filter(item => item.id !== id));
    saveData();
  };

  const deleteImagesFromGallery = (ids: string[]) => {
    setGallery(prev => prev.filter(item => !ids.includes(item.id)));
    saveData();
  };

  const updateGalleryItem = (id: string, updates: Partial<GalleryItem>) => {
    setGallery(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item));
    saveData();
  };

  const addJournalEntry = (entry: JournalEntry) => {
    setJournal(prev => [entry, ...prev]);
  };

  const updateJournalEntry = (id: string, updates: Partial<JournalEntry>) => {
    setJournal(prev => prev.map(entry => entry.id === id ? { ...entry, ...updates } : entry));
  };

  const deleteJournalEntry = (id: string) => {
    setJournal(prev => prev.filter(entry => entry.id !== id));
  };

  const addToKnowledgeBase = (file: { name: string; content: string }) => {
    setKnowledgeBase(prev => [...prev, file]);
  };

  const addMultipleToKnowledgeBase = (files: { name: string; content: string }[]) => {
    setKnowledgeBase(prev => [...prev, ...files]);
  };

  const deleteFromKnowledgeBase = (name: string) => {
    setKnowledgeBase(prev => prev.filter(file => file.name !== name));
  };

  const deleteMultipleFromKnowledgeBase = (names: string[]) => {
    setKnowledgeBase(prev => prev.filter(file => !names.includes(file.name)));
  };

  const addMemory = (memory: Memory) => {
    setMemories(prev => pruneMemories([...prev, { ...memory, lastAccessed: Date.now(), isImportant: memory.isImportant || false }]));
  };

  const updateMemory = (id: string, updates: Partial<Memory>) => {
    setMemories(prev => prev.map(m => m.id === id ? { ...m, ...updates, lastAccessed: Date.now() } : m));
  };

  const deleteMemory = (id: string) => {
    setMemories(prev => prev.filter(m => m.id !== id));
  };

  const addProactiveCommunication = (comm: ProactiveCommunication) => {
    setProactiveCommunications(prev => [comm, ...prev]);
    saveData();
  };

  const deleteProactiveCommunication = (id: string) => {
    setProactiveCommunications(prev => prev.filter(c => c.id !== id));
    saveData();
  };

  const addToast = (toast: Omit<Toast, 'id' | 'timestamp'>) => {
    const id = Math.random().toString(36).substring(2, 9);
    const newToast = { ...toast, id, timestamp: Date.now() };
    setToasts(prev => [...prev, newToast]);
    
    // Auto remove after 8 seconds
    setTimeout(() => {
      removeToast(id);
    }, 8000);
  };

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  const setApiKey = (key: string | null) => {
      setApiKeyState(key);
  };

  const setLastCloudSyncTime = (t: number | null) => {
    setLastCloudSyncTimeState(t);
    loadFromDB('indigo_app_data_core').then((core: any) => {
      if (core) saveToDB('indigo_app_data_core', { ...core, lastCloudSyncTime: t });
    }).catch(() => {});
  };

  const setLastFirebaseBackupTime = (t: number | null) => {
    setLastFirebaseBackupTimeState(t);
    loadFromDB('indigo_app_data_core').then((core: any) => {
      if (core) saveToDB('indigo_app_data_core', { ...core, lastFirebaseBackupTime: t });
    }).catch(() => {});
  };

  const setLastGalleryBackupTime = (t: number | null) => {
    setLastGalleryBackupTimeState(t);
    loadFromDB('indigo_app_data_core').then((core: any) => {
      if (core) saveToDB('indigo_app_data_core', { ...core, lastGalleryBackupTime: t });
    }).catch(() => {});
  };

  const setAutoBackupSchedule = (s: 'off' | 'daily' | 'weekly') => {
    setAutoBackupScheduleState(s);
    loadFromDB('indigo_app_data_core').then((core: any) => {
      if (core) saveToDB('indigo_app_data_core', { ...core, autoBackupSchedule: s });
    }).catch(() => {});
  };

  const setRealTimeSyncEnabled = (enabled: boolean) => {
    setRealTimeSyncEnabledState(enabled);
    loadFromDB('indigo_app_data_core').then((core: any) => {
      if (core) saveToDB('indigo_app_data_core', { ...core, realTimeSyncEnabled: enabled });
    }).catch(() => {});
  };

  const setAnthropicApiKey = (key: string | null) => {
    setAnthropicApiKeyState(key);
    loadFromDB('indigo_app_data_core').then((core: any) => {
      if (core) saveToDB('indigo_app_data_core', { ...core, anthropicApiKey: key });
    }).catch(() => {});
  };

  const setElevenLabsApiKey = (key: string | null) => {
    setElevenLabsApiKeyState(key);
    loadFromDB('indigo_app_data_core').then((core: any) => {
      if (core) saveToDB('indigo_app_data_core', { ...core, elevenLabsApiKey: key });
    }).catch(() => {});
  };

  const setGeminiApiKey = (key: string | null) => {
    setGeminiApiKeyState(key);
    loadFromDB('indigo_app_data_core').then((core: any) => {
      if (core) saveToDB('indigo_app_data_core', { ...core, geminiApiKey: key });
    }).catch(() => {});
  };

  const setWavespeedApiKey = (key: string | null) => {
    setWavespeedApiKeyState(key);
    loadFromDB('indigo_app_data_core').then((core: any) => {
      if (core) saveToDB('indigo_app_data_core', { ...core, wavespeedApiKey: key });
    }).catch(() => {});
  };

  // ── Firebase backup / restore ────────────────────────────────────────────────
  const firebaseRuntimeConfig = {
    apiKey: firebaseApiKey, authDomain: firebaseAuthDomain,
    projectId: firebaseProjectId, storageBucket: firebaseStorageBucket,
    appId: firebaseAppId, messagingSenderId: firebaseMessagingSenderId,
  };

  const firebaseBackup = async (dataToBackup: any) => {
    if (!userId) throw new Error("Set a User ID in Cloud Sync settings before backing up.");
    await backupToFirestore(userId, dataToBackup, firebaseRuntimeConfig);
  };

  const firebaseRestore = async (): Promise<any | null> => {
    if (!userId) throw new Error("Set a User ID in Cloud Sync settings before restoring.");
    return restoreFromFirestore(userId, firebaseRuntimeConfig);
  };

  const firebaseGalleryBackup = async (onProgress?: (done: number, total: number) => void): Promise<number> => {
    if (!userId) throw new Error("Set a User ID in Cloud Sync settings before backing up the gallery.");
    // Gallery is lazily loaded — only populated when the Gallery screen is visited.
    // If backup is triggered from Settings before that, read directly from IndexedDB.
    let galleryToBackup = gallery;
    if (!galleryLoaded) {
      const galleryIds = await loadFromDB('indigo_app_data_gallery_ids');
      if (galleryIds && Array.isArray(galleryIds)) {
        const items = await Promise.all(
          galleryIds.map(async (id: string) => {
            const itemStr = await loadFromDB(`indigo_app_data_gallery_item_${id}`);
            return itemStr ? (typeof itemStr === 'string' ? JSON.parse(itemStr) : itemStr) : null;
          })
        );
        galleryToBackup = items.filter((item): item is GalleryItem => item !== null);
      } else {
        galleryToBackup = [];
      }
    }
    return uploadGalleryToFirebaseStorage(userId, galleryToBackup, firebaseRuntimeConfig, onProgress);
  };

  const firebaseGalleryRestore = async (onProgress?: (done: number, total: number) => void): Promise<number> => {
    if (!userId) throw new Error("Set a User ID in Cloud Sync settings before restoring the gallery.");
    const restored = await restoreGalleryFromFirebaseStorage(userId, firebaseRuntimeConfig, onProgress);
    // Add each restored image to the local gallery (skip if already present by id)
    const existingIds = new Set(gallery.map((g: any) => g.id));
    let added = 0;
    for (const item of restored) {
      if (!existingIds.has(item.id)) {
        addToGallery({ id: item.id, url: item.url, prompt: item.prompt || '', provider: item.provider || 'Firebase Storage', createdAt: Date.now() } as any);
        added++;
      }
    }
    return added;
  };

  const firebaseKBBackup = async (onProgress?: (done: number, total: number) => void): Promise<number> => {
    if (!userId) throw new Error("Set a User ID in Cloud Sync settings before backing up the knowledge base.");
    return uploadKnowledgeBaseToFirebaseStorage(userId, knowledgeBase, firebaseRuntimeConfig, onProgress);
  };

  const firebaseKBRestore = async (onProgress?: (done: number, total: number) => void): Promise<number> => {
    if (!userId) throw new Error("Set a User ID in Cloud Sync settings before restoring the knowledge base.");
    const restored = await restoreKnowledgeBaseFromFirebaseStorage(userId, firebaseRuntimeConfig, onProgress);
    let added = 0;
    for (const file of restored) {
      addToKnowledgeBase({ name: file.name, content: file.content });
      added++;
    }
    return added;
  };

  const setFcmToken = (token: string | null) => {
    setFcmTokenState(token);
  };

  const exportData = async (chatHistory: ChatMessage[], sessions: ChatSession[], activeSessionId: string | null) => {
    // Create a lean export object to reduce redundancy and file size
    // We only need sessions, as chatHistory is just the messages of the active session
    return {
      aiProfile: {
        ...aiProfile,
        chatHistory: undefined,
        sessions: undefined,
        activeSessionId: undefined,
        backgroundImages: undefined // Exclude background images from standard backup
      },
      savedPersonas: savedPersonas.map(p => ({
        ...p,
        chatHistory: undefined,
        sessions: undefined,
        activeSessionId: undefined,
        backgroundImages: undefined // Exclude background images from standard backup
      })),
      userProfile,
      // chatHistory is redundant if it's already in the sessions
      // But we'll keep it for compatibility with the current importData logic
      // which expects it at the root. However, we can make it lean.
      chatHistory, 
      sessions,
      activeSessionId,
      journal,
      knowledgeBase,
      memories,
      // gallery is excluded from standard backup
      apiKey,
      fcmToken,
      autoSaveChatInterval,
      autoJsonBackupInterval,
      proactiveMessageFrequency: aiProfile.proactiveMessageFrequency,
      notificationsEnabled,
      showTimestamps,
      aiCanGenerateImages: aiProfile.aiCanGenerateImages,
      timeZone,
      // backgrounds is excluded from standard backup
    };
  };

  const exportGalleryData = async () => {
    const chunks = await exportGalleryChunks(999999); // One giant chunk
    return chunks[0];
  };

  const importGalleryData = async (compressedData: Uint8Array) => {
    return importGalleryChunks([compressedData]);
  };

  const exportGalleryChunks = async (chunkSize: number = 2, mediaType?: 'image' | 'video') => {
    const chunks: Uint8Array[] = [];
    
    const getItemMediaType = (item: GalleryItem): 'image' | 'video' => {
      if (item.mediaType) return item.mediaType;
      if (item.url.startsWith('data:video/') || item.url.startsWith('video/') || item.url.endsWith('.mp4') || item.url.endsWith('.webm') || item.url.endsWith('.mov')) return 'video';
      return 'image';
    };

    const filteredGallery = mediaType 
      ? gallery.filter(item => getItemMediaType(item) === mediaType)
      : gallery;

    // Split gallery into chunks
    for (let i = 0; i < filteredGallery.length; i += chunkSize) {
      const galleryChunk = filteredGallery.slice(i, i + chunkSize);
      const data = {
        gallery: galleryChunk,
      };
      const jsonString = JSON.stringify(data);
      const uint8 = strToU8(jsonString);
      chunks.push(gzipSync(uint8, { level: 9 }));
    }
    
    return chunks;
  };

  const importGalleryChunks = async (chunks: Uint8Array[]) => {
    try {
      let combinedGallery: any[] = [];
      
      for (const chunk of chunks) {
        const decompressed = gunzipSync(chunk);
        const jsonString = strFromU8(decompressed);
        const parsed = JSON.parse(jsonString);
        
        if (parsed.gallery) combinedGallery = [...combinedGallery, ...parsed.gallery];
      }
      
      // Use a Map to deduplicate by ID
      const deduplicate = (arr: any[]) => {
        const map = new Map();
        arr.forEach(item => map.set(item.id, item));
        return Array.from(map.values());
      };
      
      setGallery(prev => deduplicate([...prev, ...combinedGallery]));
      
      addToast({ title: "Gallery Restored", message: `Restored ${combinedGallery.length} images from ${chunks.length} chunks.`, type: "success" });
    } catch (e) {
      console.error("Failed to import gallery chunks", e);
      addToast({ title: "Import Failed", message: "Failed to decompress or parse gallery chunks.", type: "error" });
    }
  };

  const syncGalleryToCloud = async (mediaType?: 'image' | 'video') => {
    if (!userId) {
      addToast({ title: "Sync Failed", message: "User ID not found. Please interact with the AI first.", type: "error" });
      return;
    }

    try {
      addToast({ title: "Cloud Sync", message: `Preparing ${mediaType || 'gallery'} for cloud synchronization...`, type: "info" });
      const chunks = await exportGalleryChunks(1, mediaType); // 1 image per chunk for maximum reliability
      const timestamp = Date.now();
      
      if (chunks.length === 0) {
        addToast({ title: "Sync", message: `No ${mediaType || 'gallery items'} to sync.`, type: "info" });
        return;
      }

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const blob = new Blob([chunk]);
        const base64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => {
            const dataUrl = reader.result as string;
            resolve(dataUrl.split(',')[1]);
          };
          reader.readAsDataURL(blob);
        });

        const payload = JSON.stringify({
          userId,
          data: {
            galleryChunk: base64,
            chunkIndex: i,
            totalChunks: chunks.length,
            galleryBackupTimestamp: timestamp,
            mediaType: mediaType || 'all'
          }
        });
        
        const compressed = gzipSync(strToU8(payload));

        const response = await fetchWithRetry('/api/sync', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/octet-stream',
            // No Content-Encoding: gzip — Render's proxy would try to decompress it,
            // breaking the request. Server detects gzip by magic bytes instead.
          },
          body: compressed
        });

        if (!response.ok) {
          throw new Error(`Failed to sync chunk ${i + 1}/${chunks.length}: ${response.status}`);
        }
        
        if (i % 5 === 0 || i === chunks.length - 1) {
          console.log(`Synced gallery chunk ${i + 1}/${chunks.length}`);
        }
      }

      addToast({ title: "Cloud Sync", message: `${mediaType ? (mediaType.charAt(0).toUpperCase() + mediaType.slice(1) + 's') : 'Gallery'} successfully synced to cloud in ${chunks.length} chunks!`, type: "success" });
    } catch (e: any) {
      console.error("Gallery cloud sync failed", e);
      addToast({ title: "Sync Failed", message: e.message || "An error occurred during gallery cloud sync.", type: "error" });
    }
  };

  const restoreGalleryFromCloud = async (mediaType?: 'image' | 'video') => {
    if (!userId) {
      addToast({ title: "Restore Failed", message: "User ID not found.", type: "error" });
      return;
    }

    try {
      addToast({ title: "Cloud Restore", message: `Fetching ${mediaType || 'gallery'} backup from cloud...`, type: "info" });
      const response = await fetchWithRetry(`/api/sync/${userId}`, { method: 'GET' });
      if (!response.ok) {
        let errorMessage = "Failed to fetch cloud data";
        try {
          const error = await response.json();
          errorMessage = error.error || errorMessage;
        } catch (jsonError) {
          console.warn("Failed to parse error response as JSON", jsonError);
          errorMessage = `Server error: ${response.status} ${response.statusText}`;
        }
        throw new Error(errorMessage);
      }

      let data;
      try {
        data = await response.json();
      } catch (jsonError) {
        console.error("Failed to parse cloud data as JSON", jsonError);
        throw new Error("Invalid data received from cloud storage.");
      }
      
      const chunksKey = mediaType ? `galleryChunks_${mediaType}` : 'galleryChunks';
      const backupData = data[chunksKey];

      // Handle both old single backup, new chunked backup, and raw gallery array
      if (backupData && Array.isArray(backupData)) {
        const chunks: Uint8Array[] = [];
        for (const base64 of backupData) {
          const res = await fetch(`data:application/octet-stream;base64,${base64}`);
          const blob = await res.blob();
          chunks.push(new Uint8Array(await blob.arrayBuffer()));
        }
        await importGalleryChunks(chunks);
      } else if (!mediaType && data.gallery && Array.isArray(data.gallery) && data.gallery.length > 0) {
        // Handle raw gallery array if it was synced via general sync
        setGallery(prev => {
          const map = new Map();
          [...prev, ...data.gallery].forEach(item => map.set(item.id, item));
          return Array.from(map.values());
        });
        addToast({ title: "Gallery Restored", message: `Restored ${data.gallery.length} images from cloud sync.`, type: "success" });
      } else if (!mediaType && data.galleryBackup) {
        const base64 = data.galleryBackup;
        const res = await fetch(`data:application/octet-stream;base64,${base64}`);
        const blob = await res.blob();
        const bytes = new Uint8Array(await blob.arrayBuffer());
        await importGalleryData(bytes);
      } else {
        addToast({ title: "No Backup Found", message: `No ${mediaType || 'gallery'} backup found in the cloud for this user.`, type: "warning" });
        return;
      }
    } catch (e: any) {
      console.error("Gallery cloud restore failed", e);
      addToast({ title: "Restore Failed", message: e.message || "An error occurred during cloud restore.", type: "error" });
    }
  };

  const importData = (
    json: string, 
    setChatHistory: (history: ChatMessage[]) => void,
    setSessions: (sessions: ChatSession[]) => void,
    setActiveSessionId: (id: string | null) => void
  ) => {
    try {
      const parsed = JSON.parse(json);
      
      // 1. Restore AI Profile and Personas
      const importedProfile = parsed.aiProfile || aiProfile;
      setAIProfileState({
        ...importedProfile,
        imageGenerationInstructions: importedProfile.imageGenerationInstructions !== undefined ? importedProfile.imageGenerationInstructions : initialAIProfileState.imageGenerationInstructions
      });
      setSavedPersonas(parsed.savedPersonas || [importedProfile]);
      
      // 2. Restore Chat Data
      const importedSessions = parsed.sessions || importedProfile.sessions || [];
      const importedActiveId = parsed.activeSessionId || importedProfile.activeSessionId || (importedSessions.length > 0 ? importedSessions[0].id : null);
      const importedHistory = parsed.chatHistory || importedProfile.chatHistory || [];

      setSessions(importedSessions);
      setActiveSessionId(importedActiveId);
      
      if (importedActiveId) {
        const activeSession = importedSessions.find((s: any) => s.id === importedActiveId);
        setChatHistory(activeSession ? activeSession.messages : importedHistory);
      } else {
        setChatHistory(importedHistory);
      }

      // 3. Restore Other App State
      setUserProfileState(parsed.userProfile || userProfile);
      setGallery(parsed.gallery || []);
      setJournal(parsed.journal || []);
      setKnowledgeBase(parsed.knowledgeBase || []);
      setMemories(parsed.memories || []);
      setApiKeyState(parsed.apiKey || null);
      setFcmTokenState(parsed.fcmToken || null);
      setAutoSaveChatInterval(parsed.autoSaveChatInterval !== undefined ? parsed.autoSaveChatInterval : 30);
      setAutoJsonBackupInterval(parsed.autoJsonBackupInterval !== undefined ? parsed.autoJsonBackupInterval : 5);
      setProactiveMessageFrequency(parsed.proactiveMessageFrequency !== undefined ? parsed.proactiveMessageFrequency : 'off');
      setNotificationsEnabledState(parsed.notificationsEnabled !== undefined ? parsed.notificationsEnabled : (typeof Notification !== 'undefined' && Notification.permission === 'granted'));
      setShowTimestampsState(parsed.showTimestamps !== undefined ? parsed.showTimestamps : true);
      setTimeZoneState(parsed.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone);
      addToast({ title: "Import Successful", message: "All app data has been restored.", type: "success" });
    } catch (e) {
      console.error("Invalid JSON data", e);
      addToast({ title: "Import Failed", message: "Failed to import data. Invalid JSON.", type: "error" });
    }
  };

  const setFirebaseConfig = (config: {
    apiKey?: string | null; authDomain?: string | null; projectId?: string | null;
    storageBucket?: string | null; appId?: string | null;
    messagingSenderId?: string | null;
  }) => {
    // Update React state for each provided field, then patch IDB directly
    // (same pattern as setMongoUri / setAnthropicApiKey to avoid stale closure issues)
    const updates: Record<string, any> = {};
    if (config.apiKey           !== undefined) { setFirebaseApiKey(config.apiKey);                     updates.firebaseApiKey           = config.apiKey; }
    if (config.authDomain       !== undefined) { setFirebaseAuthDomain(config.authDomain);             updates.firebaseAuthDomain       = config.authDomain; }
    if (config.projectId        !== undefined) { setFirebaseProjectId(config.projectId);               updates.firebaseProjectId        = config.projectId; }
    if (config.storageBucket    !== undefined) { setFirebaseStorageBucket(config.storageBucket);       updates.firebaseStorageBucket    = config.storageBucket; }
    if (config.appId            !== undefined) { setFirebaseAppId(config.appId);                       updates.firebaseAppId            = config.appId; }
    if (config.messagingSenderId !== undefined){ setFirebaseMessagingSenderId(config.messagingSenderId);updates.firebaseMessagingSenderId = config.messagingSenderId; }
    if (Object.keys(updates).length > 0) {
      loadFromDB('indigo_app_data_core').then((core: any) => {
        if (core) saveToDB('indigo_app_data_core', { ...core, ...updates });
      }).catch(() => {});
    }
  };

  // ── Firebase Auth state listener ─────────────────────────────────────────────
  useEffect(() => {
    const hasConfig = firebaseApiKey || import.meta.env.VITE_FIREBASE_API_KEY;
    if (!hasConfig) {
      setAuthLoading(false);
      return;
    }
    // Safety timeout — never leave the app stuck on auth loading
    const timeout = setTimeout(() => setAuthLoading(false), 5000);
    let unsubscribe: (() => void) | undefined;
    try {
      const runtimeConfig = {
        apiKey: firebaseApiKey, authDomain: firebaseAuthDomain,
        projectId: firebaseProjectId, storageBucket: firebaseStorageBucket,
        appId: firebaseAppId, messagingSenderId: firebaseMessagingSenderId,
      };
      unsubscribe = onAuthStateChange((user) => {
        clearTimeout(timeout);
        setCurrentUser(user);
        if (user) {
          setUserId(user.uid);
          localStorage.setItem('indigo_user_id', user.uid);
        }
        setAuthLoading(false);
      }, runtimeConfig);
    } catch (e) {
      console.error('Firebase auth init failed:', e);
      clearTimeout(timeout);
      setAuthLoading(false);
    }
    return () => { clearTimeout(timeout); if (unsubscribe) unsubscribe(); };
  // Only re-subscribe when the core config values actually change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firebaseApiKey, firebaseProjectId, firebaseAppId, firebaseAuthDomain]);

  const signInWithGoogle = async () => {
    const runtimeConfig = {
      apiKey: firebaseApiKey, authDomain: firebaseAuthDomain,
      projectId: firebaseProjectId, storageBucket: firebaseStorageBucket,
      appId: firebaseAppId, messagingSenderId: firebaseMessagingSenderId,
    };
    await fbSignInWithGoogle(runtimeConfig);
  };

  const signOut = async () => {
    const runtimeConfig = {
      apiKey: firebaseApiKey, authDomain: firebaseAuthDomain,
      projectId: firebaseProjectId, storageBucket: firebaseStorageBucket,
      appId: firebaseAppId, messagingSenderId: firebaseMessagingSenderId,
    };
    await fbSignOutUser(runtimeConfig);
    setCurrentUser(null);
  };

  const setAutoSaveChat = (enabled: boolean) => setAutoSaveChatState(enabled);
  const updateUserId = (id: string) => {
    setUserId(id);
    localStorage.setItem('indigo_user_id', id);
  };
  const setAutoJsonBackup = (enabled: boolean) => setAutoJsonBackupState(enabled);
  const setNotificationsEnabled = (enabled: boolean) => setNotificationsEnabledState(enabled);
  const setIsDebuggerEnabled = (enabled: boolean) => {
    console.log(`setIsDebuggerEnabled called with: ${enabled}`);
    console.trace("setIsDebuggerEnabled trace");
    setIsDebuggerEnabledState(enabled);
    if (typeof window !== 'undefined') {
      localStorage.setItem('indigo_debugger_enabled', String(enabled));
      window.dispatchEvent(new Event('indigo_debugger_toggle'));
    }
  };
  const setShowTimestamps = (show: boolean) => setShowTimestampsState(show);
  const setProactiveMessageFrequency = (frequency: '1h' | '6h' | '12h' | '24h' | 'off') => {
    setAIProfileState(prev => ({ ...prev, proactiveMessageFrequency: frequency }));
  };

  const setProactiveEmailFrequency = (frequency: '1h' | '6h' | '12h' | '24h' | 'off') => {
    setAIProfileState(prev => ({ ...prev, proactiveEmailFrequency: frequency }));
  };
  const setAmbientMode = (enabled: boolean) => setAIProfileState(prev => ({ ...prev, ambientMode: enabled }));
  const setAmbientFrequency = (frequency: '1h' | '6h' | '12h' | '24h' | 'off') => setAIProfileState(prev => ({ ...prev, ambientFrequency: frequency }));
  const setAiCanGenerateImages = (enabled: boolean) => setAIProfileState(prev => ({ ...prev, aiCanGenerateImages: enabled }));
  const setTimeZone = (tz: string) => setTimeZoneState(tz);

  const resetApp = async () => {
      try {
          await clearDB();
          localStorage.clear();
          // Reset all state variables to their initial values
          setAIProfileState(initialAIProfileState);
          setSavedPersonas([initialAIProfileState]);
          setUserProfileState(initialUserProfileState);
          setGallery([]);
          setJournal([]);
          setKnowledgeBase([]);
          setMemories([]);
          setApiKeyState(null);
          setAutoSaveChatState(true);
          setAutoSaveChatInterval(30);
          setAutoJsonBackupState(false);
          setAutoJsonBackupInterval(5);
          setAIProfileState(prev => ({ ...prev, proactiveMessageFrequency: 'off', timeAwareness: true, ambientMode: false, ambientFrequency: 'off' }));
          setTimeZoneState(Intl.DateTimeFormat().resolvedOptions().timeZone);
          setShowTutorial(false);
          setShowTimestampsState(true);
          window.location.reload();
      } catch (e) {
          console.error("Failed to reset app", e);
          throw e;
      }
  };

  return (
    <AppContext.Provider value={{
      aiProfile, setAIProfile, savePersona, deletePersona, loadPersona,
      savedPersonas, galleryLoaded, loadGallery,
      userProfile, setUserProfile, setUserReferenceImage,
      gallery, addToGallery, deleteImageFromGallery, deleteImagesFromGallery, updateGalleryItem,
      journal, addJournalEntry, updateJournalEntry, deleteJournalEntry,
      knowledgeBase, addToKnowledgeBase, addMultipleToKnowledgeBase, deleteFromKnowledgeBase, deleteMultipleFromKnowledgeBase,
      memories, addMemory, updateMemory, deleteMemory,
      proactiveCommunications, addProactiveCommunication, deleteProactiveCommunication,
      toasts, addToast, removeToast,
      resetApp, exportData, importData,
      apiKey, setApiKey,
      showTutorial, setShowTutorial,
      autoSaveChat, setAutoSaveChat,
      autoSaveChatInterval, setAutoSaveChatInterval,
      autoJsonBackup, setAutoJsonBackup,
      autoJsonBackupInterval, setAutoJsonBackupInterval,
      isSyncEnabled, setIsSyncEnabled,
      syncFrequency, setSyncFrequency,
      notificationsEnabled, setNotificationsEnabled,
      fcmToken, setFcmToken,
      isDebuggerEnabled, setIsDebuggerEnabled,
      showTimestamps, setShowTimestamps,
      proactiveMessageFrequency: aiProfile.proactiveMessageFrequency, setProactiveMessageFrequency,
      proactiveEmailFrequency: aiProfile.proactiveEmailFrequency, setProactiveEmailFrequency,
      ambientMode: aiProfile.ambientMode, setAmbientMode,
      ambientFrequency: aiProfile.ambientFrequency, setAmbientFrequency,
      aiCanGenerateImages: aiProfile.aiCanGenerateImages, setAiCanGenerateImages,
      timeZone, setTimeZone,
      firebaseApiKey, firebaseAuthDomain, firebaseProjectId, firebaseStorageBucket,
      firebaseAppId, firebaseMessagingSenderId, setFirebaseConfig,
      lastCloudSyncTime, lastFirebaseBackupTime, lastGalleryBackupTime,
      setLastCloudSyncTime, setLastFirebaseBackupTime, setLastGalleryBackupTime,
      anthropicApiKey, setAnthropicApiKey,
      elevenLabsApiKey, setElevenLabsApiKey,
      geminiApiKey, setGeminiApiKey,
      wavespeedApiKey, setWavespeedApiKey,
      isLoaded, isSuccessfullyLoaded, lastInteractionTime, setLastInteractionTime,
      userId, setUserId, isSyncing, setIsSyncing,
      exportGalleryData, exportGalleryChunks, importGalleryData, importGalleryChunks, syncGalleryToCloud, restoreGalleryFromCloud,
      updateAIProfile, fetchWithRetry,
      firebaseBackup, firebaseRestore, firebaseGalleryBackup, firebaseGalleryRestore,
      firebaseKBBackup, firebaseKBRestore,
      autoBackupSchedule, setAutoBackupSchedule,
      realTimeSyncEnabled, setRealTimeSyncEnabled,
      currentUser, authLoading, signInWithGoogle, signOut,
    }}>
      {!isLoaded ? (
        <div className="flex h-screen flex-col items-center justify-center bg-indigo-50 dark:bg-indigo-950 p-4 text-center">
          <div className="text-indigo-900 dark:text-indigo-100 font-bold text-xl animate-pulse mb-4">Loading indigo AI...</div>
          {showResetOption && (
            <div className="max-w-xs animate-in fade-in slide-in-from-bottom-4 duration-700">
              <p className="text-sm text-indigo-600 dark:text-indigo-400 mb-4">This is taking longer than expected. There might be an issue with your local data.</p>
              <button 
                onClick={() => {
                  localStorage.clear();
                  window.location.reload();
                }}
                className="text-xs text-red-600 dark:text-red-400 underline hover:text-red-800 dark:hover:text-red-200"
              >
                Reset App Data & Reload
              </button>
            </div>
          )}
        </div>
      ) : (
        children
      )}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
};
