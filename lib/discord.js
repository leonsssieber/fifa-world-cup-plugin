function getWebhookUrl() {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url || url.includes('XXXXXXXX')) {
    throw new Error('DISCORD_WEBHOOK_URL fehlt oder ist Platzhalter.');
  }
  return url;
}

async function post(body) {
  const res = await fetch(getWebhookUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Discord webhook ${res.status}: ${text.slice(0, 200)}`);
  }
}

export async function postEmbed(embed, { silent = false } = {}) {
  const body = { embeds: [embed] };
  if (silent) body.flags = 4096;
  await post(body);
}

export async function postPing(content) {
  await post({
    content,
    allowed_mentions: { parse: ['everyone', 'roles', 'users'] },
  });
}
