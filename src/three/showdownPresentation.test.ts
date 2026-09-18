import { describe, expect, it } from 'vitest';
import { PokerRoom } from '../../server/engine';
import { showdownPresentation } from './showdownPresentation';
import type { PokerAction } from '../../shared/types';

function table(count = 2) {
  let now = 100_000;
  const room = new PokerRoom('REVEAL', { autoNextHand: false, rebuys: true }, { paced: true, clock: () => now });
  const players = Array.from({ length: count }, (_, i) => room.addPlayer(`Player ${i}`, 'juan'));
  const rail = room.addPlayer('Spectator', 'nat', { spectator: true });
  room.start(players[0].id);
  if (count === 2) {
    players[0].holeCards = ['As', 'Ad']; players[1].holeCards = ['Ks', 'Kd'];
    room.deck = ['2h', '2c', '3d', '7h', '4h', '8s', '5h', '9c'].reverse();
  }
  const at = (time: number) => { now = time; room.tick(); };
  const act = (action?: PokerAction) => {
    at(room.turnStartsAt!);
    const id = room.turnPlayerId!;
    room.act(id, action || { type: room.availableActions(id)!.canCheck ? 'check' : 'call' });
  };
  const finish = () => { let steps = 0; while (room.isPlaying && steps++ < 80) act(); };
  return { room, players, rail, at, act, finish, time: () => now };
}

describe('cards tabled in the scene', () => {
  it('does not disclose the precomputed river result before the showdown presentation', () => {
    const { room, rail, finish, time } = table();
    finish();
    const snapshot = room.viewFor(rail.id);
    expect(snapshot.winners.length).toBeGreaterThan(0);
    expect(snapshot.players.some(p => p.disclosure === 'shown')).toBe(true);
    expect(showdownPresentation(snapshot, null, snapshot.board, false, time())).toBeNull();
  });

  it('keeps an owner’s private losing cards off the felt until an explicit show', () => {
    const { room, players, rail, finish, at, time } = table();
    finish(); at(room.handReview!.startsAt);
    const mine = room.viewFor(players[1].id);
    expect(mine.players.find(p => p.id === players[1].id)!.holeCards).toHaveLength(2);
    const before = showdownPresentation(mine, null, room.board, false, time())!;
    expect(before.seats.find(p => p.id === players[1].id)!.cards).toEqual([]);
    expect(before.seats.every(p => p.award === 0)).toBe(true);
    room.chooseCards(players[1].id, 'show', room.handNumber);
    expect(showdownPresentation(room.viewFor(rail.id), null, room.board, false, time())!.seats.find(p => p.id === players[1].id)!.cards).toEqual(['Ks', 'Kd']);
  });

  it('preserves mucked hands and shows an uncontested award without exposing a bluff', () => {
    const { room, players, rail, act, at, time } = table();
    act({ type: 'fold' }); at(room.handReview!.startsAt);
    room.chooseCards(players[1].id, 'muck', room.handNumber);
    const reveal = showdownPresentation(room.viewFor(rail.id), null, room.board, true, time())!;
    expect(reveal.seats).toHaveLength(1);
    expect(reveal.seats[0]).toMatchObject({ id: players[1].id, cards: [], disclosure: 'mucked' });
    expect(reveal.seats[0].award).toBeGreaterThan(0);
    expect(reveal.contested).toBe(false);
  });

  it('keeps odds attached to player IDs after ordering seats and hides awards during an all-in runout', () => {
    const { room, players, rail, act, time } = table();
    act({ type: 'all-in' }); act({ type: 'call' });
    const odds = { players: [players[1], players[0]].map(p => ({ playerId: p.id, cards: p.holeCards })), result: { wins: [12, 86], equity: [13, 87], tie: 2, exact: true, samples: 44 } };
    const reveal = showdownPresentation(room.viewFor(rail.id), odds, ['2c', '3d', '7h', '8s'], false, time())!;
    expect(reveal.seats.find(p => p.id === players[0].id)).toMatchObject({ chance: 86, award: 0, cards: ['As', 'Ad'] });
    expect(reveal.seats.find(p => p.id === players[1].id)).toMatchObject({ chance: 12, award: 0, cards: ['Ks', 'Kd'] });
    expect(reveal.split).toBe(2);
  });

  it('includes all twelve contenders without dropping or paging seats', () => {
    const { room, rail, act, time } = table(12);
    act({ type: 'all-in' });
    while (room.isPlaying) act({ type: 'call' });
    const event = room.tableEvents.find(e => e.type === 'all-in')!;
    if (event.type !== 'all-in') throw new Error('Missing public reveal');
    const reveal = showdownPresentation(room.viewFor(rail.id), { players: event.players, result: null }, [], false, time())!;
    expect(reveal.seats).toHaveLength(12);
    expect(new Set(reveal.seats.map(p => p.seat)).size).toBe(12);
    expect(reveal.seats.every(p => p.cards.length === 2 && p.award === 0)).toBe(true);
  });

  it('clears the reveal on the next hand', () => {
    const { room, players, rail, finish, at, time } = table();
    finish(); at(room.handReview!.endsAt); room.nextHand(players[0].id);
    expect(showdownPresentation(room.viewFor(rail.id), null, [], false, time())).toBeNull();
  });
});
