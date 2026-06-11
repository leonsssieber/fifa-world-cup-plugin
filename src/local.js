import 'dotenv/config';
import { runOnce } from '../lib/runOnce.js';

const intervalMin = parseInt(process.env.INTERVAL_MINUTES ?? '5', 10);

async function tick() {
  try {
    const result = await runOnce();
    console.log(`[${result.ts}]`, JSON.stringify({ news: result.news, scores: result.scores }));
  } catch (err) {
    console.error('tick error:', err.message);
  }
}

console.log(`FIFA WM Bot lokal gestartet — Intervall ${intervalMin} min`);
await tick();
setInterval(tick, intervalMin * 60_000);
