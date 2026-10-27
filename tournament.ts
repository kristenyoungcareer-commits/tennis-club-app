export type TournamentStatus = 'DRAFT' | 'CONFIRMED' | 'CANCELED';
export type Player = { id: string; name: string; groupId: string; manualRank?: number };
export type DoublesMatch = {
  id: string;
  groupId: string;
  order: number;
  teamA: [string, string];
  teamB: [string, string];
  scoreA?: number;
  scoreB?: number;
};

export type Standing = {
  playerId: string;
  played: number;
  wins: number;
  losses: number;
  difference: number;
  rank: number;
  tied: boolean;
};

const pairKey = (a: string, b: string) => [a, b].sort().join(':');

/**
 * Creates a deterministic rotation draft. Completed matches are immutable inputs:
 * their ids, teams and scores are retained while only unplayed slots are replaced.
 */
export function generateRotation(
  groupId: string,
  playerIds: string[],
  targetGames: number,
  previous: DoublesMatch[] = [],
): DoublesMatch[] {
  if (playerIds.length < 4) return previous.filter(m => m.groupId === groupId && m.scoreA !== undefined);
  if (playerIds.length > 8) throw new Error('조당 최대 인원은 8명입니다.');
  const completed = previous.filter(m => m.groupId === groupId && m.scoreA !== undefined && m.scoreB !== undefined);
  const games = new Map(playerIds.map(id => [id, 0]));
  const partners = new Map<string, number>();
  completed.forEach(m => {
    [...m.teamA, ...m.teamB].forEach(id => games.set(id, (games.get(id) || 0) + 1));
    [m.teamA, m.teamB].forEach(([a, b]) => partners.set(pairKey(a, b), (partners.get(pairKey(a, b)) || 0) + 1));
  });
  const desiredSlots = Math.ceil((playerIds.length * Math.max(1, targetGames)) / 4);
  const result = [...completed];
  for (let order = completed.length + 1; result.length < Math.max(completed.length, desiredSlots); order += 1) {
    const available = [...playerIds].sort((a, b) => (games.get(a) || 0) - (games.get(b) || 0) || a.localeCompare(b));
    const selected = available.slice(0, 4);
    if (selected.length < 4) break;
    const pairings: Array<[[string, string], [string, string]]> = [
      [[selected[0], selected[1]], [selected[2], selected[3]]],
      [[selected[0], selected[2]], [selected[1], selected[3]]],
      [[selected[0], selected[3]], [selected[1], selected[2]]],
    ];
    pairings.sort((x, y) => {
      const cost = (p: [[string, string], [string, string]]) => p.reduce((sum, pair) => sum + (partners.get(pairKey(...pair)) || 0), 0);
      return cost(x) - cost(y);
    });
    const [teamA, teamB] = pairings[0];
    const match: DoublesMatch = { id: `${groupId}-${order}`, groupId, order, teamA, teamB };
    result.push(match);
    selected.forEach(id => games.set(id, (games.get(id) || 0) + 1));
    [teamA, teamB].forEach(([a, b]) => partners.set(pairKey(a, b), (partners.get(pairKey(a, b)) || 0) + 1));
  }
  return result.sort((a, b) => a.order - b.order);
}

export function standings(players: Player[], matches: DoublesMatch[]): Standing[] {
  const rows = new Map<string, Omit<Standing, 'rank' | 'tied'>>(
    players.map(p => [p.id, { playerId: p.id, played: 0, wins: 0, losses: 0, difference: 0 }]),
  );
  matches.filter(m => m.scoreA !== undefined && m.scoreB !== undefined && m.scoreA !== m.scoreB).forEach(m => {
    const aWon = m.scoreA! > m.scoreB!;
    const diff = m.scoreA! - m.scoreB!;
    m.teamA.forEach(id => { const r = rows.get(id); if (r) { r.played++; r.wins += aWon ? 1 : 0; r.losses += aWon ? 0 : 1; r.difference += diff; } });
    m.teamB.forEach(id => { const r = rows.get(id); if (r) { r.played++; r.wins += aWon ? 0 : 1; r.losses += aWon ? 1 : 0; r.difference -= diff; } });
  });
  const ordered = [...rows.values()].sort((a, b) => b.wins - a.wins || b.difference - a.difference || ((players.find(p => p.id === a.playerId)?.manualRank ?? 999) - (players.find(p => p.id === b.playerId)?.manualRank ?? 999)));
  return ordered.map((row, index) => {
    const same = ordered.filter(x => x.wins === row.wins && x.difference === row.difference).length > 1;
    return { ...row, rank: index + 1, tied: same };
  });
}

export function scoreMatch(match: DoublesMatch, scoreA: number, scoreB: number): DoublesMatch {
  if (!Number.isInteger(scoreA) || !Number.isInteger(scoreB) || scoreA < 0 || scoreB < 0) throw new Error('스코어는 0 이상의 정수여야 합니다.');
  if (scoreA === scoreB) throw new Error('월례대회 경기는 무승부로 저장할 수 없습니다.');
  return { ...match, scoreA, scoreB };
}
