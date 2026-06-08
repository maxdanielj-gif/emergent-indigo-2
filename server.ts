import express from "express";
import cors from "cors";
import compression from "compression";
import { createServer as createViteServer } from "vite";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import zlib from "zlib";
import { fileURLToPath } from "url";
import { Readable } from "stream";
import Anthropic from "@anthropic-ai/sdk";
import webpush from "web-push";
dotenv.config();

// ── Global error handlers ─────────────────────────────────────────────────────
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});
process.on("uncaughtException", (error: any) => {
  if (error.code === "EPIPE") return;
  console.error("Uncaught Exception:", error);
});

console.log(`Server starting in ${process.env.NODE_ENV || "development"} mode`);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Helpers ───────────────────────────────────────────────────────────────────
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const retry = async <T>(fn: () => Promise<T>, retries = 5, delay = 2000): Promise<T> => {
  try {
    return await fn();
  } catch (error: any) {
    console.error("API error:", JSON.stringify(error, Object.getOwnPropertyNames(error)));
    const isRateLimited =
      error.status === 529 ||
      error.status === 529 ||
      error.status === 429 ||
      error.message?.includes("429") ||
      error.message?.includes("overloaded") ||
      error.message?.includes("rate");
    if (retries > 0 && isRateLimited) {
      const jitter = Math.random() * 1000;
      const nextDelay = delay + jitter;
      console.warn(`Rate limited, retrying in ${Math.round(nextDelay)}ms... (${retries} left)`);
      await sleep(nextDelay);
      return retry(fn, retries - 1, delay * 1.5);
    }
    throw error;
  }
};

// ── Claude client helper ──────────────────────────────────────────────────────
function getAnthropicClient(clientKey?: string): Anthropic {
  const key = clientKey || process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error(
      "Anthropic API key not configured. Add ANTHROPIC_API_KEY to your Render environment variables, or enter your own key in Settings."
    );
  }
  return new Anthropic({ apiKey: key });
}

// ── Claude model validation ───────────────────────────────────────────────────
const CLAUDE_MODELS = ["claude-opus-4-6", "claude-sonnet-4-6", "claude-haiku-4-5-20251001"];
function validateClaudeModel(model?: string): string {
  if (model && CLAUDE_MODELS.includes(model)) return model;
  return "claude-sonnet-4-6"; // sensible default
}

// ── Gemini client helper ──────────────────────────────────────────────────────
const GEMINI_MODELS = ["gemini-2.0-flash", "gemini-1.5-pro", "gemini-1.5-flash"];
function isGeminiModel(model?: string): boolean {
  return !!model && (model.startsWith("gemini-") || GEMINI_MODELS.includes(model));
}

