import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { generateElevenLabsSpeech, listElevenLabsVoices } from '../services/asyncService';
import { useApp } from '../context/AppContext';
import { useChat } from '../context/ChatContext';
import { AIProfile, ChatMessage, ChatSession } from '../types';
import { 
  Upload, 
  Plus, 
  Save, 
  Trash2, 
  Users, 
  Play, 
  Download, 
  Mic, 
  Loader2, 
  RotateCcw, 
  HelpCircle,
  Volume2,
  Headphones,
  Settings,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  MessageSquare,
  X
} from 'lucide-react';
import PreviewChat from '../components/PreviewChat';

const AIProfileScreen: React.FC = () => {
  const {
    aiProfile, setAIProfile, savePersona, deletePersona, savedPersonas, loadPersona,
    setAmbientMode, setAmbientFrequency, addToast,
    anthropicApiKey, elevenLabsApiKey, geminiApiKey, userId,
  } = useApp();
  const { chatHistory, sessions, activeSessionId, setChatHistory, setSessions, setActiveSessionId } = useChat();
  const [name, setName] = useState(aiProfile.name);
  const [personality, setPersonality] = useState(aiProfile.personality);
  const [behavioralPatterns, setBehavioralPatterns] = useState(aiProfile.behavioralPatterns || '');
  const [goals, setGoals] = useState(aiProfile.goals || '');
  const [coreValues, setCoreValues] = useState(aiProfile.coreValues || '');
  const [likes, setLikes] = useState(aiProfile.likes || '');
  const [dislikes, setDislikes] = useState(aiProfile.dislikes || '');
  const [speakingStyle, setSpeakingStyle] = useState(aiProfile.speakingStyle || '');
  const [backstory, setBackstory] = useState(aiProfile.backstory);
  const [appearance, setAppearance] = useState(aiProfile.appearance);
  const [voiceURI, setVoiceURI] = useState(aiProfile.voiceURI || '');
  const [voicePitch, setVoicePitch] = useState(aiProfile.voicePitch || 1.0);
  const [voiceSpeed, setVoiceSpeed] = useState(aiProfile.voiceSpeed || 1.0);
  const [autoReadMessages, setAutoReadMessages] = useState(aiProfile.autoReadMessages || false);
  const [voiceGender, setVoiceGender] = useState<'male' | 'female' | 'none'>(aiProfile.voiceGender || 'none');
  const [voiceDescription, setVoiceDescription] = useState(aiProfile.voiceDescription || '');
  const [voiceProvider, setVoiceProvider] = useState<'browser' | 'elevenlabs'>(
    (aiProfile.voiceProvider === 'elevenlabs') ? 'elevenlabs' : 'browser'
  );
  const [responseLength, setResponseLength] = useState<AIProfile['responseLength']>(aiProfile.responseLength || 'medium');
  const [responseDetail, setResponseDetail] = useState<AIProfile['responseDetail']>(aiProfile.responseDetail || 'standard');
  const [responseTone, setResponseTone] = useState<AIProfile['responseTone']>(aiProfile.responseTone || 'friendly');
  const [customParagraphCount, setCustomParagraphCount] = useState<number | null>(aiProfile.customParagraphCount || null);
  const [customWordCount, setCustomWordCount] = useState<number | null>(aiProfile.customWordCount || null);
  const [proactiveMessageFrequency, setProactiveMessageFrequency] = useState<AIProfile['proactiveMessageFrequency']>(aiProfile.proactiveMessageFrequency || 'off');
  const [proactiveEmailFrequency, setProactiveEmailFrequency] = useState<AIProfile['proactiveEmailFrequency']>(aiProfile.proactiveEmailFrequency || 'off');
  const [proactiveEmailStyle, setProactiveEmailStyle] = useState<AIProfile['proactiveEmailStyle']>(aiProfile.proactiveEmailStyle || 'personal');
  const [proactiveEmailParagraphs, setProactiveEmailParagraphs] = useState<number>(aiProfile.proactiveEmailParagraphs || 3);
  const [proactiveBlogFrequency, setProactiveBlogFrequency] = useState<AIProfile['proactiveBlogFrequency']>(aiProfile.proactiveBlogFrequency || 'off');
  const [proactiveBlogStyle, setProactiveBlogStyle] = useState<AIProfile['proactiveBlogStyle']>(aiProfile.proactiveBlogStyle || 'journal');
  const [proactiveBlogParagraphs, setProactiveBlogParagraphs] = useState<number>(aiProfile.proactiveBlogParagraphs || 5);
  const [proactiveBlogId, setProactiveBlogId] = useState<string | null>(aiProfile.proactiveBlogId || null);
  const [availableBlogs, setAvailableBlogs] = useState<{id: string, name: string}[]>([]);
  const [isFetchingBlogs, setIsFetchingBlogs] = useState(false);
  const [aiCanUseBlogger, setAiCanUseBlogger] = useState<boolean>(aiProfile.aiCanUseBlogger || false);
  const [aiCanGenerateSpeech, setAiCanGenerateSpeech] = useState<boolean>(aiProfile.aiCanGenerateSpeech ?? true);
  const [textOnlyMode, setTextOnlyMode] = useState<boolean>(aiProfile.textOnlyMode ?? false);
  const [knowsItsAI, setKnowsItsAI] = useState<boolean>(aiProfile.knowsItsAI ?? true);
  
  useEffect(() => {
    const fetchLatestProfile = async () => {
      if (!userId) return;
      try {
        const response = await fetch(`/api/sync/${userId}`);
        if (response.ok) {
          const data = await response.json();
          if (data && data.lastProactiveStatus) {
            setAIProfile({ ...aiProfile, lastProactiveStatus: data.lastProactiveStatus });
          }
        }
      } catch (e) {
        console.error("Error fetching latest profile:", e);
      }
    };
    fetchLatestProfile();
  }, [userId]);
  
  const CLAUDE_MODELS = ['claude-sonnet-4-6', 'claude-opus-4-6', 'claude-haiku-4-5-20251001'];
  // Accept any model string
  const validateModel = (m: string | undefined): string => {
    if (m) return m;
    return 'claude-sonnet-4-6';
  };

  const [model, setModel] = useState(validateModel(aiProfile.model));
  const [temperature, setTemperature] = useState(aiProfile.temperature || 0.7);
  const [timeAwareness, setTimeAwareness] = useState<boolean>(aiProfile.timeAwareness ?? true);
  const [ambientModeState, setAmbientModeState] = useState<boolean>(aiProfile.ambientMode ?? false);
  const [ambientFrequencyState, setAmbientFrequencyState] = useState<AIProfile['ambientFrequency']>(aiProfile.ambientFrequency || 'off');
  const [imageStyle, setImageStyle] = useState<string>(aiProfile.imageStyle || 'none');
  const [imageGenerationInstructions, setImageGenerationInstructions] = useState<string[]>(aiProfile.imageGenerationInstructions || []);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [referenceImage, setReferenceImage] = useState<string | null>(aiProfile.referenceImage);
  const [isTestingVoice, setIsTestingVoice] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Preview Chat State
  const [previewInput, setPreviewInput] = useState('');
  const [previewMessages, setPreviewMessages] = useState<{role: 'user' | 'model', content: string, attachments?: {type: string, content: string, name: string}[]}[]>([]);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);

  const geminiVoices = ['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'];

  const handleTestVoice = async () => {
    if (isTestingVoice) return;
    addToast({ title: "Voice Test", message: "Generating voice sample...", type: "info" });
    await new Promise(resolve => setTimeout(resolve, 600));
    setIsTestingVoice(true);
    const text = `Hello! I am ${name}. This is an example of how I sound.`;

    if (voiceProvider === 'elevenlabs' && elevenLabsVoiceId) {
      try {
        const audioBlob = await generateElevenLabsSpeech(text, elevenLabsVoiceId, elevenLabsApiKey, elevenLabsModelId, {
          stability: elStability, similarityBoost: elSimilarity, style: elStyle,
          useSpeakerBoost: elSpeakerBoost, speakingRate: elSpeakingRate,
        });
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);
        audio.onended = () => { setIsTestingVoice(false); URL.revokeObjectURL(audioUrl); };
        audio.onerror = () => { setIsTestingVoice(false); URL.revokeObjectURL(audioUrl); };
        audio.play().catch(() => setIsTestingVoice(false));
      } catch (error: any) {
        addToast({ title: "Voice Error", message: error.message || "ElevenLabs TTS failed.", type: "error" });
        setIsTestingVoice(false);
      }
    } else {
      speakWithBrowser(text);
    }
  };

  const speakWithBrowser = (text: string) => {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const availableVoices = window.speechSynthesis.getVoices();
    
    let selectedVoice: SpeechSynthesisVoice | undefined;
    if (voiceURI) {
        selectedVoice = availableVoices.find(v => v.voiceURI === voiceURI);
    }
    if (!selectedVoice && voiceGender !== 'none') {
        const genderFilter = voiceGender === 'male' ? 'male' : 'female';
        selectedVoice = availableVoices.find(v => v.lang.startsWith('en') && v.name.toLowerCase().includes(genderFilter));
    }
    if (selectedVoice) utterance.voice = selectedVoice;

    utterance.pitch = voicePitch;
    utterance.rate = voiceSpeed;
    utterance.onend   = () => setIsTestingVoice(false);
    utterance.onerror = () => setIsTestingVoice(false);
    
    window.speechSynthesis.speak(utterance);
    // Safety timeout — if onend never fires (some Android browsers)
    setTimeout(() => setIsTestingVoice(false), 10000);
  };


  // Update local state when active profile changes
  useEffect(() => {
    setName(aiProfile.name);
    setPersonality(aiProfile.personality);
    setBackstory(aiProfile.backstory);
    setAppearance(aiProfile.appearance);
    setVoiceURI(aiProfile.voiceURI || '');
    setVoicePitch(aiProfile.voicePitch || 1.0);
    setVoiceSpeed(aiProfile.voiceSpeed || 1.0);
    setAutoReadMessages(aiProfile.autoReadMessages || false);
    setVoiceGender(aiProfile.voiceGender || 'none');
    setVoiceDescription(aiProfile.voiceDescription || '');
    setVoiceProvider((aiProfile.voiceProvider === 'elevenlabs') ? 'elevenlabs' : 'browser');
    setResponseLength(aiProfile.responseLength || 'medium');
    setResponseDetail(aiProfile.responseDetail || 'standard');
    setResponseTone(aiProfile.responseTone || 'friendly');
    setCustomParagraphCount(aiProfile.customParagraphCount || null);
    setCustomWordCount(aiProfile.customWordCount || null);
    setBehavioralPatterns(aiProfile.behavioralPatterns || '');
    setGoals(aiProfile.goals || '');
    setCoreValues(aiProfile.coreValues || '');
    setLikes(aiProfile.likes || '');
    setDislikes(aiProfile.dislikes || '');
    setSpeakingStyle(aiProfile.speakingStyle || '');
    setProactiveMessageFrequency(aiProfile.proactiveMessageFrequency || 'off');
    setProactiveEmailFrequency(aiProfile.proactiveEmailFrequency || 'off');
    setProactiveEmailStyle(aiProfile.proactiveEmailStyle || 'personal');
    setProactiveEmailParagraphs(aiProfile.proactiveEmailParagraphs || 3);
    setProactiveBlogFrequency(aiProfile.proactiveBlogFrequency || 'off');
    setProactiveBlogStyle(aiProfile.proactiveBlogStyle || 'journal');
    setProactiveBlogParagraphs(aiProfile.proactiveBlogParagraphs || 5);
    setAiCanUseBlogger(aiProfile.aiCanUseBlogger || false);
    setAiCanGenerateSpeech(aiProfile.aiCanGenerateSpeech ?? true);
    setTextOnlyMode(aiProfile.textOnlyMode ?? false);
    setElevenLabsModelId(aiProfile.elevenLabsModelId || 'eleven_v3');
    setElStability(aiProfile.elStability     ?? 0.5);
    setElSimilarity(aiProfile.elSimilarity   ?? 0.75);
    setElStyle(aiProfile.elStyle             ?? 0);
    setElSpeakerBoost(aiProfile.elSpeakerBoost ?? true);
    setElSpeakingRate(aiProfile.elSpeakingRate  ?? 1.0);
    setDynamicEmotion(aiProfile.dynamicEmotion  ?? false);
    setMaxTokens(aiProfile.maxTokens ?? 2048);
    setKnowsItsAI(aiProfile.knowsItsAI ?? true);
    setReferenceImage(aiProfile.referenceImage);
    setModel(validateModel(aiProfile.model));
    setTemperature(aiProfile.temperature || 0.7);
    setTimeAwareness(aiProfile.timeAwareness !== undefined ? aiProfile.timeAwareness : true);
    setAmbientModeState(aiProfile.ambientMode ?? false);
    setAmbientFrequencyState(aiProfile.ambientFrequency || 'off');
    setImageStyle(aiProfile.imageStyle || 'none');
    setImageGenerationInstructions(aiProfile.imageGenerationInstructions || []);
  }, [aiProfile]);

  React.useEffect(() => {
    const loadVoices = () => {
      const availableVoices = window.speechSynthesis.getVoices();
      setVoices(availableVoices.filter(v => v.lang.startsWith('en')));
    };
    
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }, []);

  const handleSave = async () => {
    addToast({ title: "AI Profile", message: "Saving persona settings...", type: "info" });
    await new Promise(resolve => setTimeout(resolve, 500));
    const updatedProfile: AIProfile = {
      id: aiProfile.id,
      name,
      personality,
      behavioralPatterns,
      goals,
      coreValues,
      likes,
      dislikes,
      speakingStyle,
      backstory,
      appearance,
      referenceImage,
      voiceURI,
      voicePitch,
      voiceSpeed,
      autoReadMessages,
      voiceGender,
      voiceDescription,
      voiceProvider,
      responseLength,
      responseDetail,
      responseTone,
      customParagraphCount,
      customWordCount,
      proactiveMessageFrequency,
      proactiveEmailFrequency,
      proactiveEmailStyle,
      proactiveEmailParagraphs,
      proactiveBlogFrequency,
      proactiveBlogStyle,
      proactiveBlogParagraphs,
      proactiveBlogId,
      knowsItsAI,
      model,
      temperature,
      maxTokens,
      timeAwareness,
      ambientMode: ambientModeState,
      ambientFrequency: ambientFrequencyState,
      aiCanGenerateImages: aiProfile.aiCanGenerateImages,
      aiCanUseWebSearch: aiProfile.aiCanUseWebSearch,
      aiCanUseCalendar: aiProfile.aiCanUseCalendar,
      aiCanUseGmail: aiProfile.aiCanUseGmail,
      aiCanUseYouTube: aiProfile.aiCanUseYouTube,
      aiCanUseGoogleMaps: aiProfile.aiCanUseGoogleMaps,
      aiCanUseBlogger,
      imageStyle,
      imageGenerationInstructions,
      aiCanGenerateSpeech,
      textOnlyMode,
      elevenLabsModelId,
      elStability,
      elSimilarity,
      elStyle,
      elSpeakerBoost,
      elSpeakingRate,
      dynamicEmotion,
      aiCanUseTools: aiProfile.aiCanUseTools,
      aiCanBrowse: aiProfile.aiCanBrowse,
      chatHistory: aiProfile.chatHistory,
      memories: aiProfile.memories,
      journal: aiProfile.journal,
    };
    savePersona(updatedProfile, chatHistory, sessions, activeSessionId);
    addToast({ title: "Persona Saved", message: "AI Persona settings saved successfully!", type: "success" });
  };

  const handleSaveAsNew = async () => {
    const newId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
    const newProfile: AIProfile = {
      id: newId,
      name: `${name} (Copy)`,
      personality,
      behavioralPatterns,
      goals,
      coreValues,
      likes,
      dislikes,
      speakingStyle,
      backstory,
      appearance,
      referenceImage,
      voiceURI,
      voicePitch,
      voiceSpeed,
      autoReadMessages,
      voiceGender,
      voiceDescription,
      voiceProvider,
      responseLength,
      responseDetail,
      responseTone,
      customParagraphCount,
      customWordCount,
      proactiveMessageFrequency: proactiveMessageFrequency,
      proactiveEmailFrequency: proactiveEmailFrequency,
      proactiveEmailStyle,
      proactiveEmailParagraphs,
      proactiveBlogFrequency: proactiveBlogFrequency,
      proactiveBlogStyle,
      proactiveBlogParagraphs,
      proactiveBlogId: proactiveBlogId,
      knowsItsAI,
      model: aiProfile.model,
      temperature: aiProfile.temperature,
      timeAwareness,
      ambientMode: ambientModeState,
      ambientFrequency: ambientFrequencyState,
      aiCanGenerateImages: aiProfile.aiCanGenerateImages,
      aiCanUseWebSearch: aiProfile.aiCanUseWebSearch,
      aiCanUseCalendar: aiProfile.aiCanUseCalendar,
      aiCanUseGmail: aiProfile.aiCanUseGmail,
      aiCanUseYouTube: aiProfile.aiCanUseYouTube,
      aiCanUseGoogleMaps: aiProfile.aiCanUseGoogleMaps,
      aiCanUseBlogger,
      imageStyle,
      imageGenerationInstructions,
      aiCanGenerateSpeech,
      textOnlyMode,
      elevenLabsModelId,
      aiCanUseTools: aiProfile.aiCanUseTools,
      aiCanBrowse: aiProfile.aiCanBrowse,
      chatHistory: [], // New persona starts with fresh history
      memories: [],
      journal: [],
    };
    savePersona(newProfile, [], [], null);
    loadPersona(newId, [], [], null, setChatHistory, setSessions, setActiveSessionId); // Switch to new persona
    alert('New AI Persona created!');
  };

  const handleDelete = () => {
    if (savedPersonas.length <= 1) {
        alert("Cannot delete the last persona.");
        return;
    }
    if (window.confirm(`Are you sure you want to delete "${name}"?`)) {
        deletePersona(aiProfile.id);
    }
  };

  const handleCreateNew = () => {
    const newId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
    const newProfile: AIProfile = {
        id: newId,
        name: 'New Persona',
        personality: '',
        backstory: '',
        appearance: '',
        referenceImage: null,
        voiceURI: null,
        voicePitch: 1.0,
        voiceSpeed: 1.0,
        autoReadMessages: false,
        voiceGender: 'none',
        voiceDescription: '',
        voiceProvider: 'browser',
        responseLength: 'medium',
        responseDetail: 'medium',
        responseTone: 'friendly',
        customParagraphCount: null,
        customWordCount: null,
        proactiveMessageFrequency: 'off',
        proactiveEmailFrequency: 'off',
        proactiveBlogFrequency: 'off',
        knowsItsAI: true,
        model: 'claude-sonnet-4-6',
        temperature: 0.7,
        timeAwareness: true,
        ambientMode: false,
        ambientFrequency: 'off',
        aiCanGenerateImages: false,
        aiCanGenerateSpeech: false,
        aiCanUseTools: false,
        aiCanUseWebSearch: false,
        aiCanUseCalendar: false,
        aiCanUseGmail: false,
        aiCanUseYouTube: false,
        aiCanUseGoogleMaps: false,
        aiCanUseBlogger: false,
        aiCanBrowse: false,
        chatHistory: [],
        memories: [],
        journal: [],
    };
    savePersona(newProfile, [], [], null);
    loadPersona(newId, [], [], null, setChatHistory, setSessions, setActiveSessionId);
  };

  const handlePreviewSend = useCallback(async () => {
    if (!previewInput.trim() || isPreviewLoading) return;

    addToast({ title: "Preview Chat", message: "Indigo is thinking...", type: "info" });
    await new Promise(resolve => setTimeout(resolve, 500));

    const userMsg = { role: 'user' as const, content: previewInput };
    setPreviewMessages(prev => [...prev, userMsg]);
    setPreviewInput('');
    setIsPreviewLoading(true);

    try {
        const previewProfile = {
          ...aiProfile,
          name, personality, backstory, appearance, responseLength,
          customParagraphCount, model, temperature,
          knowsItsAI,
        };
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [...previewMessages, userMsg].map(m => ({
              role: m.role, content: m.content
            })),
            aiProfile: previewProfile,
            userProfile: { name: 'User', email: '', info: '', preferences: '', appearance: '', referenceImage: null },
            anthropicKey: anthropicApiKey || undefined,
            geminiKey: geminiApiKey || undefined,
          }),
        });
        if (!res.ok) throw new Error((await res.json()).error || 'Failed');
        const data = await res.json();
        const responseText = data.content || '';
        setPreviewMessages(prev => [...prev, { role: 'model', content: responseText }]);
    } catch (error) {
        console.error("Preview chat error", error);
        setPreviewMessages(prev => [...prev, { role: 'model', content: "Error: Failed to generate response. Check your Anthropic API key in Settings." }]);
    } finally {
        setIsPreviewLoading(false);
    }
  }, [previewInput, isPreviewLoading, anthropicApiKey, name, personality, backstory, appearance, responseLength, customParagraphCount, model, temperature, previewMessages, knowsItsAI, aiProfile]);

  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        // Resize image to avoid localStorage quota limits
        const img = new Image();
        img.src = reader.result as string;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const MAX_WIDTH = 512;
            const MAX_HEIGHT = 512;
            let width = img.width;
            let height = img.height;

            if (width > height) {
                if (width > MAX_WIDTH) {
                    height *= MAX_WIDTH / width;
                    width = MAX_WIDTH;
                }
            } else {
                if (height > MAX_HEIGHT) {
                    width *= MAX_HEIGHT / height;
                    height = MAX_HEIGHT;
                }
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx?.drawImage(img, 0, 0, width, height);
            
            const resizedDataUrl = canvas.toDataURL('image/jpeg', 0.8);
            setReferenceImage(resizedDataUrl);
        };
      };
      reader.readAsDataURL(file);
    }
  }, []);

  const handleExport = useCallback(() => {
    try {
      // Create a complete profile object for export including current form state and chat data
      const exportProfile: AIProfile = {
        ...aiProfile,
        name,
        personality,
        backstory,
        appearance,
        referenceImage,
        voiceURI,
        voicePitch,
        voiceSpeed,
        autoReadMessages,
        voiceGender,
        voiceDescription,
        voiceProvider,
        responseLength,
        responseDetail,
        responseTone,
        customParagraphCount,
        customWordCount,
        proactiveMessageFrequency,
        knowsItsAI,
        model,
        temperature,
            timeAwareness,
        ambientMode: ambientModeState,
        ambientFrequency: ambientFrequencyState,
        aiCanGenerateImages: aiProfile.aiCanGenerateImages,
        imageStyle,
        // Include chat data for this persona
        chatHistory,
        sessions,
        activeSessionId
      };
      
      const dataStr = JSON.stringify(exportProfile, null, 2);
      const blob = new Blob([dataStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.style.display = 'none';
      link.href = url;
      link.download = `${aiProfile.name.replace(/\s+/g, '_')}_persona.json`;
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }, 100);
    } catch (error) {
      console.error("Persona export failed:", error);
      alert("Failed to export persona.");
    }
  }, [aiProfile]);

  const handleImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        // Basic validation
        if (json.name && json.personality) {
            // Ensure ID is unique to avoid overwriting unless intended
            // For safety, let's always create a new ID for imported personas
            const newPersona = { ...json, id: Date.now().toString() + Math.random().toString(36).substr(2, 9) };
            savePersona(newPersona, newPersona.chatHistory || [], newPersona.sessions || [], newPersona.activeSessionId || null);
            loadPersona(newPersona.id, newPersona.chatHistory || [], newPersona.sessions || [], newPersona.activeSessionId || null, setChatHistory, setSessions, setActiveSessionId);
            alert("Persona imported successfully!");
        } else {
            alert("Invalid persona file format.");
        }
      } catch (err) {
        console.error("Error importing persona", err);
        alert("Failed to parse persona file.");
      }
    };
    reader.readAsText(file);
    // Reset input
    e.target.value = '';
  }, [savePersona, loadPersona]);

  const [isLoadingLibraryVoices, setIsLoadingLibraryVoices] = useState(false);
  const [elevenLabsVoices, setElevenLabsVoices] = useState<any[]>([]);
  const [isLoadingElevenLabsVoices, setIsLoadingElevenLabsVoices] = useState(false);
  const [elevenLabsVoiceId, setElevenLabsVoiceId] = useState<string>(aiProfile.asyncVoiceId || '');
  const [elevenLabsModelId, setElevenLabsModelId] = useState<string>('eleven_v3');
  const [elSearchFilter, setElSearchFilter] = useState('');
  const [elCategoryFilter, setElCategoryFilter] = useState('');
  const [elVoiceTypeFilter, setElVoiceTypeFilter] = useState('');
  const [elSort, setElSort] = useState<'name' | 'created_at_unix'>('name');
  const [elSortDir, setElSortDir] = useState<'asc' | 'desc'>('asc');
  const [dynamicEmotion, setDynamicEmotion]     = useState<boolean>(aiProfile.dynamicEmotion  ?? false);

  // ElevenLabs voice quality settings
  const [elStability,      setElStability]      = useState<number>(aiProfile.elStability      ?? 0.5);
  const [elSimilarity,     setElSimilarity]     = useState<number>(aiProfile.elSimilarity     ?? 0.75);
  const [elStyle,          setElStyle]          = useState<number>(aiProfile.elStyle           ?? 0);
  const [elSpeakerBoost,   setElSpeakerBoost]   = useState<boolean>(aiProfile.elSpeakerBoost  ?? true);
  const [elSpeakingRate,   setElSpeakingRate]   = useState<number>(aiProfile.elSpeakingRate   ?? 1.0);

  // LLM max tokens
  const [maxTokens, setMaxTokens] = useState<number>(aiProfile.maxTokens ?? 2048);

  const fetchElevenLabsVoices = useCallback(async () => {
    if (!elevenLabsApiKey) return;
    setIsLoadingElevenLabsVoices(true);
    try {
      const voices = await listElevenLabsVoices(elevenLabsApiKey, {
        search: elSearchFilter || undefined,
        sort: elSort,
        sort_direction: elSortDir,
        voice_type: elVoiceTypeFilter as any || undefined,
        category: elCategoryFilter as any || undefined,
      });
      setElevenLabsVoices(voices);
    } catch (error: any) {
      addToast({ title: "ElevenLabs Error", message: error.message || "Failed to load voices.", type: "error" });
    } finally {
      setIsLoadingElevenLabsVoices(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elevenLabsApiKey, elSearchFilter, elCategoryFilter, elVoiceTypeFilter, elSort, elSortDir]);

  useEffect(() => {
    if (voiceProvider === 'elevenlabs' && elevenLabsApiKey) {
      fetchElevenLabsVoices();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceProvider, elevenLabsApiKey, elSearchFilter, elCategoryFilter, elVoiceTypeFilter, elSort, elSortDir]);

  return (
    <div className="flex flex-col lg:flex-row h-full w-full mx-auto bg-transparent transition-colors duration-500 overflow-y-auto lg:overflow-hidden p-4 sm:p-6 gap-4 sm:gap-6">
      {/* Sidebar - Persona List */}
      <div className="w-full lg:w-1/3 h-auto lg:h-full bg-indigo-100 dark:bg-indigo-900 rounded-lg shadow-md flex flex-col mb-4 lg:mb-0 border border-indigo-200 dark:border-indigo-800 flex-shrink-0 overflow-hidden">
        <div className="p-4 border-b border-indigo-200 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-800 flex justify-between items-center">
            <h3 className="font-bold text-indigo-700 dark:text-indigo-200 flex items-center">
                <Users className="w-5 h-5 mr-2 text-indigo-600 dark:text-indigo-400" />
                Personas
            </h3>
            <div className="flex space-x-1">
                <label className="p-1 bg-indigo-200 dark:bg-indigo-700 text-indigo-700 dark:text-indigo-200 rounded hover:bg-indigo-300 dark:hover:bg-indigo-600 transition-colors cursor-pointer" title="Import Persona">
                    <Upload className="w-4 h-4" />
                    <input type="file" accept=".json" onChange={handleImport} className="hidden" />
                </label>
                <button 
                    onClick={handleExport}
                    className="p-1 bg-indigo-100 dark:bg-indigo-800 text-indigo-600 dark:text-indigo-400 rounded hover:bg-indigo-200 dark:hover:bg-indigo-700 transition-colors"
                    title="Export Current Persona"
                >
                    <Download className="w-4 h-4" />
                </button>
                <button 
                    onClick={handleCreateNew}
                    className="p-1 bg-indigo-100 dark:bg-indigo-800 text-indigo-600 dark:text-indigo-400 rounded hover:bg-indigo-200 dark:hover:bg-indigo-700 transition-colors"
                    title="Create New Persona"
                >
                    <Plus className="w-4 h-4" />
                </button>
            </div>
        </div>
        <div className="flex-1 lg:overflow-y-auto p-2 space-y-2 h-auto lg:h-full">
            {savedPersonas.map(persona => (
                <div 
                    key={persona.id}
                    onClick={() => loadPersona(persona.id, chatHistory, sessions, activeSessionId, setChatHistory, setSessions, setActiveSessionId)}
                    className={`p-3 rounded-lg cursor-pointer flex items-center space-x-3 transition-colors ${
                        aiProfile.id === persona.id 
                        ? 'bg-indigo-50 dark:bg-indigo-800 border border-indigo-200 dark:border-indigo-700' 
                        : 'hover:bg-indigo-50 dark:hover:bg-indigo-800/50 border border-transparent'
                    }`}
                >
                    <div className="w-10 h-10 rounded-full bg-indigo-200 dark:bg-indigo-700 overflow-hidden flex-shrink-0">
                        {persona.referenceImage ? (
                            <img src={persona.referenceImage} alt={persona.name} className="w-full h-full object-cover" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-indigo-400 dark:text-indigo-500 font-bold text-xs">
                                {persona.name.substring(0, 2).toUpperCase()}
                            </div>
                        )}
                    </div>
                    <div className="flex-1 min-w-0">
                        <h4 className={`font-medium truncate ${aiProfile.id === persona.id ? 'text-indigo-700 dark:text-indigo-200' : 'text-indigo-900 dark:text-indigo-100'}`}>
                            {persona.name}
                        </h4>
                        <p className="text-xs text-indigo-500 dark:text-indigo-400 truncate">{persona.personality || 'No personality defined'}</p>
                    </div>
                </div>
            ))}
        </div>
      </div>

      {/* Main Content - Edit Form */}
      <div className="flex-1 h-auto lg:h-full bg-white dark:bg-indigo-950 rounded-lg shadow-md overflow-visible lg:overflow-y-auto border border-indigo-200 dark:border-indigo-800">
        <div className="p-6">
            <h2 className="text-2xl font-bold mb-6 text-indigo-600 dark:text-indigo-400">Edit Persona: {name}</h2>
            <p className="text-sm text-indigo-500 dark:text-indigo-400 mb-6">Persona ID: {aiProfile.id}</p>
            
            <div className="space-y-6">
                {/* Reference Image */}
                <div className="flex flex-col items-center justify-center mb-6">
                <div className="w-32 h-32 rounded-full bg-indigo-50 dark:bg-indigo-900 overflow-hidden mb-2 border-4 border-indigo-100 dark:border-indigo-800 relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                    {referenceImage ? (
                    <img src={referenceImage} alt="AI Avatar" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                    <div className="w-full h-full flex items-center justify-center text-indigo-400 dark:text-indigo-500">
                        <Upload className="w-8 h-8" />
                    </div>
                    )}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <span className="text-white text-xs font-medium uppercase tracking-wider">Change</span>
                    </div>
                </div>
                <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleImageUpload} 
                    accept="image/*" 
                    className="hidden" 
                />
                <p className="text-sm text-indigo-500 dark:text-indigo-400">Upload Reference Image</p>
                </div>

                <div>
                <label className="block text-sm font-medium text-indigo-700 dark:text-indigo-300 mb-1">Name</label>
                <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full p-2 border border-indigo-300 dark:border-indigo-700 rounded-md bg-white dark:bg-indigo-900 text-indigo-900 dark:text-indigo-100 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
                </div>

                <div>
                <label className="block text-sm font-medium text-indigo-700 dark:text-indigo-300 mb-1">Personality Traits</label>
                <textarea
                    value={personality}
                    onChange={(e) => setPersonality(e.target.value)}
                    rows={3}
                    className="w-full p-2 border border-indigo-300 dark:border-indigo-700 rounded-md bg-white dark:bg-indigo-900 text-indigo-900 dark:text-indigo-100 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="e.g., Witty, sarcastic, observant, empathetic..."
                />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-indigo-700 dark:text-indigo-300 mb-1">Behavioral Patterns</label>
                        <textarea
                            value={behavioralPatterns}
                            onChange={(e) => setBehavioralPatterns(e.target.value)}
                            rows={3}
                            className="w-full p-2 border border-indigo-300 dark:border-indigo-700 rounded-md bg-white dark:bg-indigo-900 text-indigo-900 dark:text-indigo-100 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                            placeholder="How does the AI react to specific situations?"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-indigo-700 dark:text-indigo-300 mb-1">Goals & Aspirations</label>
                        <textarea
                            value={goals}
                            onChange={(e) => setGoals(e.target.value)}
                            rows={3}
                            className="w-full p-2 border border-indigo-300 dark:border-indigo-700 rounded-md bg-white dark:bg-indigo-900 text-indigo-900 dark:text-indigo-100 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                            placeholder="What does the AI want to achieve?"
                        />
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-indigo-700 dark:text-indigo-300 mb-1">Core Values</label>
                        <textarea
                            value={coreValues}
                            onChange={(e) => setCoreValues(e.target.value)}
                            rows={2}
                            className="w-full p-2 border border-indigo-300 dark:border-indigo-700 rounded-md bg-white dark:bg-indigo-900 text-indigo-900 dark:text-indigo-100 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                            placeholder="What does the AI stand for?"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-indigo-700 dark:text-indigo-300 mb-1">Speaking Style</label>
                        <textarea
                            value={speakingStyle}
                            onChange={(e) => setSpeakingStyle(e.target.value)}
                            rows={2}
                            className="w-full p-2 border border-indigo-300 dark:border-indigo-700 rounded-md bg-white dark:bg-indigo-900 text-indigo-900 dark:text-indigo-100 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                            placeholder="Tone, vocabulary, sentence structure..."
                        />
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-indigo-700 dark:text-indigo-300 mb-1">Likes</label>
                        <textarea
                            value={likes}
                            onChange={(e) => setLikes(e.target.value)}
                            rows={2}
                            className="w-full p-2 border border-indigo-300 dark:border-indigo-700 rounded-md bg-white dark:bg-indigo-900 text-indigo-900 dark:text-indigo-100 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                            placeholder="Things the AI enjoys..."
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-indigo-700 dark:text-indigo-300 mb-1">Dislikes</label>
                        <textarea
                            value={dislikes}
                            onChange={(e) => setDislikes(e.target.value)}
                            rows={2}
                            className="w-full p-2 border border-indigo-300 dark:border-indigo-700 rounded-md bg-white dark:bg-indigo-900 text-indigo-900 dark:text-indigo-100 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                            placeholder="Things the AI avoids..."
                        />
                    </div>
                </div>

                <div>
                <label className="block text-sm font-medium text-indigo-700 dark:text-indigo-300 mb-1">Backstory</label>
                <textarea
                    value={backstory}
                    onChange={(e) => setBackstory(e.target.value)}
                    rows={3}
                    className="w-full p-2 border border-indigo-300 dark:border-indigo-700 rounded-md bg-white dark:bg-indigo-900 text-indigo-900 dark:text-indigo-100 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="Where does this AI come from?"
                />
                </div>

                <div>
                <label className="block text-sm font-medium text-indigo-700 dark:text-indigo-300 mb-1">Physical Appearance</label>
                <textarea
                    value={appearance}
                    onChange={(e) => setAppearance(e.target.value)}
                    rows={2}
                    className="w-full p-2 border border-indigo-300 dark:border-indigo-700 rounded-md bg-white dark:bg-indigo-900 text-indigo-900 dark:text-indigo-100 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="Describe how the AI looks..."
                />
                </div>

                {/* Advanced Model Settings */}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-indigo-700 dark:text-indigo-300 mb-1">Response Detail</label>
                        <select
                            value={responseDetail}
                            onChange={(e) => setResponseDetail(e.target.value as AIProfile['responseDetail'])}
                            className="w-full p-2 border border-indigo-300 dark:border-indigo-700 rounded-md bg-white dark:bg-indigo-900 text-indigo-900 dark:text-indigo-100 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        >
                            <option value="Concise">Concise</option>
                            <option value="standard">Standard</option>
                            <option value="Detailed">Detailed</option>
                            <option value="Verbose">Verbose</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-indigo-700 dark:text-indigo-300 mb-1">Response Tone</label>
                        <select
                            value={responseTone}
                            onChange={(e) => setResponseTone(e.target.value as AIProfile['responseTone'])}
                            className="w-full p-2 border border-indigo-300 dark:border-indigo-700 rounded-md bg-white dark:bg-indigo-900 text-indigo-900 dark:text-indigo-100 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        >
                            <option value="friendly">Friendly</option>
                            <option value="Serious">Serious</option>
                            <option value="Humorous">Humorous</option>
                            <option value="Professional">Professional</option>
                            <option value="Flirty">Flirty</option>
                            <option value="Empathetic">Empathetic</option>
                            <option value="Sarcastic">Sarcastic</option>
                        </select>
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-indigo-700 dark:text-indigo-300 mb-1">Custom Paragraph Count</label>
                        <input
                            type="number"
                            min="1"
                            max="20"
                            value={customParagraphCount ?? ''}
                            onChange={(e) => setCustomParagraphCount(e.target.value ? parseInt(e.target.value) : null)}
                            className="w-full p-2 border border-indigo-300 dark:border-indigo-700 rounded-md bg-white dark:bg-indigo-900 text-indigo-900 dark:text-indigo-100 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                            placeholder="e.g., 3 (overrides Response Length)"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-indigo-700 dark:text-indigo-300 mb-1">Custom Word Count</label>
                        <input
                            type="number"
                            min="10"
                            max="500"
                            value={customWordCount ?? ''}
                            onChange={(e) => setCustomWordCount(e.target.value ? parseInt(e.target.value) : null)}
                            className="w-full p-2 border border-indigo-300 dark:border-indigo-700 rounded-md bg-white dark:bg-indigo-900 text-indigo-900 dark:text-indigo-100 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                            placeholder="e.g., 150 (overrides Response Length)"
                        />
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-indigo-700 dark:text-indigo-300 mb-1">Response Length</label>
                        <select
                            value={responseLength}
                            onChange={(e) => setResponseLength(e.target.value as AIProfile['responseLength'])}
                            className="w-full p-2 border border-indigo-300 dark:border-indigo-700 rounded-md bg-white dark:bg-indigo-900 text-indigo-900 dark:text-indigo-100 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        >
                            <option value="short">Short</option>
                            <option value="medium">Medium</option>
                            <option value="long">Long</option>
                            <option value="custom">Custom</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-indigo-700 dark:text-indigo-300 mb-1">Proactive Messages</label>
                        <select
                            value={proactiveMessageFrequency}
                            onChange={(e) => setProactiveMessageFrequency(e.target.value as any)}
                            className="w-full p-2 border border-indigo-300 dark:border-indigo-700 rounded-md bg-white dark:bg-indigo-900 text-indigo-900 dark:text-indigo-100 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        >
                            <option value="off">Off</option>
                            <option value="2h">About every 2 hours</option>
                            <option value="3h">About every 3 hours</option>
                            <option value="5h">About every 5 hours</option>
                            <option value="11h">About every 11 hours</option>
                        </select>
                        <p className="text-xs text-indigo-500 dark:text-indigo-400 mt-1">
                            Allow AI to send check-in notifications.
                        </p>
                    </div>
                </div>

                <div className="border-t border-indigo-100 dark:border-indigo-800 pt-4">
                    <h3 className="text-sm font-semibold text-indigo-900 dark:text-indigo-100 mb-3">Proactive Message Status</h3>
                    <div className="p-3 bg-indigo-50 dark:bg-indigo-900/30 rounded-md text-sm text-indigo-600 dark:text-indigo-400">
                        {aiProfile.lastProactiveStatus || 'No proactive messages sent yet.'}
                    </div>
                </div>

                <div className="border-t border-indigo-100 dark:border-indigo-800 pt-4">
                    <h3 className="text-sm font-semibold text-indigo-900 dark:text-indigo-100 mb-3">Ambient Mode Settings</h3>
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center">
                                <label htmlFor="ambientMode" className="block text-sm font-medium text-indigo-700 dark:text-indigo-300">Enable Ambient Mode</label>
                                <div className="relative group ml-2" tabIndex={0}>
                                    <HelpCircle className="w-4 h-4 text-indigo-400 dark:text-indigo-500 cursor-help" />
                                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-2 bg-indigo-800 dark:bg-indigo-700 text-white text-[10px] rounded shadow-lg opacity-0 group-hover:opacity-100 focus:opacity-100 group-focus:opacity-100 transition-opacity pointer-events-none z-50">
                                        Ambient Mode allows the AI to maintain a background presence. When enabled, the AI may send more passive, atmospheric updates or check-ins that feel more natural and less direct than standard proactive messages.
                                    </div>
                                </div>
                            </div>
                            <button 
                                onClick={() => setAmbientModeState(!ambientModeState)}
                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${ambientModeState ? 'bg-indigo-600' : 'bg-indigo-200 dark:bg-indigo-800'}`}
                            >
                                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${ambientModeState ? 'translate-x-6' : 'translate-x-1'}`} />
                            </button>
                        </div>
                        {ambientModeState && (
                            <div className="mt-3">
                                <label className="block text-xs font-medium text-indigo-700 dark:text-indigo-300 mb-1">Ambient Frequency</label>
                                <select
                                    value={ambientFrequencyState}
                                    onChange={(e) => setAmbientFrequencyState(e.target.value as any)}
                                    className="w-full p-2 text-sm border border-indigo-300 dark:border-indigo-700 rounded-md bg-white dark:bg-indigo-900 text-indigo-900 dark:text-indigo-100 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                >
                                    <option value="off">Off</option>
                                    <option value="15m">About every 15 minutes</option>
                                    <option value="30m">About every 30 minutes</option>
                                    <option value="45m">About every 45 minutes</option>
                                    <option value="60m">About every 60 minutes</option>
                                </select>
                            </div>
                        )}

                        {aiProfile.aiCanGenerateImages && (
                            <div className="mt-3 space-y-4">
                                <div>
                                    <label className="block text-xs font-medium text-indigo-700 dark:text-indigo-300 mb-1">Image Generation Style</label>
                                    <select
                                        value={imageStyle}
                                        onChange={(e) => setImageStyle(e.target.value)}
                                        className="w-full p-2 text-sm border border-indigo-300 dark:border-indigo-700 rounded-md bg-white dark:bg-indigo-900 text-indigo-900 dark:text-indigo-100 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                    >
                                        <option value="none">None</option>
                                        <option value="photograph">Photograph</option>
                                        <option value="anime">Anime</option>
                                    </select>
                                </div>
                                
                                <div>
                                    <label className="block text-xs font-medium text-indigo-700 dark:text-indigo-300 mb-1">Image Generation Instructions</label>
                                    <p className="text-xs text-indigo-500 dark:text-indigo-400 mb-2">These instructions will ALWAYS be followed by the AI when generating images.</p>
                                    <div className="space-y-2">
                                        {imageGenerationInstructions.map((instruction, index) => (
                                            <div key={index} className="flex items-center gap-2">
                                                <input
                                                    type="text"
                                                    value={instruction}
                                                    onChange={(e) => {
                                                        const newInstructions = [...imageGenerationInstructions];
                                                        newInstructions[index] = e.target.value;
                                                        setImageGenerationInstructions(newInstructions);
                                                    }}
                                                    className="flex-1 p-2 text-sm border border-indigo-300 dark:border-indigo-700 rounded-md bg-white dark:bg-indigo-900 text-indigo-900 dark:text-indigo-100 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 placeholder-indigo-400 dark:placeholder-indigo-600"
                                                    placeholder="e.g., Always make the lighting cinematic"
                                                />
                                                <button
                                                    onClick={() => {
                                                        const newInstructions = imageGenerationInstructions.filter((_, i) => i !== index);
                                                        setImageGenerationInstructions(newInstructions);
                                                    }}
                                                    className="p-2 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-md transition-colors"
                                                    title="Remove instruction"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        ))}
                                        <div className="flex items-center gap-4 mt-2">
                                            <button
                                                onClick={() => setImageGenerationInstructions([...imageGenerationInstructions, ''])}
                                                className="flex items-center gap-1 text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium"
                                            >
                                                <Plus size={16} /> Add Instruction
                                            </button>
                                            <button
                                                onClick={() => {
                                                    const defaults = [
                                                        "If a character reference image is provided, you MUST use it as the absolute source of truth.",
                                                        "COPY the face, body type, skin tone, hair color, and all physical features EXACTLY from the reference image.",
                                                        "You are ONLY permitted to modify the pose, clothing, facial expression, and eye position.",
                                                        "DO NOT alter the body type (muscularity, bust size, etc.) or facial structure in any way.",
                                                        "If the prompt or description contradicts the reference image, the reference image ALWAYS takes precedence.",
                                                    ];
                                                    setImageGenerationInstructions([...imageGenerationInstructions, ...defaults.filter(d => !imageGenerationInstructions.includes(d))]);
                                                }}
                                                className="text-sm text-indigo-500 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium"
                                            >
                                                Restore Defaults
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Advanced Model Settings */}
                <div className="border-t border-indigo-100 dark:border-indigo-800 pt-4">
                    <h3 className="text-sm font-semibold text-indigo-900 dark:text-indigo-100 mb-3">Advanced Model Settings</h3>
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <label className="text-sm font-medium text-indigo-700 dark:text-indigo-300">Knows it's an AI</label>
                            <button
                                onClick={() => setKnowsItsAI(!knowsItsAI)}
                                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${knowsItsAI ? 'bg-indigo-600' : 'bg-indigo-200 dark:bg-indigo-800'}`}
                            >
                                <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${knowsItsAI ? 'translate-x-5' : 'translate-x-0'}`} />
                            </button>
                        </div>
                        <div className="flex items-center justify-between">
                            <div>
                                <label className="text-sm font-medium text-indigo-700 dark:text-indigo-300">Time Awareness</label>
                                <span className="block text-xs text-indigo-500 dark:text-indigo-400">AI knows the current date and time (timezone set in Settings)</span>
                            </div>
                            <button
                                onClick={() => setTimeAwareness(!timeAwareness)}
                                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${timeAwareness ? 'bg-indigo-600' : 'bg-indigo-200 dark:bg-indigo-800'}`}
                            >
                                <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${timeAwareness ? 'translate-x-5' : 'translate-x-0'}`} />
                            </button>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-indigo-700 dark:text-indigo-300 mb-1">AI Model</label>
                            <select
                                value={model}
                                onChange={(e) => {
                                  setModel(e.target.value);
                                }}
                                className="w-full p-2 border border-indigo-300 dark:border-indigo-700 rounded-md bg-white dark:bg-indigo-900 text-indigo-900 dark:text-indigo-100 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                            >
                                <option value="claude-sonnet-4-6">Claude Sonnet (Recommended)</option>
                                <option value="claude-opus-4-6">Claude Opus (Most capable)</option>
                                <option value="claude-haiku-4-5-20251001">Claude Haiku (Fastest)</option>
                                <option disabled value="">── Gemini (requires Gemini key) ──</option>
                                <option value="gemini-2.0-flash">Gemini 2.0 Flash (Fast)</option>
                                <option value="gemini-1.5-pro">Gemini 1.5 Pro (Capable)</option>
                                <option value="gemini-1.5-flash">Gemini 1.5 Flash (Fastest)</option>
                            </select>
                        </div>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                            <div>
                                <div className="flex items-center mb-1">
                                    <label className="block text-xs font-medium text-indigo-700 dark:text-indigo-300">Temperature: {temperature}</label>
                                    <div className="relative group ml-1" tabIndex={0}>
                                        <HelpCircle className="w-3 h-3 text-indigo-400 dark:text-indigo-500 cursor-help" />
                                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-indigo-800 dark:bg-indigo-700 text-white text-[10px] rounded shadow-lg opacity-0 group-hover:opacity-100 focus:opacity-100 group-focus:opacity-100 transition-opacity pointer-events-none z-50">
                                            Controls randomness. Lower values make responses more predictable and focused, while higher values make them more creative and varied.
                                        </div>
                                    </div>
                                </div>
                                <input
                                    type="range"
                                    min="0"
                                    max="2"
                                    step="0.1"
                                    value={temperature}
                                    onChange={(e) => setTemperature(parseFloat(e.target.value))}
                                    className="w-full h-2 bg-indigo-200 dark:bg-indigo-800 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                                />
                                <div className="flex justify-between text-[10px] text-indigo-400 dark:text-indigo-500 mt-1">
                                    <span>Precise</span>
                                    <span>Creative</span>
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-indigo-700 dark:text-indigo-300 mb-1">Max Tokens: {maxTokens}</label>
                                <input
                                    type="range"
                                    min="256"
                                    max="8192"
                                    step="256"
                                    value={maxTokens}
                                    onChange={(e) => setMaxTokens(parseInt(e.target.value))}
                                    className="w-full h-2 bg-indigo-200 dark:bg-indigo-800 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                                    data-testid="max-tokens-slider"
                                />
                                <div className="flex justify-between text-[10px] text-indigo-400 dark:text-indigo-500 mt-1">
                                    <span>Short (256)</span>
                                    <span>Long (8192)</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="border-t border-indigo-100 dark:border-indigo-800 pt-6 mt-6">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-medium text-indigo-900 dark:text-indigo-100">Voice Settings</h3>
                        <div className="flex items-center gap-6">
                            <div className="flex items-center justify-between gap-3">
                                <label className="text-sm text-indigo-900 dark:text-indigo-100">Enable Speech</label>
                                <button
                                    onClick={() => setAiCanGenerateSpeech(!aiCanGenerateSpeech)}
                                    className={`w-10 h-6 rounded-full transition-colors flex-shrink-0 ${aiCanGenerateSpeech ? 'bg-indigo-600' : 'bg-indigo-200 dark:bg-indigo-800'}`}
                                >
                                    <div className={`w-4 h-4 rounded-full bg-white transition-transform mx-auto ${aiCanGenerateSpeech ? 'translate-x-2' : '-translate-x-2'}`} />
                                </button>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                                <label className="text-sm text-indigo-900 dark:text-indigo-100">Auto-read</label>
                                <button
                                    onClick={() => setAutoReadMessages(!autoReadMessages)}
                                    className={`w-10 h-6 rounded-full transition-colors flex-shrink-0 ${autoReadMessages ? 'bg-indigo-600' : 'bg-indigo-200 dark:bg-indigo-800'}`}
                                >
                                    <div className={`w-4 h-4 rounded-full bg-white transition-transform mx-auto ${autoReadMessages ? 'translate-x-2' : '-translate-x-2'}`} />
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Text-only mode toggle — always visible, not inside the TTS block */}
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <label className="text-sm font-medium text-indigo-700 dark:text-indigo-300">Text-Only Mode</label>
                            <span className="block text-xs text-indigo-500 dark:text-indigo-400">No asterisk actions — uses [action] format instead, which works better with ElevenLabs v3</span>
                        </div>
                        <button
                            onClick={() => setTextOnlyMode(!textOnlyMode)}
                            className={`w-10 h-6 rounded-full transition-colors flex-shrink-0 ${textOnlyMode ? 'bg-indigo-600' : 'bg-indigo-200 dark:bg-indigo-800'}`}
                        >
                            <div className={`w-4 h-4 rounded-full bg-white transition-transform mx-auto ${textOnlyMode ? 'translate-x-2' : '-translate-x-2'}`} />
                        </button>
                    </div>
                    
                    {aiCanGenerateSpeech && (
                        <>
                            <div className="space-y-6 animate-in fade-in duration-300">
                            <div className="mb-4">
                                <label className="block text-sm font-medium text-indigo-700 dark:text-indigo-300 mb-2">Voice Engine</label>
                                <div className="flex p-1 bg-indigo-50 dark:bg-indigo-900/50 rounded-xl border border-indigo-100 dark:border-indigo-800">
                                    <button 
                                        onClick={() => {
                                            setVoiceProvider('browser');
                                            setAIProfile({ ...aiProfile, voiceProvider: 'browser', aiCanGenerateSpeech: aiCanGenerateSpeech });
                                        }}
                                        className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition-all duration-200 flex items-center justify-center ${voiceProvider === 'browser' ? 'bg-white dark:bg-indigo-800 text-indigo-600 dark:text-indigo-100 shadow-sm' : 'text-indigo-400 dark:text-indigo-500 hover:text-indigo-600 dark:hover:text-indigo-300'}`}
                                    >
                                        <Volume2 className="w-3 h-3 mr-1" />
                                        Browser
                                    </button>
                                    <button
                                        onClick={() => {
                                            setVoiceProvider('elevenlabs');
                                            setAIProfile({ ...aiProfile, voiceProvider: 'elevenlabs', aiCanGenerateSpeech: aiCanGenerateSpeech });
                                            if (elevenLabsVoices.length === 0) fetchElevenLabsVoices();
                                        }}
                                        className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition-all duration-200 flex items-center justify-center ${voiceProvider === 'elevenlabs' ? 'bg-white dark:bg-indigo-800 text-indigo-600 dark:text-indigo-100 shadow-sm' : 'text-indigo-400 dark:text-indigo-500 hover:text-indigo-600 dark:hover:text-indigo-300'}`}
                                    >
                                        <Headphones className="w-3 h-3 mr-1" />
                                        ElevenLabs
                                    </button>
                                </div>
                                <p className="mt-2 text-[10px] text-indigo-500 dark:text-indigo-400">
                                    {voiceProvider === 'elevenlabs' && "Premium ElevenLabs voices. Requires an ElevenLabs API key in Settings."}
                                    {voiceProvider === 'browser' && "Uses your device's built-in speech engine. No API key required."}
                                </p>
                            </div>

                            {voiceProvider === 'elevenlabs' ? (
                                <div className="p-4 bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-800 rounded-lg space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                                    <div className="flex items-center justify-between">
                                        <label className="block text-sm font-bold text-indigo-900 dark:text-indigo-100">ElevenLabs Voices</label>
                                        <button onClick={fetchElevenLabsVoices} className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline flex items-center">
                                            <RotateCcw className="w-3 h-3 mr-1" />
                                            Refresh
                                        </button>
                                    </div>

                                    {/* Model selector */}
                                    <div>
                                        <label className="block text-xs font-medium text-indigo-700 dark:text-indigo-300 mb-1">Model</label>
                                        <select
                                            value={elevenLabsModelId}
                                            onChange={(e) => setElevenLabsModelId(e.target.value)}
                                            className="w-full text-xs p-1.5 rounded border border-indigo-200 dark:border-indigo-700 bg-white dark:bg-indigo-950 text-indigo-900 dark:text-indigo-100"
                                        >
                                            <option value="eleven_v3">Eleven v3 — Most expressive, 70+ languages (recommended)</option>
                                            <option value="eleven_multilingual_v2">Multilingual v2 — Lifelike, 29 languages</option>
                                            <option value="eleven_flash_v2_5">Flash v2.5 — Ultra-fast ~75ms, 32 languages</option>
                                            <option value="eleven_flash_v2">Flash v2 — Ultra-fast, English only</option>
                                        </select>
                                    </div>

                                    {/* Filters */}
                                    <div className="grid grid-cols-2 gap-2">
                                        <input
                                            type="text"
                                            placeholder="Search voices…"
                                            value={elSearchFilter}
                                            onChange={(e) => setElSearchFilter(e.target.value)}
                                            className="col-span-2 text-xs p-1.5 rounded border border-indigo-200 dark:border-indigo-700 bg-white dark:bg-indigo-950 text-indigo-900 dark:text-indigo-100"
                                        />
                                        <select className="text-xs p-1 rounded border border-indigo-200 dark:border-indigo-700 bg-white dark:bg-indigo-950 text-indigo-900 dark:text-indigo-100" value={elCategoryFilter} onChange={(e) => setElCategoryFilter(e.target.value)}>
                                            <option value="">All categories</option>
                                            <option value="premade">Premade</option>
                                            <option value="cloned">Cloned</option>
                                            <option value="generated">Generated</option>
                                            <option value="professional">Professional</option>
                                        </select>
                                        <select className="text-xs p-1 rounded border border-indigo-200 dark:border-indigo-700 bg-white dark:bg-indigo-950 text-indigo-900 dark:text-indigo-100" value={elVoiceTypeFilter} onChange={(e) => setElVoiceTypeFilter(e.target.value)}>
                                            <option value="">All types</option>
                                            <option value="personal">My voices</option>
                                            <option value="community">Community</option>
                                            <option value="default">Default</option>
                                        </select>
                                        <select className="text-xs p-1 rounded border border-indigo-200 dark:border-indigo-700 bg-white dark:bg-indigo-950 text-indigo-900 dark:text-indigo-100" value={elSort} onChange={(e) => setElSort(e.target.value as any)}>
                                            <option value="name">Sort: Name</option>
                                            <option value="created_at_unix">Sort: Date</option>
                                        </select>
                                        <select className="text-xs p-1 rounded border border-indigo-200 dark:border-indigo-700 bg-white dark:bg-indigo-950 text-indigo-900 dark:text-indigo-100" value={elSortDir} onChange={(e) => setElSortDir(e.target.value as any)}>
                                            <option value="asc">A → Z / Oldest</option>
                                            <option value="desc">Z → A / Newest</option>
                                        </select>
                                    </div>

                                    {/* Voice list */}
                                    {isLoadingElevenLabsVoices ? (
                                        <div className="flex justify-center py-4">
                                            <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
                                        </div>
                                    ) : elevenLabsVoices.length > 0 ? (
                                        <div className="space-y-1 max-h-60 overflow-y-auto">
                                            {elevenLabsVoices.map((v: any) => (
                                                <div
                                                    key={v.voice_id}
                                                    onClick={() => {
                                                        setElevenLabsVoiceId(v.voice_id);
                                                        setAIProfile({ ...aiProfile, asyncVoiceId: v.voice_id, voiceProvider: 'elevenlabs' });
                                                    }}
                                                    className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors ${elevenLabsVoiceId === v.voice_id ? 'bg-indigo-200 dark:bg-indigo-700' : 'hover:bg-indigo-100 dark:hover:bg-indigo-800'}`}
                                                >
                                                    <div className="flex-1 min-w-0">
                                                        <span className="text-sm font-bold text-indigo-900 dark:text-indigo-100 truncate block">{v.name}</span>
                                                        <span className="text-[10px] text-indigo-400 dark:text-indigo-500">
                                                            {[v.category, v.labels?.accent, v.labels?.gender].filter(Boolean).join(' · ')}
                                                        </span>
                                                    </div>
                                                    <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ml-2 ${elevenLabsVoiceId === v.voice_id ? 'border-indigo-600 bg-indigo-600' : 'border-indigo-300 dark:border-indigo-700'}`}>
                                                        {elevenLabsVoiceId === v.voice_id && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-xs text-center text-indigo-500 dark:text-indigo-400 py-4">
                                            {elevenLabsApiKey ? 'No voices found. Try different filters.' : 'Add your ElevenLabs API key in Settings first.'}
                                        </p>
                                    )}

                                    <div className="flex justify-center">
                                        <button
                                            onClick={handleTestVoice}
                                            disabled={isTestingVoice || !elevenLabsVoiceId}
                                            className="flex items-center space-x-2 py-2 px-6 bg-indigo-600 text-white rounded-full text-sm font-medium hover:bg-indigo-700 transition-all disabled:opacity-50 shadow-md"
                                        >
                                            {isTestingVoice ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                                            <span>Test ElevenLabs Voice</span>
                                        </button>
                                    </div>

                                    {/* Custom voice ID */}
                                    <div className="border-t border-indigo-100 dark:border-indigo-800 pt-3">
                                        <label className="block text-xs font-medium text-indigo-700 dark:text-indigo-300 mb-1">Custom Voice ID</label>
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                value={elevenLabsVoiceId}
                                                onChange={(e) => setElevenLabsVoiceId(e.target.value)}
                                                placeholder="Paste a voice ID from elevenlabs.io"
                                                className="flex-1 p-2 border border-indigo-300 dark:border-indigo-700 rounded-lg bg-white dark:bg-indigo-950 text-indigo-900 dark:text-indigo-100 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                            />
                                            <button
                                                onClick={() => {
                                                    if (!elevenLabsVoiceId.trim()) return;
                                                    setAIProfile({ ...aiProfile, asyncVoiceId: elevenLabsVoiceId.trim(), voiceProvider: 'elevenlabs' });
                                                    addToast({ title: 'Voice Set', message: 'Custom ElevenLabs voice ID saved.', type: 'success' });
                                                }}
                                                className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
                                            >
                                                Use
                                            </button>
                                        </div>
                                        <p className="text-[10px] text-indigo-400 dark:text-indigo-500 mt-1">
                                            Find voice IDs on your ElevenLabs dashboard. Works for any voice including ones you've created there.
                                        </p>
                                    </div>
                                    {/* ElevenLabs voice quality settings */}
                                    <div className="border-t border-indigo-100 dark:border-indigo-800 pt-3 space-y-3">
                                        <label className="block text-xs font-semibold text-indigo-700 dark:text-indigo-300">Voice Quality Settings</label>
                                        {[
                                          { label: `Stability: ${elStability.toFixed(2)}`, val: elStability, set: setElStability, min: 0, max: 1, step: 0.05, hint: 'Higher = more consistent but less expressive' },
                                          { label: `Similarity Boost: ${elSimilarity.toFixed(2)}`, val: elSimilarity, set: setElSimilarity, min: 0, max: 1, step: 0.05, hint: 'How closely the AI follows the original voice' },
                                          { label: `Style: ${elStyle.toFixed(2)}`, val: elStyle, set: setElStyle, min: 0, max: 1, step: 0.05, hint: 'Style exaggeration — higher values are more dramatic' },
                                          { label: `Speaking Rate: ${elSpeakingRate.toFixed(2)}x`, val: elSpeakingRate, set: setElSpeakingRate, min: 0.7, max: 1.2, step: 0.05, hint: 'Speech speed multiplier' },
                                        ].map(({ label, val, set, min, max, step, hint }) => (
                                          <div key={label}>
                                            <div className="flex items-center gap-1 mb-1">
                                              <label className="text-[11px] font-medium text-indigo-700 dark:text-indigo-300">{label}</label>
                                              <div className="relative group" tabIndex={0}>
                                                <HelpCircle className="w-3 h-3 text-indigo-400 cursor-help" />
                                                <div className="absolute bottom-full left-0 mb-1 w-44 p-2 bg-indigo-800 text-white text-[10px] rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">{hint}</div>
                                              </div>
                                            </div>
                                            <input type="range" min={min} max={max} step={step} value={val}
                                              onChange={(e) => set(parseFloat(e.target.value) as any)}
                                              className="w-full h-1.5 bg-indigo-200 dark:bg-indigo-800 rounded-lg appearance-none cursor-pointer accent-indigo-600" />
                                          </div>
                                        ))}
                                        <div className="flex items-center justify-between">
                                          <label className="text-[11px] font-medium text-indigo-700 dark:text-indigo-300">Speaker Boost</label>
                                          <button onClick={() => setElSpeakerBoost(!elSpeakerBoost)}
                                            className={`w-8 h-5 rounded-full transition-colors ${elSpeakerBoost ? 'bg-indigo-600' : 'bg-indigo-200 dark:bg-indigo-800'}`}>
                                            <div className={`w-3 h-3 rounded-full bg-white transition-transform mx-auto ${elSpeakerBoost ? 'translate-x-1.5' : '-translate-x-1.5'}`} />
                                          </button>
                                        </div>
                                        <div className="flex items-center justify-between pt-1">
                                            <div>
                                                <label className="text-[11px] font-semibold text-indigo-700 dark:text-indigo-300">Dynamic Style</label>
                                                <p className="text-[10px] text-indigo-400 leading-tight">Auto-scale style exaggeration based on the AI's emotional tone</p>
                                            </div>
                                            <button
                                                onClick={() => setDynamicEmotion(!dynamicEmotion)}
                                                data-testid="el-dynamic-style-toggle"
                                                className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ${dynamicEmotion ? 'bg-indigo-600' : 'bg-indigo-200 dark:bg-indigo-800'}`}>
                                                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${dynamicEmotion ? 'translate-x-4' : 'translate-x-0.5'}`} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="p-4 bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-800 rounded-lg space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-indigo-700 dark:text-indigo-300 mb-1">Browser Voice</label>
                                            <div className="flex space-x-2">
                                                <select
                                                value={voiceURI}
                                                onChange={(e) => setVoiceURI(e.target.value)}
                                                className="flex-1 p-2 border border-indigo-300 dark:border-indigo-700 rounded-md bg-white dark:bg-indigo-950 text-indigo-900 dark:text-indigo-100 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                                >
                                                <option value="">Default System Voice</option>
                                                {voices.map((voice) => (
                                                    <option key={`browser-${voice.voiceURI}`} value={voice.voiceURI}>
                                                        {voice.name} ({voice.lang})
                                                    </option>
                                                ))}
                                                </select>
                                                <button
                                                    onClick={handleTestVoice}
                                                    disabled={isTestingVoice}
                                                    className="p-2 bg-indigo-100 dark:bg-indigo-800 text-indigo-600 dark:text-indigo-400 rounded-md hover:bg-indigo-200 dark:hover:bg-indigo-700 transition-colors disabled:opacity-50"
                                                    title="Test Voice"
                                                >
                                                    <Play className="w-5 h-5" />
                                                </button>
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-indigo-700 dark:text-indigo-300 mb-1">Voice Gender (Local Only)</label>
                                            <select
                                            value={voiceGender}
                                            onChange={(e) => setVoiceGender(e.target.value as 'male' | 'female' | 'none')}
                                            className="w-full p-2 border border-indigo-300 dark:border-indigo-700 rounded-md bg-white dark:bg-indigo-950 text-indigo-900 dark:text-indigo-100 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                            >
                                            <option value="none">None / Neutral</option>
                                            <option value="male">Male</option>
                                            <option value="female">Female</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            )}
                            </div>

            </>
        )}
    </div>

                <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-3 pt-4 border-t border-indigo-100 dark:border-indigo-800">
                    <button
                        onClick={handleSave}
                        className="w-full sm:w-auto bg-indigo-600 dark:bg-indigo-500 text-white py-2 px-4 rounded-md hover:bg-indigo-700 dark:hover:bg-indigo-600 transition-colors font-medium shadow-sm flex items-center justify-center"
                    >
                        <Save className="w-4 h-4 mr-2" />
                        Save Changes
                    </button>
                    <button
                        onClick={handleSaveAsNew}
                        className="w-full sm:w-auto bg-white dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-700 py-2 px-4 rounded-md hover:bg-indigo-50 dark:hover:bg-indigo-900 transition-colors font-medium shadow-sm flex items-center justify-center"
                    >
                        <Plus className="w-4 h-4 mr-2" />
                        Save as New
                    </button>
                    <button
                        onClick={handleDelete}
                        className="px-4 py-2 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-md transition-colors border border-transparent hover:border-red-100 dark:hover:border-red-900"
                        title="Delete Persona"
                    >
                        <Trash2 className="w-5 h-5" />
                    </button>
                </div>

                {/* Preview Chat Section */}
                <PreviewChat 
                  name={name}
                  previewMessages={previewMessages}
                  isPreviewLoading={isPreviewLoading}
                  previewInput={previewInput}
                  setPreviewInput={setPreviewInput}
                  handlePreviewSend={handlePreviewSend}
                  setPreviewMessages={setPreviewMessages}
                />
            </div>
        </div>
      </div>
    </div>
  );
};

export default AIProfileScreen;
