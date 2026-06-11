import { runOnce } from '../../lib/runOnce.js';

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const auth = req.headers.authorization ?? '';
    if (auth !== `Bearer ${expected}`) {
      return res.status(401).json({ error: 'unauthorized' });
    }
  }

  try {
    const result = await runOnce();
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    console.error('cron error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
