// Local face AI: TensorFlow.js (WASM, falls back to pure-JS CPU) + face-api models shipped inside the npm package.
const path = require('path');
const sharp = require('sharp');
const faceapi = require('@vladmandic/face-api/dist/face-api.node-wasm.js');
const wasm = require('@tensorflow/tfjs-backend-wasm');

const { tf } = faceapi;
const MODEL_DIR = path.join(path.dirname(require.resolve('@vladmandic/face-api/package.json')), 'model');
const WASM_DIR = `${path.join(path.dirname(require.resolve('@tensorflow/tfjs-backend-wasm/package.json')), 'dist').split(path.sep).join('/')}/`;
const MIN_CONFIDENCE = 0.35;
const MAX_FACES = 6;

const state = { ready: false, loading: null, error: null, backend: null, model: 'face-api · SSD-MobileNetV1 + 68-point landmarks + FaceNet-style 128-d descriptor' };

async function load() {
  if (state.ready) return;
  if (state.loading) return state.loading;
  state.loading = (async () => {
    const t = Date.now();
    try {
      wasm.setWasmPaths(WASM_DIR);
      await tf.setBackend('wasm');
    } catch (err) {
      console.warn('[face] WASM backend unavailable, using CPU backend:', err.message);
      await tf.setBackend('cpu');
    }
    await tf.ready();
    state.backend = tf.getBackend();
    await faceapi.nets.ssdMobilenetv1.loadFromDisk(MODEL_DIR);
    await faceapi.nets.faceLandmark68Net.loadFromDisk(MODEL_DIR);
    await faceapi.nets.faceRecognitionNet.loadFromDisk(MODEL_DIR);
    await faceapi.nets.ageGenderNet.loadFromDisk(MODEL_DIR);
    await faceapi.nets.faceExpressionNet.loadFromDisk(MODEL_DIR);
    state.ready = true;
    state.loadMs = Date.now() - t;
    console.log(`[face] face models ready on ${state.backend} in ${state.loadMs}ms`);
  })().catch((err) => {
    state.error = err.message;
    state.loading = null;
    console.error('[face] failed to load face models', err);
    throw err;
  });
  return state.loading;
}

let queue = Promise.resolve();
function serial(fn) {
  const run = queue.then(fn);
  queue = run.catch(() => {});
  return run;
}

const r1 = (v) => Math.round(v * 10) / 10;
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const mid = (pts) => [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function geometry(lm) {
  const eyeL = mid(lm.slice(36, 42));
  const eyeR = mid(lm.slice(42, 48));
  const iod = dist(eyeL, eyeR) || 1;
  const faceWidth = dist(lm[0], lm[16]) || 1;
  const browMid = mid([lm[19], lm[24]]);
  const faceHeight = dist(browMid, lm[8]) || 1;
  const roll = (Math.atan2(eyeR[1] - eyeL[1], eyeR[0] - eyeL[0]) * 180) / Math.PI;
  const yawRatio = (dist(lm[30], lm[0]) - dist(lm[30], lm[16])) / faceWidth;
  const midX = (lm[27][0] + lm[8][0]) / 2;
  const pairs = [[0, 16], [2, 14], [4, 12], [6, 10], [17, 26], [19, 24], [21, 22], [36, 45], [39, 42], [31, 35], [48, 54], [50, 52]];
  const asym = pairs.reduce((s, [a, b]) => s + Math.abs((midX - lm[a][0]) - (lm[b][0] - midX)) + Math.abs(lm[a][1] - lm[b][1]), 0) / (pairs.length * iod);
  const ratio = faceHeight / faceWidth;
  const jawTaper = dist(lm[4], lm[12]) / faceWidth;
  const shape = ratio > 0.98 ? 'Long / oval' : ratio < 0.84 ? (jawTaper > 0.86 ? 'Square' : 'Round') : jawTaper > 0.88 ? 'Square' : jawTaper < 0.8 ? 'Heart' : 'Oval';
  const yaw = Math.round(yawRatio * 90);
  return {
    face_shape: shape,
    face_ratio: Math.round(ratio * 100) / 100,
    eye_spacing: Math.round((iod / faceWidth) * 100),
    nose_length: Math.round((dist(lm[27], lm[33]) / faceHeight) * 100),
    nose_width: Math.round((dist(lm[31], lm[35]) / iod) * 100),
    mouth_width: Math.round((dist(lm[48], lm[54]) / iod) * 100),
    jaw_taper: Math.round(jawTaper * 100),
    symmetry: Math.round(clamp(100 - asym * 160, 0, 100)),
    yaw,
    roll: Math.round(roll),
    pose: Math.abs(yaw) < 12 ? 'Frontal' : yaw > 0 ? 'Turned left' : 'Turned right',
  };
}

async function analyze(filePath) {
  await load();
  return serial(async () => {
    const t = Date.now();
    const { data, info } = await sharp(filePath).rotate().removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const tensor = tf.tensor3d(new Uint8Array(data), [info.height, info.width, 3], 'int32');
    let dets;
    try {
      dets = await faceapi
        .detectAllFaces(tensor, new faceapi.SsdMobilenetv1Options({ minConfidence: MIN_CONFIDENCE, maxResults: MAX_FACES }))
        .withFaceLandmarks()
        .withFaceExpressions()
        .withAgeAndGender()
        .withFaceDescriptors();
    } finally {
      tensor.dispose();
    }
    const faces = dets
      .map((d) => {
        const b = d.detection.box;
        const lm = d.landmarks.positions.map((p) => [r1(p.x), r1(p.y)]);
        const [expression, expressionP] = Object.entries(d.expressions).sort((a, b2) => b2[1] - a[1])[0];
        return {
          box: { x: r1(b.x), y: r1(b.y), w: r1(b.width), h: r1(b.height) },
          score: Math.round(d.detection.score * 100) / 100,
          landmarks: lm,
          age: Math.round(d.age),
          gender: d.gender,
          gender_p: Math.round(d.genderProbability * 100) / 100,
          expression,
          expression_p: Math.round(expressionP * 100) / 100,
          geometry: geometry(lm),
          descriptor: Float32Array.from(d.descriptor),
        };
      })
      .sort((a, b) => b.box.w * b.box.h - a.box.w * a.box.h);
    return { width: info.width, height: info.height, faces, ms: Date.now() - t };
  });
}

function distance(a, b) {
  if (!a || !b) return Infinity;
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2;
  return Math.sqrt(s);
}

const GEOMETRY_KEYS = ['eye_spacing', 'nose_length', 'nose_width', 'mouth_width', 'jaw_taper', 'face_ratio'];

function compareGeometry(a, b) {
  if (!a || !b) return [];
  return GEOMETRY_KEYS.map((k) => ({ key: k, a: a[k], b: b[k], diff: Math.round(Math.abs(a[k] - b[k]) * 100) / 100 }));
}

function publicFace(f) {
  if (!f) return null;
  const { descriptor, ...rest } = f;
  return rest;
}

module.exports = { state, load, analyze, distance, compareGeometry, publicFace, MIN_CONFIDENCE };