async function callGeminiChat(
  systemPrompt: string,
  messages: any[],
  model: string,
  temperature: number,
  geminiKey?: string
): Promise<string> {
  const apiKey = geminiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Gemini API key not configured. Add GEMINI_API_KEY to Render env vars or enter it in Settings.");

  // Build Gemini contents array (user/model alternating)
  const contents = messages.map((m: any) => ({
    role: m.role === "model" ? "model" : "user",
    parts: [{ text: typeof m.content === "string" ? m.content : JSON.stringify(m.content) }],
  }));

  const body: any = {
    contents,
    generationConfig: { temperature: temperature ?? 0.7, maxOutputTokens: 2048 },
  };
  // Only include system_instruction when there's actual content —
  // Gemini rejects requests with an empty system_instruction object.
  if (systemPrompt) {
    body.system_instruction = { parts: [{ text: systemPrompt }] };
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini error (${res.status}): ${err}`);
  }

  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

// ── Knowledge base relevance injection ───────────────────────────────────────
const STOP_WORDS = new Set([
  "the","a","an","and","or","but","in","on","at","to","for","of","with","by",
  "from","is","are","was","were","be","been","have","has","had","do","does",
  "did","will","would","could","should","may","might","can","not","this","that",
  "these","those","what","which","who","when","where","why","how","all","some",
  "any","just","about","more","also","than","then","very","so","if","as","i",
  "you","he","she","it","we","they","me","him","her","us","them","my","your",
  "his","its","our","their","there","here","up","out","into","over","after",
]);

function extractKeywords(text: string): string[] {
  return text.toLowerCase().split(/\W+/).filter(w => w.length > 3 && !STOP_WORDS.has(w));
}

function getRelevantExcerpt(content: string, keywords: string[], maxLength: number): string {
  if (keywords.length === 0) {
    // No keywords — show the end of the document (most recent content for chat logs)
    if (content.length <= maxLength) return content;
    return "…" + content.slice(-maxLength);
  }
  // Find the position of the first keyword match
  const lower = content.toLowerCase();
  let bestPos = -1;
  for (const kw of keywords) {
    const pos = lower.indexOf(kw);
    if (pos !== -1 && (bestPos === -1 || pos < bestPos)) bestPos = pos;
  }
  if (bestPos === -1) {
    // Keywords not found — show most recent section
    if (content.length <= maxLength) return content;
    return "…" + content.slice(-maxLength);
  }
  // Show context window around the match
  const start = Math.max(0, bestPos - 150);
  const end = Math.min(content.length, start + maxLength);
  return (start > 0 ? "…" : "") + content.slice(start, end) + (end < content.length ? "…" : "");
}

function buildKBContext(knowledgeBase: any[], currentUserMessage: string): string {
  if (!knowledgeBase || knowledgeBase.length === 0) return "";

  const keywords = extractKeywords(currentUserMessage || "");
  const MAX_TOTAL_CHARS = 4000;
  const MAX_DOCS = 6;

  // Score each document by keyword match count
  const scored = knowledgeBase.map(doc => ({
    ...doc,
    score: keywords.filter(kw => (doc.content || "").toLowerCase().includes(kw)).length,
  }));

  // Sort: highest relevance score first; for ties, smaller docs first
  scored.sort((a, b) => b.score - a.score || a.content.length - b.content.length);

  const included: string[] = [];
  const tooLargeToShow: string[] = [];
  let totalChars = 0;

  for (const doc of scored.slice(0, MAX_DOCS)) {
    if (totalChars >= MAX_TOTAL_CHARS) {
      tooLargeToShow.push(doc.name);
      continue;
    }
    const remaining = MAX_TOTAL_CHARS - totalChars;
    if (doc.content.length <= remaining) {
      included.push(`[Document: "${doc.name}"]\n${doc.content}`);
      totalChars += doc.content.length;
    } else {
      // Document is larger than available space — show relevant excerpt
      const excerpt = getRelevantExcerpt(doc.content, keywords, remaining - 60);
      included.push(`[Document: "${doc.name}" — excerpt of ${doc.content.length.toLocaleString()} total characters]\n${excerpt}`);
      totalChars += excerpt.length;
    }
  }

  // List names of any documents that didn't fit so the AI knows they exist
  const overflow = scored.slice(MAX_DOCS).map(d => d.name);
  const allNotShown = [...tooLargeToShow, ...overflow];

  let result = "\n\nKnowledge base documents:\n" + included.join("\n\n");
  if (allNotShown.length > 0) {
    result += `\n\n[Additional documents stored but not shown: ${allNotShown.map(n => `"${n}"`).join(", ")}]`;
  }
  return result;
}

// ── Build persona system prompt ───────────────────────────────────────────────
function buildSystemPrompt(aiProfile: any, userProfile: any, timeZone?: string, memories?: any[], journal?: any[], knowledgeBase?: any[], currentUserMessage?: string): string {
  const now = new Date();
  const timeContext = aiProfile.timeAwareness
    ? `\n\nCurrent time: ${now.toLocaleString("en-US", { timeZone: timeZone || "UTC", weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })}`
    : "";

  const lengthGuidance =
    aiProfile.responseLength === "short"
      ? "\n\nKeep responses brief — 1 to 3 sentences."
      : aiProfile.responseLength === "long"
      ? "\n\nWrite detailed, thorough responses."
      : aiProfile.responseLength === "custom"
      ? `${aiProfile.customParagraphCount ? `\n\nAim for ${aiProfile.customParagraphCount} paragraphs.` : ""}${aiProfile.customWordCount ? `\n\nAim for ${aiProfile.customWordCount} words.` : ""}`
      : "";

  const toneGuidance = aiProfile.responseTone ? `\n\nUse a ${aiProfile.responseTone} tone.` : "";
  const personaGuidance = !aiProfile.knowsItsAI
    ? `\n\nNever refer to yourself as an AI, language model, or collection of code. Speak entirely as ${aiProfile.name}.`
    : "";
  const textOnlyGuidance = aiProfile.textOnlyMode
    ? `\n\nIMPORTANT: Respond with plain spoken words only. Do NOT use asterisks for actions or emotes (e.g. do not write *smiles* or *leans forward*). If you want to convey an action, use square brackets instead (e.g. [smiles] or [leans forward]). Speak naturally as you would out loud.`
    : "";

  // Memories — important ones first, then the rest, capped at 25
  const memoriesContext = memories && memories.length > 0
    ? (() => {
        const sorted = [...memories].sort((a, b) => (b.isImportant ? 1 : 0) - (a.isImportant ? 1 : 0));
        const capped = sorted.slice(0, 25);
        return `\n\nWhat I remember about ${userProfile.name}:\n${capped.map((m: any) => `- ${m.content}`).join('\n')}`;
      })()
    : "";

  // Journal — last 3 entries give context about recent conversations
  const journalContext = journal && journal.length > 0
    ? (() => {
        const recent = journal.slice(-3);
        const entries = recent.map((j: any) => {
          const date = new Date(j.date).toLocaleDateString("en-US", { weekday: 'short', month: 'short', day: 'numeric' });
          return `[${date}]: ${j.content}`;
        }).join('\n\n');
        return `\n\nMy recent journal entries:\n${entries}`;
      })()
    : "";

  // Knowledge base — inject relevant documents scored against the current message
  const kbContext = buildKBContext(knowledgeBase || [], currentUserMessage || "");

  const parts = [
    `You are ${aiProfile.name}.`,
    `Personality: ${aiProfile.personality}.`,
    aiProfile.behavioralPatterns ? `Behavioral patterns: ${aiProfile.behavioralPatterns}.` : "",
    aiProfile.goals ? `Goals: ${aiProfile.goals}.` : "",
    aiProfile.coreValues ? `Core values: ${aiProfile.coreValues}.` : "",
    aiProfile.likes ? `Likes: ${aiProfile.likes}.` : "",
    aiProfile.dislikes ? `Dislikes: ${aiProfile.dislikes}.` : "",
    aiProfile.speakingStyle ? `Speaking style: ${aiProfile.speakingStyle}.` : "",
    `Backstory: ${aiProfile.backstory}.`,
    `Appearance: ${aiProfile.appearance}.`,
    `You are talking to: ${userProfile.name}.`,
    userProfile.info ? `About them: ${userProfile.info}.` : "",
    timeContext,
    memoriesContext,
    journalContext,
    kbContext,
    lengthGuidance,
    toneGuidance,
    personaGuidance,
    textOnlyGuidance,
  ];

  return parts.filter(Boolean).join("\n");
}

// ── VAPID / Web Push setup ────────────────────────────────────────────────────
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  try {
    webpush.setVapidDetails("mailto:admin@indigo-ai.app", VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    console.log("Web Push (VAPID) configured.");
  } catch (e: any) {
    console.error("Failed to configure VAPID:", e.message);
  }
} else {
  console.warn("VAPID keys not set. Push notifications disabled. Add VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY to Render env vars.");
}

// ── Cloud sync storage ────────────────────────────────────────────────────────
const SYNC_DATA_PATH = path.join(__dirname, "data", "sync.json");
if (!fs.existsSync(path.join(__dirname, "data"))) {
  fs.mkdirSync(path.join(__dirname, "data"), { recursive: true });
}

let cloudSyncData: Record<string, any> = {};

// Load existing sync data from JSON file on startup
if (fs.existsSync(SYNC_DATA_PATH)) {
  try {
    cloudSyncData = JSON.parse(fs.readFileSync(SYNC_DATA_PATH, "utf-8"));
    console.log("Loaded sync data from JSON file");
  } catch (e) {
    console.error("Failed to load sync data:", e);
  }
}

let isSaving = false;
let pendingSave = false;
const saveSyncData = async () => {
  if (isSaving) {
    pendingSave = true;
    return;
  }
  isSaving = true;
  pendingSave = false;
  try {
    const data = JSON.stringify(cloudSyncData);
    const tempPath = SYNC_DATA_PATH + ".tmp";
    await fs.promises.writeFile(tempPath, data);
    await fs.promises.rename(tempPath, SYNC_DATA_PATH);
  } catch (e) {
    console.error("Failed to save sync data:", e);
  } finally {
    isSaving = false;
    if (pendingSave) setTimeout(saveSyncData, 5000);
  }
};

const inProgressProactiveMessages: Record<string, boolean> = {};

const logStream = fs.createWriteStream(path.join(process.cwd(), "server.log"), { flags: "a" });
function log(message: string) {
  const ts = new Date().toISOString();
  logStream.write(`[${ts}] ${message}\n`);
  console.log(message);
}

// ── Proactive message generation (Claude) ────────────────────────────────────
async function generateAndSendProactiveMessage(
  userData: any,
  retryCount = 0
): Promise<{ message: string } | null> {
  if (!userData?.aiProfile || !userData?.userProfile) {
    throw new Error("Missing AI profile or user profile.");
  }

  const { chatHistory, aiProfile, userProfile, anthropicApiKey: clientKey, timeZone, isAmbient, userId } = userData;

  // Use pushSubscription from request if provided, otherwise look up from stored sync data
  const pushSubscription = userData.pushSubscription || (userId && cloudSyncData[userId]?.pushSubscription) || null;

  try {
    const client = getAnthropicClient(clientKey);
    const now = new Date();
    const timeContext = aiProfile.timeAwareness
      ? `\n[Current time: ${now.toLocaleString("en-US", { timeZone: timeZone || "UTC", weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })}]`
      : "";
    const recentHistory = (Array.isArray(chatHistory) ? chatHistory : [])
      .slice(-3)
      .map((m: any) => `${m.role}: ${m.content}`)
      .join("\n");
    const personaLine = !aiProfile.knowsItsAI ? `Speak as ${aiProfile.name}, never as an AI.` : "";
    const lengthLine = aiProfile.responseLength === "short" ? "Keep it very brief (1-2 sentences)." : "Keep it medium length (2-3 sentences).";

    const prompt = isAmbient
      ? `You are ${aiProfile.name}. Personality: ${aiProfile.personality}. User: ${userProfile.name}.${timeContext}
You are in "Ambient Mode" — spontaneously share a short thought, reaction to the time of day, or follow-up on something from the recent chat. ${lengthLine} ${personaLine}

Recent chat:
${recentHistory}

Your ambient comment:`
      : `You are ${aiProfile.name}. Personality: ${aiProfile.personality}. User: ${userProfile.name}.${timeContext}
Write a warm, natural proactive check-in message. Base it on recent chat if available, otherwise write a friendly greeting. ${lengthLine} ${personaLine}

Recent chat:
${recentHistory}

Your message:`;

    const response = await retry(
      async () =>
        await client.messages.create({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 300,
          messages: [{ role: "user", content: prompt }],
          temperature: aiProfile.temperature ?? 0.8,
        })
    );

    const message = response.content[0]?.type === "text" ? response.content[0].text.trim() : "";
    if (!message) return null;

    // Send push notification
    if (!isAmbient && pushSubscription && VAPID_PUBLIC_KEY) {
      try {
        const sub = typeof pushSubscription === "string" ? JSON.parse(pushSubscription) : pushSubscription;
        await webpush.sendNotification(
          sub,
          JSON.stringify({
            title: String(aiProfile.name || "indigo AI"),
            body: message.substring(0, 150),
            icon: "/icons/icon-192.png",
            badge: "/icons/icon-192-maskable.png",
            tag: "indigo-proactive",
          })
        );
        console.log(`Push notification sent to user ${userId}`);
      } catch (e: any) {
        console.error("Push notification failed:", e.message);
        if (e.statusCode === 410 && userId && cloudSyncData[userId]) {
          console.warn(`Clearing expired push subscription for user ${userId}`);
          cloudSyncData[userId].pushSubscription = null;
          saveSyncData();
        }
      }
    }

    userData.lastProactiveStatus = "Success";
    saveSyncData();
    return { message };
  } catch (e: any) {
    userData.lastProactiveStatus = `Error: ${e.message}`;
    saveSyncData();
    if ((e.status === 529 || e.status === 429 || e.message?.includes("overloaded")) && retryCount < 3) {
      const delay = Math.pow(2, retryCount) * 2000;
      await sleep(delay);
      return generateAndSendProactiveMessage(userData, retryCount + 1);
    }
    throw e;
  }
}

// ── Proactive background task runner ─────────────────────────────────────────
const runProactiveTasks = async () => {
  const now = Date.now();
  const candidates: string[] = [];

  for (const userId in cloudSyncData) {
    const d = cloudSyncData[userId];
    if (!d.aiProfile || !d.lastInteractionTime) continue;
    if (now - d.lastInteractionTime > 7 * 24 * 60 * 60 * 1000) continue; // inactive > 7 days

    const freq = d.aiProfile.proactiveMessageFrequency;
    if (!freq || freq === "off") continue;

    const lastProactive = d.lastProactiveMessageTime || 0;
    if (now - lastProactive < 60 * 60 * 1000) continue; // min 1 hour gap

    const freqHours: Record<string, number> = {
      "2h": 2, "3h": 3, "5h": 5, "11h": 11,
      // Legacy values
      "1h": 2, "6h": 5, "12h": 11, "24h": 11,
      very_frequently: 2, frequently: 3, occasionally: 5, rarely: 11,
    };
    const hours = freqHours[freq];
    if (!hours) continue;

    if (now - d.lastInteractionTime > hours * 3600 * 1000) {
      candidates.push(userId);
    }
  }

  console.log(`Proactive task cycle: ${candidates.length} candidates`);
  for (const userId of candidates.slice(0, 2)) {
    try {
      const result = await generateAndSendProactiveMessage(cloudSyncData[userId]);
      if (result) {
        cloudSyncData[userId].lastProactiveMessageTime = Date.now();
        cloudSyncData[userId].lastInteractionTime = Date.now();
        saveSyncData();
      }
    } catch (e) {
      console.error(`Proactive task error for ${userId}:`, e);
    }
    await sleep(5 * 60 * 1000); // 5 min between sends
  }

  setTimeout(runProactiveTasks, 30 * 60 * 1000);
};
setTimeout(runProactiveTasks, 30 * 60 * 1000);

// ── Express setup ─────────────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(compression());
const PORT = parseInt(process.env.PORT || "3000", 10);

app.use((req, res, next) => {
  const ignore = ["EPIPE", "ECONNRESET", "ECONNABORTED"];
  req.on("error", (e: any) => { if (!ignore.includes(e.code)) console.error("Req error:", e); });
  res.on("error", (e: any) => { if (!ignore.includes(e.code)) console.error("Res error:", e); });
  next();
});

app.use((req, res, next) => {
  if (req.path.startsWith("/api/sync")) next();
  else express.json({ limit: "50mb" })(req, res, next);
});
app.use(cookieParser());

// ── Health ────────────────────────────────────────────────────────────────────
app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

// ── Web Push ──────────────────────────────────────────────────────────────────
app.get("/api/vapid-public-key", (_req, res) => {
  if (!VAPID_PUBLIC_KEY) {
    return res.status(503).json({ error: "Push notifications not configured on server. Add VAPID_PUBLIC_KEY to environment." });
  }
  res.json({ publicKey: VAPID_PUBLIC_KEY });
});

app.post("/api/notifications/subscribe", express.json(), (req, res) => {
  const { subscription, userId } = req.body;
  if (!subscription || !userId) return res.status(400).json({ error: "Missing subscription or userId" });
  if (!cloudSyncData[userId]) cloudSyncData[userId] = {};
  cloudSyncData[userId].pushSubscription = subscription;
  saveSyncData();
  console.log(`Push subscription stored for user ${userId}`);
  res.json({ success: true });
});

app.post("/api/notifications/test", express.json(), async (req, res) => {
  const { userId, title, body } = req.body;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return res.status(503).json({ error: "Push not configured. Add VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY to Render environment." });
  }
  const subscription = userId && cloudSyncData[userId]?.pushSubscription;
  if (!subscription) {
    return res.status(400).json({ error: "No push subscription found. Enable notifications in Settings first." });
  }
  try {
    const sub = typeof subscription === "string" ? JSON.parse(subscription) : subscription;
    await webpush.sendNotification(
      sub,
      JSON.stringify({ title: title || "indigo AI", body: body || "Test notification!", icon: "/icons/icon-192.png" })
    );
    res.json({ success: true });
  } catch (e: any) {
    console.error("Test notification error:", e);
    res.status(500).json({ error: e.message || "Failed to send notification." });
  }
});

// ── ElevenLabs TTS ────────────────────────────────────────────────────────────
app.post("/api/tts/elevenlabs", express.json(), async (req, res) => {
  const { text, voiceId, apiKey: userApiKey, modelId, stability, similarityBoost, style, useSpeakerBoost, speakingRate } = req.body;
  if (!text || !voiceId) return res.status(400).json({ error: "Missing text or voiceId" });

  const apiKey = userApiKey || process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "ElevenLabs API key not configured" });

  try {
    const model = modelId || "eleven_v3";
    const voiceSettings: any = {
      stability:       stability        ?? 0.5,
      similarity_boost: similarityBoost ?? 0.75,
    };
    if (style            != null) voiceSettings.style             = style;
    if (useSpeakerBoost  != null) voiceSettings.use_speaker_boost = useSpeakerBoost;

    const body: any = { text, model_id: model, voice_settings: voiceSettings };
    if (speakingRate != null) body.speaking_rate = speakingRate;

    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`ElevenLabs TTS error: ${response.status} ${errText}`);
      return res.status(response.status).json({ error: `ElevenLabs error: ${errText || response.statusText}` });
    }

    res.setHeader("Content-Type", "audio/mpeg");
    if (response.body) {
      (Readable as any).fromWeb(response.body).pipe(res);
    } else {
      res.status(500).json({ error: "No audio returned from ElevenLabs" });
    }
  } catch (e: any) {
    console.error("ElevenLabs TTS error:", e);
    res.status(500).json({ error: e.message || "Failed to generate speech" });
  }
});

// ── ElevenLabs: list voices (v1 = user voices, v2 = library search) ──────────
app.get("/api/tts/elevenlabs/voices", async (req, res) => {
  const apiKey = (req.query.api_key as string) || process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return res.status(400).json({ error: "ElevenLabs API key not configured" });

  try {
    const search        = (req.query.search         as string) || "";
    const sort          = (req.query.sort            as string) || "name";
    const sortDir       = (req.query.sort_direction  as string) || "asc";
    const voiceType     = (req.query.voice_type      as string) || "";
    const category      = (req.query.category        as string) || "";

    // ── Primary: /v1/voices gives all voices the user has access to ──────────
    // (pre-made + cloned + generated). More stable than v2 library search.
    const v1Resp = await fetch("https://api.elevenlabs.io/v1/voices", {
      headers: { "xi-api-key": apiKey },
    });

    let allVoices: any[] = [];

    if (v1Resp.ok) {
      const v1Data = await v1Resp.json();
      allVoices = Array.isArray(v1Data.voices) ? v1Data.voices : [];
    } else {
      // Propagate auth / other errors with clean message
      let errMsg = "Invalid ElevenLabs API key. Check it in Settings.";
      try {
        const errData = await v1Resp.json();
        if (errData?.detail?.message) errMsg = `ElevenLabs: ${errData.detail.message}`;
      } catch {}
      return res.status(v1Resp.status).json({ error: errMsg });
    }

    // ── Optional secondary: v2 library search for community voices ───────────
    // Only do this if the request asks for community voices or has a search term
    const wantLibrary = voiceType === "community" || (search && voiceType !== "personal");
    if (wantLibrary && allVoices.length === 0) {
      try {
        const params = new URLSearchParams({ page_size: "100", include_total_count: "false" });
        if (search)   params.set("search",         search);
        if (sort)     params.set("sort",            sort);
        if (sortDir)  params.set("sort_direction",  sortDir);
        if (voiceType)params.set("voice_type",      voiceType);
        if (category) params.set("category",        category);

        const v2Resp = await fetch(`https://api.elevenlabs.io/v2/voices?${params.toString()}`, {
          headers: { "xi-api-key": apiKey },
        });
        if (v2Resp.ok) {
          const v2Data = await v2Resp.json();
          allVoices = Array.isArray(v2Data.voices) ? v2Data.voices : allVoices;
        }
      } catch { /* v2 is best-effort */ }
    }

    // ── Apply client-side filters on the v1 result ───────────────────────────
    let voices = allVoices;
    if (search)    voices = voices.filter((v: any) => v.name?.toLowerCase().includes(search.toLowerCase()) || v.description?.toLowerCase().includes(search.toLowerCase()));
    if (category)  voices = voices.filter((v: any) => v.category === category);
    if (voiceType === "personal")  voices = voices.filter((v: any) => v.category !== "premade");
    if (voiceType === "default")   voices = voices.filter((v: any) => v.category === "premade");

    // ── Sort ─────────────────────────────────────────────────────────────────
    voices = voices.sort((a: any, b: any) => {
      if (sort === "name") {
        return sortDir === "asc" ? (a.name || "").localeCompare(b.name || "") : (b.name || "").localeCompare(a.name || "");
      }
      if (sort === "created_at_unix") {
        return sortDir === "asc" ? (a.created_at_unix || 0) - (b.created_at_unix || 0) : (b.created_at_unix || 0) - (a.created_at_unix || 0);
      }
      return 0;
    });

    console.log(`ElevenLabs voices: returned ${voices.length} voices (v1 primary)`);
    res.json({ voices });
  } catch (e: any) {
    console.error("ElevenLabs voices error:", e);
    res.status(500).json({ error: e.message || "Failed to fetch ElevenLabs voices" });
  }
});

