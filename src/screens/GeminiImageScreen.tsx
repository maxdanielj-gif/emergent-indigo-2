import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { ArrowLeft, Wand2, Upload, X, Download, Loader2, RefreshCw } from 'lucide-react';

const GEMINI_IMAGE_MODELS = [
  { id: 'gemini-3.1-flash-image-preview', name: 'Nano Banana 2 — Fast, high-volume', supportsSize: true },
  { id: 'gemini-3-pro-image-preview',     name: 'Nano Banana Pro — Highest quality, 4K', supportsSize: true },
  { id: 'gemini-2.5-flash-image',         name: 'Gemini 2.5 Flash Image — Speed optimised', supportsSize: false },
];

const ASPECT_RATIOS = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3'];
const IMAGE_SIZES   = ['1K', '2K', '4K'];

export default function GeminiImageScreen() {
  const navigate = useNavigate();
  const { geminiApiKey, addToGallery, addToast } = useApp();

  const [prompt,       setPrompt]       = useState('');
  const [modelId,      setModelId]      = useState('gemini-3.1-flash-image-preview');
  const [aspectRatio,  setAspectRatio]  = useState('1:1');
  const [imageSize,    setImageSize]    = useState('');
  const [refImages,    setRefImages]    = useState<(string | null)[]>([null, null, null]);
  const [showRefSlots, setShowRefSlots] = useState(false);

  const [status,    setStatus]    = useState<'idle' | 'generating' | 'done' | 'failed'>('idle');
  const [statusMsg, setStatusMsg] = useState('');
  const [results,   setResults]   = useState<string[]>([]);
  const [commentary,setCommentary]= useState<string | null>(null);

  const fileRefs = [useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null)];

  const activeModel = GEMINI_IMAGE_MODELS.find(m => m.id === modelId) ?? GEMINI_IMAGE_MODELS[0];

  const handleFileUpload = (slot: number, file: File) => {
    const reader = new FileReader();
    reader.onload = e => {
      const updated = [...refImages];
      updated[slot] = e.target?.result as string;
      setRefImages(updated);
    };
    reader.readAsDataURL(file);
  };

  const clearSlot = (slot: number) => {
    const updated = [...refImages];
    updated[slot] = null;
    setRefImages(updated);
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      addToast({ title: 'Prompt required', message: 'Describe the image you want to generate.', type: 'warning' });
      return;
    }
    if (!geminiApiKey) {
      addToast({ title: 'No Gemini key', message: 'Add your Gemini API key in Settings.', type: 'warning' });
      return;
    }

    setStatus('generating');
    setStatusMsg('Sending to Gemini…');
    setResults([]);
    setCommentary(null);

    try {
      const validRefs = refImages.filter(Boolean) as string[];

      const body: any = {
        prompt: prompt.trim(),
        modelId,
        aspectRatio,
        geminiKey: geminiApiKey,
      };
      if (activeModel.supportsSize && imageSize) body.imageSize = imageSize;
      if (validRefs.length > 0) body.referenceImages = validRefs;

      setStatusMsg(`Generating with ${activeModel.name.split(' — ')[0]}…`);

      const r = await fetch('/api/gemini/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!r.ok) {
        const e = await r.json();
        throw new Error(e.error || `HTTP ${r.status}`);
      }

      const data = await r.json();
      if (!data.images || data.images.length === 0) throw new Error('No images returned.');

      setResults(data.images);
      if (data.text) setCommentary(data.text);
      setStatus('done');
      setStatusMsg('');

      // Auto-save all generated images to gallery
      data.images.forEach((imgUrl: string) => {
        addToGallery({
          id: `gemini-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          type: 'generated',
          mediaType: 'image',
          url: imgUrl,
          prompt: prompt.trim(),
          timestamp: Date.now(),
        });
      });
      addToast({ title: 'Saved to Gallery', message: `${data.images.length} image${data.images.length > 1 ? 's' : ''} added to your gallery.`, type: 'success' });
    } catch (e: any) {
      setStatus('failed');
      setStatusMsg(e.message || 'Generation failed.');
      addToast({ title: 'Gemini Image Error', message: e.message || 'Generation failed.', type: 'error' });
    }
  };

  const handleSaveToGallery = (dataUrl: string) => {
    addToGallery({
      id: `gemini-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type: 'generated',
      mediaType: 'image',
      url: dataUrl,
      prompt: prompt.trim(),
      timestamp: Date.now(),
    });
    addToast({ title: 'Saved', message: 'Image added to your gallery.', type: 'success' });
  };

  const handleDownload = (dataUrl: string, index: number) => {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `gemini-image-${Date.now()}-${index + 1}.png`;
    a.click();
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-indigo-950 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-indigo-100 dark:border-indigo-800 sticky top-0 bg-white dark:bg-indigo-950 z-10">
        <button
          onClick={() => navigate('/image-generator')}
          className="p-2 rounded-xl hover:bg-indigo-50 dark:hover:bg-indigo-900 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
        </button>
        <div>
          <h2 className="text-lg font-bold text-indigo-600 dark:text-indigo-400">Gemini Image</h2>
          <p className="text-xs text-indigo-400 dark:text-indigo-500">Powered by Google Nano Banana</p>
        </div>
      </div>

      <div className="flex-1 p-4 space-y-4">

        {/* Model picker */}
        <div>
          <label className="block text-sm font-medium text-indigo-700 dark:text-indigo-300 mb-1">Model</label>
          <select
            value={modelId}
            onChange={e => setModelId(e.target.value)}
            className="w-full p-2 border border-indigo-300 dark:border-indigo-700 rounded-xl bg-white dark:bg-indigo-950 text-indigo-900 dark:text-indigo-100 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
          >
            {GEMINI_IMAGE_MODELS.map(m => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>

        {/* Prompt */}
        <div>
          <label className="block text-sm font-medium text-indigo-700 dark:text-indigo-300 mb-1">Prompt</label>
          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            rows={4}
            placeholder="Describe the image you want to generate…"
            className="w-full p-3 border border-indigo-300 dark:border-indigo-700 rounded-xl bg-white dark:bg-indigo-950 text-indigo-900 dark:text-indigo-100 text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
          />
        </div>

        {/* Aspect ratio + size */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-indigo-700 dark:text-indigo-300 mb-1">Aspect Ratio</label>
            <select
              value={aspectRatio}
              onChange={e => setAspectRatio(e.target.value)}
              className="w-full p-2 border border-indigo-300 dark:border-indigo-700 rounded-xl bg-white dark:bg-indigo-950 text-indigo-900 dark:text-indigo-100 text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
            >
              {ASPECT_RATIOS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-indigo-700 dark:text-indigo-300 mb-1">
              Resolution {!activeModel.supportsSize && <span className="text-indigo-400">(not supported)</span>}
            </label>
            <select
              value={imageSize}
              onChange={e => setImageSize(e.target.value)}
              disabled={!activeModel.supportsSize}
              className="w-full p-2 border border-indigo-300 dark:border-indigo-700 rounded-xl bg-white dark:bg-indigo-950 text-indigo-900 dark:text-indigo-100 text-xs focus:ring-2 focus:ring-indigo-500 outline-none disabled:opacity-40"
            >
              <option value="">Default</option>
              {IMAGE_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        {/* Reference images toggle */}
        <div>
          <button
            onClick={() => setShowRefSlots(v => !v)}
            className="text-xs text-indigo-500 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-200 flex items-center gap-1"
          >
            <Upload className="w-3 h-3" />
            {showRefSlots ? 'Hide' : 'Add'} reference images (optional)
          </button>

          {showRefSlots && (
            <div className="grid grid-cols-3 gap-2 mt-2">
              {refImages.map((img, i) => (
                <div key={i} className="relative aspect-square rounded-xl border-2 border-dashed border-indigo-200 dark:border-indigo-700 overflow-hidden bg-indigo-50 dark:bg-indigo-900/30">
                  {img ? (
                    <>
                      <img src={img} className="w-full h-full object-cover" alt="" />
                      <button
                        onClick={() => clearSlot(i)}
                        className="absolute top-1 right-1 w-5 h-5 bg-black/50 rounded-full flex items-center justify-center"
                      >
                        <X className="w-3 h-3 text-white" />
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => fileRefs[i].current?.click()}
                      className="w-full h-full flex items-center justify-center text-indigo-300"
                    >
                      <Upload className="w-5 h-5" />
                    </button>
                  )}
                  <input
                    ref={fileRefs[i]}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={e => { if (e.target.files?.[0]) handleFileUpload(i, e.target.files[0]); }}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Generate button */}
        <button
          onClick={handleGenerate}
          disabled={status === 'generating'}
          className="w-full py-3 px-6 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold rounded-xl flex items-center justify-center gap-2 shadow-md transition-all"
        >
          {status === 'generating'
            ? <><Loader2 className="w-5 h-5 animate-spin" /> {statusMsg || 'Generating…'}</>
            : <><Wand2 className="w-5 h-5" /> Generate</>
          }
        </button>

        {/* Error */}
        {status === 'failed' && (
          <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
            <p className="text-xs text-red-600 dark:text-red-400">{statusMsg}</p>
            <button onClick={handleGenerate} className="mt-2 text-xs text-red-500 flex items-center gap-1">
              <RefreshCw className="w-3 h-3" /> Try again
            </button>
          </div>
        )}

        {/* Commentary from model */}
        {commentary && (
          <div className="p-3 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl border border-indigo-100 dark:border-indigo-800">
            <p className="text-xs text-indigo-600 dark:text-indigo-300 italic">{commentary}</p>
          </div>
        )}

        {/* Results */}
        {results.length > 0 && (
          <div className="space-y-4">
            {results.map((imgUrl, i) => (
              <div key={i} className="rounded-xl overflow-hidden border border-indigo-100 dark:border-indigo-800 shadow-sm">
                <img src={imgUrl} alt={`Generated ${i + 1}`} className="w-full object-contain bg-black" />
                <div className="flex gap-2 p-2 bg-indigo-50 dark:bg-indigo-900/30">
                  <div className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs text-indigo-400 dark:text-indigo-500">
                    ✓ Saved to gallery
                  </div>
                  <button
                    onClick={() => handleDownload(imgUrl, i)}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 border border-indigo-300 dark:border-indigo-700 text-indigo-600 dark:text-indigo-400 text-xs font-medium rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
