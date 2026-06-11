import { getState, setState } from './storage.js';
import { postPing } from './discord.js';

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

function isSwiss(team, teamMatch) {
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

function formatScore(match, score) {
  const homeName = match.homeTeam?.name ?? 'Heim';
  const awayName = match.awayTeam?.name ?? 'Auswaerts';
  return `**${homeName} ${score.home} : ${score.away} ${awayName}**`;
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

  const swissMatches = allMatches.filter(m =>
    isSwiss(m.homeTeam, teamMatch) || isSwiss(m.awayTeam, teamMatch)
  );

  const events = [];

  for (const match of swissMatches) {
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
    const swissIsHome = isSwiss(match.homeTeam, teamMatch);
    const minuteStr = minute ? ` ${minute}'` : '';

    if (!prev.notifiedKickoff && (status === 'IN_PLAY' || status === 'PAUSED')) {
      await postPing(
        `:flag_ch: **Anpfiff!** ${ping}\n${match.homeTeam?.name} vs ${match.awayTeam?.name}`
      );
      prev.notifiedKickoff = true;
      events.push({ matchId: match.id, event: 'kickoff' });
    }

    if (status === 'IN_PLAY' || status === 'PAUSED' || status === 'FINISHED') {
      const swissScored = swissIsHome
        ? score.home > prev.homeScore
        : score.away > prev.awayScore;
      const oppScored = swissIsHome
        ? score.away > prev.awayScore
        : score.home > prev.homeScore;

      if (swissScored) {
        await postPing(
          `:soccer: **TOR FUER DIE SCHWEIZ!** :flag_ch:${minuteStr} ${ping}\n${formatScore(match, score)}`
        );
        events.push({ matchId: match.id, event: 'swiss_goal' });
      }
      if (oppScored) {
        await postPing(
          `:grimacing: **Gegentor**${minuteStr}\n${formatScore(match, score)}`
        );
        events.push({ matchId: match.id, event: 'opp_goal' });
      }
    }

    if (!prev.notifiedHalftime && status === 'PAUSED') {
      await postPing(`:pause_button: **Halbzeit**\n${formatScore(match, score)}`);
      prev.notifiedHalftime = true;
      events.push({ matchId: match.id, event: 'halftime' });
    }

    if (!prev.notifiedFulltime && status === 'FINISHED') {
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
        `:end: **Schlusspfiff** ${ping}\n${formatScore(match, score)}\n${verdict}`
      );
      prev.notifiedFulltime = true;
      events.push({ matchId: match.id, event: 'fulltime' });
    }

    prev.status = status;
    prev.homeScore = score.home;
    prev.awayScore = score.away;
    await setState(stateKey, prev);
  }

  return {
    competition,
    swissMatches: swissMatches.length,
    events,
  };
}