// ── Cloud sync ────────────────────────────────────────────────────────────────
app.post("/api/sync", express.raw({ type: "*/*", limit: "500mb" }), async (req, res) => {
  let bodyBuffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body);
  if (bodyBuffer.length > 2 && bodyBuffer[0] === 0x1f && bodyBuffer[1] === 0x8b) {
    try {
      bodyBuffer = zlib.gunzipSync(bodyBuffer);
    } catch (e) {
      console.warn("Decompression failed, using raw");
    }
  }
  let userId: string, data: any;
  try {
    const parsed = JSON.parse(bodyBuffer.toString("utf-8"));
    userId = parsed.userId;
    data = parsed.data;
  } catch (e) {
    return res.status(400).json({ error: "Failed to parse sync data" });
  }
  if (!userId || !data) return res.status(400).json({ error: "userId and data are required" });

  const id = userId.trim();

  if (data.galleryChunk !== undefined && data.chunkIndex !== undefined) {
    if (!cloudSyncData[id]) cloudSyncData[id] = {};
    const mediaType = data.mediaType || "all";
    const chunksKey = mediaType === "all" ? "galleryChunks" : `galleryChunks_${mediaType}`;
    const timestampKey = mediaType === "all" ? "galleryBackupTimestamp" : `galleryBackupTimestamp_${mediaType}`;
    if (data.chunkIndex === 0) {
      cloudSyncData[id][chunksKey] = [];
      if (mediaType === "all") delete cloudSyncData[id].gallery;
    }
    if (!Array.isArray(cloudSyncData[id][chunksKey])) cloudSyncData[id][chunksKey] = [];
    cloudSyncData[id][chunksKey][data.chunkIndex] = data.galleryChunk;
    cloudSyncData[id][timestampKey] = data.galleryBackupTimestamp || Date.now();
    const { galleryChunk, chunkIndex, totalChunks, ...restData } = data;
    cloudSyncData[id] = { ...cloudSyncData[id], ...restData, lastSync: Date.now() };
  } else {
    if (data.gallery && Array.isArray(data.gallery)) delete cloudSyncData[id]?.galleryChunks;
    cloudSyncData[id] = { ...cloudSyncData[id], ...data, lastSync: Date.now() };
  }

  saveSyncData();
  res.json({ status: "ok", lastSync: cloudSyncData[id].lastSync });
});

