import type { RoomState } from '../../shared/types';
import type { ShowdownOdds } from '../../shared/handOdds';
import { describeHand } from '../../shared/handOdds';

export type PublicOdds = {
  players: { playerId: string; cards: string[] }[];
  result: ShowdownOdds | null;
} | null;

export interface RevealedSeat {
  id: string;
  name: string;
  seat: number;
  cards: string[];
  hand: string;
  disclosure: 'shown' | 'hidden' | 'mucked';
  chance: number | null;
  award: number;
}
export interface ShowdownPresentation {
  key: string;
  seats: RevealedSeat[];
  settled: boolean;
  allIn: boolean;
  contested: boolean;
  estimated: boolean;
  split: number | null;
  sidePots: boolean;
}

/** Only tabled cards enter the scene. A viewer's private cards are not disclosure.
 * Result snapshots arrive ahead of the animated runout: don't spoil the winner. */
export function showdownPresentation(room: RoomState | null, odds: PublicOdds, board: string[], settled: boolean, now: number): ShowdownPresentation | null {
  if (!room) return null;
  const reviewing = !!room.handReview && now >= room.handReview.startsAt;
  if (!odds && !reviewing && !settled) return null;
  const ids = new Set(odds?.players.map(p => p.playerId) || (reviewing ? room.handReview?.playerIds : []) || []);
  if (settled) room.winners.forEach(w => ids.add(w.playerId));
  if (reviewing) room.players.filter(p => p.disclosure === 'shown').forEach(p => ids.add(p.id));
  const seats = room.players.filter(p => p.seat >= 0 && ids.has(p.id)).map(player => {
    const index = odds?.players.findIndex(p => p.playerId === player.id) ?? -1;
    const cards = index >= 0 ? odds!.players[index].cards : reviewing && player.disclosure === 'shown' ? player.holeCards : [];
    const winner = settled ? room.winners.find(w => w.playerId === player.id) : undefined;
    return {
      id: player.id, name: player.id === room.you ? `${player.name} · you` : player.name, seat: player.seat,
      cards, disclosure: cards.length === 2 ? 'shown' as const : player.disclosure === 'mucked' ? 'mucked' as const : 'hidden' as const,
      hand: cards.length ? describeHand([...cards, ...board]) : player.disclosure === 'mucked' ? 'Mucked' : 'Not shown',
      chance: !settled && index >= 0 && odds?.result ? odds.result.wins[index] : null,
      award: winner?.amount || 0,
    };
  }).sort((a, b) => a.seat - b.seat);
  if (!seats.length) return null;
  return {
    key: `${room.code}:${room.handNumber}`, seats, settled, allIn: !!odds && !settled,
    contested: !!odds || !!room.handReview?.contested,
    estimated: !!odds?.result && !odds.result.exact,
    split: !settled ? odds?.result?.tie ?? null : null,
    sidePots: room.pots.some(pot => pot.eligible.length < seats.length),
  };
}
