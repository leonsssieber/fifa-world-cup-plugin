import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pollNews } from './news.js';
import { checkLiveMatches } from './scores.js';
import { flush } from './storage.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, '..', 'config.json');

let configCache = null;
async function loadConfig() {
  if (configCache) return configCache;
  configCache = JSON.parse(await fs.readFile(CONFIG_PATH, 'utf8'));
  return configCache;
}

export async function runOnce() {
  const config = await loadConfig();
  const news = await pollNews(config);
  const scores = await checkLiveMatches(config);
  await flush();
  return { ts: new Date().toISOString(), news, scores };
}