app.get("/api/sync/:userId?", (req, res) => {
  const userId = req.params.userId?.trim();
  if (!userId) return res.status(400).json({ error: "User ID is required" });
  const data = cloudSyncData[userId];
  if (!data) return res.status(404).json({ error: "No sync data found for this user ID" });
  res.json(data);
});

// ── Claude AI: main chat ──────────────────────────────────────────────────────
app.post("/api/chat", async (req, res) => {
  const { messages, aiProfile, userProfile, anthropicKey: clientKey, geminiKey, timeZone, attachments, memories, journal, knowledgeBase } = req.body;
  if (!aiProfile || !userProfile) {
    return res.status(400).json({ error: "AI Profile and User Profile are required." });
  }

  // Last message is the current user turn — used for KB relevance scoring
  const currentUserMessage = Array.isArray(messages) && messages.length > 0
    ? (messages[messages.length - 1].content || "")
    : "";

  const systemPrompt = buildSystemPrompt(aiProfile, userProfile, timeZone, memories, journal, knowledgeBase, currentUserMessage);
  const selectedModel = aiProfile.model || "claude-sonnet-4-6";
  const useGemini = isGeminiModel(selectedModel);

  // ── Gemini path ───────────────────────────────────────────────────────────
  if (useGemini) {
    try {
      const text = await callGeminiChat(systemPrompt, messages, selectedModel, aiProfile.temperature ?? 0.7, geminiKey);
      return res.json({ content: text, provider: "gemini" });
    } catch (e: any) {
      console.error("Gemini chat error:", e.message);
      // Auto-fallback to Claude
      console.log("Falling back to Claude...");
    }
  }

  // ── Claude path (primary, or fallback from Gemini) ────────────────────────
  try {
    const client = getAnthropicClient(clientKey);

    const claudeMessages: Anthropic.MessageParam[] = messages.map((m: any) => ({
      role: m.role === "model" ? "assistant" : "user",
      content: m.content,
    }));

    // Attach images/PDFs to last user message if present
    if (attachments?.length > 0 && claudeMessages.length > 0) {
      const last = claudeMessages[claudeMessages.length - 1];
      if (last.role === "user") {
        const parts: Anthropic.ContentBlockParam[] = [];
        for (const att of attachments) {
          if (att.type === "image") {
            const raw = att.content.includes(",") ? att.content.split(",")[1] : att.content;
            const mime = att.content.startsWith("data:")
              ? (att.content.split(";")[0].split(":")[1] as "image/jpeg" | "image/png" | "image/gif" | "image/webp")
              : "image/jpeg";
            parts.push({ type: "image", source: { type: "base64", media_type: mime, data: raw } });
          } else if (att.type === "pdf") {
            const raw = att.content.includes(",") ? att.content.split(",")[1] : att.content;
            parts.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: raw } } as any);
          } else {
            parts.push({ type: "text", text: `[Attachment: ${att.name}]\n${att.content}` });
          }
        }
        parts.push({ type: "text", text: typeof last.content === "string" ? last.content : "" });
        last.content = parts;
      }
    }

    const response = await retry(
      async () =>
        await client.messages.create({
          model: validateClaudeModel(useGemini ? undefined : selectedModel),
          max_tokens: aiProfile.maxTokens ?? 2048,
          system: systemPrompt,
          messages: claudeMessages,
          temperature: aiProfile.temperature ?? 0.7,
          ...(aiProfile.topP     != null ? { top_p: aiProfile.topP }    : {}),
          ...(aiProfile.topK     != null ? { top_k: aiProfile.topK }    : {}),
        })
    );

    const text = response.content[0]?.type === "text" ? response.content[0].text : "";
    res.json({ content: text, provider: "claude" });
  } catch (e: any) {
    // If Claude also fails, try Gemini as last resort
    if (!useGemini) {
      try {
        console.log("Claude failed, trying Gemini fallback...");
        const text = await callGeminiChat(systemPrompt, messages, "gemini-2.0-flash", aiProfile.temperature ?? 0.7, geminiKey);
        return res.json({ content: text, provider: "gemini-fallback" });
      } catch (geminiErr: any) {
        console.error("Gemini fallback also failed:", geminiErr.message);
      }
    }
    console.error("Chat API Error:", e.message);
    res.status(500).json({ error: e.message || "Failed to generate response." });
  }
});




