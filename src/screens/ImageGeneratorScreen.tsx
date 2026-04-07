import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import {
  Download, RefreshCw, Image as ImageIcon, User, X,
  ChevronDown, ChevronUp, Plus, Trash2, Wand2, Palette,
  CheckCircle, Clock, AlertCircle, Upload
} from 'lucide-react';

// ── Constants ────────────────────────────────────────────────────────────────

// Provider choices
const PROVIDERS = [
  { label: 'Freepik Mystic — Ultra-realistic, LoRA support', value: 'freepik' },
  { label: 'WaveSpeed — Flux 2 Klein 9B image editing', value: 'wavespeed' },
  { label: 'Stability AI — SD3.5, minimal content restrictions', value: 'stability' },
] as const;
type Provider = 'freepik' | 'wavespeed' | 'stability';

// Stability AI models
const STABILITY_MODELS = [
  { label: 'Stable Image Core — Fast, high quality',       value: 'stable-image-core' },
  { label: 'SD 3.5 Large — Highest quality (8B)',          value: 'stable-diffusion-3.5-large' },
  { label: 'SD 3.5 Large Turbo — Fast (4-step)',           value: 'stable-diffusion-3.5-large-turbo' },
  { label: 'SD 3.5 Medium — Balanced speed/quality',       value: 'stable-diffusion-3.5-medium' },
];

const STABILITY_ASPECT_RATIOS = [
  { label: 'Square (1:1)',     value: '1:1'  },
  { label: 'Landscape (16:9)', value: '16:9' },
  { label: 'Portrait (9:16)',  value: '9:16' },
  { label: 'Portrait (2:3)',   value: '2:3'  },
  { label: 'Landscape (3:2)',  value: '3:2'  },
  { label: 'Social (4:5)',     value: '4:5'  },
  { label: 'Social (5:4)',     value: '5:4'  },
  { label: 'Ultra-wide (21:9)',value: '21:9' },
  { label: 'Ultra-tall (9:21)',value: '9:21' },
];

// WaveSpeed uses a single model — Flux 2 Klein 9B Edit
const WS_MODEL_ID = 'wavespeed-ai/flux-2-klein-9b/edit';
const WS_MAX_IMAGES = 3;

// Mystic aspect ratios — full list from API docs
const ASPECT_RATIOS_MYSTIC = [
  { label: 'Square (1:1)',            value: 'square_1_1'               },
  { label: 'Portrait (2:3)',          value: 'portrait_2_3'             },
  { label: 'Portrait (3:4)',          value: 'traditional_3_4'          },
  { label: 'Landscape (4:3)',         value: 'classic_4_3'              },
  { label: 'Landscape (3:2)',         value: 'standard_3_2'             },
  { label: 'Tall (9:16)',             value: 'social_story_9_16'        },
  { label: 'Wide (16:9)',             value: 'widescreen_16_9'          },
  { label: 'Wide (2:1)',              value: 'horizontal_2_1'           },
  { label: 'Tall (1:2)',              value: 'vertical_1_2'             },
  { label: 'Phone wide (20:9)',       value: 'smartphone_horizontal_20_9'},
  { label: 'Phone tall (9:20)',       value: 'smartphone_vertical_9_20' },
  { label: 'Social (4:5)',            value: 'social_post_4_5'          },
  { label: 'Social (5:4)',            value: 'social_5_4'               },
];

const RESOLUTIONS = [
  { label: '1K — Fast',        value: '1k' },
  { label: '2K — High res',    value: '2k' },
  { label: '4K — Mystic only', value: '4k' },
];

// Mystic models — exact API enum values.
// fluid, flexible, super_real, editorial_portraits all IGNORE LoRAs.
// Only realism and zen support LoRAs.
const MODELS = [
  { label: 'Realism — photorealistic, less AI look',         value: 'realism',             loraOk: true  },
  { label: 'Zen — clean, smooth, fewer details',             value: 'zen',                  loraOk: true  },
  { label: 'Fluid — best prompt adherence (Google Imagen)',  value: 'fluid',                loraOk: false },
  { label: 'Flexible — vivid, great for illustrations',      value: 'flexible',             loraOk: false },
  { label: 'Super Real — near-photographic realism',         value: 'super_real',           loraOk: false },
  { label: 'Editorial Portraits — hyperrealistic close-ups', value: 'editorial_portraits',  loraOk: false },
];

// Mystic render engines
const MYSTIC_ENGINES = [
  { label: 'Automatic (recommended)', value: 'automatic'        },
  { label: 'Illusio — smooth, soft',  value: 'magnific_illusio' },
  { label: 'Sharpy — sharp, grainy',  value: 'magnific_sharpy'  },
  { label: 'Sparkle — middle ground', value: 'magnific_sparkle' },
];
const TABS = ['Generate', 'Style Transfer', 'Character LoRA'] as const;
type Tab = typeof TABS[number];
type JobStatus = 'idle' | 'creating' | 'waiting' | 'succeeded' | 'failed';

// ── Slider component ─────────────────────────────────────────────────────────

function Slider({ label, value, min, max, onChange }: {
  label: string; value: number; min: number; max: number;
  onChange: (v: number) => void;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div>
      <div className="flex justify-between mb-1">
        <span className="text-xs font-medium text-indigo-700 dark:text-indigo-300">{label}</span>
        <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">{value}</span>
      </div>
      <div className="relative w-full h-6 flex items-center">
        <div className="absolute w-full h-2 bg-indigo-200 dark:bg-indigo-700 rounded-full" />
        <div className="absolute h-2 bg-indigo-600 rounded-full" style={{ width: `${pct}%` }} />
        <input type="range" min={min} max={max} value={value}
          onChange={e => onChange(Number(e.target.value))}
          className="absolute w-full opacity-0 cursor-pointer h-6" />
        <div className="absolute w-5 h-5 bg-white border-2 border-indigo-600 rounded-full shadow pointer-events-none"
          style={{ left: `calc(${pct}% - 10px)` }} />
      </div>
    </div>
  );
}

// ── Image picker helper ───────────────────────────────────────────────────────

