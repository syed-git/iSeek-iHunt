const {
  env,
  AutoProcessor,
  AutoTokenizer,
  CLIPVisionModelWithProjection,
  CLIPTextModelWithProjection,
  RawImage,
} = require('@huggingface/transformers');
const { MODEL_DIR } = require('../config');
const { CATEGORIES, COLORS } = require('../categories');

const MODEL_ID = process.env.CLIP_MODEL || 'Xenova/clip-vit-base-patch32';
env.cacheDir = MODEL_DIR;
env.allowLocalModels = true;

const state = { ready: false, loading: null, error: null, model: MODEL_ID };
let processor;
let tokenizer;
let visionModel;
let textModel;
let categoryBank;
let colorBank;

function normalize(vec) {
  let n = 0;
  for (let i = 0; i < vec.length; i++) n += vec[i] * vec[i];
  n = Math.sqrt(n) || 1;
  const out = new Float32Array(vec.length);
  for (let i = 0; i < vec.length; i++) out[i] = vec[i] / n;
  return out;
}

function cosine(a, b) {
  if (!a || !b) return 0;
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

function softmax(scores, temperature = 100) {
  const m = Math.max(...scores);
  const e = scores.map((s) => Math.exp((s - m) * temperature));
  const sum = e.reduce((a, b) => a + b, 0);
  return e.map((x) => x / sum);
}

async function embedTextsRaw(texts) {
  const inputs = tokenizer(texts, { padding: true, truncation: true, max_length: 77 });
  const { text_embeds } = await textModel(inputs);
  const dim = text_embeds.dims[1];
  const out = [];
  for (let i = 0; i < texts.length; i++) out.push(normalize(text_embeds.data.slice(i * dim, (i + 1) * dim)));
  return out;
}

async function load() {
  if (state.ready) return;
  if (state.loading) return state.loading;
  state.loading = (async () => {
    const t = Date.now();
    const opts = { dtype: 'q8', session_options: { intraOpNumThreads: 2, enableCpuMemArena: false } };
    processor = await AutoProcessor.from_pretrained(MODEL_ID);
    tokenizer = await AutoTokenizer.from_pretrained(MODEL_ID);
    visionModel = await CLIPVisionModelWithProjection.from_pretrained(MODEL_ID, opts);
    textModel = await CLIPTextModelWithProjection.from_pretrained(MODEL_ID, opts);

    categoryBank = [];
    for (const c of CATEGORIES) {
      const embs = await embedTextsRaw(c.prompts.map((p) => `a photo of ${p}`));
      const mean = new Float32Array(embs[0].length);
      embs.forEach((e) => e.forEach((v, i) => (mean[i] += v / embs.length)));
      categoryBank.push({ name: c.name, emb: normalize(mean) });
    }
    colorBank = [];
    const colorEmbs = await embedTextsRaw(COLORS.map((c) => `a photo of a ${c} colored object`));
    COLORS.forEach((c, i) => colorBank.push({ name: c, emb: colorEmbs[i] }));

    state.ready = true;
    state.loadMs = Date.now() - t;
    console.log(`[ai] CLIP model ${MODEL_ID} ready in ${state.loadMs}ms`);
  })().catch((err) => {
    state.error = err.message;
    state.loading = null;
    console.error('[ai] failed to load model', err);
    throw err;
  });
  return state.loading;
}

async function embedImage(filePath) {
  await load();
  const image = await RawImage.read(filePath);
  const inputs = await processor(image);
  const { image_embeds } = await visionModel(inputs);
  return normalize(image_embeds.data);
}

async function embedText(text) {
  await load();
  const [emb] = await embedTextsRaw([text]);
  return emb;
}

function rank(bank, emb, top) {
  const scores = bank.map((b) => cosine(emb, b.emb));
  const probs = softmax(scores);
  return bank
    .map((b, i) => ({ name: b.name, score: scores[i], prob: probs[i] }))
    .sort((a, b) => b.prob - a.prob)
    .slice(0, top);
}

function classifyCategory(emb, top = 3) {
  return rank(categoryBank.filter((c) => c.name !== 'Other'), emb, top);
}

function classifyColor(emb, top = 2) {
  return rank(colorBank, emb, top);
}

function meanVector(vectors) {
  const list = vectors.filter(Boolean);
  if (!list.length) return null;
  const out = new Float32Array(list[0].length);
  list.forEach((v) => v.forEach((x, i) => (out[i] += x / list.length)));
  return normalize(out);
}

module.exports = {
  state,
  load,
  embedImage,
  embedText,
  classifyCategory,
  classifyColor,
  cosine,
  meanVector,
  normalize,
};
