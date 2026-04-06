// ── ElevenLabs TTS ────────────────────────────────────────────────────────────
export interface ElevenLabsVoice {
  voice_id: string;
  name: string;
  category: string;
  labels: Record<string, string>;
}

export interface ElevenLabsVoiceParams {
  search?: string;
  sort?: 'name' | 'created_at_unix';
  sort_direction?: 'asc' | 'desc';
  voice_type?: 'personal' | 'community' | 'default' | 'non-default';
  category?: 'premade' | 'cloned' | 'generated' | 'professional';
}

export const generateElevenLabsSpeech = async (
  text: string,
  voiceId: string,
  apiKey?: string | null,
  modelId?: string,
  voiceSettings?: {
    stability?: number;
    similarityBoost?: number;
    style?: number;
    useSpeakerBoost?: boolean;
    speakingRate?: number;
  }
): Promise<Blob> => {
  if (!apiKey) throw new Error("ElevenLabs API key not set. Add it in Settings.");

  const res = await fetch('/api/tts/elevenlabs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text, voiceId, apiKey, modelId,
      stability:       voiceSettings?.stability,
      similarityBoost: voiceSettings?.similarityBoost,
      style:           voiceSettings?.style,
      useSpeakerBoost: voiceSettings?.useSpeakerBoost,
      speakingRate:    voiceSettings?.speakingRate,
    }),
  });

  if (!res.ok) {
    let errMsg = `ElevenLabs TTS failed (${res.status})`;
    try { const err = await res.json(); errMsg = err.error || errMsg; } catch {}
    throw new Error(errMsg);
  }

  return await res.blob();
};

export const listElevenLabsVoices = async (
  apiKey?: string | null,
  params: ElevenLabsVoiceParams = {}
): Promise<ElevenLabsVoice[]> => {
  if (!apiKey) throw new Error("ElevenLabs API key not set. Add it in Settings.");

  const qs = new URLSearchParams({ api_key: apiKey });
  if (params.search)         qs.set('search',         params.search);
  if (params.sort)           qs.set('sort',           params.sort);
  if (params.sort_direction) qs.set('sort_direction', params.sort_direction);
  if (params.voice_type)     qs.set('voice_type',     params.voice_type);
  if (params.category)       qs.set('category',       params.category);

  const res = await fetch(`/api/tts/elevenlabs/voices?${qs.toString()}`);
  if (!res.ok) {
    let errMsg = `Failed to fetch ElevenLabs voices (${res.status})`;
    try { const err = await res.json(); errMsg = err.error || errMsg; } catch {}
    throw new Error(errMsg);
  }

  const data = await res.json();
  return data.voices || [];
};