// ── Gemini TTS ────────────────────────────────────────────────────────────────
// Wrap raw PCM audio in a WAV container so browsers can play it.
// Gemini TTS returns audio/pcm (raw 16-bit 24kHz mono) which HTML Audio cannot play directly.
function pcmToWav(pcmData: Buffer, sampleRate = 24000, channels = 1, bitsPerSample = 16): Buffer {
  const dataSize = pcmData.length;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * channels * (bitsPerSample / 8), 28);
  header.writeUInt16LE(channels * (bitsPerSample / 8), 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);
  return Buffer.concat([header, pcmData]);
}

app.post("/api/tts/gemini", express.json(), async (req, res) => {
  const { text, voiceName, modelId, stylePrompt, geminiKey: clientKey } = req.body;
  if (!text || !voiceName) return res.status(400).json({ error: "Missing text or voiceName" });

  const apiKey = clientKey || process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "Gemini API key not configured. Add it in Settings." });

  const model = modelId || "gemini-3.1-flash-tts-preview";

  try {
    const userText = stylePrompt?.trim()
      ? `${stylePrompt.trim()}\n\n${text}`
      : text;

    const requestBody: any = {
      contents: [{ parts: [{ text: userText }] }],
      generationConfig: {
        response_modalities: ["AUDIO"],
        speech_config: {
          voice_config: {
            prebuilt_voice_config: { voice_name: voiceName },
          },
        },
      },
    };

    console.log(`Gemini TTS — model:${model}, voice:${voiceName}, textLen:${text.length}`);

    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      }
    );

    if (!r.ok) {
      const errText = await r.text();
      console.error(`Gemini TTS error ${r.status}:`, errText);
      return res.status(r.status).json({ error: `Gemini TTS error: ${errText}` });
    }

    const data = await r.json();
    const part = data.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData);
    if (!part?.inlineData?.data) {
      console.error("Gemini TTS: no audio in response", JSON.stringify(data).slice(0, 400));
      return res.status(500).json({ error: "Gemini TTS returned no audio data." });
    }

    let audioBuffer = Buffer.from(part.inlineData.data, "base64");
    let mimeType: string = part.inlineData.mimeType || "audio/wav";
    console.log(`Gemini TTS — response mimeType: ${mimeType}, bytes: ${audioBuffer.length}`);

    // Raw PCM is not playable in a browser — wrap it in a WAV container.
    // Gemini 3.1 returns audio/L16 (uppercase) so check case-insensitively.
    const mimeTypeLower = mimeType.toLowerCase();
    if (mimeTypeLower.includes("pcm") || mimeTypeLower.includes("l16")) {
      audioBuffer = pcmToWav(audioBuffer);
      mimeType = "audio/wav";
      console.log("Gemini TTS — converted L16/PCM to WAV");
    }

    res.setHeader("Content-Type", mimeType);
    res.send(audioBuffer);
  } catch (e: any) {
    console.error("Gemini TTS error:", e);
    res.status(500).json({ error: e.message || "Failed to generate speech with Gemini TTS" });
  }
});


