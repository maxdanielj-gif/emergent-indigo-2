import express from "express";
import cors from "cors";
import compression from "compression";
import { createServer as createViteServer } from "vite";
import { WebSocketServer, WebSocket } from "ws";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import zlib from "zlib";
import { fileURLToPath } from "url";
import { Readable } from "stream";
import Anthropic from "@anthropic-ai/sdk";
import webpush from "web-push";
import { MongoClient, Db, Collection } from "mongodb";

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

  const body = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents,
    generationConfig: { temperature: temperature ?? 0.7, maxOutputTokens: 2048 },
  };

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

// ── Build persona system prompt ───────────────────────────────────────────────
function buildSystemPrompt(aiProfile: any, userProfile: any, timeZone?: string): string {
  const now = new Date();
  const timeContext = aiProfile.timeAwareness
    ? `\n\nCurrent time: ${now.toLocaleString("en-US", { timeZone: timeZone || "UTC" })}`
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

// ── MongoDB sync storage ──────────────────────────────────────────────────────
let mongoDb: Db | null = null;
let syncCollection: Collection | null = null;

async function connectMongo() {
  try {
    const mongoUrl = process.env.MONGO_URL || "mongodb://localhost:27017";
    const dbName   = process.env.DB_NAME   || "indigo_ai";
    const client   = new MongoClient(mongoUrl);
    await client.connect();
    mongoDb        = client.db(dbName);
    syncCollection = mongoDb.collection("sync_data");
    await syncCollection.createIndex({ userId: 1 }, { unique: true });
    console.log("MongoDB connected for cloud sync");

    // Load existing sync data into memory (limit to 1000 users on startup; rest loaded on demand)
    const docs = await syncCollection.find({}, { projection: { userId: 1, data: 1 } }).limit(1000).toArray();
    for (const doc of docs) {
      if (doc.userId) cloudSyncData[doc.userId] = doc.data;
    }
    console.log(`Loaded ${docs.length} user records from MongoDB`);
  } catch (e) {
    console.error("MongoDB connection failed, falling back to JSON file:", e);
    // Fall back to JSON file
    if (fs.existsSync(SYNC_DATA_PATH)) {
      try {
        cloudSyncData = JSON.parse(fs.readFileSync(SYNC_DATA_PATH, "utf-8"));
        console.log("Loaded sync data from JSON fallback");
      } catch (jsonErr) {
        console.error("Failed to load JSON fallback:", jsonErr);
      }
    }
  }
}

// Start MongoDB connection
connectMongo();

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
    if (syncCollection) {
      // Save all dirty entries to MongoDB
      const ops = Object.entries(cloudSyncData).map(([userId, data]) => ({
        updateOne: {
          filter: { userId },
          update: { $set: { userId, data, lastSync: Date.now() } },
          upsert: true,
        },
      }));
      if (ops.length > 0) await syncCollection.bulkWrite(ops as any);
    } else {
      // JSON file fallback
      const data = JSON.stringify(cloudSyncData);
      const tempPath = SYNC_DATA_PATH + ".tmp";
      await fs.promises.writeFile(tempPath, data);
      await fs.promises.rename(tempPath, SYNC_DATA_PATH);
      console.log(`Sync data saved to JSON (${(data.length / 1024 / 1024).toFixed(2)} MB)`);
    }
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
      ? `\n[Current time: ${now.toLocaleString("en-US", { timeZone: timeZone || "UTC" })}]`
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

// ── Async TTS endpoints ───────────────────────────────────────────────────────
// Simple HTTP TTS — full text in, mp3 out. No WebSocket needed.
app.post("/api/tts/generate", express.json(), async (req, res) => {
  const { text, voiceId, apiKey: userApiKey } = req.body;
  if (!text || !voiceId) return res.status(400).json({ error: "Missing text or voiceId" });

  const apiKey = userApiKey || process.env.ASYNC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "Async API key not configured" });

  try {
    const response = await fetch("https://api.async.com/text_to_speech", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "version": "v1",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model_id: "async_flash_v1.0",
        transcript: text,
        voice: { mode: "id", id: voiceId },
        output_format: { container: "mp3", sample_rate: 44100 },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`Async TTS error: ${response.status} ${errText}`);
      return res.status(response.status).json({ error: `Async TTS error: ${errText || response.statusText}` });
    }

    res.setHeader("Content-Type", "audio/mpeg");
    if (response.body) {
      (Readable as any).fromWeb(response.body).pipe(res);
    } else {
      res.status(500).json({ error: "No audio returned from Async API" });
    }
  } catch (e: any) {
    console.error("TTS generate error:", e);
    res.status(500).json({ error: e.message || "Failed to generate speech" });
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

// ── Cartesia TTS ──────────────────────────────────────────────────────────────
app.post("/api/tts/cartesia", express.json(), async (req, res) => {
  const { text, voiceId, apiKey: userApiKey, language, speed, emotions } = req.body;
  if (!text || !voiceId) return res.status(400).json({ error: "Missing text or voiceId" });

  const apiKey = userApiKey || process.env.CARTESIA_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "Cartesia API key not configured" });

  try {
    const cartesiaBody: any = {
      model_id: "sonic-3",
      transcript: text,
      voice: { mode: "id", id: voiceId },
      output_format: { container: "mp3", encoding: "mp3", sample_rate: 24000 },
      language: language || "en",
    };
    if (speed    != null) cartesiaBody.speed    = speed;
    if (emotions?.length) cartesiaBody.emotions = emotions;

    const response = await fetch("https://api.cartesia.ai/tts/bytes", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Cartesia-Version": "2025-04-16",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(cartesiaBody),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`Cartesia TTS error: ${response.status} ${errText}`);
      return res.status(response.status).json({ error: `Cartesia error: ${errText || response.statusText}` });
    }

    res.setHeader("Content-Type", "audio/mpeg");
    if (response.body) {
      (Readable as any).fromWeb(response.body).pipe(res);
    } else {
      res.status(500).json({ error: "No audio returned from Cartesia" });
    }
  } catch (e: any) {
    console.error("Cartesia TTS error:", e);
    res.status(500).json({ error: e.message || "Failed to generate speech" });
  }
});

