import { describe, expect, it } from 'vitest';
import { PokerRoom } from './engine';
import type { PokerAction } from '../shared/types';

function table() {
  let now = 100_000;
  const room = new PokerRoom('REVIEW', { autoNextHand: false, rebuys: true }, { paced: true, clock: () => now });
  const a = room.addPlayer('Juan', 'juan'), b = room.addPlayer('Nat', 'nat');
  const rail = room.addPlayer('Rail', 'jack', { spectator: true });
  room.start(a.id);
  a.holeCards = ['As', 'Ad']; b.holeCards = ['Ks', 'Kd'];
  room.deck = ['2h', '2c', '3d', '7h', '4h', '8s', '5h', '9c'].reverse();
  const at = (time: number) => { now = time; room.tick(); };
  const act = (action?: PokerAction) => {
    at(room.turnStartsAt!);
    const id = room.turnPlayerId!;
    room.act(id, action || { type: room.availableActions(id)!.canCheck ? 'check' : 'call' });
  };
  const finish = () => { let steps = 0; while (room.isPlaying && steps++ < 30) act(); expect(room.stage).toBe('showdown'); };
  const open = () => at(room.handReview!.startsAt);
  return { room, a, b, rail, at, act, finish, open, time: () => now };
}

describe('private show/muck choices and the hand review window', () => {
  it('tables the contested winner, keeps a losing hand private, and broadcasts only an explicit show', () => {
    const { room, a, b, rail, finish, open } = table();
    finish();
    expect(room.winners[0].playerId).toBe(a.id);
    expect(() => room.chooseCards(b.id, 'show', 1)).toThrow('window is closed');
    open();
    const before = room.viewFor(rail.id);
    expect(before.players.find(p => p.id === a.id)).toMatchObject({ holeCards: ['As', 'Ad'], disclosure: 'shown' });
    expect(before.players.find(p => p.id === b.id)).toMatchObject({ holeCards: [], disclosure: 'hidden' });
    expect(room.viewFor(b.id).canShowCards).toBe(true);
    expect(room.viewFor(a.id).canMuckCards).toBe(false);
    expect(() => room.chooseCards(a.id, 'muck', 1)).toThrow('already been shown');
    expect(() => room.chooseCards(rail.id, 'show', 1)).toThrow();
    room.chooseCards(b.id, 'show', 1);
    expect(room.viewFor(rail.id).players.find(p => p.id === b.id)).toMatchObject({ holeCards: ['Ks', 'Kd'], disclosure: 'shown' });
    expect(room.viewFor(b.id).canShowCards).toBe(false);
    expect(JSON.stringify(before.tableEvents)).not.toMatch(/Ks|Kd/);
  });

  it('lets an uncontested winner show a bluff, while mucked cards remain private even on reconnect', () => {
    const { room, a, b, rail, act, open } = table();
    act({ type: 'fold' }); open();
    expect(room.viewFor(b.id).canShowCards).toBe(true);
    expect(room.viewFor(rail.id).players.every(p => !p.holeCards.length)).toBe(true);
    room.chooseCards(a.id, 'muck', room.handNumber);
    expect(() => room.chooseCards(a.id, 'show', room.handNumber)).toThrow();
    expect(room.reconnect(a.token)?.id).toBe(a.id);
    expect(room.viewFor(rail.id).players.find(p => p.id === a.id)).toMatchObject({ holeCards: [], disclosure: 'mucked' });
    expect(room.viewFor(a.id).players.find(p => p.id === a.id)?.holeCards).toEqual(['As', 'Ad']);
    room.chooseCards(b.id, 'show', room.handNumber);
    expect(room.viewFor(a.id).players.find(p => p.id === b.id)?.holeCards).toEqual(['Ks', 'Kd']);
  });

  it('defaults hidden hands to muck, refuses stale choices, and prevents the host skipping celebration', () => {
    const { room, a, b, rail, act, open, at } = table();
    act({ type: 'fold' }); open();
    expect(() => room.chooseCards(b.id, 'show', 0)).toThrow('earlier hand');
    expect(() => room.chooseCards(b.id, 'invalid', 1)).toThrow('Choose show or muck');
    at(room.handReview!.endsAt - 1);
    expect(() => room.nextHand(a.id)).toThrow('show or muck');
    at(room.handReview!.endsAt);
    expect(room.viewFor(rail.id).players.filter(p => p.cardCount).every(p => p.disclosure === 'mucked' && !p.holeCards.length)).toBe(true);
    expect(() => room.chooseCards(b.id, 'show', 1)).toThrow('window is closed');
    room.nextHand(a.id);
    expect(room.handNumber).toBe(2);
    expect(() => room.chooseCards(a.id, 'show', 1)).toThrow('earlier hand');
    expect(room.handReview).toBeNull();
    expect(room.viewFor(rail.id).players.every(p => !p.holeCards.length)).toBe(true);
  });

  it('preserves the review deadline through a pause and accepts a choice after resuming', () => {
    const { room, a, b, act, open, at, time } = table();
    act({ type: 'fold' }); open();
    const deadline = room.handReview!.endsAt;
    room.pause(a.id, true);
    at(time() + 30_000);
    expect(() => room.chooseCards(b.id, 'show', 1)).toThrow('window is closed');
    room.pause(a.id, false);
    expect(room.handReview!.endsAt).toBe(deadline + 30_000);
    expect(() => room.chooseCards(b.id, 'show', 1)).not.toThrow();
  });

  it('keeps exposed all-in cards public and lets a newly busted player react during the review', () => {
    const { room, a, b, rail, act, open } = table();
    act({ type: 'all-in' }); act({ type: 'call' }); open();
    expect(b.status).toBe('out');
    expect(room.viewFor(b.id).canMuckCards).toBe(false);
    expect(() => room.chooseCards(b.id, 'muck', 1)).toThrow('already been shown');
    room.emote(b.id, 'cry'); room.emote(rail.id, 'laugh');
    const view = room.viewFor(a.id);
    expect(view.players.find(p => p.id === b.id)?.emote?.type).toBe('cry');
    expect(view.players.find(p => p.id === rail.id)?.emote).toBeNull();
  });
});