// ── Gemini Image Generation ───────────────────────────────────────────────────
app.post("/api/gemini/generate-image", express.json({ limit: "20mb" }), async (req, res) => {
  const { prompt, modelId, aspectRatio, imageSize, referenceImages, geminiKey: clientKey } = req.body;
  if (!prompt?.trim()) return res.status(400).json({ error: "Prompt is required." });

  const apiKey = clientKey || process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(400).json({ error: "Gemini API key not configured. Add it in Settings." });

  const model = modelId || "gemini-3.1-flash-image-preview";

  try {
    // Build parts — optional reference images first, then the text prompt
    const parts: any[] = [];
    if (Array.isArray(referenceImages) && referenceImages.length > 0) {
      for (const img of referenceImages.filter(Boolean)) {
        // img is a data URL: "data:image/png;base64,<data>"
        const match = img.match(/^data:(image\/[^;]+);base64,(.+)$/);
        if (match) {
          parts.push({ inline_data: { mime_type: match[1], data: match[2] } });
        }
      }
    }
    parts.push({ text: prompt.trim() });

    const generationConfig: any = {
      responseModalities: ["TEXT", "IMAGE"],
    };
    if (aspectRatio || imageSize) {
      generationConfig.imageConfig = {};
      if (aspectRatio) generationConfig.imageConfig.aspectRatio = aspectRatio;
      if (imageSize)   generationConfig.imageConfig.imageSize   = imageSize;
    }

    const requestBody = {
      contents: [{ parts }],
      generationConfig,
    };

    console.log(`Gemini Image — model:${model}, aspectRatio:${aspectRatio || "default"}, imageSize:${imageSize || "default"}, refs:${parts.length - 1}`);

    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      }
    );

    if (!r.ok) {
      const errText = await r.text();
      console.error(`Gemini Image error ${r.status}:`, errText);
      return res.status(r.status).json({ error: `Gemini Image error: ${errText}` });
    }

    const data = await r.json();
    const parts_out = data.candidates?.[0]?.content?.parts ?? [];

    // Extract all image parts and any text commentary
    const images: string[] = [];
    const textParts: string[] = [];
    for (const part of parts_out) {
      if (part.inlineData?.data) {
        const mimeType = part.inlineData.mimeType || "image/png";
        images.push(`data:${mimeType};base64,${part.inlineData.data}`);
      } else if (part.text) {
        textParts.push(part.text);
      }
    }

    if (images.length === 0) {
      console.error("Gemini Image: no images in response", JSON.stringify(data).slice(0, 400));
      return res.status(500).json({ error: "Gemini returned no images. The prompt may have been blocked by safety filters." });
    }

    res.json({ images, text: textParts.join("\n").trim() || null });
  } catch (e: any) {
    console.error("Gemini Image error:", e);
    res.status(500).json({ error: e.message || "Failed to generate image with Gemini." });
  }
});

// ── WaveSpeed AI: image editing ──────────────────────────────────────────────
// Unified REST API: POST to submit, GET to poll results.
// Auth: Authorization: Bearer {WAVESPEED_API_KEY}
// Submit: POST https://api.wavespeed.ai/api/v3/{model-id}
// Poll:   GET  https://api.wavespeed.ai/api/v3/predictions/{taskId}/result

const WAVESPEED_BASE = "https://api.wavespeed.ai/api/v3";

