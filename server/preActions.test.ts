import { describe, expect, it } from 'vitest';
import { PokerRoom } from './engine';
import type { PreActionRequest } from '../shared/types';
import { clockwiseDistance } from '../shared/seats';

function firstTwo(room: PokerRoom) {
  const first = room.turnPlayerId!;
  const next = room.actors.filter(p => p.id !== first).sort((a, b) =>
    clockwiseDistance(room.player(first).seat, a.seat) - clockwiseDistance(room.player(first).seat, b.seat))[0].id;
  return [first, next];
}

function setup(count = 4) {
  let now = 100000;
  const room = new PokerRoom('QUEUE1', { autoNextHand: false }, { clock: () => now, paced: true });
  for (let i = 0; i < count; i++) room.addPlayer(`Player ${i}`, 'juan');
  room.start(room.hostId);
  const ready = () => { now = room.turnStartsAt!; room.tick(); };
  const advance = (ms: number) => { now += ms; return room.tick(); };
  const request = (type: PreActionRequest['type']): PreActionRequest => ({ type, handNumber: room.handNumber, stage: room.stage, currentBet: room.currentBet });
  return { room, ready, advance, request };
}

describe('private, fixed-price preselected decisions', () => {
  it('waits for the normal gesture and camera hold, then makes the selected call exactly once', () => {
    const { room, ready, advance, request } = setup();
    ready();
    const [first, next] = firstTwo(room);
    const before = room.player(next).chips;
    room.setPreAction(next, request('call'));
    expect(room.viewFor(first).preAction).toBeNull();
    expect(JSON.stringify(room.viewFor(first).players)).not.toContain('preAction');
    room.act(first, {type:'call'});
    expect(room.player(next).chips).toBe(before);
    ready();
    advance(899);
    expect(room.player(next).chips).toBe(before);
    advance(1);
    expect(room.player(next).chips).toBe(before - 50);
    expect(room.viewFor(next).preAction).toBeNull();
    advance(100);
    expect(room.tableEvents.filter(e => e.type === 'bet' && !e.forced && e.playerId === next)).toHaveLength(1);
  });
  it.each(['raise', 'short all-in'] as const)('cancels all selections on a %s, even when a capped call would cost the same', kind => {
    const { room, ready, request } = setup(); ready();
    const [first, next] = firstTwo(room);
    room.player(next).chips = 25;
    const stale = request('call');
    room.setPreAction(next, stale);
    if (kind === 'short all-in') room.player(first).chips = 60;
    room.act(first, kind === 'raise' ? {type:'raise',amount:100} : {type:'all-in'});
    expect(room.viewFor(next).preAction).toBeNull();
    expect(() => room.setPreAction(next, stale)).toThrow('changed');
    ready();
    expect(room.availableActions(next)?.callAmount).toBe(25);
    expect(room.player(next).chips).toBe(25);
  });
  it('checks once for a waiting big blind, then clears at the next street', () => {
    const { room, ready, advance, request } = setup(2); ready();
    const big = room.bigBlindId!;
    room.setPreAction(big, request('check'));
    room.act(room.turnPlayerId!, {type:'call'});
    ready(); advance(900);
    expect(room.stage).toBe('flop');
    expect(room.viewFor(big).preAction).toBeNull();
    ready(); advance(1500);
    expect(room.stage).toBe('flop');
    expect(room.turnPlayerId).toBe(big);
  });
  it('allows cancellation and clears on pause, disconnect, replacement session and hand end', () => {
    const { room, ready, request } = setup(2); ready();
    const big = room.bigBlindId!;
    for (const cancel of [
      () => room.setPreAction(big, request(null)),
      () => { room.pause(room.hostId, true); room.pause(room.hostId, false); },
      () => { room.disconnect(big); room.reconnect(room.player(big).token); },
      () => room.reconnect(room.player(big).token),
    ]) {
      room.setPreAction(big, request('check')); cancel();
      expect(room.viewFor(big).preAction).toBeNull();
    }
    room.setPreAction(big, request('check'));
    room.act(room.turnPlayerId!, {type:'fold'});
    expect(room.viewFor(big).preAction).toBeNull();
    expect(room.viewFor(big).canPreAct).toBe(false);
  });
  it('rejects stale streets/hands, unaffordable checks, raises, spectators and live-turn selections', () => {
    const { room, ready, request } = setup(); ready();
    const [first, next] = firstTwo(room);
    const rail = room.addPlayer('Rail', 'nat', {spectator:true});
    for (const bad of [null, {}, {...request('call'),handNumber:0}, {...request('call'),stage:'river'}, {...request('call'),type:'raise'}])
      expect(() => room.setPreAction(next, bad as PreActionRequest)).toThrow();
    expect(() => room.setPreAction(first, request('call'))).toThrow('waiting');
    expect(() => room.setPreAction(rail.id, request('fold'))).toThrow('waiting');
    expect(() => room.setPreAction(next, request('check'))).toThrow('bet to call');
  });
  it('continues clockwise at a full table after folds and calls', () => {
    const { room, ready } = setup(12); ready();
    const first = room.player(room.turnPlayerId!).seat;
    for (let i = 0; i < 12; i++) {
      expect(room.player(room.turnPlayerId!).seat).toBe((first + i) % 12);
      const action = i === 0 ? 'fold' : room.availableActions(room.turnPlayerId!)?.canCheck ? 'check' : 'call';
      room.act(room.turnPlayerId!, { type: action }); ready();
    }
    expect(room.stage).toBe('flop');
  });
});
