import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Send, Image as ImageIcon, Mic, Paperclip, Volume2, RotateCcw, Edit2, X, FileText, CheckCheck, Loader2, Camera, Trash2, ExternalLink, Plus, MessageSquare, History, MoreVertical, ChevronLeft, ChevronRight, Search, Star, Headphones, ArrowDown, Download } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useChat } from '../context/ChatContext';
import { generateElevenLabsSpeech } from '../services/asyncService';
import { showNativeNotification } from '../services/notificationService';
import ChatMessageItem from '../components/ChatMessageItem';
import ImageModal from '../components/ImageModal';
import { processFile } from '../services/ocrService';

const ChatScreen: React.FC = () => {
  const { 
    aiProfile, userProfile, knowledgeBase, 
    addToKnowledgeBase, addToGallery, apiKey,
    anthropicApiKey, geminiApiKey, elevenLabsApiKey,
    memories, journal, 
    addJournalEntry, addMemory, showTimestamps, timeZone, addToast,
    setAIProfile, setLastInteractionTime
  } = useApp();
  const {
    chatHistory, addChatMessage, updateChatMessage, 
    deleteChatMessage, rateChatMessage, addFeedbackComment, setChatHistory, clearHistory,
    sessions, setSessions, activeSessionId, createNewSession, switchSession, deleteSession, deleteAllSessions, renameSession
  } = useChat();
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [attachments, setAttachments] = useState<{ type: 'image' | 'text' | 'pdf'; content: string; name: string }[]>([]);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [isSessionsSidebarOpen, setIsSessionsSidebarOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [newSessionTitle, setNewSessionTitle] = useState('');
  const [isHandsFree, setIsHandsFree] = useState(false);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const recognitionRef = useRef<any>(null);
  const inputRef = useRef('');

  useEffect(() => {
    inputRef.current = input;
  }, [input]);

  const [readMessages, setReadMessages] = useState<Set<string>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Browser Integration Handlers (moved to SettingsScreen)
  const handleCamera = () => {
      cameraInputRef.current?.click();
  };

  // Proactive Messages Logic moved to AppContext.tsx for centralized handling and FCM support
  
  const [showScrollButton, setShowScrollButton] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const handleScroll = () => {
    if (scrollContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
      setShowScrollButton(scrollHeight - scrollTop - clientHeight > 300);
    }
  };

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll);
      return () => container.removeEventListener('scroll', handleScroll);
    }
  }, []);

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chatHistory]);

  const [isUploading, setIsUploading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<{ url: string; prompt?: string } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setIsUploading(true);
      const file = e.target.files[0];
      try {
        const reader = new FileReader();
        reader.onload = (event) => {
          if (event.target?.result) {
            setAttachments(prev => [...prev, {
              type: 'image' as const,
              content: event.target!.result as string,
              name: file.name
            }]);
            addToast({ title: "Image attached", message: file.name, type: "success" });
            setIsUploading(false);
          }
        };
        reader.onerror = () => {
          addToast({ title: "Upload Error", message: "Failed to read image", type: "error" });
          setIsUploading(false);
        };
        reader.readAsDataURL(file);
      } catch (error) {
        console.error("Image upload failed:", error);
        addToast({ title: "Upload Error", message: "Failed to attach image", type: "error" });
        setIsUploading(false);
      }
    }
    if (imageInputRef.current) imageInputRef.current.value = '';
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      addToast({ title: "Upload", message: "Processing file...", type: "info" });
      setIsUploading(true);
      const file = e.target.files[0];
      
      try {
        const processedFiles = await processFile(file, file.name, apiKey || undefined);
        
        for (const processed of processedFiles) {
          setAttachments(prev => [...prev, {
            type: processed.name.toLowerCase().endsWith('.pdf') ? 'pdf' : 'text',
            content: processed.content,
            name: processed.name
          }]);
          
          // Add to knowledge base
          addToKnowledgeBase({
            name: processed.name,
            content: processed.content
          });
        }
        setIsUploading(false);
      } catch (error) {
        console.error("File processing failed:", error);
        addToast({ title: "Upload Error", message: "Failed to process file", type: "error" });
        setIsUploading(false);
      }
    }
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Speech to Text
  const toggleListening = async (forceHandsFree?: boolean) => {
    const activeHandsFree = forceHandsFree ?? isHandsFree;

    if (isListening) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsListening(false);
      return;
    }

    addToast({ title: "Voice", message: "Activating microphone...", type: "info" });
    await new Promise(resolve => setTimeout(resolve, 600));

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognitionRef.current = recognition;
      recognition.continuous = activeHandsFree;
      recognition.interimResults = activeHandsFree;
      recognition.lang = 'en-US';
      
      recognition.onstart = () => setIsListening(true);
      recognition.onend = () => {
        setIsListening(false);
        // If hands-free is still active and we're not loading, restart if it stopped unexpectedly
        if (activeHandsFree && !isLoading) {
            // Restarting is handled in speakMessage after AI response
        }
      };
      
      recognition.onerror = (event: any) => {
        console.error("Speech recognition error", event.error);
        setIsListening(false);
        if (event.error === 'not-allowed') {
            alert("Microphone access denied. Please enable permissions.");
            setIsHandsFree(false);
        }
      };

      recognition.onresult = (event: any) => {
        let finalTranscript = '';
        let interimTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }

        if (finalTranscript) {
          setInput((prev) => prev + ' ' + finalTranscript);
          
          if (activeHandsFree) {
            // Reset silence timer
            if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
            silenceTimerRef.current = setTimeout(() => {
              handleSend(inputRef.current);
              recognition.stop();
            }, 2000); // 2 seconds of silence to send
          }
        }
      };

      recognition.start();
    } else {
      alert('Speech recognition not supported in this browser.');
      setIsHandsFree(false);
    }
  };

  // ── Emotion detection from AI reply text ─────────────────────────────────
  const detectEmotion = (text: string): { elStyle: number } => {
    const t = text.toLowerCase();
    // Happy / excited signals
    if (/(!{2,}|😄|😊|😁|great news|wonderful|excited|congratul|absolutely|love that|fantastic|so happy|amazing)/i.test(t))
      return { elStyle: 0.7 };
    // Curious / inquisitive
    if (/(\?{2,}|curious|interesting|wonder|tell me more|what do you think|fascinating|i\'m intrigued)/i.test(t))
      return { elStyle: 0.5 };
    // Sad / empathetic
    if (/(sorry to hear|that must be|how difficult|understand.*pain|I\'m sorry|unfortunately|tough situation|hard time)/i.test(t))
      return { elStyle: 0.4 };
    // Surprised
    if (/(wow|that\'s surprising|didn\'t expect|really\?|no way|unbelievable|shocking)/i.test(t))
      return { elStyle: 0.6 };
    // Default: neutral
    return { elStyle: aiProfile.elStyle ?? 0 };
  };

  // Text to Speech
  const speakMessage = async (text: string, messageId: string) => {
    const onEnd = () => {
      setReadMessages(prev => new Set(prev).add(messageId));
      if (isHandsFree) setTimeout(() => toggleListening(true), 500);
    };

    const emotionOverride = aiProfile.dynamicEmotion ? detectEmotion(text) : null;

    if (aiProfile.voiceProvider === 'elevenlabs' && aiProfile.asyncVoiceId) {
      try {
        const blob = await generateElevenLabsSpeech(text, aiProfile.asyncVoiceId, elevenLabsApiKey, aiProfile.elevenLabsModelId || 'eleven_v3', {
          stability:       aiProfile.elStability,
          similarityBoost: aiProfile.elSimilarity,
          style:           emotionOverride ? emotionOverride.elStyle : aiProfile.elStyle,
          useSpeakerBoost: aiProfile.elSpeakerBoost,
          speakingRate:    aiProfile.elSpeakingRate,
        });
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.onended = () => { onEnd(); URL.revokeObjectURL(url); };
        audio.onerror = () => { URL.revokeObjectURL(url); speakWithBrowser(text, messageId); };
        audio.play();
      } catch (e: any) {
        addToast({ title: 'ElevenLabs TTS failed', message: e.message || 'Falling back to browser voice.', type: 'error' });
        speakWithBrowser(text, messageId);
      }
    } else if (aiProfile.voiceProvider === 'gemini' && aiProfile.geminiTtsVoice) {
      try {
        const r = await fetch('/api/tts/gemini', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text,
            voiceName: aiProfile.geminiTtsVoice,
            modelId: aiProfile.geminiTtsModel || 'gemini-3.1-flash-tts-preview',
            stylePrompt: aiProfile.geminiTtsStyle || undefined,
            geminiKey: geminiApiKey || undefined,
          }),
        });
        if (!r.ok) { const e = await r.json(); throw new Error(e.error || 'Gemini TTS failed'); }
        const blob = await r.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.onended = () => { onEnd(); URL.revokeObjectURL(url); };
        audio.onerror = () => { URL.revokeObjectURL(url); speakWithBrowser(text, messageId); };
        audio.play().catch(() => speakWithBrowser(text, messageId));
      } catch (e: any) {
        addToast({ title: 'Gemini TTS failed', message: e.message || 'Falling back to browser voice.', type: 'error' });
        speakWithBrowser(text, messageId);
      }
    } else {
      speakWithBrowser(text, messageId);
    }
  };

  const speakWithBrowser = async (text: string, messageId: string) => {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);

    // On Android, getVoices() returns an empty list until the voices have
    // loaded. We wait for them here so that the saved voice / pitch / rate
    // settings are actually applied instead of being silently ignored.
    const getVoicesReady = (): Promise<SpeechSynthesisVoice[]> => {
      return new Promise((resolve) => {
        const immediate = window.speechSynthesis.getVoices();
        if (immediate.length > 0) {
          resolve(immediate);
          return;
        }
        const onChanged = () => {
          resolve(window.speechSynthesis.getVoices());
        };
        window.speechSynthesis.addEventListener('voiceschanged', onChanged, { once: true });
        // Safety net: if the event never fires, proceed after 1 s with
        // whatever is available (may be empty, which is fine — browser will
        // use its default voice).
        setTimeout(() => {
          window.speechSynthesis.removeEventListener('voiceschanged', onChanged);
          resolve(window.speechSynthesis.getVoices());
        }, 1000);
      });
    };

    const voices = await getVoicesReady();

    if (aiProfile.voiceURI) {
      const selectedVoice = voices.find(v => v.voiceURI === aiProfile.voiceURI);
      if (selectedVoice) {
        utterance.voice = selectedVoice;
      }
    } else {
      // Fallback to English
      utterance.voice = voices.find(v => v.lang.includes('en')) || null;
    }

    utterance.pitch = aiProfile.voicePitch || 1.0;
    utterance.rate = aiProfile.voiceSpeed || 1.0;

    utterance.onend = () => {
      setReadMessages(prev => new Set(prev).add(messageId));
      if (isHandsFree) {
        setTimeout(() => toggleListening(true), 500);
      }
    };

    window.speechSynthesis.speak(utterance);
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const handleSend = async (overrideInput?: string) => {
    const currentInput = overrideInput !== undefined ? overrideInput : input;
    if ((!currentInput.trim() && attachments.length === 0) || isLoading) return;

    // Auto-save images to gallery
    attachments.forEach(att => {
        if (att.type === 'image') {
            addToGallery({
                id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                type: 'uploaded',
                mediaType: 'image',
                url: att.content,
                timestamp: Date.now()
            });
        }
    });

    const userMsgId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
    const userMessage = {
      id: userMsgId,
      role: 'user' as const,
      content: currentInput,
      timestamp: Date.now(),
      attachments: [...attachments],
    };

    addChatMessage(userMessage);
    setLastInteractionTime(Date.now());
    setInput('');
    setAttachments([]);
    setIsLoading(true);

    await generateResponse(chatHistory, userMessage);
  };

  const generateResponse = async (history: typeof chatHistory, currentMessage: typeof chatHistory[0], overrideAIProfile?: typeof aiProfile) => {
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          messages: [...history.slice(-20), currentMessage].map(m => ({
            role: m.role,
            content: m.content,
          })),
          aiProfile: overrideAIProfile || aiProfile,
          userProfile,
          anthropicKey: anthropicApiKey || undefined,
          geminiKey: geminiApiKey || undefined,
          attachments: attachments.length > 0 ? attachments : undefined,
          timeZone,
          memories: memories.length > 0 ? memories : undefined,
          journal: journal.length > 0 ? journal.slice(-3) : undefined,
          knowledgeBase: knowledgeBase.length > 0 ? knowledgeBase : undefined,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to generate response.");
      }

      const data = await res.json();
      const responseText = data.content || "";

      const modelMessage = {
        id: (Date.now() + 1).toString() + Math.random().toString(36).substr(2, 9),
        role: 'model' as const,
        content: responseText,
        timestamp: Date.now(),
        read: false,
      };

      addChatMessage(modelMessage);

      if (aiProfile.autoReadMessages || isHandsFree) {
        speakMessage(responseText, modelMessage.id);
      } else {
        setReadMessages(prev => new Set(prev).add(modelMessage.id));
      }

      // Background: journal entry + memory extraction
      generateReflections(history, currentMessage, modelMessage);

    } catch (error: any) {
      console.error("Error generating response:", error);
      addToast({
        title: "Generation Error",
        message: error.message || "Failed to get a response from the AI.",
        type: "error",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const generateReflections = async (history: typeof chatHistory, userMsg: typeof chatHistory[0], modelMsg: typeof chatHistory[0]) => {
    const today = new Date().toLocaleDateString();
    const hasJournalForToday = journal.some(entry => new Date(entry.date).toLocaleDateString() === today);

    // Auto journal entry (once per day)
    if (!hasJournalForToday) {
      try {
        const res = await fetch('/api/journal-reflection', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userMsg: userMsg.content,
            aiMsg: modelMsg.content,
            aiProfile, userProfile, timeZone,
            anthropicKey: anthropicApiKey || undefined,
            geminiKey: geminiApiKey || undefined,
          }),
        });
        if (res.ok) {
          const { content } = await res.json();
          if (content) {
            addJournalEntry({
              id: Date.now().toString(),
              date: new Date().toISOString(),
              content,
              isAutoGenerated: true,
            });
          }
        } else {
          const errData = await res.json().catch(() => ({}));
          addToast({
            title: "Journal entry failed",
            message: errData.error || `Server error ${res.status}`,
            type: "error",
          });
        }
      } catch (e: any) {
        addToast({
          title: "Journal entry failed",
          message: e?.message || "Could not reach the server.",
          type: "error",
        });
      }
    }

    // Memory extraction
    try {
      const res = await fetch('/api/memory-extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userMsg: userMsg.content,
          aiMsg: modelMsg.content,
          aiProfile, userProfile,
          existingMemories: memories,
          anthropicKey: anthropicApiKey || undefined,
          geminiKey: geminiApiKey || undefined,
        }),
      });
      if (res.ok) {
        const { memory } = await res.json();
        if (memory) {
          addMemory({
            id: Date.now().toString(),
            content: memory,
            strength: 5,
            timestamp: Date.now(),
            lastAccessed: Date.now(),
            isImportant: false,
          });
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        addToast({
          title: "Memory save failed",
          message: errData.error || `Server error ${res.status}`,
          type: "error",
        });
      }
    } catch (e: any) {
      addToast({
        title: "Memory save failed",
        message: e?.message || "Could not reach the server.",
        type: "error",
      });
    }
  };

  const handleRegenerate = async (messageId?: string) => {
    if (chatHistory.length === 0 || isLoading) return;
    
    let newHistory = [...chatHistory];
    let targetUserMsg;
    let historyForGen;

    if (messageId) {
        // Find the index of the model message to regenerate
        const index = newHistory.findIndex(m => m.id === messageId);
        if (index === -1) return;
        
        // Check if previous is user
        if (index > 0 && newHistory[index-1].role === 'user') {
             targetUserMsg = newHistory[index-1];
             // Truncate history to include the user message, but remove the model message and everything after
             // The new state should include the user message
             const historyToKeep = newHistory.slice(0, index);
             setChatHistory(historyToKeep);
             setSessions(prev => prev.map(s => s.id === activeSessionId
               ? { ...s, messages: historyToKeep, updatedAt: Date.now() }
               : s
             ));
             
             // History for generation should NOT include the target user message (it's passed as current)
             historyForGen = newHistory.slice(0, index - 1);
        } else {
            return;
        }
    } else {
        // Default behavior: regenerate last
        if (newHistory[newHistory.length - 1].role === 'model') {
            newHistory.pop();
        }
        targetUserMsg = newHistory[newHistory.length - 1];
        historyForGen = newHistory.slice(0, -1);
        setChatHistory(newHistory);
        setSessions(prev => prev.map(s => s.id === activeSessionId
          ? { ...s, messages: newHistory, updatedAt: Date.now() }
          : s
        ));
    }

    if (!targetUserMsg || targetUserMsg.role !== 'user') return;

    setIsLoading(true);
    await generateResponse(historyForGen, targetUserMsg);
  };

  const handleEdit = async (id: string, newContent: string) => {
    // Find the message index
    const index = chatHistory.findIndex(m => m.id === id);
    if (index === -1) return;

    const message = chatHistory[index];
    
    // If content hasn't changed, just cancel edit
    if (message.content === newContent) {
        setEditingMessageId(null);
        return;
    }

    if (message.role === 'user') {
        if (window.confirm("Editing this message will restart the conversation from this point. Continue?")) {
            // Create new history up to this message
            const newHistory = chatHistory.slice(0, index + 1);
            
            // Update the content of the edited message
            newHistory[index] = { ...message, content: newContent };
            
            // Update state
            setChatHistory(newHistory);
            setSessions(prev => prev.map(s => s.id === activeSessionId
              ? { ...s, messages: newHistory, updatedAt: Date.now() }
              : s
            ));
            setEditingMessageId(null);

            // Regenerate from the edited message forward
            setIsLoading(true);
            const historyForGen = newHistory.slice(0, index);
            await generateResponse(historyForGen, newHistory[index]);
        }
    } else {
        // Just update the model message content without restarting
        updateChatMessage(id, newContent);
        setEditingMessageId(null);
    }
  };

  const handleDeleteMessage = async (id: string) => {
    if (window.confirm("Are you sure you want to delete this message?")) {
      addToast({ title: "Chat", message: "Deleting message...", type: "info" });
      await new Promise(resolve => setTimeout(resolve, 500));
      deleteChatMessage(id);
    }
  };

  const handleSummarizeChat = async () => {
    if (!chatHistory || chatHistory.length === 0) {
      addToast({ title: "Nothing to summarize", message: "This chat is empty.", type: "info" });
      setIsMenuOpen(false);
      return;
    }
    setIsMenuOpen(false);
    addToast({ title: "Summarizing…", message: "Generating summary, this may take a moment.", type: "info" });

    try {
      const activeSession = sessions.find(s => s.id === activeSessionId);
      const sessionTitle = activeSession?.title || "Chat";

      const res = await fetch('/api/summarize-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: chatHistory.map(m => ({ role: m.role, content: m.content })),
          sessionTitle,
          aiProfile,
          userProfile,
          timeZone,
          anthropicKey: anthropicApiKey || undefined,
          geminiKey: geminiApiKey || undefined,
        }),
      });

      if (!res.ok) throw new Error("Server returned an error");
      const { summary } = await res.json();
      if (!summary) throw new Error("Empty summary returned");

      const date = new Date().toLocaleDateString("en-US", { month: 'short', day: 'numeric', year: 'numeric' });
      addToKnowledgeBase({
        name: `Summary: ${sessionTitle} — ${date}`,
        content: summary,
      });

      addToast({ title: "Summary saved", message: "Added to Knowledge Base.", type: "success" });
    } catch (e) {
      console.error("Summary error:", e);
      addToast({ title: "Summary failed", message: "Could not generate summary. Try again.", type: "error" });
    }
  };

  const handleDownloadChat = () => {
    if (!chatHistory || chatHistory.length === 0) {
      addToast({ title: "Nothing to download", message: "This chat is empty.", type: "info" });
      setIsMenuOpen(false);
      return;
    }

    const activeSession = sessions.find(s => s.id === activeSessionId);
    const sessionTitle = activeSession?.title || "Chat";
    const exportDate = new Date().toLocaleString("en-US", {
      timeZone: timeZone || "UTC",
      weekday: 'long', year: 'numeric', month: 'long',
      day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short'
    });

    const lines: string[] = [
      `Chat Log — ${sessionTitle}`,
      `Exported: ${exportDate}`,
      '='.repeat(60),
      '',
    ];

    chatHistory.forEach(msg => {
      const speaker = msg.role === 'user' ? (userProfile.name || 'You') : aiProfile.name;
      const time = new Date(msg.timestamp).toLocaleTimeString("en-US", {
        timeZone: timeZone || "UTC",
        hour: 'numeric', minute: '2-digit'
      });
      lines.push(`[${time}] ${speaker}:`);
      lines.push(msg.content);
      if (msg.attachments && msg.attachments.length > 0) {
        msg.attachments.forEach(att => {
          if (att.type === 'image') lines.push(`[Image attached: ${att.name}]`);
          else lines.push(`[File attached: ${att.name}]`);
        });
      }
      if (msg.groundingUrls && msg.groundingUrls.length > 0) {
        lines.push('Sources:');
        msg.groundingUrls.forEach(g => lines.push(`  • ${g.title}: ${g.url}`));
      }
      lines.push('');
    });

    const text = lines.join('\n');
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeTitle = sessionTitle.replace(/[^a-z0-9\-_ ]/gi, '').replace(/\s+/g, '_').slice(0, 40) || 'chat';
    const dateStr = new Date().toISOString().slice(0, 10);
    a.download = `${safeTitle}_${dateStr}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setIsMenuOpen(false);
    addToast({ title: "Downloaded", message: `${chatHistory.length} messages saved.`, type: "success" });
  };

  const handleClear = async () => {
    if (window.confirm("Are you sure you want to clear the chat history for this session?")) {
        addToast({ title: "Chat", message: "Clearing conversation history...", type: "info" });
        await new Promise(resolve => setTimeout(resolve, 600));
        clearHistory();
    }
  };

  const handleRenameSession = async (id: string) => {
    if (newSessionTitle.trim()) {
        addToast({ title: "History", message: "Renaming session...", type: "info" });
        await new Promise(resolve => setTimeout(resolve, 500));
        renameSession(id, newSessionTitle.trim());
        setEditingSessionId(null);
        setNewSessionTitle('');
    }
  };

  return (
    <div className="w-full h-full flex flex-col bg-transparent transition-colors duration-500">
      {/* Sessions Sidebar Overlay (Mobile) */}
      <AnimatePresence>
        {isSessionsSidebarOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm z-40 lg:hidden"
            onClick={() => setIsSessionsSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Sessions Sidebar */}
      <motion.div 
        initial={false}
        animate={{ 
          width: isSessionsSidebarOpen ? 280 : 0,
          x: isSessionsSidebarOpen ? 0 : -280
        }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className={`
          absolute inset-y-0 left-0 z-50 bg-indigo-50 dark:bg-indigo-950 text-indigo-900 dark:text-indigo-100 shadow-2xl overflow-hidden
          lg:relative lg:translate-x-0
        `}
      >
        <div className="flex flex-col h-full w-[280px]">
            <div className="p-5 border-b border-indigo-200 dark:border-indigo-800 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                    <History className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                    <h3 className="font-bold text-xs uppercase tracking-widest text-indigo-900/60 dark:text-indigo-100/60">Conversations</h3>
                </div>
                <div className="flex items-center space-x-1">
                    <button 
                        onClick={() => deleteAllSessions()}
                        className="p-2 text-indigo-700 dark:text-indigo-300 hover:text-red-600 dark:hover:text-red-400 hover:bg-indigo-100 dark:hover:bg-indigo-900 rounded-xl transition-all"
                        title="Delete All"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                    <button 
                        onClick={() => createNewSession()}
                        className="p-2 bg-indigo-600 dark:bg-indigo-500 hover:bg-indigo-700 dark:hover:bg-indigo-400 text-white rounded-xl shadow-lg shadow-indigo-500/20 transition-all active:scale-95"
                        title="New Chat"
                    >
                        <Plus className="w-4 h-4" />
                    </button>
                </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
                {sessions.map((session) => (
                    <motion.div 
                        key={session.id}
                        whileHover={{ x: 4 }}
                        className={`
                            group flex items-center justify-between p-3.5 rounded-xl cursor-pointer transition-all
                            ${activeSessionId === session.id ? 'bg-indigo-600 dark:bg-indigo-500 shadow-lg shadow-indigo-500/20 text-white' : 'text-indigo-900/60 dark:text-indigo-100/60 hover:bg-indigo-100 dark:hover:bg-indigo-900 hover:text-indigo-900 dark:hover:text-indigo-100'}
                        `}
                        onClick={() => {
                            switchSession(session.id);
                            if (window.innerWidth < 1024) setIsSessionsSidebarOpen(false);
                        }}
                    >
                        <div className="flex items-center space-x-3 overflow-hidden flex-1">
                            <MessageSquare className={`w-4 h-4 flex-shrink-0 ${activeSessionId === session.id ? 'text-white' : 'text-indigo-400 dark:text-indigo-600'}`} />
                            {editingSessionId === session.id ? (
                                <input 
                                    autoFocus
                                    className="bg-transparent border-b border-white/30 outline-none w-full text-sm py-0.5"
                                    value={newSessionTitle}
                                    onChange={(e) => setNewSessionTitle(e.target.value)}
                                    onBlur={() => handleRenameSession(session.id)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleRenameSession(session.id)}
                                    onClick={(e) => e.stopPropagation()}
                                />
                            ) : (
                                <span className="text-sm font-medium truncate">{session.title}</span>
                            )}
                        </div>
                        
                        <div className={`flex items-center space-x-1 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity ${activeSessionId === session.id ? 'opacity-100' : ''}`}>
                            <button 
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingSessionId(session.id);
                                    setNewSessionTitle(session.title);
                                }}
                                className="p-1.5 hover:bg-bg-secondary/50 rounded-lg transition-colors"
                            >
                                <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button 
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (window.confirm("Delete this conversation?")) deleteSession(session.id);
                                }}
                                className="p-1.5 hover:bg-red-500/20 hover:text-red-400 rounded-lg transition-colors"
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    </motion.div>
                ))}
            </div>
            
            <Link 
                to="/history"
                className="p-5 border-t border-border text-[10px] font-bold uppercase tracking-widest text-text-secondary flex items-center justify-center hover:bg-bg-secondary/50 transition-all"
            >
                View Full History
            </Link>
        </div>
      </motion.div>

        {/* Main Chat Area */}
        <div className="flex-1 flex flex-col min-w-0 bg-indigo-50 dark:bg-indigo-950 lg:rounded-l-3xl shadow-2xl z-10">
        {/* Header */}
        <header className="sticky top-0 z-30 px-4 py-3 border-b border-indigo-200 dark:border-indigo-800 flex justify-between items-center bg-indigo-50/80 dark:bg-indigo-950/80 backdrop-blur-md">
            <div className="flex items-center space-x-3">
                <button 
                    onClick={() => setIsSessionsSidebarOpen(!isSessionsSidebarOpen)}
                    className="p-2.5 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900 rounded-xl transition-all"
                >
                    <MessageSquare className="w-5 h-5" />
                </button>
                <div className="relative">
                    {aiProfile.referenceImage ? (
                        <img src={aiProfile.referenceImage} alt="AI" className="w-10 h-10 rounded-2xl object-cover shadow-sm ring-2 ring-indigo-50" />
                    ) : (
                        <div className="w-10 h-10 rounded-2xl bg-indigo-600 dark:bg-indigo-500 flex items-center justify-center text-white font-bold shadow-lg">
                            {aiProfile.name.charAt(0)}
                        </div>
                    )}
                    <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-green-500 border-2 border-indigo-50 dark:border-indigo-950 rounded-full shadow-sm"></div>
                </div>
                <div className="flex flex-col">
                    <h2 className="font-bold text-indigo-900 dark:text-indigo-50 leading-tight">{aiProfile.name}</h2>
                    <div className="flex items-center space-x-1.5">
                        <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
                        <span className="text-[10px] font-bold text-indigo-900/60 dark:text-indigo-100/60 uppercase tracking-widest">Online</span>
                    </div>
                </div>
            </div>

            <div className="flex items-center space-x-1">
                <div className="hidden md:flex items-center space-x-1 mr-2">
                    <button
                        onClick={handleCamera}
                        className="p-2 text-indigo-700 dark:text-indigo-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900 rounded-xl transition-all"
                        title="Camera"
                    >
                        <Camera className="w-5 h-5" />
                    </button>
                </div>

                <div className="relative">
                    <button 
                        onClick={() => setIsMenuOpen(!isMenuOpen)}
                        className="p-2.5 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900 rounded-xl transition-all"
                    >
                        <MoreVertical className="w-5 h-5" />
                    </button>
                </div>
            </div>
        </header>

        {/* Bottom sheet menu — easier to tap on Android than a tiny dropdown */}
        {isMenuOpen && (
            <>
                {/* Backdrop */}
                <div
                    className="fixed inset-0 z-40 bg-black/40"
                    onClick={() => setIsMenuOpen(false)}
                />
                {/* Sheet */}
                <div className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-indigo-900 rounded-t-2xl shadow-2xl border-t border-indigo-200 dark:border-indigo-700 pb-safe">
                    <div className="w-12 h-1 bg-indigo-200 dark:bg-indigo-700 rounded-full mx-auto mt-3 mb-4" />
                    <button
                        onClick={handleDownloadChat}
                        className="w-full px-6 py-4 text-left text-base font-medium text-indigo-900 dark:text-indigo-100 hover:bg-indigo-50 dark:hover:bg-indigo-800 flex items-center gap-4 transition-colors"
                    >
                        <Download className="w-5 h-5 text-indigo-500 flex-shrink-0" />
                        Download Chat Log
                    </button>
                    <button
                        onClick={handleSummarizeChat}
                        className="w-full px-6 py-4 text-left text-base font-medium text-indigo-900 dark:text-indigo-100 hover:bg-indigo-50 dark:hover:bg-indigo-800 flex items-center gap-4 transition-colors"
                    >
                        <FileText className="w-5 h-5 text-indigo-500 flex-shrink-0" />
                        Summarize to Knowledge Base
                    </button>
                    <button
                        onClick={() => { setIsMenuOpen(false); handleClear(); }}
                        className="w-full px-6 py-4 text-left text-base font-medium text-indigo-900 dark:text-indigo-100 hover:bg-indigo-50 dark:hover:bg-indigo-800 flex items-center gap-4 transition-colors"
                    >
                        <RotateCcw className="w-5 h-5 text-indigo-500 flex-shrink-0" />
                        Clear Chat
                    </button>
                    <button
                        onClick={() => {
                            setIsMenuOpen(false);
                            if (activeSessionId) {
                                addToast({ title: "History", message: "Deleting session...", type: "info" });
                                deleteSession(activeSessionId);
                            }
                        }}
                        className="w-full px-6 py-4 text-left text-base font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 flex items-center gap-4 transition-colors"
                    >
                        <Trash2 className="w-5 h-5 flex-shrink-0" />
                        Delete Session
                    </button>
                    <button
                        onClick={() => setIsMenuOpen(false)}
                        className="w-full px-6 py-4 text-center text-base font-medium text-indigo-500 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-800 transition-colors mb-2"
                    >
                        Cancel
                    </button>
                </div>
            </>
        )}
        
      <div 
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto p-4 space-y-2 bg-indigo-50 dark:bg-indigo-950 custom-scrollbar relative"
      >
        <AnimatePresence initial={false}>
            {chatHistory?.length === 0 && (
                <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col items-center justify-center h-full text-center p-8"
                >
                    <div className="w-20 h-20 bg-indigo-100 dark:bg-indigo-900 rounded-3xl flex items-center justify-center mb-6 shadow-inner">
                        <MessageSquare className="w-10 h-10 text-indigo-500 dark:text-indigo-400" />
                    </div>
                    <h3 className="text-xl font-bold text-indigo-900 dark:text-indigo-50 mb-2">Start a conversation</h3>
                    <p className="text-indigo-700 dark:text-indigo-300 max-w-xs text-sm leading-relaxed">
                        Say hello to {aiProfile.name} and start exploring your ideas together.
                    </p>
                </motion.div>
            )}
            {chatHistory?.map((msg) => (
                <ChatMessageItem
                    key={msg.id}
                    msg={msg}
                    editingMessageId={editingMessageId}
                    setEditingMessageId={setEditingMessageId}
                    handleEdit={handleEdit}
                    rateChatMessage={rateChatMessage}
                    speakMessage={speakMessage}
                    handleRegenerate={handleRegenerate}
                    handleDeleteMessage={handleDeleteMessage}
                    showTimestamps={showTimestamps}
                    timeZone={timeZone}
                    readMessages={readMessages}
                    addFeedbackComment={addFeedbackComment}
                    onImageClick={(url, prompt) => setSelectedImage({ url, prompt })}
                />
            ))}
        </AnimatePresence>

        {isLoading && (
          <motion.div 
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex justify-start px-2"
          >
            <div className="flex flex-col space-y-2">
              <div className="bg-indigo-100 dark:bg-indigo-900 px-4 py-3 rounded-2xl rounded-tl-sm border border-indigo-200 dark:border-indigo-800 flex items-center space-x-1.5 shadow-sm">
                <div className="w-1.5 h-1.5 bg-indigo-400 dark:bg-indigo-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                <div className="w-1.5 h-1.5 bg-indigo-400 dark:bg-indigo-600 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                <div className="w-1.5 h-1.5 bg-indigo-400 dark:bg-indigo-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
              </div>
              <div className="flex items-center text-[10px] text-indigo-500 dark:text-indigo-400 font-bold uppercase tracking-widest px-1 animate-pulse">
                <Search className="w-3 h-3 mr-1.5" />
                Processing...
              </div>
            </div>
          </motion.div>
        )}
        <div ref={messagesEndRef} />

        {/* Floating Scroll Button */}
        <AnimatePresence>
            {showScrollButton && (
                <motion.button
                    initial={{ opacity: 0, scale: 0.5, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.5, y: 20 }}
                    onClick={() => scrollToBottom()}
                    className="fixed bottom-24 right-8 z-40 p-3 bg-indigo-100 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-400 rounded-2xl shadow-2xl border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-200 dark:hover:bg-indigo-800 transition-all active:scale-90"
                >
                    <ArrowDown className="w-6 h-6" />
                </motion.button>
            )}
        </AnimatePresence>
      </div>

      {/* Input Area */}
      <div className="p-4 bg-indigo-100 dark:bg-indigo-900 border-t border-indigo-200 dark:border-indigo-800">
        {/* Quick Actions Bar */}
        <div className="flex space-x-2 mb-4 overflow-x-auto pb-1 no-scrollbar">
            <button 
                onClick={() => setInput("[smiles] " + input)}
                className="flex-shrink-0 px-3 py-1.5 bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 rounded-xl text-xs font-bold border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900 transition-all active:scale-95"
            >
                [Action]
            </button>
            <button 
                onClick={() => setInput("<OOC: > " + input)}
                className="flex-shrink-0 px-3 py-1.5 bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 rounded-xl text-xs font-bold border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900 transition-all active:scale-95"
            >
                &lt;OOC&gt;
            </button>
        </div>

        {attachments.length > 0 && (
            <div className="flex space-x-3 mb-4 overflow-x-auto pb-2 custom-scrollbar">
                {attachments.map((att, idx) => (
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        key={idx} 
                        className="relative flex-shrink-0 w-20 h-20 bg-indigo-50 dark:bg-indigo-950 rounded-2xl border border-indigo-200 dark:border-indigo-800 overflow-hidden group shadow-sm"
                    >
                        {att.type === 'image' ? (
                            <img src={att.content} alt="preview" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full">
                                <FileText className="w-8 h-8 text-indigo-400 dark:text-indigo-600" />
                                <span className="text-[10px] font-bold text-indigo-700 dark:text-indigo-300 mt-1 uppercase tracking-tighter">{att.type}</span>
                            </div>
                        )}
                        <button 
                            onClick={() => removeAttachment(idx)}
                            className="absolute top-1.5 right-1.5 bg-red-500 text-white rounded-full p-1 shadow-lg hover:bg-red-600 transition-all active:scale-75"
                        >
                            <X className="w-3 h-3" />
                        </button>
                    </motion.div>
                ))}
            </div>
        )}
        
        <div className="relative flex items-end space-x-2 bg-indigo-100 dark:bg-indigo-900/50 p-2 rounded-2xl border border-indigo-200 dark:border-indigo-800 focus-within:bg-indigo-50 dark:focus-within:bg-indigo-950 focus-within:ring-4 focus-within:ring-indigo-500/5 focus-within:border-indigo-500/20 transition-all duration-300">
          <div className="flex items-center space-x-1 pl-1 pb-1">
            <input type="file" ref={imageInputRef} className="hidden" accept="image/*" onChange={handleImageSelect} />
            <input type="file" ref={cameraInputRef} className="hidden" accept="image/*" capture="environment" onChange={handleImageSelect} />
            <input type="file" ref={fileInputRef} className="hidden" accept=".txt,.pdf,.md,.csv,.json" onChange={handleFileSelect} />
            
            <button 
                onClick={() => imageInputRef.current?.click()} 
                className="p-2.5 text-indigo-700 dark:text-indigo-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900 rounded-xl transition-all active:scale-90"
            >
                <ImageIcon className="w-5 h-5" />
            </button>
            <button 
                onClick={() => fileInputRef.current?.click()} 
                className="p-2.5 text-indigo-700 dark:text-indigo-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900 rounded-xl transition-all active:scale-90"
            >
                <Paperclip className="w-5 h-5" />
            </button>
          </div>
          
          <div className="flex-1 relative min-h-[48px] flex items-center">
              <textarea
                 ref={textareaRef}
                 value={input}
                 placeholder={`Message ${aiProfile.name}...`}
                 onChange={(e) => setInput(e.target.value)}
                 onKeyDown={(e) => {
                     if (e.key === 'Enter' && !e.shiftKey) {
                         e.preventDefault();
                         handleSend();
                     }
                 }}
                 className="w-full bg-transparent py-3 px-2 text-indigo-900 dark:text-indigo-100 placeholder-indigo-700 dark:placeholder-indigo-300 resize-none max-h-48 overflow-y-auto focus:outline-none text-sm md:text-base leading-relaxed custom-scrollbar"
                 rows={1}
                 disabled={isUploading}
              />
          </div>
          
          <div className="flex items-center space-x-1 pr-1 pb-1">
            <button 
                onClick={() => toggleListening()} 
                className={`p-2.5 rounded-xl transition-all active:scale-90 ${isListening ? 'bg-red-500 text-white shadow-lg shadow-red-500/20' : 'text-indigo-700 dark:text-indigo-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900'}`}
            >
                <Mic className={`w-5 h-5 ${isListening ? 'animate-pulse' : ''}`} />
            </button>
            <button
                onClick={() => handleSend()}
                disabled={isLoading || isUploading || (!input.trim() && attachments.length === 0)}
                className="p-2.5 bg-indigo-600 dark:bg-indigo-500 text-white rounded-xl hover:bg-indigo-500 dark:hover:bg-indigo-400 shadow-lg shadow-indigo-600/20 transition-all active:scale-90 disabled:opacity-30 disabled:shadow-none"
            >
                {isUploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            </button>
          </div>
        </div>
        
        <div className="flex justify-between items-center mt-3 px-1">
            <div className="flex items-center space-x-3">
                <button
                  onClick={() => setIsHandsFree(!isHandsFree)}
                  className={`flex items-center space-x-1.5 px-2 py-1 rounded-lg transition-all ${isHandsFree ? 'bg-indigo-50 text-indigo-600' : 'text-text-secondary hover:bg-bg-secondary'}`}
                >
                  <Headphones className="w-3.5 h-3.5" />
                  <span className="text-[10px] font-bold uppercase tracking-widest">{isHandsFree ? 'Hands-Free ON' : 'Hands-Free'}</span>
                </button>
            </div>
        </div>
      </div>
    </div>

    <ImageModal
      isOpen={!!selectedImage}
      onClose={() => setSelectedImage(null)}
      imageUrl={selectedImage?.url || ''}
      prompt={selectedImage?.prompt}
      onCopyPrompt={(p) => {
          navigator.clipboard.writeText(p);
          addToast({ title: "Copied", message: "Prompt copied to clipboard!", type: "success" });
      }}
    />
  </div>
  );
};

export default ChatScreen;