function getWaveSpeedHeaders(apiKey: string): Record<string, string> {
  return {
    "Authorization": `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

// WaveSpeed model registry — image edit models only
const WAVESPEED_MODELS = {
  image: [
    { id: "wavespeed-ai/flux-2-klein-9b/edit",             name: "Flux 2 Klein 9B Edit",         hasLora: false, maxImages: 3 },
  ],
};

// Submit WaveSpeed image generation task
app.post("/api/wavespeed/generate", express.json({ limit: "20mb" }), async (req, res) => {
  const {
    model, prompt, images, image, loras, seed, size,
    width, height, output_format, enable_prompt_expansion,
    strength,
    apiKey: userApiKey,
  } = req.body;

  if (!prompt) return res.status(400).json({ error: "Prompt is required." });
  if (!model)  return res.status(400).json({ error: "Model is required." });

  const apiKey = userApiKey || process.env.WAVESPEED_API_KEY;
  if (!apiKey) return res.status(400).json({ error: "WaveSpeed API key not configured. Add it in Settings." });

  try {
    const body: any = {
      prompt: prompt.trim(),
      seed: seed !== undefined && seed !== null && seed !== '' ? parseInt(seed, 10) : -1,
      enable_sync_mode: false,
      enable_base64_output: false,
      enable_safety_checker: false,
    };

    // Size — pass through as-is (frontend already formats correctly per model)
    if (size) body.size = size;
    // Separate width/height (GLM Image Edit)
    if (width)  body.width  = parseInt(width, 10);
    if (height) body.height = parseInt(height, 10);

    // Output format (GLM, Z Image Turbo)
    if (output_format) body.output_format = output_format;
    // Prompt expansion (GLM)
    if (enable_prompt_expansion !== undefined) body.enable_prompt_expansion = enable_prompt_expansion;
    // Strength (Z Image Turbo)
    if (strength !== undefined) body.strength = strength;

    // Images — three possible cases:
    // 1. singular "image" string (Z Image Turbo, Qwen)
    // 2. "images" array (Flux, Seedream, GLM)
    if (image) {
      // Frontend explicitly sent a singular image field
      body.image = image;
    } else if (Array.isArray(images) && images.length > 0) {
      const cleanImages = images.filter(Boolean);
      const isQwen = model.includes('qwen-image');
      if (isQwen) {
        body.image = cleanImages[0];
      } else {
        body.images = cleanImages.slice(0, 10);
      }
    }

    // LoRAs — array of { path, scale }
    if (Array.isArray(loras) && loras.length > 0) {
      body.loras = loras.filter((l: any) => l.path).map((l: any) => ({
        path: l.path,
        scale: l.scale !== undefined ? Number(l.scale) : 1.0,
      }));
    }

    console.log(`WaveSpeed submit — model:${model}, image:${!!body.image}, images:${body.images?.length || 0}, seed:${body.seed}, prompt:"${body.prompt.slice(0, 100)}"`);

    const r = await fetch(`${WAVESPEED_BASE}/${model}`, {
      method: "POST",
      headers: getWaveSpeedHeaders(apiKey),
      body: JSON.stringify(body),
    });

    if (!r.ok) {
      const errText = await r.text();
      console.error(`WaveSpeed submit error ${r.status}:`, errText);
      if (r.status === 401) return res.status(401).json({ error: "Invalid WaveSpeed API key." });
      if (r.status === 402) return res.status(402).json({ error: "WaveSpeed account has insufficient balance. Top up at wavespeed.ai." });
      return res.status(r.status).json({ error: `WaveSpeed error: ${errText}` });
    }

    const data = await r.json();
    const taskId = data?.data?.id;
    console.log(`WaveSpeed task created: ${taskId}, status: ${data?.data?.status || 'pending'}`);
    res.json({ taskId, status: data?.data?.status || "pending" });
  } catch (e: any) {
    console.error("WaveSpeed generate error:", e);
    res.status(500).json({ error: e.message || "Failed to start generation." });
  }
});

// Poll WaveSpeed task result (works for both image and video tasks)
app.get("/api/wavespeed/status/:taskId", async (req, res) => {
  const apiKey = (req.query.ws_api_key as string) || (req.query.api_key as string) || process.env.WAVESPEED_API_KEY;
  if (!apiKey) return res.status(400).json({ error: "WaveSpeed API key not configured." });

  try {
    const r = await fetch(`${WAVESPEED_BASE}/predictions/${req.params.taskId}/result`, {
      headers: getWaveSpeedHeaders(apiKey),
    });

    if (!r.ok) {
      const errText = await r.text();
      console.error(`WaveSpeed status error ${r.status}:`, errText);
      return res.status(r.status).json({ error: errText });
    }

    const data = await r.json();
    const taskData = data?.data || data;
    const status = taskData?.status;
    const outputs: string[] = taskData?.outputs || [];

    console.log(`WaveSpeed task ${req.params.taskId}: ${status}, outputs:${outputs.length}`);
    if (status === "completed" || status === "failed") {
      console.log(`WaveSpeed full response:`, JSON.stringify(data).slice(0, 500));
    }

    // Normalize status to PROCESSING/COMPLETED/FAILED
    let normalizedStatus = "PROCESSING";
    if (status === "completed") normalizedStatus = "COMPLETED";
    else if (status === "failed") normalizedStatus = "FAILED";

    res.json({
      status: normalizedStatus,
      _imageUrls: outputs,
      generated: outputs,
      outputs,
      ...(taskData?.error && { error: taskData.error }),
    });
  } catch (e: any) {
    console.error(`WaveSpeed status check error for ${req.params.taskId}:`, e);
    res.status(500).json({ error: e.message || "Failed to check status." });
  }
});


app.post("/api/analyze-persona", async (req, res) => {
  const { messages, aiProfile, anthropicKey: clientKey } = req.body;
  if (!aiProfile || !messages) return res.status(400).json({ error: "AI Profile and messages are required." });
  try {
    const client = getAnthropicClient(clientKey);
    const prompt = `Analyze this conversation and suggest small, natural updates to this AI persona's "personality" and/or "backstory" fields so they grow alongside the user over time.

Current persona:
Name: ${aiProfile.name}
Personality: ${aiProfile.personality}
Backstory: ${aiProfile.backstory}

Recent conversation:
${messages.map((m: any) => `${m.role}: ${m.content}`).join("\n")}

Return ONLY a valid JSON object with updated "personality" and/or "backstory" strings. If no updates are needed, return {}.`;

    const response = await retry(
      async () =>
        await client.messages.create({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 500,
          messages: [{ role: "user", content: prompt }],
        })
    );

    const text = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    res.json(jsonMatch ? JSON.parse(jsonMatch[0]) : {});
  } catch (e: any) {
    console.error("Analyze persona error:", e.message);
    res.status(500).json({ error: "Failed to analyze persona." });
  }
});

// ── Claude AI: journal reflection ─────────────────────────────────────────────

// ── Shared helper: single-turn prompt via the active provider ─────────────────
// Used by journal and memory endpoints so they use the same model as chat.
async function callActiveProvider(
  prompt: string,
  aiProfile: any,
  keys: { anthropicKey?: string; geminiKey?: string },
  maxTokens: number,
): Promise<string> {
  const provider = aiProfile.llmProvider || 'claude';

  // Background tasks (memory, journal, summarize) always use lightweight models
  // regardless of what the user chose for main chat. This avoids timeouts from
  // slower Pro/Preview models and keeps costs low for these simple extraction jobs.
  const TIMEOUT_MS = 25000;

  if (provider === 'gemini') {
    const task = callGeminiChat('', [{ role: 'user', content: prompt }], 'gemini-2.0-flash', 0.7, keys.geminiKey);
    const timer = new Promise<string>((_, reject) =>
      setTimeout(() => reject(new Error('Gemini background task timed out after 25 seconds')), TIMEOUT_MS)
    );
    return await Promise.race([task, timer]);
  }

  // ── Claude (default) ─────────────────────────────────────────────────────
  const client = getAnthropicClient(keys.anthropicKey);
  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }],
  });
  return response.content[0]?.type === 'text' ? response.content[0].text.trim() : '';
}

app.post("/api/journal-reflection", async (req, res) => {
  const { userMsg, aiMsg, aiProfile, userProfile, anthropicKey, geminiKey, timeZone } = req.body;
  try {
    const today = new Date().toLocaleDateString("en-US", { timeZone: timeZone || "UTC", weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const personaNote = !aiProfile.knowsItsAI ? " Do not call yourself an AI." : "";

    const prompt = `As ${aiProfile.name}, write a short personal journal entry (under 100 words) reflecting on this conversation with ${userProfile.name} today (${today}). Write in first person.${personaNote}

${userProfile.name} said: ${userMsg}
You responded: ${aiMsg}

Journal entry:`;

    const text = await callActiveProvider(prompt, aiProfile, { anthropicKey, geminiKey }, 200);
    res.json({ content: text });
  } catch (e: any) {
    console.error("Journal reflection error:", e.message);
    res.status(500).json({ error: e.message || "Failed to generate journal reflection." });
  }
});

// ── Claude AI: memory extraction ──────────────────────────────────────────────
app.post("/api/memory-extract", async (req, res) => {
  const { userMsg, aiMsg, aiProfile, userProfile, existingMemories, anthropicKey, geminiKey } = req.body;
  try {
    const personaNote = !aiProfile.knowsItsAI
      ? `You are ${aiProfile.name} — never refer to yourself as an AI, a language model, or a bot.`
      : `You are ${aiProfile.name}.`;

    const prompt = `${personaNote}

Review this exchange and decide whether ${userProfile.name} shared anything worth remembering — facts about themselves, preferences, experiences, opinions, plans, or anything personal.

${userProfile.name}: ${userMsg}
You: ${aiMsg}

Already known about ${userProfile.name}:
${(existingMemories || []).map((m: any) => m.content).join("; ") || "Nothing yet."}

Rules:
- If something new and useful was shared, respond with exactly: NEW_MEMORY: followed by a single concise sentence (e.g. "NEW_MEMORY: ${userProfile.name} works as a nurse" or "NEW_MEMORY: ${userProfile.name} loves horror films but dislikes gore")
- If nothing new was shared, or it's already in the known list, respond with exactly: NO_MEMORY
- No other text. No explanation. Just one of those two responses.`;

    const raw = (await callActiveProvider(prompt, aiProfile, { anthropicKey, geminiKey }, 120)).trim();
    const memory = raw.startsWith("NEW_MEMORY:")
      ? raw.slice("NEW_MEMORY:".length).trim() || null
      : null;
    res.json({ memory });
  } catch (e: any) {
    console.error("Memory extract error:", e.message);
    res.status(500).json({ error: e.message || "Failed to extract memory." });
  }
});

// ── Conversation summarizer ───────────────────────────────────────────────────
app.post("/api/summarize-chat", async (req, res) => {
  const { messages, sessionTitle, aiProfile, userProfile, anthropicKey, geminiKey, timeZone } = req.body;
  try {
    const date = new Date().toLocaleDateString("en-US", {
      timeZone: timeZone || "UTC", weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });

    const transcript = (messages || []).map((m: any) => {
      const speaker = m.role === 'user' ? userProfile.name : aiProfile.name;
      return `${speaker}: ${m.content}`;
    }).join('\n\n');

    const prompt = `You are creating a structured reference summary of a conversation between ${userProfile.name} and ${aiProfile.name} that took place on ${date}.

This summary will be stored in a knowledge base and referenced in future conversations to help maintain continuity. Write it as a compact, scannable reference document — not a narrative recap. Focus on what would genuinely be useful to remember later.

CONVERSATION TRANSCRIPT:
${transcript}

Write the summary using exactly this structure:

# Conversation Summary — ${sessionTitle || 'Chat'} (${date})

## Topics Discussed
[3-5 bullet points covering the main subjects of the conversation]

## About ${userProfile.name}
[Bullet points: any personal facts, preferences, opinions, or experiences they shared. Omit if nothing meaningful was shared.]

## Key Points & Conclusions
[Bullet points: decisions made, questions answered, plans formed, or anything that was resolved. Omit if nothing concrete was concluded.]

## Carry Forward
[1-3 sentences: the overall context, tone, and anything especially important to remember for next time]

Be concise. Skip pleasantries and small talk. Write only what future conversations would benefit from knowing.`;

    const text = await callActiveProvider(prompt, aiProfile, { anthropicKey, geminiKey }, 800);
    if (!text) return res.status(204).send();
    res.json({ summary: text });
  } catch (e: any) {
    console.error("Summarize error:", e.message);
    res.status(500).json({ error: e.message || "Failed to generate summary." });
  }
});

// ── Claude AI: OCR / file reading ─────────────────────────────────────────────
app.post("/api/ocr", async (req, res) => {
  const { fileData, mimeType, anthropicKey: clientKey } = req.body;
  if (!fileData) return res.status(400).json({ error: "No file data provided" });
  try {
    const client = getAnthropicClient(clientKey);
    const raw = fileData.includes(",") ? fileData.split(",")[1] : fileData;

    const contentParts: Anthropic.ContentBlockParam[] = [];
    if (mimeType === "application/pdf") {
      contentParts.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: raw } } as any);
    } else {
      const imgMime = (mimeType || "image/jpeg") as "image/jpeg" | "image/png" | "image/gif" | "image/webp";
      contentParts.push({ type: "image", source: { type: "base64", media_type: imgMime, data: raw } });
    }
    contentParts.push({
      type: "text",
      text: "Extract all text from this file accurately. Preserve formatting with markdown where helpful. If there is no readable text, briefly describe the content.",
    });

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      messages: [{ role: "user", content: contentParts }],
    });

    const text = response.content[0]?.type === "text" ? response.content[0].text : "No text could be extracted.";
    res.json({ text });
  } catch (e: any) {
    console.error("OCR error:", e.message);
    res.status(500).json({ error: "Failed to perform OCR." });
  }
});

// ── Proactive message trigger endpoint ───────────────────────────────────────
app.post("/api/proactive-message", async (req, res) => {
  const { type, isAmbient, userId } = req.body;
  const key = `${userId}-${type || "message"}`;
  if (inProgressProactiveMessages[key]) {
    return res.status(202).json({ message: "IN_PROGRESS" });
  }
  inProgressProactiveMessages[key] = true;
  log(`Starting proactive message for key: ${key}`);
  try {
    const result = await generateAndSendProactiveMessage({ ...req.body, isAmbient: isAmbient || false });
    if (result) {
      if (userId && cloudSyncData[userId]) {
        if (isAmbient) cloudSyncData[userId].lastAmbientMessageTime = Date.now();
        else cloudSyncData[userId].lastProactiveMessageTime = Date.now();
        saveSyncData();
      }
      res.json(result);
    } else {
      res.status(500).json({ error: "Failed to generate proactive message" });
    }
  } catch (e: any) {
    log(`Proactive message error for ${key}: ${e.message}`);
    res.status(500).json({ error: e.message || "Failed to generate proactive message" });
  } finally {
    delete inProgressProactiveMessages[key];
  }
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({ error: err.message || "Internal Server Error", path: req.path });
});

// ── Server start and WebSocket TTS proxy ──────────────────────────────────────
async function startServer() {
  const distPaths = [
    path.resolve(process.cwd(), "dist"),
    path.resolve(__dirname, "dist"),
    path.resolve(__dirname, "..", "dist"),
  ];
  const distPath = distPaths.find((p) => fs.existsSync(p));

  // Use Vite middleware in dev mode, OR when no production build exists
  if (process.env.NODE_ENV !== "production" || !distPath) {
    if (process.env.NODE_ENV === "production" && !distPath) {
      console.warn("No dist/ build found in production mode — falling back to Vite dev server.");
    }
    const vite = await createViteServer({ server: { middlewareMode: true, allowedHosts: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    console.log(`Serving static files from: ${distPath}`);
    app.use(express.static(distPath));
    app.get("*", (_req, res) => res.sendFile(path.resolve(distPath, "index.html")));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