// ── Async: clone voice ────────────────────────────────────────────────────────
app.post("/api/voices/clone", async (req, res) => {
  // This endpoint receives a base64-encoded audio file + metadata from the client,
  // rebuilds a multipart/form-data request, and forwards it to Async.
  const { audioBase64, audioMimeType, audioFileName, name, description, accent, gender, style, enhance, transcript, apiKey: userApiKey } = req.body;

  const apiKey = userApiKey || process.env.ASYNC_API_KEY;
  if (!apiKey) return res.status(400).json({ error: "Async API key not configured." });
  if (!audioBase64 || !name) return res.status(400).json({ error: "Audio and voice name are required." });

  try {
    // Rebuild the audio file from base64
    const audioBuffer = Buffer.from(audioBase64, "base64");
    const fileName = audioFileName || "voice_sample.wav";

    // Build multipart form using Node's built-in approach
    const boundary = `----AsyncVoiceClone${Date.now()}`;
    const CRLF = "\r\n";

    const addField = (name: string, value: string) =>
      `--${boundary}${CRLF}Content-Disposition: form-data; name="${name}"${CRLF}${CRLF}${value}${CRLF}`;

    let formBody = "";
    formBody += addField("name", name);
    if (description) formBody += addField("description", description);
    if (accent)      formBody += addField("accent", accent);
    if (gender)      formBody += addField("gender", gender);
    if (style)       formBody += addField("style", style);
    if (transcript)  formBody += addField("transcript", transcript);
    if (enhance)     formBody += addField("enhance", "true");

    // File field
    const filePart = `--${boundary}${CRLF}Content-Disposition: form-data; name="audio"; filename="${fileName}"${CRLF}Content-Type: ${audioMimeType || "audio/wav"}${CRLF}${CRLF}`;
    const closing = `${CRLF}--${boundary}--${CRLF}`;

    const formPrefix = Buffer.from(formBody + filePart, "utf-8");
    const formSuffix = Buffer.from(closing, "utf-8");
    const body = Buffer.concat([formPrefix, audioBuffer, formSuffix]);

    const response = await fetch("https://api.async.com/voices/clone", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "version": "v1",
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        "Content-Length": body.length.toString(),
      },
      body,
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error(`Async clone error ${response.status}:`, errBody);
      return res.status(response.status).json({ error: `Clone failed: ${errBody}` });
    }

    res.json(await response.json());
  } catch (e: any) {
    console.error("Voice clone error:", e.message);
    res.status(500).json({ error: e.message || "Failed to clone voice." });
  }
});


