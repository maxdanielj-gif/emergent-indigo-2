import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import {
  Download, RefreshCw, X, Wand2, Upload, Cpu
} from 'lucide-react';

// ── Constants ────────────────────────────────────────────────────────────────

// ── WaveSpeed model registry ────────────────────────────────────────────────
type WsModelId = 'wavespeed-ai/flux-2-klein-9b/edit' | 'bytedance/seedream-v4.5/edit' | 'wavespeed-ai/z-image-turbo/image-to-image' | 'z-ai/glm-image/edit';

const WS_MODELS: { id: WsModelId; name: string; maxImages: number; usesSeparateWH: boolean; hasSeed: boolean; hasOutputFormat: boolean; hasPromptExpansion: boolean; hasSafetyChecker: boolean; usesStarSize?: boolean; hasSingleImage?: boolean; hasStrength?: boolean }[] = [
  {
    id: 'wavespeed-ai/flux-2-klein-9b/edit',
    name: 'Flux 2 Klein 9B (Default)',
    maxImages: 3,
    usesSeparateWH: false,
    hasSeed: true,
    hasOutputFormat: false,
    hasPromptExpansion: false,
    hasSafetyChecker: true,
  },
  {
    id: 'bytedance/seedream-v4.5/edit',
    name: 'Bytedance Seedream V4.5',
    maxImages: 10,
    usesSeparateWH: false,
    hasSeed: false,
    hasOutputFormat: false,
    hasPromptExpansion: false,
    hasSafetyChecker: false,
  },
  {
    id: 'wavespeed-ai/z-image-turbo/image-to-image',
    name: 'Z Image Turbo (Image-to-Image)',
    maxImages: 1,          // takes a single image field
    usesSeparateWH: false,
    hasSeed: true,
    hasOutputFormat: true,
    hasPromptExpansion: false,
    hasSafetyChecker: false,
    usesStarSize: true,    // size format: "1024*1024" not "1024x1024"
    hasSingleImage: true,  // sends image: string, not images: string[]
    hasStrength: true,     // strength parameter 0-1
  },
  {
    id: 'z-ai/glm-image/edit',
    name: 'Z.AI GLM Image Edit',
    maxImages: 4,
    usesSeparateWH: true,
    hasSeed: true,
    hasOutputFormat: true,
    hasPromptExpansion: true,
    hasSafetyChecker: false,
    usesStarSize: false,
    hasSingleImage: false,
    hasStrength: false,
  },
];

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

// ── Main component ────────────────────────────────────────────────────────────

