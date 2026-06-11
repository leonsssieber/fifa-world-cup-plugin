import { getState, setState } from './storage.js';
import { postPing, postEmbed } from './discord.js';

const API_BASE = 'https://api.football-data.org/v4';

async function fetchMatches(token, competition) {
  const url = `${API_BASE}/competitions/${competition}/matches`;
  const res = await fetch(url, { headers: { 'X-Auth-Token': token } });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`football-data ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.matches ?? [];
}

function isSwissTeam(team, teamMatch) {
  const name = (team?.name ?? '').toLowerCase();
  return teamMatch.some(needle => name.includes(needle.toLowerCase()));
}

function scoreFromMatch(match) {
  const home = match.score?.fullTime?.home;
  const away = match.score?.fullTime?.away;
  return {
    home: typeof home === 'number' ? home : 0,
    away: typeof away === 'number' ? away : 0,
  };
}

function formatScoreLine(match, score) {
  const homeName = match.homeTeam?.name ?? 'Heim';
  const awayName = match.awayTeam?.name ?? 'Auswaerts';
  return `${homeName} ${score.home} : ${score.away} ${awayName}`;
}

export async function checkLiveMatches(config) {
  const token = process.env.FOOTBALL_DATA_TOKEN;
  if (!token) return { skipped: 'kein FOOTBALL_DATA_TOKEN' };

  const ping = process.env.GOAL_PING_MENTION ?? '@everyone';
  const competition = config.competition ?? 'WC';
  const teamMatch = config.teamMatch ?? ['switzerland', 'schweiz'];

  let allMatches;
  try {
    allMatches = await fetchMatches(token, competition);
  } catch (err) {
    return { error: err.message };
  }

  const events = [];

  for (const match of allMatches) {
    const stateKey = `match:${match.id}`;
    const prev = (await getState(stateKey)) ?? {
      status: null,
      homeScore: 0,
      awayScore: 0,
      notifiedKickoff: false,
      notifiedHalftime: false,
      notifiedFulltime: false,
    };

    const status = match.status;
    const score = scoreFromMatch(match);
    const minute = match.minute ?? null;
    const homeName = match.homeTeam?.name ?? 'Heim';
    const awayName = match.awayTeam?.name ?? 'Auswaerts';
    const swissIsHome = isSwissTeam(match.homeTeam, teamMatch);
    const swissIsAway = isSwissTeam(match.awayTeam, teamMatch);
    const involvesSwiss = swissIsHome || swissIsAway;
    const minuteStr = minute ? ` ${minute}'` : '';
    const scoreLine = formatScoreLine(match, score);

    // First encounter: don't backfill old events. Just initialize state.
    const firstEncounter = prev.status === null;
    if (firstEncounter) {
      prev.homeScore = score.home;
      prev.awayScore = score.away;
      if (status === 'FINISHED') {
        prev.notifiedKickoff = true;
        prev.notifiedHalftime = true;
        prev.notifiedFulltime = true;
      } else if (status === 'IN_PLAY' || status === 'PAUSED') {
        prev.notifiedKickoff = true;
        if (status === 'PAUSED') prev.notifiedHalftime = true;
      }
      prev.status = status;
      await setState(stateKey, prev);
      continue;
    }

    // --- Kickoff: nur Schweiz, mit Ping ---
    if (!prev.notifiedKickoff && (status === 'IN_PLAY' || status === 'PAUSED')) {
      if (involvesSwiss) {
        await postPing(`:flag_ch: **Anpfiff!** ${ping}\n${homeName} vs ${awayName}`);
        events.push({ matchId: match.id, event: 'kickoff_swiss' });
      }
      prev.notifiedKickoff = true;
    }

    // --- Tore ---
    if (status === 'IN_PLAY' || status === 'PAUSED' || status === 'FINISHED') {
      const homeDelta = score.home - prev.homeScore;
      const awayDelta = score.away - prev.awayScore;

      if (homeDelta > 0 || awayDelta > 0) {
        if (involvesSwiss) {
          // Schweizer Spiel: Pings für alle Tore
          const swissScored = (swissIsHome && homeDelta > 0) || (swissIsAway && awayDelta > 0);
          const oppScored = (swissIsHome && awayDelta > 0) || (swissIsAway && homeDelta > 0);

          if (swissScored) {
            await postPing(
              `:soccer: **TOR FUER DIE SCHWEIZ!** :flag_ch:${minuteStr} ${ping}\n**${scoreLine}**`
            );
            events.push({ matchId: match.id, event: 'swiss_goal' });
          }
          if (oppScored) {
            await postPing(`:grimacing: **Gegentor**${minuteStr}\n**${scoreLine}**`);
            events.push({ matchId: match.id, event: 'opp_goal' });
          }
        } else {
          // Anderes WM-Spiel: ruhiges Embed, kein Ping
          const scorer = homeDelta > 0 ? homeName : awayName;
          await postEmbed({
            title: `:soccer: TOR ${scorer}${minuteStr}`,
            description: `**${scoreLine}**`,
            color: 0x57F287,
            timestamp: new Date().toISOString(),
            footer: { text: 'FIFA WM' },
          });
          events.push({ matchId: match.id, event: 'other_goal' });
        }
      }
    }

    // --- Halbzeit: nur Schweiz ---
    if (!prev.notifiedHalftime && status === 'PAUSED') {
      if (involvesSwiss) {
        await postPing(`:pause_button: **Halbzeit**\n**${scoreLine}**`);
        events.push({ matchId: match.id, event: 'halftime_swiss' });
      }
      prev.notifiedHalftime = true;
    }

    // --- Schlusspfiff: Schweiz mit Ping, andere als Embed ---
    if (!prev.notifiedFulltime && status === 'FINISHED') {
      if (involvesSwiss) {
        const swissWon = swissIsHome
          ? score.home > score.away
          : score.away > score.home;
        const draw = score.home === score.away;
        const verdict = swissWon
          ? ':white_check_mark: Schweiz gewinnt!'
          : draw
            ? ':handshake: Unentschieden.'
            : ':x: Schweiz verliert.';
        await postPing(
          `:end: **Schlusspfiff** ${ping}\n**${scoreLine}**\n${verdict}`
        );
        events.push({ matchId: match.id, event: 'fulltime_swiss' });
      } else {
        await postEmbed({
          title: ':end: Schlusspfiff',
          description: `**${scoreLine}**`,
          color: 0x4F545C,
          timestamp: new Date().toISOString(),
          footer: { text: 'FIFA WM' },
        });
        events.push({ matchId: match.id, event: 'fulltime_other' });
      }
      prev.notifiedFulltime = true;
    }

    prev.status = status;
    prev.homeScore = score.home;
    prev.awayScore = score.away;
    await setState(stateKey, prev);
  }

  return {
    competition,
    totalMatches: allMatches.length,
    events,
  };
}
