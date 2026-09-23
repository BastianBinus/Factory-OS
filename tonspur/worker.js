// Runs Whisper off the main thread. The page decodes the video to 16 kHz mono
// PCM (AudioContext does not exist in workers) and hands it over here.
import {
  WhisperForConditionalGeneration,
  AutoProcessor,
  AutoTokenizer,
  env,
} from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0/dist/transformers.min.js';

env.allowLocalModels = false;

// Whisper's encoder loses noticeably more accuracy under 8-bit quantisation than
// its decoder does, so tiny/base keep a full-precision encoder. Small's fp32
// encoder alone is ~350 MB, too much for an iPhone tab, so it gets q8 throughout.
const MODELS = {
  tiny: { id: 'onnx-community/whisper-tiny', wasm: { encoder_model: 'fp32', decoder_model_merged: 'q8' } },
  base: { id: 'onnx-community/whisper-base', wasm: { encoder_model: 'fp32', decoder_model_merged: 'q8' } },
  small: { id: 'onnx-community/whisper-small', wasm: { encoder_model: 'q8', decoder_model_merged: 'q8' } },
};
const WEBGPU_DTYPE = { encoder_model: 'fp32', decoder_model_merged: 'q4' };

const SAMPLE_RATE = 16000;
const post = (msg) => self.postMessage(msg);

let loaded = null;
let cancelled = false;

async function load(modelKey, device) {
  const key = `${modelKey}:${device}`;
  if (loaded?.key === key) return loaded;
  if (loaded) {
    await loaded.model.dispose();
    loaded = null;
  }

  const spec = MODELS[modelKey];
  const files = new Map();
  const progress_callback = (p) => {
    if (p.status !== 'progress' || !p.total) return;
    files.set(p.file, { loaded: p.loaded, total: p.total });
    let done = 0;
    let total = 0;
    for (const f of files.values()) {
      done += f.loaded;
      total += f.total;
    }
    post({ type: 'download', loaded: done, total });
  };

  post({ type: 'stage', stage: 'loading' });
  const [processor, tokenizer, model] = await Promise.all([
    AutoProcessor.from_pretrained(spec.id, { progress_callback }),
    AutoTokenizer.from_pretrained(spec.id, { progress_callback }),
    WhisperForConditionalGeneration.from_pretrained(spec.id, {
      dtype: device === 'webgpu' ? WEBGPU_DTYPE : spec.wasm,
      device,
      progress_callback,
    }),
  ]);

  const gc = model.generation_config;
  const tokens = {
    sot: gc.decoder_start_token_id,
    de: gc.lang_to_id['<|de|>'],
    en: gc.lang_to_id['<|en|>'],
    transcribe: gc.task_to_id.transcribe,
    noTimestamps: gc.no_timestamps_token_id,
    beginSuppress: gc.begin_suppress_tokens ?? [],
  };
  loaded = { key, processor, tokenizer, model, tokens };
  return loaded;
}

// transformers.js 4.3 has no Whisper language detection: without a language it
// silently transcribes as English, which turns German speech into a rough
// English translation. So the decoder starts from <|startoftranscript|> alone and
// this processor steers the first three steps:
//   step 1: language token, restricted to the allowed set; the argmax is recorded
//   step 2: <|transcribe|> (never translate)
//   step 3: <|notimestamps|>
// That detects the language per chunk inside the same generate() call, so the
// encoder runs once per chunk instead of twice.
function steering(tokens, allowed, result) {
  const force = (data, id) => {
    const keep = data[id];
    data.fill(-Infinity);
    data[id] = Number.isFinite(keep) ? keep : 0;
  };
  return (input_ids, logits) => {
    for (let i = 0; i < input_ids.length; i++) {
      const data = logits[i].data;
      const step = input_ids[i].length;
      if (step === 1) {
        let best = allowed[0];
        for (const lang of allowed) if (data[tokens[lang]] > data[tokens[best]]) best = lang;
        result.lang = best;
        force(data, tokens[best]);
      } else if (step === 2) {
        force(data, tokens.transcribe);
      } else if (step === 3) {
        force(data, tokens.noTimestamps);
      } else if (step === 4) {
        for (const id of tokens.beginSuppress) data[id] = -Infinity;
      }
    }
    return logits;
  };
}

// Whisper's best-known failure on silence or music: it "hears" the credits line
// from the subtitled TV it was trained on. These are never real content.
const HALLUCINATIONS = [
  /Untertitel (im Auftrag des ZDF|der Amara\.org-Community|von Stephanie Geiges)[^.]*\.?/gi,
  /Subtitles by the Amara\.org community\.?/gi,
];

function clean(text) {
  let t = text;
  for (const re of HALLUCINATIONS) t = t.replace(re, '');
  return t.replace(/\s+/g, ' ').trim();
}

async function transcribeChunk(ctx, audio, allowed) {
  const { processor, tokenizer, model, tokens } = ctx;
  const { input_features } = await processor(audio);
  const result = { lang: allowed[0] };
  const ids = await model.generate({
    inputs: input_features,
    decoder_input_ids: [tokens.sot],
    logits_processor: [steering(tokens, allowed, result)],
    forced_decoder_ids: null,
    begin_suppress_tokens: null,
    return_timestamps: false,
    max_new_tokens: 400,
  });
  const text = tokenizer.batch_decode(ids, { skip_special_tokens: true })[0];
  return { text: clean(text), lang: result.lang };
}

self.onmessage = async ({ data }) => {
  if (data.type === 'cancel') {
    cancelled = true;
    return;
  }
  if (data.type !== 'run') return;
  cancelled = false;

  const { audio, chunks, model: modelKey, device, language } = data;
  const allowed = language === 'auto' ? ['de', 'en'] : [language];

  try {
    let ctx;
    try {
      ctx = await load(modelKey, device);
    } catch (err) {
      if (device !== 'webgpu') throw err;
      // WebKit on iPhone can report a WebGPU adapter and still fail to build
      // Whisper's sessions on it; the CPU path is slower but works.
      post({ type: 'notice', text: 'The GPU could not run the model, so the CPU is running it instead.' });
      ctx = await load(modelKey, 'wasm');
    }

    post({ type: 'stage', stage: 'transcribing', total: chunks.length });
    for (let i = 0; i < chunks.length; i++) {
      if (cancelled) {
        post({ type: 'cancelled' });
        return;
      }
      const { start, end, silent } = chunks[i];
      const started = performance.now();
      let segment = { text: '', lang: null };
      if (!silent) segment = await transcribeChunk(ctx, audio.subarray(start, end), allowed);
      post({
        type: 'segment',
        index: i,
        start: start / SAMPLE_RATE,
        end: end / SAMPLE_RATE,
        text: segment.text,
        lang: segment.lang,
        ms: performance.now() - started,
      });
    }
    post({ type: 'done' });
  } catch (err) {
    post({ type: 'error', text: String(err?.message ?? err) });
  }
};