function ImagePickerButton({ label, value, onChange }: {
  label: string; value: string | null; onChange: (b64: string | null) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div>
      <p className="text-xs font-medium text-indigo-700 dark:text-indigo-300 mb-1">{label}</p>
      <div className="flex gap-2 items-center">
        {value ? (
          <>
            <img src={value} alt="" className="w-12 h-12 rounded-lg object-cover border border-indigo-300 dark:border-indigo-700" />
            <button onClick={() => onChange(null)} className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1">
              <X className="w-3 h-3" /> Remove
            </button>
          </>
        ) : (
          <button onClick={() => ref.current?.click()}
            className="flex items-center gap-2 px-3 py-2 border border-dashed border-indigo-400 dark:border-indigo-600 rounded-xl text-xs text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900 transition-colors">
            <Upload className="w-3 h-3" /> Upload image
          </button>
        )}
        <input ref={ref} type="file" accept="image/*" className="hidden"
          onChange={e => {
            const f = e.target.files?.[0];
            if (!f) return;
            const reader = new FileReader();
            reader.onload = () => onChange(reader.result as string);
            reader.readAsDataURL(f);
            e.target.value = '';
          }} />
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

const ImageGeneratorScreen: React.FC = () => {
  const { freepikApiKey, wavespeedApiKey, stabilityApiKey, aiProfile, addToGallery, addToast } = useApp();
  const hasRef = !!aiProfile.referenceImage;

  const [activeTab, setActiveTab] = useState<Tab>('Generate');

  // ── Generate tab state ────────────────────────────────────────────────────
  const [provider,          setProvider]          = useState<Provider>('freepik');
  const [useReference,      setUseReference]      = useState(hasRef);
  const [styleRefImage,     setStyleRefImage]      = useState<string | null>(null);
  const [prompt,            setPrompt]            = useState('');
  const [negPrompt,         setNegPrompt]         = useState('');
  const [aspectRatio,       setAspectRatio]       = useState('square_1_1');
  const [resolution,        setResolution]        = useState('2k');
  const [model,             setModel]             = useState('realism');
  const [mysticEngine,      setMysticEngine]      = useState('automatic');
  const [fixedGeneration,   setFixedGeneration]   = useState(false);
  const [structureStrength, setStructureStrength] = useState(35);
  const [adherence,         setAdherence]         = useState(50);
  const [hdr,               setHdr]               = useState(50);
  const [creativeDetailing, setCreativeDetailing] = useState(33);
  const [showAdvanced,      setShowAdvanced]      = useState(false);
  const [selectedLoraChars, setSelectedLoraChars] = useState<{id:string;name:string;strength:number}[]>([]);
  const [selectedLoraStyles,setSelectedLoraStyles]= useState<{name:string;strength:number}[]>([]);

  // ── WaveSpeed-specific state ──────────────────────────────────────────────
  const [wsImages,          setWsImages]          = useState<(string|null)[]>([null, null, null]);
  const [wsSlot0Cleared,    setWsSlot0Cleared]    = useState(false);
  const [wsSeed,            setWsSeed]            = useState('');
  const [wsSize,            setWsSize]            = useState('');

  // ── Freepik custom structure reference (img2img) ──────────────────────────
  const [customStructureRef, setCustomStructureRef] = useState<string | null>(null);

  // ── LoRA state (shared) ───────────────────────────────────────────────────
  const [loras,             setLoras]             = useState<any>({ default: [], customs: [] });
  const [lorasLoaded,       setLorasLoaded]       = useState(false);

  // ── Style transfer tab state ──────────────────────────────────────────────
  const [stSourceImage,     setStSourceImage]     = useState<string | null>(null);
  const [stStyleImage,      setStStyleImage]      = useState<string | null>(null);

  // ── Character LoRA training tab state ────────────────────────────────────
  const [loraName,          setLoraName]          = useState('');
  const [loraGender,        setLoraGender]        = useState('');
  const [loraImages,        setLoraImages]        = useState<string[]>([]);
  const [loraTraining,      setLoraTraining]      = useState<JobStatus>('idle');
  const [loraMsg,           setLoraMsg]           = useState('');

  // ── Shared job state ──────────────────────────────────────────────────────
  const [jobStatus,   setJobStatus]   = useState<JobStatus>('idle');
  const [statusMsg,   setStatusMsg]   = useState('');
  const [resultImages,setResultImages]= useState<string[]>([]);

  // Stability AI state
  const [stabilityModel,       setStabilityModel]       = useState('stable-image-core');
  const [stabilityAspectRatio, setStabilityAspectRatio] = useState('1:1');
  const [stabilitySeed,        setStabilitySeed]        = useState('');
  const [stabilityResult,      setStabilityResult]      = useState<string | null>(null);
  const [stabilityLoading,     setStabilityLoading]     = useState(false);
  const [stabilityNegPrompt,   setStabilityNegPrompt]   = useState('');
  const [stabilityStylePreset, setStabilityStylePreset] = useState('');
  const [stabilityOutputFmt,   setStabilityOutputFmt]   = useState('png');
  const [stabilityInitImage,   setStabilityInitImage]   = useState<string | null>(null);
  const [stabilityInitStrength,setStabilityInitStrength]= useState(0.65);

  const pollRef    = useRef<NodeJS.Timeout | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const promptRef  = useRef('');

  useEffect(() => () => {
    if (pollRef.current)    clearInterval(pollRef.current);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  // Load LoRAs when key is available
  const loadLoras = useCallback(async () => {
    if (!freepikApiKey || lorasLoaded) return;
    try {
      const r = await fetch(`/api/image/loras?api_key=${encodeURIComponent(freepikApiKey)}`);
      if (!r.ok) return;
      const data = await r.json();
      setLoras(data?.data || { default: [], customs: [] });
      setLorasLoaded(true);
    } catch {}
  }, [freepikApiKey, lorasLoaded]);

  useEffect(() => { loadLoras(); }, [loadLoras]);

  // ── Blank image detection ─────────────────────────────────────────────────
  // Freepik silently returns a solid black image when NSFW filter blocks content.
  // We sample the image pixels and flag it if >95% are near-black.
  const checkIfBlankImage = async (url: string): Promise<boolean> => {
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject();
        img.src = url;
      });
      const canvas = document.createElement('canvas');
      // Sample a small version — enough to detect solid black without loading the full res
      canvas.width = 32; canvas.height = 32;
      const ctx = canvas.getContext('2d');
      if (!ctx) return false;
      ctx.drawImage(img, 0, 0, 32, 32);
      const pixels = ctx.getImageData(0, 0, 32, 32).data;
      let darkCount = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        const r = pixels[i], g = pixels[i+1], b = pixels[i+2];
        if (r < 20 && g < 20 && b < 20) darkCount++;
      }
      const darkRatio = darkCount / (32 * 32);
      console.log(`[ImageGen] Blank check: ${Math.round(darkRatio * 100)}% dark pixels`);
      return darkRatio > 0.95;
    } catch {
      return false; // If check fails, assume image is fine
    }
  };

  // ── Polling helper ────────────────────────────────────────────────────────
  const freepikKeyRef = useRef(freepikApiKey);
  useEffect(() => { freepikKeyRef.current = freepikApiKey; }, [freepikApiKey]);
  const wavespeedKeyRef = useRef(wavespeedApiKey);
  useEffect(() => { wavespeedKeyRef.current = wavespeedApiKey; }, [wavespeedApiKey]);

  const startPolling = (taskId: string, statusEndpoint: string) => {
    if (pollRef.current)    clearInterval(pollRef.current);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    let consecutiveErrors = 0;
    const log = (msg: string) => console.log(`[ImageGen] ${msg}`);

    log(`Polling started — taskId: ${taskId}`);

    // Determine which API key to pass based on the endpoint
    const isWaveSpeed = statusEndpoint.includes('wavespeed');

    pollRef.current = setInterval(async () => {
      try {
        let url: string;
        if (isWaveSpeed) {
          const wsKey = wavespeedKeyRef.current || '';
          url = `${statusEndpoint}/${taskId}?ws_api_key=${encodeURIComponent(wsKey)}`;
        } else {
          const fpKey = freepikKeyRef.current || '';
          url = `${statusEndpoint}/${taskId}?api_key=${encodeURIComponent(fpKey)}`;
        }
        const r = await fetch(url);

        if (!r.ok) {
          consecutiveErrors++;
          log(`HTTP ${r.status} error (${consecutiveErrors}/5)`);
          if (consecutiveErrors >= 5) {
            clearInterval(pollRef.current!); clearTimeout(timeoutRef.current!); pollRef.current = null;
            let errMsg = `Polling failed: HTTP ${r.status}`;
            try { const e = await r.json(); errMsg = e.error || errMsg; } catch {}
            log(`Stopped: ${errMsg}`);
            setJobStatus('failed'); setStatusMsg(errMsg);
            addToast({ title: 'Generation failed', message: errMsg, type: 'error' });
          }
          return;
        }

        consecutiveErrors = 0;
        const data = await r.json();
        const status = String(data.status || '').toUpperCase();
        const urlCount = (data._imageUrls || []).length;
        log(`status=${status} urls=${urlCount} generated=${JSON.stringify(data.generated || []).slice(0,80)}`);

        if (status === 'COMPLETED') {
          clearInterval(pollRef.current!); clearTimeout(timeoutRef.current!); pollRef.current = null;
          const urls: string[] = data._imageUrls || data.generated || [];
          if (urls.length > 0) {
            // Check if Freepik returned a black/blank image (NSFW filter silently replaces output)
            const isBlank = await checkIfBlankImage(urls[0]);
            if (isBlank) {
              log('COMPLETED but image is blank/black — likely blocked by NSFW filter');
              setJobStatus('failed');
              setStatusMsg('Image was blocked by Freepik\'s content filter. Try a different prompt, or contact Freepik support about API content permissions.');
              addToast({ title: 'Blocked by content filter', message: 'Freepik returned a blank image. Try rephrasing the prompt.', type: 'error' });
            } else {
              setResultImages(urls); setJobStatus('succeeded'); setStatusMsg('');
              // Convert remote URLs to base64 data URIs before saving to gallery
              // so images persist even after the provider's temporary URLs expire
              for (let i = 0; i < urls.length; i++) {
                const originalUrl = urls[i];
                let savedUrl = originalUrl;
                try {
                  if (originalUrl.startsWith('http')) {
                    const imgEl = new Image();
                    imgEl.crossOrigin = 'anonymous';
                    await new Promise<void>((resolve, reject) => {
                      imgEl.onload = () => resolve();
                      imgEl.onerror = () => reject(new Error('load failed'));
                      imgEl.src = originalUrl;
                    });
                    const cvs = document.createElement('canvas');
                    cvs.width = imgEl.naturalWidth;
                    cvs.height = imgEl.naturalHeight;
                    const cx = cvs.getContext('2d');
                    if (cx) {
                      cx.drawImage(imgEl, 0, 0);
                      savedUrl = cvs.toDataURL('image/png');
                      log(`Converted image ${i} to base64 (${Math.round(savedUrl.length/1024)}KB)`);
                    }
                  }
                } catch (err) {
                  log(`Could not convert image ${i} to base64, saving URL directly`);
                }
                addToGallery({
                  id: `generated-${Date.now()}-${i}`, type: 'generated', mediaType: 'image',
                  url: savedUrl, prompt: promptRef.current, timestamp: Date.now(),
                });
              }
              addToast({ title: 'Done!', message: 'Saved to gallery.', type: 'success' });
            }
          } else {
            log('COMPLETED but no URLs in response');
            setJobStatus('failed'); setStatusMsg('Task completed but no images returned. May have been filtered for content.');
          }
        } else if (['FAILED','ERROR','CANCELLED'].includes(status)) {
          clearInterval(pollRef.current!); clearTimeout(timeoutRef.current!); pollRef.current = null;
          const msg = data.error || data.message || `Generation ${status.toLowerCase()}.`;
          log(`Terminal status: ${status} — ${msg}`);
          setJobStatus('failed'); setStatusMsg(msg);
          addToast({ title: 'Generation failed', message: msg, type: 'error' });
        }
      } catch (e: any) {
        consecutiveErrors++;
        const msg = e.message || 'unknown error';
        log(`Exception (${consecutiveErrors}/5): ${msg}`);
        if (consecutiveErrors >= 5) {
          clearInterval(pollRef.current!); clearTimeout(timeoutRef.current!); pollRef.current = null;
          setJobStatus('failed'); setStatusMsg('Lost connection while waiting for generation.');
        }
      }
    }, 4000);

    timeoutRef.current = setTimeout(() => {
      if (pollRef.current) {
        clearInterval(pollRef.current); pollRef.current = null;
        log('Timed out after 3 minutes');
        setJobStatus('failed'); setStatusMsg('Timed out after 3 minutes.');
      }
    }, 3 * 60 * 1000);
  };

  // ── Generate ──────────────────────────────────────────────────────────────
  const handleGenerate = async () => {
    if (!prompt.trim()) { addToast({ title: 'Prompt required', message: 'Describe the image you want.', type: 'warning' }); return; }

    // ── Always build appearance-enriched prompt first ────────────────────────
    const appearancePrefix = aiProfile.appearance?.trim();
    const enrichedPrompt = appearancePrefix
      ? `${appearancePrefix}. ${prompt.trim()}`
      : prompt.trim();

    // ── Stability AI ─────────────────────────────────────────────────────────
    if (provider === 'stability') {
      setStabilityLoading(true);
      setStabilityResult(null);
      try {
        const res = await fetch('/api/image/stability/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt:           enrichedPrompt,
            negativePrompt:   stabilityNegPrompt.trim() || undefined,
            aspectRatio:      stabilityInitImage ? undefined : stabilityAspectRatio,
            outputFormat:     stabilityOutputFmt,
            model:            stabilityModel,
            seed:             stabilitySeed ? Number(stabilitySeed) : undefined,
            stylePreset:      stabilityStylePreset || undefined,
            initImage:        stabilityInitImage || undefined,
            initImageStrength:stabilityInitImage ? stabilityInitStrength : undefined,
            apiKey:           stabilityApiKey || undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok) { addToast({ title: 'Stability AI error', message: data.error || 'Generation failed.', type: 'error' }); return; }
        setStabilityResult(data.image);
        addToGallery({ url: data.image, prompt: enrichedPrompt, provider: 'Stability AI', model: stabilityModel, aspectRatio: stabilityAspectRatio, seed: data.seed });
        addToast({ title: 'Image generated', message: `Model: ${stabilityModel}`, type: 'success' });
      } catch (e: any) {
        addToast({ title: 'Generation failed', message: e.message, type: 'error' });
      } finally {
        setStabilityLoading(false);
      }
      return;
    }

    // Check appropriate API key
    if (provider === 'freepik' && !freepikApiKey) { addToast({ title: 'No Freepik key', message: 'Add your key in Settings.', type: 'warning' }); return; }
    if (provider === 'wavespeed' && !wavespeedApiKey) { addToast({ title: 'No WaveSpeed key', message: 'Add your key in Settings.', type: 'warning' }); return; }

    setJobStatus('creating'); setStatusMsg('Creating task…'); setResultImages([]);

    const hasStructureRef = useReference && hasRef;
    const hasAnyStructureRef = !!customStructureRef || hasStructureRef;
    // Per Freepik docs: LoRAs are ignored when structure_reference OR style_reference
    // is present — either one alone is enough to disable them
    const usingRefs = hasAnyStructureRef || !!styleRefImage;
    // Also check model LoRA compatibility
    const selectedModel = MODELS.find(m => m.value === model);
    const modelSupportsLoras = selectedModel?.loraOk ?? true;
    const lorasBlocked = usingRefs || !modelSupportsLoras;
    // enrichedPrompt already has appearance prepended (computed above)
    let finalPrompt = enrichedPrompt;
    promptRef.current = finalPrompt;

    try {
      // ── WaveSpeed ──────────────────────────────────────────────────────
      if (provider === 'wavespeed') {
        promptRef.current = finalPrompt;

        // Resolve actual images to send — slot 0 auto-fills with persona photo
        const resolvedImages = wsImages.map((img, i) => {
          if (img) return img;
          if (i === 0 && hasRef && aiProfile.referenceImage && !wsSlot0Cleared) return aiProfile.referenceImage;
          return null;
        }).filter(Boolean) as string[];

        const body: any = {
          model: WS_MODEL_ID,
          prompt: finalPrompt,
          images: resolvedImages,
          seed: wsSeed.trim() || undefined,
          apiKey: wavespeedApiKey,
        };

        // Size (optional)
        if (wsSize.trim()) body.size = wsSize.trim();

        const r = await fetch('/api/wavespeed/generate', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
        if (!r.ok) { const e = await r.json(); throw new Error(e.error || 'Failed'); }
        const result = await r.json();
        const taskId = result.taskId;
        if (!taskId) throw new Error(`No task ID returned. Response: ${JSON.stringify(result)}`);
        console.log(`[ImageGen WaveSpeed] Task created: ${taskId}, refs: ${resolvedImages.length}`);
        setJobStatus('waiting'); setStatusMsg('Generating with Flux 2 Klein 9B…');
        startPolling(taskId, '/api/wavespeed/status');

      // ── Freepik Mystic ────────────────────────────────────────────────
      } else {
        let enrichedPrompt = finalPrompt;
        // Inject @charactername for LoRA characters (only when LoRAs aren't blocked)
        if (!lorasBlocked && selectedLoraChars.length > 0) {
          const char = selectedLoraChars[0];
          const charName = char.name;
          // Validate: name must be a non-numeric string (numeric = we accidentally stored the ID)
          const nameIsValid = charName && !/^\d+$/.test(charName);
          if (nameIsValid) {
            const tag = `@${charName}`;
            if (!enrichedPrompt.includes(tag)) enrichedPrompt = `${tag} ${enrichedPrompt}`;
            console.log(`[ImageGen Mystic] Injecting LoRA tag: ${tag}`);
          } else {
            // Name is missing or is a number — warn and skip the @ tag
            // The styling.characters ID will still be sent but may not work without @name in prompt
            console.warn(`[ImageGen Mystic] LoRA character name is missing or numeric ("${charName}"). Cannot inject @tag. Refresh the LoRA list.`);
            addToast({ title: 'LoRA name missing', message: 'Could not find character name. Hit Refresh on the LoRA list and try again.', type: 'warning' });
            setJobStatus('idle');
            return;
          }
        }
        promptRef.current = enrichedPrompt;
        console.log(`[ImageGen Mystic] prompt: "${enrichedPrompt.slice(0,120)}", structRef:${hasStructureRef}, styleRef:${!!styleRefImage}, model:${model}, lorasBlocked:${lorasBlocked}, loraChars:${selectedLoraChars.length}`);

        const body: any = {
          prompt: enrichedPrompt, aspectRatio, resolution, model,
          creative_detailing: creativeDetailing,
          engine: mysticEngine,
          fixed_generation: fixedGeneration,
          apiKey: freepikApiKey,
          ...(negPrompt.trim() ? { negativePrompt: negPrompt.trim() } : {}),
          // Custom upload takes priority; fall back to persona photo if toggled on
          ...((customStructureRef || hasStructureRef) ? {
            structureReference: customStructureRef || aiProfile.referenceImage,
            structureStrength,
          } : {}),
          ...(styleRefImage   ? { styleReference: styleRefImage, adherence, hdr } : {}),
          // Only send LoRAs when not blocked — max 1 character and 1 style
          ...(!lorasBlocked && selectedLoraChars.length  > 0 ? { loraCharacters: [selectedLoraChars[0]]  } : {}),
          ...(!lorasBlocked && selectedLoraStyles.length > 0 ? { loraStyles:     [selectedLoraStyles[0]] } : {}),
        };

        const r = await fetch('/api/image/generate', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
        if (!r.ok) { const e = await r.json(); throw new Error(e.error || 'Failed'); }
        const result = await r.json();
        const taskId = result.taskId;
        if (!taskId) throw new Error(`No task ID returned. Response: ${JSON.stringify(result)}`);
        console.log(`[ImageGen Mystic] Task created: ${taskId}`);
        setJobStatus('waiting'); setStatusMsg(`Generating with Mystic at ${RESOLUTIONS.find(x=>x.value===resolution)?.label||resolution}…`);
        startPolling(taskId, '/api/image/status');
      }
    } catch (e: any) {
      setJobStatus('failed'); setStatusMsg(e.message);
      addToast({ title: 'Failed', message: e.message, type: 'error' });
    }
  };

  // ── Style Transfer ────────────────────────────────────────────────────────
  const handleStyleTransfer = async () => {
    if (!stSourceImage || !stStyleImage) { addToast({ title: 'Both images required', message: 'Upload a source image and a style reference image.', type: 'warning' }); return; }
    if (!freepikApiKey) { addToast({ title: 'No Freepik key', message: 'Add your key in Settings.', type: 'warning' }); return; }

    setJobStatus('creating'); setStatusMsg('Starting style transfer…'); setResultImages([]);
    promptRef.current = 'Style transfer';

    try {
      const r = await fetch('/api/image/style-transfer', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ image: stSourceImage, referenceImage: stStyleImage, apiKey: freepikApiKey }),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error || 'Failed'); }
      const { taskId } = await r.json();
      setJobStatus('waiting'); setStatusMsg('Transferring style…');
      startPolling(taskId, '/api/image/style-transfer');
    } catch (e: any) {
      setJobStatus('failed'); setStatusMsg(e.message);
      addToast({ title: 'Failed', message: e.message, type: 'error' });
    }
  };

  // ── LoRA training ─────────────────────────────────────────────────────────
  const loraImageRef = useRef<HTMLInputElement>(null);

  const addLoraImages = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    files.forEach(f => {
      const reader = new FileReader();
      reader.onload = () => setLoraImages(prev => [...prev, (reader.result as string).split(',')[1]]);
      reader.readAsDataURL(f);
    });
    e.target.value = '';
  };

  const handleTrainLora = async () => {
    if (!loraName.trim()) { addToast({ title: 'Name required', message: 'Give your character a name.', type: 'warning' }); return; }
    if (loraImages.length < 8) { addToast({ title: 'More images needed', message: `Upload at least 8 images. You have ${loraImages.length}.`, type: 'warning' }); return; }
    if (!freepikApiKey) { addToast({ title: 'No Freepik key', message: 'Add your key in Settings.', type: 'warning' }); return; }

    setLoraTraining('creating'); setLoraMsg('Sending training images…');
    try {
      const r = await fetch('/api/image/loras/character', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ name: loraName.trim(), gender: loraGender || undefined, images: loraImages, apiKey: freepikApiKey }),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error || 'Training failed'); }
      setLoraTraining('waiting');
      setLoraMsg('Training started! This takes a few minutes. Check back in Settings → LoRAs or wait for it to appear in the LoRA list on the Generate tab.');
      addToast({ title: 'Training started!', message: `"${loraName}" character LoRA is training.`, type: 'success' });
      setLoraImages([]); setLoraName(''); setLoraGender('');
      setLorasLoaded(false); // force refresh next time
    } catch (e: any) {
      setLoraTraining('failed'); setLoraMsg(e.message);
      addToast({ title: 'Training failed', message: e.message, type: 'error' });
    }
  };

  const isGenerating = jobStatus === 'creating' || jobStatus === 'waiting';
  const allLoras = [...(loras.default || []), ...(loras.customs || [])];
  const characterLoras = allLoras.filter((l: any) => l.type === 'character');
  const styleLoras     = allLoras.filter((l: any) => l.type === 'style');
  // Render-time LoRA block check (mirrors the logic in handleGenerate)
  const renderUsingRefs = (useReference && hasRef) || !!customStructureRef || !!styleRefImage;
  const renderSelectedModel = MODELS.find(m => m.value === model);
  const renderLorasBlocked = renderUsingRefs || !(renderSelectedModel?.loraOk ?? true);
  const aspectRatios = ASPECT_RATIOS_MYSTIC;

  const downloadImage = (url: string, i: number) => {
    const a = document.createElement('a');
    a.href = url; a.download = `indigo-image-${Date.now()}-${i}.png`; a.target = '_blank'; a.click();
  };

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4">
      <div>
        <h2 className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">Image Generator</h2>
        <p className="text-xs text-indigo-400 dark:text-indigo-500 mt-0.5">
          Powered by {provider === 'wavespeed' ? 'WaveSpeed AI' : provider === 'stability' ? 'Stability AI' : 'Freepik'}
        </p>
      </div>

      {provider === 'freepik' && !freepikApiKey && (
        <div className="p-3 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-xl text-sm text-amber-700 dark:text-amber-300">
          Add your Freepik API key in Settings. New accounts get $5 free at{' '}
          <a href="https://www.freepik.com/developers/dashboard" target="_blank" rel="noreferrer" className="underline font-medium">freepik.com/developers</a>.
        </div>
      )}
      {provider === 'wavespeed' && !wavespeedApiKey && (
        <div className="p-3 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-xl text-sm text-amber-700 dark:text-amber-300">
          Add your WaveSpeed API key in Settings. Get one at{' '}
          <a href="https://wavespeed.ai/accesskey" target="_blank" rel="noreferrer" className="underline font-medium">wavespeed.ai/accesskey</a>. Requires a top-up to activate.
        </div>
      )}
      {provider === 'stability' && !stabilityApiKey && (
        <div className="p-3 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-xl text-sm text-blue-700 dark:text-blue-300">
          To use your own Stability AI key add it in Settings — otherwise the app uses the server key.
          Get your own key at{' '}
          <a href="https://platform.stability.ai/account/keys" target="_blank" rel="noreferrer" className="underline font-medium">platform.stability.ai</a>.
        </div>
      )}

      {/* Tabs */}
      <div className="flex p-1 bg-indigo-50 dark:bg-indigo-900/50 rounded-xl border border-indigo-100 dark:border-indigo-800">
        {TABS.map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2 px-2 rounded-lg text-xs font-semibold transition-all ${activeTab === tab ? 'bg-white dark:bg-indigo-800 text-indigo-600 dark:text-indigo-100 shadow-sm' : 'text-indigo-400 hover:text-indigo-600 dark:text-indigo-500 dark:hover:text-indigo-300'}`}>
            {tab}
          </button>
        ))}
      </div>

      {/* Engine selector — shown on Generate tab */}
      {activeTab === 'Generate' && (
        <div className="p-3 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl border border-indigo-100 dark:border-indigo-800">
          <p className="text-xs font-medium text-indigo-700 dark:text-indigo-300 mb-2">AI Engine</p>
          <div className="space-y-2">
            {PROVIDERS.map(eng => (
              <button key={eng.value} onClick={() => setProvider(eng.value)}
                className={`w-full flex items-center gap-3 p-2.5 rounded-xl border text-left transition-colors ${provider === eng.value ? 'border-indigo-500 bg-indigo-100 dark:bg-indigo-800/60' : 'border-indigo-200 dark:border-indigo-700 hover:border-indigo-400'}`}>
                <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${provider === eng.value ? 'border-indigo-600 bg-indigo-600' : 'border-indigo-400'}`} />
                <div>
                  <p className="text-xs font-semibold text-indigo-900 dark:text-indigo-100">{eng.label.split(' — ')[0]}</p>
                  <p className="text-[10px] text-indigo-500 dark:text-indigo-400">{eng.label.split(' — ')[1]}</p>
                </div>
              </button>
            ))}
          </div>
          {provider === 'wavespeed' && (
            <p className="text-[10px] text-indigo-400 dark:text-indigo-500 mt-2">
              Flux 2 Klein 9B sends your reference photos directly as subject guides for better character face consistency. Upload up to 3 images and describe the edit you want.
            </p>
          )}
        </div>
      )}

      {/* ── GENERATE TAB ── */}
      {activeTab === 'Generate' && (
        <div className="space-y-4">

          {/* ── MYSTIC: Pose + Style reference slots ── */}
          {provider === 'freepik' && (
          <div className="p-3 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl border border-indigo-100 dark:border-indigo-800 space-y-3">
            <p className="text-sm font-semibold text-indigo-800 dark:text-indigo-200">Reference Images</p>
            <div className="grid grid-cols-2 gap-3">
              {/* Slot 1 — Structure Reference (pose / composition) */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-indigo-700 dark:text-indigo-300">Structure Reference (img2img)</p>
                <p className="text-[10px] text-indigo-400 dark:text-indigo-500">Copies body pose and composition. Upload any image OR use the AI persona photo.</p>

                {/* Custom upload takes priority */}
                {customStructureRef ? (
                  <div className="relative">
                    <img src={customStructureRef} alt="Custom structure ref"
                      className="w-full aspect-square object-cover rounded-xl border-2 border-indigo-400 dark:border-indigo-500" />
                    <div className="absolute bottom-1 left-1 right-1 bg-indigo-600/80 rounded-lg px-1.5 py-0.5 text-[9px] text-white text-center truncate">
                      Custom image
                    </div>
                    <button onClick={() => setCustomStructureRef(null)}
                      className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : hasRef && useReference ? (
                  <div className="relative">
                    <img src={aiProfile.referenceImage!} alt="Pose ref"
                      className="w-full aspect-square object-cover rounded-xl border-2 border-indigo-400 dark:border-indigo-500" />
                    <div className="absolute bottom-1 left-1 right-1 bg-indigo-600/80 rounded-lg px-1.5 py-0.5 text-[9px] text-white text-center truncate">
                      {aiProfile.name}'s profile image
                    </div>
                    <button onClick={() => setUseReference(false)}
                      className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {/* Upload custom image */}
                    <label className="w-full aspect-square rounded-xl border-2 border-dashed border-indigo-300 dark:border-indigo-600 flex flex-col items-center justify-center gap-1 hover:bg-indigo-100 dark:hover:bg-indigo-800 transition-colors cursor-pointer text-indigo-400 dark:text-indigo-500">
                      <Upload className="w-5 h-5" />
                      <span className="text-[10px] text-center px-1">Upload custom image</span>
                      <input type="file" accept="image/*" className="hidden"
                        onChange={e => {
                          const f = e.target.files?.[0]; if (!f) return;
                          const reader = new FileReader();
                          reader.onload = () => setCustomStructureRef(reader.result as string);
                          reader.readAsDataURL(f); e.target.value = '';
                        }} />
                    </label>
                    {hasRef && (
                      <button onClick={() => setUseReference(true)}
                        className="w-full py-1 text-[10px] text-indigo-600 dark:text-indigo-400 border border-indigo-300 dark:border-indigo-600 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-800 transition-colors flex items-center justify-center gap-1">
                        <User className="w-3 h-3" /> Use {aiProfile.name}'s photo instead
                      </button>
                    )}
                  </div>
                )}
              </div>
              {/* Slot 2 — Style Reference */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-indigo-700 dark:text-indigo-300">Style Reference</p>
                <p className="text-[10px] text-indigo-400 dark:text-indigo-500">Transfers lighting, color palette, and artistic look. Prompt has limited effect when active.</p>
                {styleRefImage ? (
                  <div className="relative">
                    <img src={styleRefImage} alt="Style ref"
                      className="w-full aspect-square object-cover rounded-xl border-2 border-indigo-400 dark:border-indigo-500" />
                    <button onClick={() => setStyleRefImage(null)}
                      className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <label className="w-full aspect-square rounded-xl border-2 border-dashed border-indigo-300 dark:border-indigo-600 flex flex-col items-center justify-center gap-1 hover:bg-indigo-100 dark:hover:bg-indigo-800 transition-colors cursor-pointer text-indigo-400 dark:text-indigo-500">
                    <Upload className="w-5 h-5" />
                    <span className="text-[10px] text-center px-1">Upload style image</span>
                    <input type="file" accept="image/*" className="hidden"
                      onChange={e => {
                        const f = e.target.files?.[0]; if (!f) return;
                        const reader = new FileReader();
                        reader.onload = () => setStyleRefImage(reader.result as string);
                        reader.readAsDataURL(f); e.target.value = '';
                      }} />
                  </label>
                )}
              </div>
            </div>
            {(useReference && hasRef || !!customStructureRef) && (
              <div className="pt-1 space-y-2">
                <Slider label="Structure Strength" value={structureStrength} min={0} max={100} onChange={setStructureStrength} />
                <p className="text-[10px] text-indigo-400 -mt-1"><strong>Lower</strong> = looser interpretation of the composition. <strong>Higher</strong> = more tightly copies the exact pose, framing, and composition.</p>
                <p className="text-[10px] text-amber-500 dark:text-amber-400">⚠ Freepik will force the same aspect ratio as the reference photo, ignoring the Ratio setting below.</p>
              </div>
            )}
            {aiProfile.appearance && (
              <p className="text-[10px] text-indigo-500 dark:text-indigo-400">
                <span className="font-medium">Appearance description included in prompt. </span>
                Style reference ignores this — use Structure Reference or LoRA instead for character appearance.
              </p>
            )}
            {renderLorasBlocked && (selectedLoraChars.length + selectedLoraStyles.length > 0) && (
              <p className="text-[10px] text-amber-500">⚠ LoRAs are disabled when any reference image is active.</p>
            )}
          </div>
          )}

          {/* ── WAVESPEED: Flux 2 Klein 9B Edit — image slots ── */}
          {provider === 'wavespeed' && (
          <div className="space-y-3">
            {/* Reference images — 3 upload slots */}
            <div className="p-3 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl border border-indigo-100 dark:border-indigo-800 space-y-3">
            <div>
              <p className="text-sm font-semibold text-indigo-800 dark:text-indigo-200">Reference Images</p>
              <p className="text-[10px] text-indigo-400 dark:text-indigo-500 mt-0.5">Upload up to 3 images to guide the edit. Each slot has a suggested role, but you can use any image in any slot.</p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {([0,1,2] as const).map(i => {
                const WS_SLOT_LABELS  = ['Character / Face', 'Pose / Style', 'Scene / BG'] as const;
                const WS_SLOT_HINTS   = ['Best for face & identity', 'Body pose & style guide', 'Background & scene'] as const;
                const label    = WS_SLOT_LABELS[i];
                const hint     = WS_SLOT_HINTS[i];
                const val      = wsImages[i];
                const setVal   = (v: string | null) => setWsImages(prev => { const n=[...prev]; n[i]=v; return n; });

                // Slot 0 auto-fills with persona photo UNLESS user has cleared it
                const isAutoFilled = i === 0 && !val && hasRef && !wsSlot0Cleared;
                const displayImg = isAutoFilled ? aiProfile.referenceImage! : val;

                return (
                  <div key={i} className="space-y-1">
                    <p className="text-xs font-medium text-indigo-700 dark:text-indigo-300">
                      {label}{isAutoFilled ? <span className="text-[9px] text-indigo-400 ml-1">(auto)</span> : ''}
                    </p>
                    <p className="text-[9px] text-indigo-400 dark:text-indigo-500">{hint}</p>
                    {displayImg ? (
                      <div className="relative">
                        <img src={displayImg} alt={label}
                          className={`w-full aspect-square object-cover rounded-xl border-2 ${isAutoFilled ? 'border-indigo-300 dark:border-indigo-600' : 'border-indigo-400 dark:border-indigo-500'}`} />
                        {isAutoFilled && (
                          <div className="absolute bottom-1 left-1 right-1 bg-indigo-600/80 rounded-lg px-1.5 py-0.5 text-[9px] text-white text-center truncate">
                            {aiProfile.name}'s photo
                          </div>
                        )}
                        <button
                          onClick={() => {
                            if (i === 0 && isAutoFilled) {
                              setWsSlot0Cleared(true); // prevent re-auto-fill
                            } else {
                              setVal(null);
                            }
                          }}
                          className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <label className="w-full aspect-square rounded-xl border-2 border-dashed border-indigo-300 dark:border-indigo-600 flex flex-col items-center justify-center gap-1 hover:bg-indigo-100 dark:hover:bg-indigo-800 transition-colors cursor-pointer text-indigo-400 dark:text-indigo-500">
                        <Upload className="w-5 h-5" />
                        <span className="text-[10px] text-center px-1">{i === 0 && wsSlot0Cleared && hasRef ? `Re-add ${aiProfile.name}'s photo` : 'Upload'}</span>
                        <input type="file" accept="image/*" className="hidden"
                          onChange={e => {
                            const f = e.target.files?.[0]; if (!f) return;
                            const reader = new FileReader();
                            reader.onload = () => {
                              setVal(reader.result as string);
                              if (i === 0) setWsSlot0Cleared(false); // uploading re-enables tracking
                            };
                            reader.readAsDataURL(f); e.target.value = '';
                          }} />
                      </label>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          </div>
          )}

          {/* Prompt */}
          <div>
            <label className="block text-sm font-medium text-indigo-700 dark:text-indigo-300 mb-1">Prompt</label>
            <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={3}
              placeholder={`Describe the scene — e.g. "${aiProfile.name} sitting in a cozy café, warm lighting, photorealistic"`}
              className="w-full p-3 border border-indigo-300 dark:border-indigo-700 rounded-xl bg-white dark:bg-indigo-950 text-indigo-900 dark:text-indigo-100 text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none" />
          </div>

          {/* Core controls — Freepik only (WaveSpeed uses size in its own controls) */}
          {provider === 'freepik' && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-indigo-700 dark:text-indigo-300 mb-1">Ratio</label>
              <select value={aspectRatio} onChange={e => setAspectRatio(e.target.value)}
                className="w-full p-2 border border-indigo-300 dark:border-indigo-700 rounded-xl bg-white dark:bg-indigo-950 text-indigo-900 dark:text-indigo-100 text-xs">
                {aspectRatios.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-indigo-700 dark:text-indigo-300 mb-1">Resolution</label>
              <select value={resolution} onChange={e => setResolution(e.target.value)}
                className="w-full p-2 border border-indigo-300 dark:border-indigo-700 rounded-xl bg-white dark:bg-indigo-950 text-indigo-900 dark:text-indigo-100 text-xs">
                {RESOLUTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
          </div>
          )}

          {/* Mystic-only: Style model */}
          {provider === 'freepik' && (
            <div>
              <label className="block text-xs font-medium text-indigo-700 dark:text-indigo-300 mb-1">Model</label>
              <select value={model} onChange={e => setModel(e.target.value)}
                className="w-full p-2 border border-indigo-300 dark:border-indigo-700 rounded-xl bg-white dark:bg-indigo-950 text-indigo-900 dark:text-indigo-100 text-xs">
                {MODELS.map(m => <option key={m.value} value={m.value}>{m.label}{m.loraOk ? '' : ' ✕ LoRA'}</option>)}
              </select>
              {!renderSelectedModel?.loraOk && (
                <p className="text-[10px] text-amber-500 mt-0.5">This model ignores LoRAs. Use Realism or Zen if you want LoRA support.</p>
              )}
            </div>
          )}

          {/* WaveSpeed-only: Seed + Size + LoRA URLs */}
          {provider === 'wavespeed' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-indigo-700 dark:text-indigo-300 mb-1">
                    Seed <span className="font-normal text-indigo-400">(optional)</span>
                  </label>
                  <input type="number" value={wsSeed} onChange={e => setWsSeed(e.target.value)}
                    placeholder="-1 = random"
                    min={-1} max={4294967295}
                    className="w-full p-2 border border-indigo-300 dark:border-indigo-700 rounded-xl bg-white dark:bg-indigo-950 text-indigo-900 dark:text-indigo-100 text-xs focus:ring-2 focus:ring-indigo-500 outline-none" />
                  <p className="text-[10px] text-indigo-400 mt-0.5">Same seed = same image. -1 for random.</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-indigo-700 dark:text-indigo-300 mb-1">
                    Size <span className="font-normal text-indigo-400">(optional)</span>
                  </label>
                  <input type="text" value={wsSize} onChange={e => setWsSize(e.target.value)}
                    placeholder="e.g. 1024x1024"
                    className="w-full p-2 border border-indigo-300 dark:border-indigo-700 rounded-xl bg-white dark:bg-indigo-950 text-indigo-900 dark:text-indigo-100 text-xs focus:ring-2 focus:ring-indigo-500 outline-none" />
                  <p className="text-[10px] text-indigo-400 mt-0.5">Leave empty to match input image size.</p>
                </div>
              </div>
            </div>
          )}

          {/* ── STABILITY AI controls ── */}
          {provider === 'stability' && (
            <div className="space-y-3">
              {/* Model + Aspect Ratio */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-indigo-700 dark:text-indigo-300 mb-1">Model</label>
                  <select value={stabilityModel} onChange={e => setStabilityModel(e.target.value)}
                    className="w-full p-2 border border-indigo-300 dark:border-indigo-700 rounded-xl bg-white dark:bg-indigo-950 text-indigo-900 dark:text-indigo-100 text-xs">
                    {STABILITY_MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-indigo-700 dark:text-indigo-300 mb-1">
                    Aspect Ratio {stabilityInitImage && <span className="text-indigo-400">(ignored in img2img)</span>}
                  </label>
                  <select value={stabilityAspectRatio} onChange={e => setStabilityAspectRatio(e.target.value)}
                    disabled={!!stabilityInitImage}
                    className="w-full p-2 border border-indigo-300 dark:border-indigo-700 rounded-xl bg-white dark:bg-indigo-950 text-indigo-900 dark:text-indigo-100 text-xs disabled:opacity-50">
                    {STABILITY_ASPECT_RATIOS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </div>
              </div>

              {/* Output format + Style preset */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-indigo-700 dark:text-indigo-300 mb-1">Output Format</label>
                  <select value={stabilityOutputFmt} onChange={e => setStabilityOutputFmt(e.target.value)}
                    className="w-full p-2 border border-indigo-300 dark:border-indigo-700 rounded-xl bg-white dark:bg-indigo-950 text-indigo-900 dark:text-indigo-100 text-xs">
                    <option value="png">PNG (lossless)</option>
                    <option value="jpeg">JPEG (smaller)</option>
                    <option value="webp">WebP (modern)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-indigo-700 dark:text-indigo-300 mb-1">Style Preset</label>
                  <select value={stabilityStylePreset} onChange={e => setStabilityStylePreset(e.target.value)}
                    className="w-full p-2 border border-indigo-300 dark:border-indigo-700 rounded-xl bg-white dark:bg-indigo-950 text-indigo-900 dark:text-indigo-100 text-xs">
                    <option value="">None</option>
                    <option value="photographic">Photographic</option>
                    <option value="anime">Anime</option>
                    <option value="digital-art">Digital Art</option>
                    <option value="comic-book">Comic Book</option>
                    <option value="fantasy-art">Fantasy Art</option>
                    <option value="cinematic">Cinematic</option>
                    <option value="3d-model">3D Model</option>
                    <option value="pixel-art">Pixel Art</option>
                    <option value="line-art">Line Art</option>
                    <option value="neon-punk">Neon Punk</option>
                    <option value="isometric">Isometric</option>
                    <option value="origami">Origami</option>
                    <option value="low-poly">Low Poly</option>
                    <option value="tile-texture">Tile Texture</option>
                  </select>
                </div>
              </div>

              {/* Negative prompt */}
              <div>
                <label className="block text-xs font-medium text-indigo-700 dark:text-indigo-300 mb-1">Negative Prompt <span className="font-normal text-indigo-400">(optional)</span></label>
                <input type="text" value={stabilityNegPrompt} onChange={e => setStabilityNegPrompt(e.target.value)}
                  placeholder="What to avoid — e.g. blurry, extra limbs, watermark"
                  className="w-full p-2 border border-indigo-300 dark:border-indigo-700 rounded-xl bg-white dark:bg-indigo-950 text-indigo-900 dark:text-indigo-100 text-xs focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>

              {/* Seed */}
              <div>
                <label className="block text-xs font-medium text-indigo-700 dark:text-indigo-300 mb-1">Seed <span className="font-normal text-indigo-400">(optional)</span></label>
                <input type="number" value={stabilitySeed} onChange={e => setStabilitySeed(e.target.value)}
                  placeholder="Leave empty for random" min={0} max={4294967295}
                  className="w-full p-2 border border-indigo-300 dark:border-indigo-700 rounded-xl bg-white dark:bg-indigo-950 text-indigo-900 dark:text-indigo-100 text-xs focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>

              {/* Image to Image */}
              <div className="p-3 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl border border-indigo-100 dark:border-indigo-800 space-y-2">
                <p className="text-xs font-semibold text-indigo-700 dark:text-indigo-300">Image-to-Image (optional)</p>
                <ImagePickerButton label="Init Image" value={stabilityInitImage} onChange={setStabilityInitImage} />
                {stabilityInitImage && (
                  <div>
                    <label className="block text-[11px] font-medium text-indigo-700 dark:text-indigo-300 mb-1">
                      Strength: {stabilityInitStrength.toFixed(2)} <span className="font-normal text-indigo-400">(lower = closer to init image)</span>
                    </label>
                    <input type="range" min="0.1" max="1.0" step="0.05" value={stabilityInitStrength}
                      onChange={e => setStabilityInitStrength(parseFloat(e.target.value))}
                      className="w-full h-1.5 bg-indigo-200 dark:bg-indigo-800 rounded-lg appearance-none cursor-pointer accent-indigo-600" />
                  </div>
                )}
                <p className="text-[10px] text-indigo-400">Upload an image as starting point. The prompt guides the transformation.</p>
              </div>

              {/* Result */}
              {stabilityLoading && (
                <div className="flex items-center gap-2 p-3 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl border border-indigo-100 dark:border-indigo-800">
                  <RefreshCw className="w-4 h-4 text-indigo-500 animate-spin" />
                  <span className="text-sm text-indigo-600 dark:text-indigo-400">Generating with Stability AI…</span>
                </div>
              )}
              {stabilityResult && !stabilityLoading && (
                <div className="space-y-2">
                  <img src={stabilityResult} alt="Stability AI result"
                    className="w-full rounded-xl border border-indigo-200 dark:border-indigo-700 shadow" />
                  <button onClick={() => downloadImage(stabilityResult, 0)}
                    className="flex items-center gap-1.5 text-xs text-indigo-600 dark:text-indigo-400 hover:underline">
                    <Download className="w-3.5 h-3.5" /> Download
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Advanced Settings — Mystic only */}
          {provider === 'freepik' && (
            <div>
              <button onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex items-center gap-2 text-sm font-medium text-indigo-600 dark:text-indigo-400 py-1">
                {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                Advanced Settings
              </button>
              {showAdvanced && (
                <div className="mt-3 space-y-4 p-4 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl border border-indigo-100 dark:border-indigo-800">
                  <div>
                    <label className="block text-sm font-medium text-indigo-700 dark:text-indigo-300 mb-1">Negative Prompt</label>
                    <input type="text" value={negPrompt} onChange={e => setNegPrompt(e.target.value)}
                      placeholder="What to avoid — e.g. blurry, distorted face, extra limbs"
                      className="w-full p-2 border border-indigo-300 dark:border-indigo-700 rounded-xl bg-white dark:bg-indigo-950 text-indigo-900 dark:text-indigo-100 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-indigo-700 dark:text-indigo-300 mb-1">Render Engine</label>
                    <select value={mysticEngine} onChange={e => setMysticEngine(e.target.value)}
                      className="w-full p-2 border border-indigo-300 dark:border-indigo-700 rounded-xl bg-white dark:bg-indigo-950 text-indigo-900 dark:text-indigo-100 text-sm">
                      {MYSTIC_PROVIDERS.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <Slider label="Creative Detailing" value={creativeDetailing} min={0} max={100} onChange={setCreativeDetailing} />
                    <p className="text-[10px] text-indigo-400 -mt-1"><strong>Higher</strong> = sharper detail. <strong>Lower</strong> = more natural. Default 33.</p>
                  </div>
                  {/* adherence and hdr only take effect when style_reference is provided */}
                  {styleRefImage && (
                    <>
                      <div>
                        <Slider label="Adherence (style ref only)" value={adherence} min={0} max={100} onChange={setAdherence} />
                        <p className="text-[10px] text-indigo-400 -mt-1"><strong>Higher</strong> = follows prompt more, less style transfer. <strong>Lower</strong> = closer to style reference. Default 50.</p>
                      </div>
                      <div>
                        <Slider label="HDR (style ref only)" value={hdr} min={0} max={100} onChange={setHdr} />
                        <p className="text-[10px] text-indigo-400 -mt-1"><strong>Higher</strong> = more detail, more AI look. <strong>Lower</strong> = more natural, artistic. Default 50.</p>
                      </div>
                    </>
                  )}
                  {!styleRefImage && (
                    <p className="text-[10px] text-indigo-400">Adherence and HDR sliders only appear when a style reference image is active.</p>
                  )}
                  <div className="flex items-center justify-between py-1">
                    <div>
                      <p className="text-sm font-medium text-indigo-700 dark:text-indigo-300">Fixed Generation</p>
                      <p className="text-[10px] text-indigo-400">Same settings always produce the same image. Good for fine-tuning prompts.</p>
                    </div>
                    <button onClick={() => setFixedGeneration(!fixedGeneration)}
                      className={`w-10 h-6 rounded-full transition-colors flex-shrink-0 ${fixedGeneration ? 'bg-indigo-600' : 'bg-indigo-200 dark:bg-indigo-800'}`}>
                      <div className={`w-4 h-4 rounded-full bg-white transition-transform mx-auto ${fixedGeneration ? 'translate-x-2' : '-translate-x-2'}`} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Generate button */}
          <button
            onClick={handleGenerate}
            disabled={
              (provider === 'stability' ? stabilityLoading : isGenerating) ||
              !prompt.trim() ||
              (provider === 'freepik' && !freepikApiKey) ||
              (provider === 'wavespeed' && !wavespeedApiKey)
            }
            data-testid="generate-image-btn"
            className="w-full py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
            {provider === 'stability'
              ? stabilityLoading
                ? <><RefreshCw className="w-4 h-4 animate-spin" />Generating…</>
                : <><Wand2 className="w-4 h-4" />Generate with Stability AI</>
              : isGenerating
                ? <><RefreshCw className="w-4 h-4 animate-spin" />{statusMsg || 'Generating…'}</>
                : <><Wand2 className="w-4 h-4" />Generate Image</>}
          </button>

          {/* LoRA section — Mystic only, below generate button */}
          {provider === 'freepik' && freepikApiKey && (lorasLoaded ? allLoras.length > 0 : true) && ( // renderLorasBlocked controls opacity inside
            <div className={`p-3 rounded-xl border space-y-3 transition-opacity ${renderLorasBlocked ? 'opacity-50' : ''} bg-indigo-50 dark:bg-indigo-900/30 border-indigo-100 dark:border-indigo-800`}>
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-indigo-700 dark:text-indigo-300">Your LoRAs</p>
                <button onClick={() => { setLorasLoaded(false); setTimeout(loadLoras, 100); }}
                  className="text-xs text-indigo-500 dark:text-indigo-400 hover:underline flex items-center gap-1">
                  <RefreshCw className="w-3 h-3" /> Refresh
                </button>
              </div>
              {renderLorasBlocked && (
                <p className="text-[10px] text-amber-500 dark:text-amber-400">
                  {renderUsingRefs ? "LoRAs are disabled when any reference image is active." : "This model does not support LoRAs. Use Realism or Zen instead."}
                </p>
              )}
              {!lorasLoaded && <p className="text-xs text-indigo-400 flex items-center gap-1"><RefreshCw className="w-3 h-3 animate-spin" /> Loading…</p>}
              {lorasLoaded && allLoras.length === 0 && (
                <p className="text-xs text-indigo-400">No LoRAs yet — train one on the Character LoRA tab.</p>
              )}
              {lorasLoaded && characterLoras.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-indigo-600 dark:text-indigo-400 mb-1">Characters</p>
                  <div className="space-y-1">
                    {characterLoras.map((l: any) => {
                      const sel = selectedLoraChars.find(x => x.id === String(l.id));
                      const isTraining = ['training','queued','pending'].includes(l.training?.status);
                      return (
                        <div key={l.id}
                          onClick={() => !renderLorasBlocked && !isTraining && setSelectedLoraChars(prev =>
                            sel ? prev.filter(x => x.id !== String(l.id)) : [...prev, { id: String(l.id), name: l.name, strength: 100 }]
                          )}
                          className={`flex items-center gap-2 p-2 rounded-lg border transition-colors
                            ${sel && !renderLorasBlocked ? 'border-indigo-500 bg-indigo-100 dark:bg-indigo-800/60' : 'border-indigo-200 dark:border-indigo-700'}
                            ${!renderLorasBlocked && !isTraining ? 'cursor-pointer hover:border-indigo-400' : 'cursor-default'}`}>
                          {l.preview && <img src={l.preview} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" />}
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-indigo-900 dark:text-indigo-100 truncate">{l.name}</p>
                            <p className={`text-[10px] ${isTraining ? 'text-amber-500' : 'text-indigo-400'}`}>
                              {isTraining ? '⏳ Still training…' : l.training?.status || 'ready'}
                            </p>
                          </div>
                          {sel && !renderLorasBlocked && <CheckCircle className="w-4 h-4 text-indigo-600 flex-shrink-0" />}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {lorasLoaded && styleLoras.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-indigo-600 dark:text-indigo-400 mb-1">Styles</p>
                  <div className="space-y-1">
                    {styleLoras.map((l: any) => {
                      const sel = selectedLoraStyles.find(x => x.name === l.name);
                      return (
                        <div key={l.id || l.name}
                          onClick={() => !renderLorasBlocked && setSelectedLoraStyles(prev =>
                            sel ? prev.filter(x => x.name !== l.name) : [...prev, { name: l.name, strength: 100 }]
                          )}
                          className={`flex items-center gap-2 p-2 rounded-lg border transition-colors
                            ${sel && !renderLorasBlocked ? 'border-indigo-500 bg-indigo-100 dark:bg-indigo-800/60' : 'border-indigo-200 dark:border-indigo-700'}
                            ${!renderLorasBlocked ? 'cursor-pointer hover:border-indigo-400' : 'cursor-default'}`}>
                          {l.preview && <img src={l.preview} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" />}
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-indigo-900 dark:text-indigo-100 truncate">{l.name}</p>
                            {l.description && <p className="text-[10px] text-indigo-400 truncate">{l.description}</p>}
                          </div>
                          {sel && !renderLorasBlocked && <CheckCircle className="w-4 h-4 text-indigo-600 flex-shrink-0" />}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {/* Strength sliders — shown when a LoRA is selected */}
              {!renderLorasBlocked && selectedLoraChars.length > 0 && (
                <div>
                  <Slider
                    label={`Character strength: ${selectedLoraChars[0].name}`}
                    value={selectedLoraChars[0].strength}
                    min={0} max={200}
                    onChange={v => setSelectedLoraChars(prev => prev.map((c, i) => i === 0 ? { ...c, strength: v } : c))}
                  />
                  <p className="text-[10px] text-indigo-400 -mt-1">Lower (60–80) = character guides the style without overwhelming the prompt. Higher (100–150) = character dominates. Default 100.</p>
                </div>
              )}
              {!renderLorasBlocked && selectedLoraStyles.length > 0 && (
                <div>
                  <Slider
                    label={`Style strength: ${selectedLoraStyles[0].name}`}
                    value={selectedLoraStyles[0].strength}
                    min={0} max={200}
                    onChange={v => setSelectedLoraStyles(prev => prev.map((s, i) => i === 0 ? { ...s, strength: v } : s))}
                  />
                  <p className="text-[10px] text-indigo-400 -mt-1">Lower values let the prompt and model override the style. Higher values force the style. Default 100.</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── STYLE TRANSFER TAB ── */}
      {activeTab === 'Style Transfer' && (
        <div className="space-y-4">
          <div className="p-3 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl border border-indigo-100 dark:border-indigo-800 text-xs text-indigo-500 dark:text-indigo-400">
            Style Transfer takes any two images and applies the visual look of one onto the other — colors, texture, lighting, artistic style.
          </div>
          <ImagePickerButton label="Source Image (what to transform)" value={stSourceImage} onChange={setStSourceImage} />
          <ImagePickerButton label="Style Image (the look to copy)" value={stStyleImage} onChange={setStStyleImage} />
          <button onClick={handleStyleTransfer} disabled={isGenerating || !stSourceImage || !stStyleImage || !freepikApiKey}
            className="w-full py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
            {isGenerating ? <><RefreshCw className="w-4 h-4 animate-spin" />{statusMsg}</> : <><Palette className="w-4 h-4" />Transfer Style</>}
          </button>
        </div>
      )}

      {/* ── CHARACTER LORA TAB ── */}
      {activeTab === 'Character LoRA' && (
        <div className="space-y-4">
          <div className="p-3 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl border border-indigo-100 dark:border-indigo-800 text-xs text-indigo-500 dark:text-indigo-400 space-y-1">
            <p><strong>Train a Character LoRA</strong> — upload 8–20 photos of your AI persona and Freepik will train a small custom model that remembers their face and appearance. Once trained it will appear in the <strong>Your LoRAs</strong> section on the Generate tab.</p>
            <p>Training takes several minutes. Once complete, turn off both reference image slots on the Generate tab and select your LoRA from the list. Use <strong>@charactername</strong> in your prompt for best results.</p>
            <p className="text-amber-500 dark:text-amber-400">⚠ Training uses Freepik credits. Check your balance at <a href="https://www.freepik.com/developers/dashboard" target="_blank" rel="noreferrer" className="underline">freepik.com/developers/dashboard</a>.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-indigo-700 dark:text-indigo-300 mb-1">Character Name</label>
            <input type="text" value={loraName} onChange={e => setLoraName(e.target.value)}
              placeholder={`e.g. "${aiProfile.name}"`}
              className="w-full p-2 border border-indigo-300 dark:border-indigo-700 rounded-xl bg-white dark:bg-indigo-950 text-indigo-900 dark:text-indigo-100 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
          </div>

          <div>
            <label className="block text-sm font-medium text-indigo-700 dark:text-indigo-300 mb-1">Gender <span className="font-normal text-indigo-400">(optional, helps training)</span></label>
            <select value={loraGender} onChange={e => setLoraGender(e.target.value)}
              className="w-full p-2 border border-indigo-300 dark:border-indigo-700 rounded-xl bg-white dark:bg-indigo-950 text-indigo-900 dark:text-indigo-100 text-sm">
              <option value="">Not specified</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-indigo-700 dark:text-indigo-300">Training Images <span className="text-indigo-400 font-normal">({loraImages.length}/20 — min 8)</span></label>
              <button onClick={() => loraImageRef.current?.click()}
                className="flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:underline">
                <Plus className="w-3 h-3" /> Add images
              </button>
              <input ref={loraImageRef} type="file" accept="image/*" multiple className="hidden" onChange={addLoraImages} />
            </div>
            {loraImages.length === 0 ? (
              <button onClick={() => loraImageRef.current?.click()}
                className="w-full py-8 border-2 border-dashed border-indigo-300 dark:border-indigo-700 rounded-xl text-indigo-400 dark:text-indigo-500 text-sm flex flex-col items-center gap-2 hover:bg-indigo-50 dark:hover:bg-indigo-900 transition-colors">
                <Upload className="w-6 h-6" />
                Tap to upload photos
              </button>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {loraImages.map((img, i) => (
                  <div key={i} className="relative group">
                    <img src={`data:image/jpeg;base64,${img}`} alt="" className="w-full aspect-square object-cover rounded-lg border border-indigo-200 dark:border-indigo-700" />
                    <button onClick={() => setLoraImages(prev => prev.filter((_, j) => j !== i))}
                      className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                <button onClick={() => loraImageRef.current?.click()}
                  className="aspect-square border-2 border-dashed border-indigo-300 dark:border-indigo-700 rounded-lg flex items-center justify-center text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900 transition-colors">
                  <Plus className="w-5 h-5" />
                </button>
              </div>
            )}
            <p className="text-[10px] text-indigo-400 mt-1">Use clear, well-lit photos. Variety helps — different angles, expressions, and lighting give better results.</p>
          </div>

          <button onClick={handleTrainLora}
            disabled={loraTraining === 'creating' || loraTraining === 'waiting' || loraImages.length < 8 || !loraName.trim() || !freepikApiKey}
            className="w-full py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
            {loraTraining === 'creating' || loraTraining === 'waiting'
              ? <><RefreshCw className="w-4 h-4 animate-spin" />Training…</>
              : <><Wand2 className="w-4 h-4" />Train Character LoRA</>}
          </button>

          {loraMsg && (
            <div className={`flex items-start gap-2 p-3 rounded-xl border text-sm ${loraTraining === 'failed' ? 'bg-red-50 dark:bg-red-900/30 border-red-200 text-red-700 dark:text-red-300' : 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-200 text-indigo-700 dark:text-indigo-300'}`}>
              {loraTraining === 'waiting' ? <Clock className="w-4 h-4 flex-shrink-0 mt-0.5" /> : loraTraining === 'failed' ? <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" /> : <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />}
              <p>{loraMsg}</p>
            </div>
          )}
        </div>
      )}

      {/* Shared error */}
      {jobStatus === 'failed' && statusMsg && activeTab !== 'Character LoRA' && (
        <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl">
          <X className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700 dark:text-red-300">{statusMsg}</p>
        </div>
      )}

      {/* Results */}
      {resultImages.length > 0 && (
        <div className="space-y-4">
          {resultImages.map((url, i) => (
            <div key={i} className="space-y-2">
              <img src={url} alt={`Result ${i+1}`} className="w-full rounded-2xl border border-indigo-100 dark:border-indigo-800 shadow-lg" />
              <button onClick={() => downloadImage(url, i)}
                className="w-full flex items-center justify-center gap-2 py-2 border border-indigo-300 dark:border-indigo-700 rounded-xl text-sm text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900 transition-colors">
                <Download className="w-4 h-4" /> Download
              </button>
            </div>
          ))}
          <button onClick={() => { setResultImages([]); setJobStatus('idle'); setPrompt(''); }}
            className="w-full py-2 border border-indigo-300 dark:border-indigo-700 rounded-xl text-sm text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900 transition-colors">
            New Image
          </button>
        </div>
      )}
    </div>
  );
};

export default ImageGeneratorScreen;
