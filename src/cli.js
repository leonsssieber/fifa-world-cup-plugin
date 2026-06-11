import 'dotenv/config';
import { runOnce } from '../lib/runOnce.js';

async function main() {
  const result = await runOnce();
  console.log(JSON.stringify(result, null, 2));
}

main().catch(err => {
  console.error('cli error:', err.message);
  process.exit(1);
});
