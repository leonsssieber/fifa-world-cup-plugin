import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCAL_PATH = path.join(__dirname, '..', 'data', 'state.json');

const useKv = !!process.env.KV_REST_API_URL && !!process.env.KV_REST_API_TOKEN;

let redisPromise = null;
function getRedis() {
  if (!redisPromise) {
    redisPromise = import('@upstash/redis').then(m => new m.Redis({
      url: process.env.KV_REST_API_URL,
      token: process.env.KV_REST_API_TOKEN,
    }));
  }
  return redisPromise;
}

let localCache = null;
let localDirty = false;

async function loadLocal() {
  if (localCache) return localCache;
  try {
    localCache = JSON.parse(await fs.readFile(LOCAL_PATH, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    localCache = {};
  }
  return localCache;
}

export async function getState(key) {
  if (useKv) {
    const kv = await getRedis();
    return await kv.get(key);
  }
  const data = await loadLocal();
  return data[key] ?? null;
}

export async function setState(key, value) {
  if (useKv) {
    const kv = await getRedis();
    await kv.set(key, value);
    return;
  }
  const data = await loadLocal();
  data[key] = value;
  localDirty = true;
}

export async function flush() {
  if (useKv) return;
  if (!localDirty) return;
  await fs.mkdir(path.dirname(LOCAL_PATH), { recursive: true });
  await fs.writeFile(LOCAL_PATH, JSON.stringify(localCache, null, 2));
  localDirty = false;
}