const ImageGeneratorScreen: React.FC = () => {
  const navigate = useNavigate();
  const { wavespeedApiKey, aiProfile, addToGallery, addToast } = useApp();
  const hasRef = !!aiProfile.referenceImage;

  const [prompt,         setPrompt]         = useState('');
  const [wsImages,       setWsImages]       = useState<(string|null)[]>([null, null, null]);
  const [wsSlot0Cleared, setWsSlot0Cleared] = useState(false);
  const [wsSeed,         setWsSeed]         = useState('');
  const [wsSize,         setWsSize]         = useState('');
  const [wsModelId,      setWsModelId]      = useState<WsModelId>('wavespeed-ai/flux-2-klein-9b/edit');
  const [wsOutputFormat, setWsOutputFormat] = useState<'jpeg' | 'png'>('jpeg');
  const [wsPromptExpand, setWsPromptExpand] = useState(false);
  const [wsStrength,     setWsStrength]     = useState(0.8);

  const activeModel = WS_MODELS.find(m => m.id === wsModelId) ?? WS_MODELS[0];
  // Clamp wsImages array length to match the selected model's max
  const imageSlots = Math.min(activeModel.maxImages, 3); // show at most 3 slots in the UI for usability

  // ── Shared job state ──────────────────────────────────────────────────────
  const [jobStatus,    setJobStatus]    = useState<JobStatus>('idle');
  const [statusMsg,    setStatusMsg]    = useState('');
  const [resultImages, setResultImages] = useState<string[]>([]);

  const pollRef    = useRef<NodeJS.Timeout | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const promptRef  = useRef('');

  useEffect(() => () => {
    if (pollRef.current)    clearInterval(pollRef.current);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  const wavespeedKeyRef = useRef(wavespeedApiKey);
  useEffect(() => { wavespeedKeyRef.current = wavespeedApiKey; }, [wavespeedApiKey]);

  // ── Polling helper ────────────────────────────────────────────────────────
  const startPolling = (taskId: string) => {
    if (pollRef.current)    clearInterval(pollRef.current);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    let consecutiveErrors = 0;
    const log = (msg: string) => console.log(`[ImageGen] ${msg}`);

    log(`Polling started — taskId: ${taskId}`);

    pollRef.current = setInterval(async () => {
      try {
        const wsKey = wavespeedKeyRef.current || '';
        const url = `/api/wavespeed/status/${taskId}?ws_api_key=${encodeURIComponent(wsKey)}`;
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
        log(`status=${status} urls=${urlCount}`);

        if (status === 'COMPLETED') {
          clearInterval(pollRef.current!); clearTimeout(timeoutRef.current!); pollRef.current = null;
          const urls: string[] = data._imageUrls || data.generated || [];
          if (urls.length > 0) {
            setResultImages(urls); setJobStatus('succeeded'); setStatusMsg('');
            // Convert remote URLs to base64 data URIs so images persist after temporary URLs expire
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
          } else {
            log('COMPLETED but no URLs in response');
            setJobStatus('failed'); setStatusMsg('Task completed but no images returned.');
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
    if (!wavespeedApiKey) { addToast({ title: 'No WaveSpeed key', message: 'Add your key in Settings.', type: 'warning' }); return; }

    const appearancePrefix = aiProfile.appearance?.trim();
    const finalPrompt = appearancePrefix
      ? `${appearancePrefix}. ${prompt.trim()}`
      : prompt.trim();

    promptRef.current = finalPrompt;
    setJobStatus('creating'); setStatusMsg('Creating task…'); setResultImages([]);

    try {
      // Resolve actual images to send — slot 0 auto-fills with persona photo
      const resolvedImages = wsImages.map((img, i) => {
        if (img) return img;
        if (i === 0 && hasRef && aiProfile.referenceImage && !wsSlot0Cleared) return aiProfile.referenceImage;
        return null;
      }).filter(Boolean) as string[];

      // Z Image Turbo (and any hasSingleImage model) requires at least one reference image
      if (activeModel.hasSingleImage && resolvedImages.length === 0) {
        addToast({ title: 'Reference image required', message: `${activeModel.name} needs a reference image to edit. Upload one in the slot above.`, type: 'warning' });
        setJobStatus('idle');
        return;
      }

      const body: any = {
        model: wsModelId,
        prompt: finalPrompt,
        apiKey: wavespeedApiKey,
      };

      // Image(s) — single string vs array depending on model
      if (activeModel.hasSingleImage) {
        body.image = resolvedImages[0];
      } else {
        body.images = resolvedImages;
      }

      // Model-specific parameters
      if (activeModel.hasSeed && wsSeed.trim()) body.seed = parseInt(wsSeed.trim(), 10);
      if (activeModel.hasStrength) body.strength = wsStrength;
      if (wsSize.trim()) {
        if (activeModel.usesSeparateWH) {
          // GLM uses separate width and height integer fields
          const parts = wsSize.trim().replace('*', 'x').split('x');
          if (parts.length === 2) { body.width = parseInt(parts[0], 10); body.height = parseInt(parts[1], 10); }
        } else {
          // Z Image Turbo uses "1024*1024"; Flux/Seedream use "1024x1024"
          body.size = activeModel.usesStarSize
            ? wsSize.trim().replace('x', '*')
            : wsSize.trim();
        }
      }
      if (activeModel.hasOutputFormat) body.output_format = wsOutputFormat;
      if (activeModel.hasPromptExpansion) body.enable_prompt_expansion = wsPromptExpand;
      if (activeModel.hasSafetyChecker) body.enable_safety_checker = false;

      const r = await fetch('/api/wavespeed/generate', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error || 'Failed'); }
      const result = await r.json();
      const taskId = result.taskId;
      if (!taskId) throw new Error(`No task ID returned. Response: ${JSON.stringify(result)}`);
      console.log(`[ImageGen WaveSpeed] Task created: ${taskId}, model: ${wsModelId}, refs: ${resolvedImages.length}`);
      setJobStatus('waiting'); setStatusMsg(`Generating with ${activeModel.name}…`);
      startPolling(taskId);
    } catch (e: any) {
      setJobStatus('failed'); setStatusMsg(e.message);
      addToast({ title: 'Failed', message: e.message, type: 'error' });
    }
  };

  const isGenerating = jobStatus === 'creating' || jobStatus === 'waiting';

  const downloadImage = (url: string, i: number) => {
    const a = document.createElement('a');
    a.href = url; a.download = `indigo-image-${Date.now()}-${i}.png`; a.target = '_blank'; a.click();
  };

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4">
      <div>
        <h2 className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">Image Generator</h2>
        <p className="text-xs text-indigo-400 dark:text-indigo-500 mt-0.5">Powered by WaveSpeed AI</p>
      </div>

      {/* Gemini Image Generator link */}
      <button
        onClick={() => navigate('/gemini-image')}
        className="flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-xl border border-indigo-300 dark:border-indigo-700 text-indigo-600 dark:text-indigo-400 text-sm font-medium hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors"
      >
        <Cpu className="w-4 h-4" />
        Switch to Gemini Image Generation
      </button>

      {/* Model selector */}
      <div>
        <label className="block text-sm font-medium text-indigo-700 dark:text-indigo-300 mb-1">Model</label>
        <select
          value={wsModelId}
          onChange={e => {
            const newId = e.target.value as WsModelId;
            setWsModelId(newId);
            // Reset image slots array to match new model's max
            setWsImages(Array(Math.min(WS_MODELS.find(m => m.id === newId)?.maxImages ?? 3, 3)).fill(null));
            setWsSlot0Cleared(false);
          }}
          className="w-full p-2 border border-indigo-300 dark:border-indigo-700 rounded-xl bg-white dark:bg-indigo-950 text-indigo-900 dark:text-indigo-100 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
        >
          {WS_MODELS.map(m => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      </div>

      {!wavespeedApiKey && (
        <div className="p-3 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-xl text-sm text-amber-700 dark:text-amber-300">
          Add your WaveSpeed API key in Settings. Get one at{' '}
          <a href="https://wavespeed.ai/accesskey" target="_blank" rel="noreferrer" className="underline font-medium">wavespeed.ai/accesskey</a>. Requires a top-up to activate.
        </div>
      )}

      {/* Reference images — 3 upload slots */}
      <div className="p-3 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl border border-indigo-100 dark:border-indigo-800 space-y-3">
        <div>
          <p className="text-sm font-semibold text-indigo-800 dark:text-indigo-200">Reference Images</p>
          <p className="text-[10px] text-indigo-400 dark:text-indigo-500 mt-0.5">
            Upload up to {imageSlots} image{imageSlots > 1 ? 's' : ''} to guide the edit. Each slot has a suggested role, but you can use any image in any slot.
          </p>
        </div>
        <div className={`grid gap-3 ${imageSlots === 1 ? 'grid-cols-1' : imageSlots === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
          {Array.from({ length: imageSlots }, (_, i) => i).map(i => {
            const WS_SLOT_LABELS  = ['Character / Face', 'Pose / Style', 'Scene / BG', 'Extra Ref 4', 'Extra Ref 5'];
            const WS_SLOT_HINTS   = ['Best for face & identity', 'Body pose & style guide', 'Background & scene', 'Additional reference', 'Additional reference'];
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
                  {label}{isAutoFilled ? <span className="text-[9px] text-indigo-400 ml-1">(auto)</span> : ''}{activeModel.hasSingleImage && i === 0 ? <span className="text-[9px] text-red-400 ml-1">(required)</span> : ''}
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
                          setWsSlot0Cleared(true);
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
                          if (i === 0) setWsSlot0Cleared(false);
                        };
                        reader.readAsDataURL(f); e.target.value = '';
                      }} />
                  </label>
                )}
              </div>
            );
          })}
        </div>
        <p className="text-[10px] text-indigo-400 dark:text-indigo-500">
          {activeModel.name} uses your reference photos as subject guides for better character consistency.
        </p>
      </div>

      {/* Prompt */}
      <div>
        <label className="block text-sm font-medium text-indigo-700 dark:text-indigo-300 mb-1">Prompt</label>
        <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={3}
          placeholder={`Describe the scene — e.g. "${aiProfile.name} sitting in a cozy café, warm lighting, photorealistic"`}
          className="w-full p-3 border border-indigo-300 dark:border-indigo-700 rounded-xl bg-white dark:bg-indigo-950 text-indigo-900 dark:text-indigo-100 text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none" />
      </div>

      {/* Seed + Size */}
      <div className="grid grid-cols-2 gap-3">
        {activeModel.hasSeed ? (
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
        ) : <div />}
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

      {/* Model-specific options */}
      {activeModel.hasStrength && (
        <div className="p-3 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl border border-indigo-100 dark:border-indigo-800 space-y-2">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-xs font-medium text-indigo-700 dark:text-indigo-300">Strength: {wsStrength.toFixed(2)}</p>
              <p className="text-[10px] text-indigo-400 mt-0.5">How much the output changes from the reference. Lower = closer to original.</p>
            </div>
          </div>
          <input
            type="range" min={0} max={1} step={0.05} value={wsStrength}
            onChange={e => setWsStrength(parseFloat(e.target.value))}
            className="w-full h-2 bg-indigo-200 dark:bg-indigo-700 rounded-full appearance-none cursor-pointer accent-indigo-600"
          />
          <div className="flex justify-between text-[10px] text-indigo-400">
            <span>Preserve original</span>
            <span>Max change</span>
          </div>
        </div>
      )}
      {activeModel.hasOutputFormat && (
        <div className="flex items-center justify-between p-3 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl border border-indigo-100 dark:border-indigo-800">
          <div>
            <p className="text-xs font-medium text-indigo-700 dark:text-indigo-300">Output Format</p>
            <p className="text-[10px] text-indigo-400 mt-0.5">JPEG = smaller file, PNG = lossless quality</p>
          </div>
          <select
            value={wsOutputFormat}
            onChange={e => setWsOutputFormat(e.target.value as 'jpeg' | 'png')}
            className="p-1.5 border border-indigo-300 dark:border-indigo-700 rounded-lg bg-white dark:bg-indigo-950 text-indigo-900 dark:text-indigo-100 text-xs"
          >
            <option value="jpeg">JPEG</option>
            <option value="png">PNG</option>
          </select>
        </div>
      )}
      {activeModel.hasPromptExpansion && (
        <div className="flex items-center justify-between p-3 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl border border-indigo-100 dark:border-indigo-800">
          <div>
            <p className="text-xs font-medium text-indigo-700 dark:text-indigo-300">Prompt Expansion</p>
            <p className="text-[10px] text-indigo-400 mt-0.5">Automatically enhances short prompts for better results</p>
          </div>
          <button
            onClick={() => setWsPromptExpand(v => !v)}
            className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ${wsPromptExpand ? 'bg-indigo-600' : 'bg-indigo-200 dark:bg-indigo-800'}`}
          >
            <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${wsPromptExpand ? 'translate-x-4' : 'translate-x-0.5'}`} />
          </button>
        </div>
      )}

      {/* Generate button */}
      <button
        onClick={handleGenerate}
        disabled={isGenerating || !prompt.trim() || !wavespeedApiKey}
        data-testid="generate-image-btn"
        className="w-full py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
        {isGenerating
          ? <><RefreshCw className="w-4 h-4 animate-spin" />{statusMsg || 'Generating…'}</>
          : <><Wand2 className="w-4 h-4" />Generate Image</>}
      </button>

      {/* Error */}
      {jobStatus === 'failed' && statusMsg && (
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