app.post("/api/voices", express.json(), async (req, res) => {
  const { apiKey: userApiKey, ...params } = req.body;
  const apiKey = userApiKey || process.env.ASYNC_API_KEY;
  if (!apiKey) return res.status(400).json({ error: "Async API key not configured. Add your key in Settings." });
  try {
    const response = await fetch("https://api.async.com/voices", {
      method: "POST",
      headers: { "x-api-key": apiKey, version: "v1", "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    if (!response.ok) {
      const errBody = await response.text();
      console.error(`Async voices error ${response.status}:`, errBody);
      return res.status(response.status).json({ error: `Async API error (${response.status}): ${errBody}` });
    }
    res.json(await response.json());
  } catch (e: any) {
    console.error("Voices fetch error:", e.message);
    res.status(500).json({ error: e.message || "Failed to fetch voices" });
  }
});

app.get("/api/voices/:id", async (req, res) => {
  const apiKey = (req.query.api_key as string) || process.env.ASYNC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "Async API key not configured" });
  try {
    const response = await fetch(`https://api.async.com/voices/${req.params.id}`, {
      method: "GET",
      headers: { "x-api-key": apiKey, version: "v1" },
    });
    if (!response.ok) throw new Error(`Async Get Voice error: ${response.statusText}`);
    res.json(await response.json());
  } catch (e: any) {
    res.status(500).json({ error: "Failed to fetch voice details" });
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

app.get("/api/debug-sync", (_req, res) => {
  res.json(
    Object.keys(cloudSyncData).map((key) => ({
      key,
      aiProfileId: cloudSyncData[key].aiProfile?.id,
    }))
  );
});

app.get("/api/sync/:userId?", (req, res) => {
  const userId = req.params.userId?.trim();
  if (!userId) return res.status(400).json({ error: "User ID is required" });
  const data = cloudSyncData[userId];
  if (!data) return res.status(404).json({ error: "No sync data found for this user ID" });
  res.json(data);
});

// ── MongoDB Export / Import ──────────────────────────────────────────────────
app.get("/api/db/export/:userId", (req, res) => {
  const userId = req.params.userId?.trim();
  if (!userId) return res.status(400).json({ error: "User ID required" });
  const data = cloudSyncData[userId];
  if (!data) return res.status(404).json({ error: "No data found for this user" });
  res.setHeader("Content-Disposition", `attachment; filename="indigo-backup-${userId.slice(0,8)}-${Date.now()}.json"`);
  res.setHeader("Content-Type", "application/json");
  res.send(JSON.stringify({ version: 1, userId, exportedAt: new Date().toISOString(), data }, null, 2));
});

app.post("/api/db/import", express.json({ limit: "50mb" }), async (req, res) => {
  const { userId, data } = req.body;
  if (!userId || !data) return res.status(400).json({ error: "userId and data are required" });
  cloudSyncData[userId] = data;
  await saveSyncData();
  res.json({ success: true, message: "Data imported successfully" });
});

// ── OpenRouter: chat completion (OpenAI-compatible) ──────────────────────────
async function callOpenRouterChat(
  systemPrompt: string,
  messages: any[],
  model: string,
  temperature: number,
  openRouterKey: string,
  maxTokens?: number,
  topP?: number,
): Promise<string> {
  const orMessages = [
    { role: "system", content: systemPrompt },
    ...messages.map((m: any) => ({
      role: m.role === "model" ? "assistant" : m.role,
      content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
    })),
  ];

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${openRouterKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.RENDER_EXTERNAL_URL || "http://localhost:3000",
      "X-Title": "Indigo AI",
    },
    body: JSON.stringify({
      model,
      messages: orMessages,
      temperature: temperature ?? 0.7,
      max_tokens: maxTokens ?? 2048,
      ...(topP != null ? { top_p: topP } : {}),
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenRouter error (${res.status}): ${err}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

// ── Claude AI: main chat ──────────────────────────────────────────────────────
app.post("/api/chat", async (req, res) => {
  const { messages, aiProfile, userProfile, anthropicKey: clientKey, geminiKey, openRouterKey, timeZone, attachments } = req.body;
  if (!aiProfile || !userProfile) {
    return res.status(400).json({ error: "AI Profile and User Profile are required." });
  }

  const systemPrompt = buildSystemPrompt(aiProfile, userProfile, timeZone);
  const selectedModel = aiProfile.model || "claude-sonnet-4-6";
  const useGemini = isGeminiModel(selectedModel);
  // OpenRouter: model IDs contain a slash (e.g. "openai/gpt-4o") and key is provided
  const useOpenRouter = !!openRouterKey && selectedModel.includes("/");

  // ── OpenRouter path ───────────────────────────────────────────────────────
  if (useOpenRouter) {
    try {
      const text = await callOpenRouterChat(systemPrompt, messages, selectedModel, aiProfile.temperature ?? 0.7, openRouterKey, aiProfile.maxTokens, aiProfile.topP);
      return res.json({ content: text, provider: "openrouter" });
    } catch (e: any) {
      console.error("OpenRouter chat error:", e.message);
      return res.status(500).json({ error: e.message || "OpenRouter failed." });
    }
  }

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

// ── Freepik: image generation (Mystic) ───────────────────────────────────────

// Temp image store — used to give Freepik HTTPS URLs for LoRA training images
// Freepik requires HTTPS URLs for training; base64 is rejected
const tempImages: Map<string, { data: string; mimeType: string; expires: number }> = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of tempImages.entries()) if (v.expires < now) tempImages.delete(k);
}, 5 * 60 * 1000);

app.get("/api/image/temp/:id", (req, res) => {
  const entry = tempImages.get(req.params.id);
  if (!entry || entry.expires < Date.now()) return res.status(404).send("Not found or expired");
  res.setHeader("Content-Type", entry.mimeType);
  res.send(Buffer.from(entry.data, "base64"));
});

// Helper: store base64 image temporarily and return an HTTPS URL
function hostTempImage(base64: string, mimeType = "image/jpeg"): string {
  const id      = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const rawData = base64.includes(",") ? base64.split(",")[1] : base64;
  tempImages.set(id, { data: rawData, mimeType, expires: Date.now() + 30 * 60 * 1000 }); // 30 min
  const serverBase = process.env.RENDER_EXTERNAL_URL || `http://localhost:${process.env.PORT || 3000}`;
  return `${serverBase}/api/image/temp/${id}`;
}

app.post("/api/image/generate", express.json({ limit: "20mb" }), async (req, res) => {
  const {
    prompt, negativePrompt, aspectRatio,
    structureReference, styleReference,
    resolution, model, adherence, structureStrength, hdr, creativeDetailing,
    engine: mysticEngine, fixed_generation,
    loraCharacters, loraStyles,
    apiKey: userApiKey,
  } = req.body;

  if (!prompt) return res.status(400).json({ error: "Prompt is required." });
  const apiKey = userApiKey || process.env.FREEPIK_API_KEY;
  if (!apiKey) return res.status(400).json({ error: "Freepik API key not configured. Add it in Settings." });

  try {
    const body: any = {
      prompt:           prompt.trim(),
      resolution:       resolution       || "2k",
      aspect_ratio:     aspectRatio      || "square_1_1",
      model:            model            || "realism",
      filter_nsfw:      false,
      fixed_generation: fixed_generation ?? false,
    };

    if (negativePrompt?.trim())            body.negative_prompt    = negativePrompt.trim();
    if (mysticEngine && mysticEngine !== 'automatic') body.engine = mysticEngine;
    if (creativeDetailing !== undefined)   body.creative_detailing = creativeDetailing;

    if (structureReference) {
      body.structure_reference = structureReference.includes(",")
        ? structureReference.split(",")[1] : structureReference;
      if (structureStrength !== undefined) body.structure_strength = structureStrength;
    }

    if (styleReference) {
      body.style_reference = styleReference.includes(",")
        ? styleReference.split(",")[1] : styleReference;
      // adherence and hdr ONLY take effect when style_reference is present
      if (adherence !== undefined) body.adherence = adherence;
      if (hdr       !== undefined) body.hdr       = hdr;
    }

    // LoRAs: ignored by API when ANY reference image is present, or when using
    // fluid/flexible/super_real/editorial_portraits models
    const hasRefs = !!(structureReference || styleReference);
    const loraIncompatibleModels = ['fluid', 'flexible', 'super_real', 'editorial_portraits'];
    const lorasAllowed = !hasRefs && !loraIncompatibleModels.includes(model);

    if (lorasAllowed) {
      const styling: any = {};
      // Max 1 character and 1 style per API schema (maxItems: 1)
      if (Array.isArray(loraCharacters) && loraCharacters.length > 0) {
        const c = loraCharacters[0];
        styling.characters = [{ id: String(c.id), strength: c.strength ?? 100 }];
      }
      if (Array.isArray(loraStyles) && loraStyles.length > 0) {
        const s = loraStyles[0];
        styling.styles = [{ name: String(s.name), strength: s.strength ?? 100 }];
      }
      if (Object.keys(styling).length > 0) body.styling = styling;
    }

    console.log(`Freepik Mystic — ${body.resolution}, model:${body.model}, engine:${body.engine||'auto'}, structRef:${!!structureReference}, styleRef:${!!styleReference}, lorasAllowed:${lorasAllowed}, loraChars:${loraCharacters?.length||0}, fixedGen:${body.fixed_generation}, prompt: "${body.prompt.slice(0,100)}"`);

    const response = await fetch("https://api.freepik.com/v1/ai/mystic", {
      method:  "POST",
      headers: { "Content-Type": "application/json", "x-freepik-api-key": apiKey },
      body:    JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`Freepik error ${response.status}:`, errText);
      if (response.status === 401) return res.status(401).json({ error: "Invalid Freepik API key. Check it in Settings." });
      return res.status(response.status).json({ error: `Image generation failed: ${errText}` });
    }

    const data = await response.json();
    const taskId = data?.data?.task_id;
    console.log(`Freepik task created: ${taskId}`);
    res.json({ taskId, status: data?.data?.status });
  } catch (e: any) {
    console.error("Freepik generation error:", e);
    res.status(500).json({ error: e.message || "Failed to start image generation." });
  }
});

// Poll Freepik task status
app.get("/api/image/status/:taskId", async (req, res) => {
  const apiKey = (req.query.api_key as string) || process.env.FREEPIK_API_KEY;
  if (!apiKey) return res.status(400).json({ error: "Freepik API key not configured." });

  try {
    const response = await fetch(`https://api.freepik.com/v1/ai/mystic/${req.params.taskId}`, {
      headers: { "x-freepik-api-key": apiKey },
    });
    if (!response.ok) {
      const errText = await response.text();
      console.error(`Status check error ${response.status} for task ${req.params.taskId}:`, errText);
      return res.status(response.status).json({ error: errText });
    }
    const data = await response.json();
    const taskStatus = data?.data?.status;

    // Log every status change (not just completion) so we can debug
    console.log(`Task ${req.params.taskId} status: ${taskStatus}, generated: ${data?.data?.generated?.length || 0}`);
    if (taskStatus === 'COMPLETED' || taskStatus === 'FAILED') {
      console.log(`Full Freepik response for ${req.params.taskId}:`, JSON.stringify(data).slice(0, 500));
    }

    const generated: string[] = data?.data?.generated || [];
    res.json({ ...data?.data, _imageUrls: generated });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Failed to check task status." });
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

// List available WaveSpeed models
app.get("/api/wavespeed/models", (_req, res) => {
  res.json(WAVESPEED_MODELS);
});

// Submit WaveSpeed image generation task
app.post("/api/wavespeed/generate", express.json({ limit: "20mb" }), async (req, res) => {
  const {
    model, prompt, images, loras, seed, size,
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
    };

    // Size (width x height) — optional, defaults to input image size
    if (size) body.size = size;

    // Images — model-specific field names:
    // Qwen models use "image" (singular string, first image only)
    // Flux/other models use "images" (array, max 3)
    if (Array.isArray(images) && images.length > 0) {
      const cleanImages = images.filter(Boolean);
      const isQwen = model.includes('qwen-image');
      if (isQwen) {
        // Qwen edit models want "image" as a single string
        body.image = cleanImages[0];
      } else {
        // Flux Klein, Turbo, etc. want "images" array, max 3
        body.images = cleanImages.slice(0, 3);
      }
    }

    // LoRAs — array of { path, scale }
    if (Array.isArray(loras) && loras.length > 0) {
      body.loras = loras.filter((l: any) => l.path).map((l: any) => ({
        path: l.path,
        scale: l.scale !== undefined ? Number(l.scale) : 1.0,
      }));
    }

    console.log(`WaveSpeed submit — model:${model}, images:${body.images?.length || 0}, loras:${body.loras?.length || 0}, seed:${body.seed}, prompt:"${body.prompt.slice(0, 100)}"`);

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

    // Normalize status to match Freepik's PROCESSING/COMPLETED/FAILED format
    // so the frontend polling logic works the same way
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


// ── Runtime config: update MongoDB URI ───────────────────────────────────────
app.post("/api/config/set-mongo", express.json(), async (req, res) => {
  const { mongoUrl } = req.body;
  if (!mongoUrl?.trim()) return res.status(400).json({ error: "mongoUrl is required." });

  try {
    // Reconnect to the new MongoDB URI
    process.env.MONGO_URL = mongoUrl.trim();
    await connectMongo();

    // Persist to .env so it survives restarts
    const envPath = path.join(__dirname, ".env");
    let envContent = "";
    try { envContent = fs.readFileSync(envPath, "utf-8"); } catch {}
    if (envContent.includes("MONGO_URL=")) {
      envContent = envContent.replace(/^MONGO_URL=.*/m, `MONGO_URL=${mongoUrl.trim()}`);
    } else {
      envContent += `\nMONGO_URL=${mongoUrl.trim()}`;
    }
    fs.writeFileSync(envPath, envContent);

    console.log(`MongoDB URI updated to: ${mongoUrl.trim().replace(/:([^@]+)@/, ":***@")}`);
    res.json({ success: true, message: "MongoDB reconnected and .env updated." });
  } catch (e: any) {
    console.error("Failed to update MongoDB URI:", e);
    res.status(500).json({ error: e.message || "Failed to reconnect to MongoDB." });
  }
});

const STABILITY_MODELS: Record<string, string> = {
  "stable-image-core":              "core",
  "stable-diffusion-3.5-large":     "sd3",
  "stable-diffusion-3.5-large-turbo": "sd3",
  "stable-diffusion-3.5-medium":    "sd3",
};

app.post("/api/image/stability/generate", express.json({ limit: "20mb" }), async (req, res) => {
  const {
    prompt, negativePrompt, aspectRatio, outputFormat,
    model, seed, cfgScale, stylePreset,
    initImage, initImageStrength,   // img2img: base64 data URL + strength (0.0–1.0)
    apiKey: userApiKey,
  } = req.body;

  if (!prompt) return res.status(400).json({ error: "Prompt is required." });

  const apiKey = userApiKey || process.env.STABILITY_API_KEY;
  if (!apiKey) return res.status(400).json({ error: "Stability AI API key not configured. Add it in Settings." });

  const selectedModel = model || "stable-image-core";
  const endpoint      = STABILITY_MODELS[selectedModel] || "core";
  const isImg2Img     = !!initImage;

  try {
    const form = new FormData();
    form.append("prompt",        prompt.trim());
    form.append("output_format", outputFormat || "png");
    if (negativePrompt?.trim()) form.append("negative_prompt", negativePrompt.trim());
    if (seed !== undefined && seed !== null && seed !== "") form.append("seed", String(seed));
    if (cfgScale !== undefined) form.append("cfg_scale", String(cfgScale));
    if (stylePreset)            form.append("style_preset", stylePreset);

    if (isImg2Img) {
      // Strip data URL prefix and convert to Blob
      const base64 = initImage.includes(",") ? initImage.split(",")[1] : initImage;
      const mimeMatch = initImage.match(/data:([^;]+);/);
      const mime = mimeMatch ? mimeMatch[1] : "image/png";
      const imgBuffer = Buffer.from(base64, "base64");
      const imgBlob   = new Blob([imgBuffer], { type: mime });
      form.append("image", imgBlob, "init.png");
      // Core uses "fidelity", SD3 uses "strength"
      const strength = initImageStrength ?? 0.65;
      if (endpoint === "core") {
        form.append("fidelity", String(strength));
      } else {
        form.append("strength", String(strength));
      }
    } else {
      // Text-to-image only: aspect_ratio is only valid without an init image
      if (aspectRatio) form.append("aspect_ratio", aspectRatio);
    }

    // SD3 models need model param
    if (endpoint === "sd3" && selectedModel !== "stable-image-core") {
      form.append("model", selectedModel);
    }

    const mode = isImg2Img ? "img2img" : "txt2img";
    form.append("mode", mode);
    console.log(`Stability AI: endpoint=${endpoint}, model=${selectedModel}, mode=${mode}, aspect=${isImg2Img ? "n/a" : aspectRatio}, prompt="${prompt.slice(0, 80)}"`);

    const response = await fetch(`https://api.stability.ai/v2beta/stable-image/generate/${endpoint}`, {
      method:  "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Accept":        "application/json",
      },
      body: form,
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`Stability AI error ${response.status}:`, errText);
      if (response.status === 401) return res.status(401).json({ error: "Invalid Stability AI API key. Check it in Settings." });
      if (response.status === 402) return res.status(402).json({ error: "Stability AI account has insufficient credits." });
      return res.status(response.status).json({ error: `Stability AI error: ${errText}` });
    }

    const data = await response.json();
    if (!data.image) return res.status(500).json({ error: "No image returned from Stability AI." });

    console.log(`Stability AI: success, seed=${data.seed}, finish_reason=${data.finish_reason}`);
    res.json({
      image:         `data:image/${outputFormat || "png"};base64,${data.image}`,
      seed:          data.seed,
      finish_reason: data.finish_reason,
    });
  } catch (e: any) {
    console.error("Stability AI generate error:", e);
    res.status(500).json({ error: e.message || "Failed to generate image." });
  }
});

// List all available LoRAs (Freepik defaults + user-trained)
app.get("/api/image/loras", async (req, res) => {
  const apiKey = (req.query.api_key as string) || process.env.FREEPIK_API_KEY;
  if (!apiKey) return res.status(400).json({ error: "Freepik API key not configured." });
  try {
    const r = await fetch("https://api.freepik.com/v1/ai/loras", {
      headers: { "x-freepik-api-key": apiKey },
    });
    if (!r.ok) return res.status(r.status).json({ error: await r.text() });
    const data = await r.json();
    // Log custom LoRAs so we can see their actual field names
    const customs = data?.data?.customs || [];
    if (customs.length > 0) {
      console.log(`Custom LoRAs (${customs.length}):`, JSON.stringify(customs.map((l: any) => ({
        id: l.id, name: l.name, type: l.type, status: l.training?.status, keys: Object.keys(l)
      }))));
    }
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Poll LoRA training task status
app.get("/api/image/loras/status", async (req, res) => {
  const apiKey = (req.query.api_key as string) || process.env.FREEPIK_API_KEY;
  if (!apiKey) return res.status(400).json({ error: "Freepik API key not configured." });
  try {
    // Freepik returns all LoRAs including training status
    const r = await fetch("https://api.freepik.com/v1/ai/loras", {
      headers: { "x-freepik-api-key": apiKey },
    });
    if (!r.ok) return res.status(r.status).json({ error: await r.text() });
    res.json(await r.json());
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Train a character LoRA — Freepik requires HTTPS image URLs, not base64
app.post("/api/image/loras/character", express.json({ limit: "50mb" }), async (req, res) => {
  const { name, description, gender, images, apiKey: userApiKey } = req.body;
  if (!name || !images?.length) return res.status(400).json({ error: "Name and images are required." });
  const apiKey = userApiKey || process.env.FREEPIK_API_KEY;
  if (!apiKey) return res.status(400).json({ error: "Freepik API key not configured." });

  try {
    // Convert base64 images to temporary HTTPS URLs that Freepik can fetch
    const imageUrls = images.map((img: string) => {
      if (img.startsWith("http")) return img; // already a URL
      const mimeMatch = img.match(/data:([^;]+);/);
      const mimeType  = mimeMatch ? mimeMatch[1] : "image/jpeg";
      return hostTempImage(img, mimeType);
    });

    console.log(`LoRA character training: ${name}, ${imageUrls.length} images hosted at temp URLs`);

    const payload: any = { name: name.trim(), images: imageUrls, quality: "high" };
    if (description?.trim()) payload.description = description.trim();
    if (gender) payload.gender = gender;

    const r = await fetch("https://api.freepik.com/v1/ai/loras/characters", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-freepik-api-key": apiKey },
      body: JSON.stringify(payload),
    });
    if (!r.ok) {
      const errText = await r.text();
      console.error(`LoRA character training error ${r.status}:`, errText);
      return res.status(r.status).json({ error: errText });
    }
    const data = await r.json();
    console.log(`LoRA character training started: ${data?.data?.task_id}`);
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Train a style LoRA — same HTTPS URL requirement
app.post("/api/image/loras/style", express.json({ limit: "50mb" }), async (req, res) => {
  const { name, description, images, apiKey: userApiKey } = req.body;
  if (!name || !images?.length) return res.status(400).json({ error: "Name and images are required." });
  const apiKey = userApiKey || process.env.FREEPIK_API_KEY;
  if (!apiKey) return res.status(400).json({ error: "Freepik API key not configured." });
  try {
    const imageUrls = images.map((img: string) => {
      if (img.startsWith("http")) return img;
      const mimeMatch = img.match(/data:([^;]+);/);
      return hostTempImage(img, mimeMatch ? mimeMatch[1] : "image/jpeg");
    });

    const r = await fetch("https://api.freepik.com/v1/ai/loras/styles", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-freepik-api-key": apiKey },
      body: JSON.stringify({ name: name.trim(), description: description?.trim() || "", images: imageUrls, quality: "high" }),
    });
    if (!r.ok) return res.status(r.status).json({ error: await r.text() });
    res.json(await r.json());
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Freepik: style transfer ───────────────────────────────────────────────────
app.post("/api/image/style-transfer", express.json({ limit: "20mb" }), async (req, res) => {
  const { image, referenceImage, apiKey: userApiKey } = req.body;
  if (!image || !referenceImage) return res.status(400).json({ error: "Both image and referenceImage are required." });
  const apiKey = userApiKey || process.env.FREEPIK_API_KEY;
  if (!apiKey) return res.status(400).json({ error: "Freepik API key not configured." });
  try {
    const toBase64 = (s: string) => s.includes(",") ? s.split(",")[1] : s;
    const r = await fetch("https://api.freepik.com/v1/ai/image-style-transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-freepik-api-key": apiKey },
      body: JSON.stringify({ image: toBase64(image), reference_image: toBase64(referenceImage) }),
    });
    if (!r.ok) return res.status(r.status).json({ error: await r.text() });
    const data = await r.json();
    res.json({ taskId: data?.data?.task_id, status: data?.data?.status });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Poll style transfer status
app.get("/api/image/style-transfer/:taskId", async (req, res) => {
  const apiKey = (req.query.api_key as string) || process.env.FREEPIK_API_KEY;
  if (!apiKey) return res.status(400).json({ error: "Freepik API key not configured." });
  try {
    const r = await fetch(`https://api.freepik.com/v1/ai/image-style-transfer/${req.params.taskId}`, {
      headers: { "x-freepik-api-key": apiKey },
    });
    if (!r.ok) return res.status(r.status).json({ error: await r.text() });
    const data = await r.json();
    const generated: string[] = data?.data?.generated || [];
    res.json({ ...data?.data, _imageUrls: generated });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
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
app.post("/api/journal-reflection", async (req, res) => {
  const { userMsg, aiMsg, aiProfile, userProfile, anthropicKey: clientKey, timeZone } = req.body;
  try {
    const client = getAnthropicClient(clientKey);
    const today = new Date().toLocaleDateString("en-US", { timeZone: timeZone || "UTC" });
    const personaNote = !aiProfile.knowsItsAI ? " Do not call yourself an AI." : "";

    const prompt = `As ${aiProfile.name}, write a short personal journal entry (under 100 words) reflecting on this conversation with ${userProfile.name} today (${today}). Write in first person.${personaNote}

${userProfile.name} said: ${userMsg}
You responded: ${aiMsg}

Journal entry:`;

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 200,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content[0]?.type === "text" ? response.content[0].text : "";
    res.json({ content: text });
  } catch (e: any) {
    console.error("Journal reflection error:", e.message);
    res.status(500).json({ error: "Failed to generate journal reflection." });
  }
});

// ── Claude AI: memory extraction ──────────────────────────────────────────────
app.post("/api/memory-extract", async (req, res) => {
  const { userMsg, aiMsg, aiProfile, userProfile, existingMemories, anthropicKey: clientKey } = req.body;
  try {
    const client = getAnthropicClient(clientKey);
    const personaNote = !aiProfile.knowsItsAI
      ? `You are ${aiProfile.name} — never refer to yourself as an AI, a language model, or a bot.`
      : `You are ${aiProfile.name}.`;

    const prompt = `${personaNote}

Extract any new, significant long-term fact about ${userProfile.name} from this interaction that you should remember.

${userProfile.name}: ${userMsg}
You: ${aiMsg}

Already known:
${(existingMemories || []).map((m: any) => m.content).join("; ")}

If there is a new fact worth remembering, write it as a single concise sentence in the first person from your perspective as ${aiProfile.name} (e.g. "I know that ${userProfile.name} loves hiking" or "${userProfile.name} told me their favourite colour is blue"). Otherwise write exactly NOTHING.`;

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 100,
      messages: [{ role: "user", content: prompt }],
    });

    const text = (response.content[0]?.type === "text" ? response.content[0].text : "").trim();
    res.json({ memory: !text || text === "NOTHING" || text.includes("NOTHING") ? null : text });
  } catch (e: any) {
    console.error("Memory extract error:", e.message);
    res.status(500).json({ error: "Failed to extract memory." });
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

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  // WebSocket TTS proxy — passes audio stream through to Async.com
  const wss = new WebSocketServer({ noServer: true });
  server.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url || "", `http://${request.headers.host}`);
    if (url.pathname === "/api/tts/ws") {
      wss.handleUpgrade(request, socket, head, (ws) => {
        const userApiKey = url.searchParams.get("api_key");
        const apiKey = userApiKey || process.env.ASYNC_API_KEY;
        const version = url.searchParams.get("version") || "v1";
        if (!apiKey) {
          ws.close(1008, "API key required");
          return;
        }

        // Async.com requires credentials as HTTP headers during the WebSocket upgrade handshake
        const asyncWs = new WebSocket("wss://api.async.com/text_to_speech/websocket/ws", {
          headers: { api_key: apiKey, version: version },
        });

        // Buffer messages that arrive before the upstream connection is ready
        const pending: any[] = [];
        let ready = false;

        ws.on("message", (data) => {
          try {
            if (ready) asyncWs.send(data);
            else pending.push(data);
          } catch (e) {
            console.error("Error forwarding to Async WS:", e);
          }
        });

        asyncWs.on("open", () => {
          ready = true;
          // Flush buffered messages in order
          for (const msg of pending) {
            try {
              asyncWs.send(msg);
            } catch (e) {
              console.error("Error flushing to Async WS:", e);
            }
          }
          pending.length = 0;

          asyncWs.on("message", (data) => {
            try {
              ws.send(data);
            } catch (e) {
              console.error("Error forwarding to client WS:", e);
            }
          });
        });

        ws.on("close", () => asyncWs.close());
        asyncWs.on("close", () => ws.close());
        ws.on("error", (e) => { console.error("Client WS error:", e); asyncWs.close(); });
        asyncWs.on("error", (e) => { console.error("Async WS error:", e); ws.close(); });
      });
    } else {
      socket.destroy();
    }
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
