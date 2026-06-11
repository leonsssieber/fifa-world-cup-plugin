import Parser from 'rss-parser';
import { getState, setState } from './storage.js';
import { postEmbed } from './discord.js';

const parser = new Parser({
  timeout: 15000,
  headers: { 'User-Agent': 'FifaWmDiscordBot/1.0' },
});

function stripHtml(s) {
  return s
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchesKeywords(text, keywords) {
  if (!keywords || keywords.length === 0) return true;
  const lower = text.toLowerCase();
  return keywords.some(k => lower.includes(k.toLowerCase()));
}

function itemId(item) {
  return item.guid || item.id || item.link || item.title;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function checkSource(source, globalKeywords) {
  const stateKey = `news:${source.name}`;
  const prev = await getState(stateKey);
  const firstRun = !prev;
  const seenSet = new Set(prev?.seen ?? []);
  let posted = 0;

  try {
    const feed = await parser.parseURL(source.url);
    const keywords = source.keywords ?? globalKeywords;
    const toPost = [];

    for (const item of feed.items) {
      const id = itemId(item);
      if (!id || seenSet.has(id)) continue;

      if (firstRun) {
        seenSet.add(id);
        continue;
      }

      const haystack = `${item.title ?? ''} ${item.contentSnippet ?? ''} ${item.content ?? ''}`;
      if (!matchesKeywords(haystack, keywords)) {
        seenSet.add(id);
        continue;
      }

      toPost.push({ id, item });
    }

    toPost.reverse();

    for (const { id, item } of toPost) {
      const embed = {
        title: (item.title ?? 'Ohne Titel').slice(0, 256),
        url: item.link,
        description: stripHtml(item.contentSnippet ?? item.content ?? '').slice(0, 400) || undefined,
        timestamp: item.isoDate ?? new Date().toISOString(),
        footer: { text: source.name },
        color: 0xDA291C,
      };
      await postEmbed(embed);
      seenSet.add(id);
      posted++;
      await sleep(800);
    }

    await setState(stateKey, { seen: [...seenSet].slice(-300) });
    return { source: source.name, posted, firstRun };
  } catch (err) {
    return { source: source.name, error: err.message };
  }
}

export async function pollNews(config) {
  const results = [];
  for (const source of config.sources) {
    if (source.enabled === false) continue;
    results.push(await checkSource(source, config.keywords));
  }
  return results;
}
