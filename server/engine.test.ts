import { describe, expect, it } from 'vitest';
import { PokerRoom, shuffledDeck, validateSettings } from './engine.js';
import { clockwiseDistance } from '../shared/seats.js';
import type { Card, GameSettings } from '../shared/types.js';

function table(count = 3, settings: Partial<GameSettings> = {}, options: ConstructorParameters<typeof PokerRoom>[2] = {}) {
  const room = new PokerRoom('TEST42',{autoNextHand:false,...settings},options);
  const players = Array.from({length:count},(_,i) => room.addPlayer(`Player ${i}`,'juan'));
  // Fixture names below refer to clockwise positions, starting with the host.
  const hostSeat = players[0].seat;
  players.sort((a,b) => ((a.seat-hostSeat+12)%12)-((b.seat-hostSeat+12)%12));
  return {room,players};
}
function rig(draws: Card[]) {
  if (new Set(draws).size !== draws.length) throw new Error('Duplicate test cards');
  return () => [...shuffledDeck().filter(c => !draws.includes(c)),...[...draws].reverse()];
}
function checkDown(room: PokerRoom) {
  let turns = 0;
  while (room.isPlaying) {
    if (++turns > 100) throw new Error('Hand failed to finish');
    const id = room.turnPlayerId!;
    const actions = room.availableActions(id)!;
    room.act(id,{type:actions.canCheck ? 'check' : 'call'});
  }
}

describe('authoritative no-limit Texas Hold’em',() => {
  it('deals 12 unique hands, uses burns, and conserves every chip through a showdown',() => {
    const {room,players} = table(12);
    room.start(players[0].id);
    expect(new Set(players.flatMap(p => p.holeCards)).size).toBe(24);
    expect(room.deck).toHaveLength(28);
    expect(room.turnPlayerId).toBe(players[3].id);
    checkDown(room);
    expect(room.board).toHaveLength(5);
    expect(room.deck).toHaveLength(20);
    expect(players.reduce((sum,p) => sum+p.chips,0)).toBe(120000);
    expect(room.winners.reduce((sum,w) => sum+w.amount,0)).toBe(600);
  });
  it('makes the heads-up button the small blind, first preflop and last postflop',() => {
    const {room,players:[button,big]} = table(2);
    room.start(button.id);
    expect(room.dealerId).toBe(button.id);
    expect(room.smallBlindId).toBe(button.id);
    expect(room.bigBlindId).toBe(big.id);
    expect(room.turnPlayerId).toBe(button.id);
    room.act(button.id,{type:'call'});
    expect(room.turnPlayerId).toBe(big.id);
    room.act(big.id,{type:'check'});
    expect(room.stage).toBe('flop');
    expect(room.turnPlayerId).toBe(big.id);
    checkDown(room);
    room.nextHand(button.id);
    expect(room.dealerId).toBe(big.id);
  });
  it('rejects out-of-turn actions, invalid checks, below-minimum raises and fractional chips without mutation',() => {
    const {room,players:[p0,p1,p2]} = table();
    room.start(p0.id);
    const snapshot = JSON.stringify(room.viewFor(p0.id));
    expect(() => room.act(p1.id,{type:'call'})).toThrow('not your turn');
    expect(() => room.act(p0.id,{type:'check'})).toThrow('bet to call');
    expect(() => room.act(p0.id,{type:'raise',amount:70})).toThrow('Minimum raise');
    expect(() => room.act(p0.id,{type:'raise',amount:100.5})).toThrow('whole number');
    expect(() => room.act(p0.id,{type:'raise',amount:Infinity})).toThrow('whole number');
    expect(JSON.stringify(room.viewFor(p0.id))).toBe(snapshot);
    room.act(p0.id,{type:'raise',amount:150});
    expect(room.availableActions(p1.id)?.minRaiseTo).toBe(250);
    expect(() => room.act(p2.id,{type:'fold'})).toThrow('not your turn');
  });
  it('does not reopen a raise for a player who already acted after a short all-in',() => {
    const {room,players:[p0,p1,p2,p3]} = table(4);
    p1.chips = 125;
    room.start(p0.id);
    room.act(p3.id,{type:'raise',amount:100});
    room.act(p0.id,{type:'call'});
    room.act(p1.id,{type:'all-in'});
    expect(room.currentBet).toBe(125);
    expect(room.availableActions(p2.id)?.canRaise).toBe(true); // Big blind has not acted.
    room.act(p2.id,{type:'call'});
    expect(room.availableActions(p3.id)?.canRaise).toBe(false);
    expect(() => room.act(p3.id,{type:'raise',amount:175})).toThrow('short all-in');
    room.act(p3.id,{type:'call'});
    expect(room.availableActions(p0.id)?.canRaise).toBe(false);
    checkDown(room);
    expect(room.players.reduce((sum,p) => sum+p.chips,0)).toBe(30125);
  });
  it('reopens betting when cumulative short all-ins reach a full raise',() => {
    const {room,players:[p0,p1,p2,p3]} = table(4);
    p1.chips = 275; p2.chips = 350;
    room.start(p0.id);
    room.act(p3.id,{type:'raise',amount:200});
    room.act(p0.id,{type:'call'});
    room.act(p1.id,{type:'all-in'});
    room.act(p2.id,{type:'all-in'});
    expect(room.currentBet).toBe(350);
    expect(room.availableActions(p3.id)?.canRaise).toBe(true);
    expect(room.availableActions(p3.id)?.minRaiseTo).toBe(500);
    room.act(p3.id,{type:'raise',amount:500});
    checkDown(room);
    expect(room.players.reduce((sum,p) => sum+p.chips,0)).toBe(20625);
  });
  it('requires a full raise above a short opening all-in, rather than completing it to one blind',() => {
    const {room,players:[p0,p1,p2,p3]} = table(4);
    p1.chips = 70;
    room.start(p0.id);
    room.act(p3.id,{type:'call'}); room.act(p0.id,{type:'call'}); room.act(p1.id,{type:'call'}); room.act(p2.id,{type:'check'});
    expect(room.stage).toBe('flop');
    room.act(p1.id,{type:'all-in'}); // Opens for 20, below the minimum bet of 50.
    expect(room.currentBet).toBe(20);
    expect(room.availableActions(p2.id)?.minRaiseTo).toBe(70);
    expect(() => room.act(p2.id,{type:'raise',amount:50})).toThrow('Minimum raise');
    room.act(p2.id,{type:'raise',amount:70});
    expect(room.availableActions(p3.id)?.minRaiseTo).toBe(120);
    checkDown(room);
    expect(room.players.reduce((sum,p) => sum+p.chips,0)).toBe(30070);
  });
  it('awards main and side pots independently, returns unmatched chips, and sends busted players to the rail',() => {
    const makeDeck = rig(['Ks','Qs','As','Kd','Qd','Ad','2h','2c','3d','7h','4h','8s','5h','9c']);
    const {room,players:[aces,kings,queens]} = table(3,{}, {makeDeck});
    aces.chips = 100; kings.chips = 200; queens.chips = 300;
    room.start(aces.id);
    room.act(aces.id,{type:'all-in'});
    room.act(kings.id,{type:'all-in'});
    expect(room.availableActions(queens.id)?.canRaise).toBe(false);
    room.act(queens.id,{type:'call'});
    expect(room.stage).toBe('showdown');
    expect(room.winners.find(w => w.playerId === aces.id)?.amount).toBe(300);
    expect(room.winners.find(w => w.playerId === kings.id)?.amount).toBe(200);
    expect(queens.chips).toBe(100);
    expect(aces.chips+kings.chips+queens.chips).toBe(600);
    expect(room.viewFor(queens.id).pots.map(p => p.amount)).toEqual([300,200]);
  });
  it('splits a board-made tied pot and awards an odd chip clockwise from the button',() => {
    const makeDeck = rig(['2d','4d','3d','5d','6d','7d','2h','Ts','Js','Qs','3h','Ks','4h','As']);
    const {room,players:[p0,p1,p2]} = table(3,{levels:[{small:1,big:2,ante:1,minutes:15}]},{makeDeck});
    room.start(p0.id);
    room.act(p0.id,{type:'call'});
    room.act(p1.id,{type:'call'});
    room.act(p2.id,{type:'check'});
    room.act(p1.id,{type:'check'});
    room.act(p2.id,{type:'fold'});
    checkDown(room);
    expect(room.pot).toBe(9);
    expect(room.winners.find(w => w.playerId === p1.id)?.amount).toBe(5);
    expect(room.winners.find(w => w.playerId === p0.id)?.amount).toBe(4);
    expect(room.players.reduce((s,p) => s+p.chips,0)).toBe(30000);
    expect(room.viewFor(p0.id).players.find(p => p.id === p2.id)?.holeCards).toEqual([]);
  });
  it('refunds the uncalled portion of a heads-up all-in call and never exposes a folded hand',() => {
    const {room,players:[short,deep]} = table(2);
    short.chips = 100; deep.chips = 300;
    room.start(short.id);
    room.act(short.id,{type:'all-in'});
    room.act(deep.id,{type:'fold'});
    expect(short.chips).toBe(150);
    expect(deep.chips).toBe(250);
    expect(room.pot).toBe(100);
    expect(room.viewFor(deep.id).players.find(p => p.id === short.id)?.holeCards).toEqual([]);
  });
  it('handles a big blind all-in below the small blind without requiring a fictional call',() => {
    const {room,players:[small,big]} = table(2);
    big.chips = 10;
    room.start(small.id);
    expect(room.isPlaying).toBe(false);
    expect(room.pot).toBe(20);
    expect(small.chips+big.chips).toBe(10010);
  });
  it('handles antes that exhaust every stack and runs out the board without an actor',() => {
    const {room,players} = table(3,{levels:[{small:25,big:50,ante:50,minutes:15}]});
    players.forEach(p => { p.chips = 20; });
    room.start(players[0].id);
    expect(room.isPlaying).toBe(false);
    expect(room.board).toHaveLength(5);
    expect(players.reduce((sum,p) => sum+p.chips,0)).toBe(60);
  });
  it('keeps the big blind option after all players limp',() => {
    const {room,players:[p0,p1,big]} = table(3);
    room.start(p0.id);
    room.act(p0.id,{type:'call'}); room.act(p1.id,{type:'call'});
    expect(room.stage).toBe('preflop');
    expect(room.turnPlayerId).toBe(big.id);
    expect(room.availableActions(big.id)?.canRaise).toBe(true);
    room.act(big.id,{type:'raise',amount:100});
    expect(room.turnPlayerId).toBe(p0.id);
  });
});

describe('tournament, privacy, and table controls',() => {
  it('serializes only the viewer’s private cards, no tokens/deck, and isolates spectator chat and gestures',() => {
    const {room,players:[host,other]} = table(2);
    const spectator = room.addPlayer('The Rail','nat',{spectator:true});
    room.start(host.id);
    room.sendChat(spectator.id,'They definitely have aces');
    room.emote(spectator.id,'bluff');
    room.sendChat(host.id,'Good luck');
    const hostState = room.viewFor(host.id);
    const railState = room.viewFor(spectator.id);
    expect(hostState.players.find(p => p.id === host.id)?.holeCards).toHaveLength(2);
    expect(hostState.players.find(p => p.id === other.id)?.holeCards).toHaveLength(0);
    expect(railState.players.every(p => p.holeCards.length === 0)).toBe(true);
    expect(hostState.chat).toHaveLength(1);
    expect(railState.chat).toHaveLength(2);
    expect(hostState.players.find(p => p.id === spectator.id)?.emote).toBe(null);
    expect(railState.players.find(p => p.id === spectator.id)?.emote?.type).toBe('bluff');
    const json = JSON.stringify(hostState);
    expect(json).not.toContain('token'); expect(json).not.toContain('deck'); expect(json).not.toContain(other.token);
  });
  it('locks tournament settings at start and denies non-host administration',() => {
    const {room,players:[host,other]} = table(2);
    expect(() => room.start(other.id)).toThrow('Only the host');
    expect(() => room.updateSettings(other.id,{startingStack:20000})).toThrow('Only the host');
    room.updateSettings(host.id,{startingStack:15000});
    expect(other.chips).toBe(15000);
    room.start(host.id);
    expect(() => room.updateSettings(host.id,{startingStack:20000})).toThrow('locked');
    room.updateSettings(host.id,{roomTheme:'penthouse'});
    expect(room.settings.roomTheme).toBe('penthouse');
  });
  it('enforces capacity and closed registration but allows spectators when configured',() => {
    const {room,players} = table(2,{maxPlayers:2});
    const extra = room.addPlayer('Extra','juan');
    expect(extra.status).toBe('spectator');
    expect(extra.chips).toBe(0);
    room.updateSettings(players[0].id,{allowSpectators:false});
    expect(() => room.addPlayer('No seat','juan')).toThrow('Spectators are disabled');
    const other = table(2,{lateRegistration:false});
    other.room.start(other.players[0].id);
    expect(other.room.addPlayer('Too late','nat').status).toBe('spectator');
  });
  it('waits to deal a late player until the next hand',() => {
    const {room,players} = table(2);
    room.start(players[0].id);
    const late = room.addPlayer('Late','jack');
    expect(late.status).toBe('waiting'); expect(late.holeCards).toHaveLength(0);
    expect(() => room.act(late.id,{type:'call'})).toThrow('not your turn');
    checkDown(room);
    room.nextHand(players[0].id);
    expect(late.holeCards).toHaveLength(2);
  });
  it('freezes both action and level time while paused, and safely checks or folds on timeout',() => {
    let now = 100000;
    const {room,players:[host,other]} = table(2,{turnSeconds:10},{clock:() => now});
    room.start(host.id);
    const levelEnd = room.levelEndsAt!;
    now += 5000; room.pause(host.id,true);
    now += 60000;
    expect(room.tick()).toBe(false); expect(room.turnPlayerId).toBe(host.id);
    room.pause(host.id,false);
    expect(room.levelEndsAt).toBe(levelEnd+60000);
    now += 5000;
    expect(room.tick()).toBe(true); expect(host.status).toBe('folded');
    room.nextHand(host.id);
    room.act(other.id,{type:'call'});
    now += 10000;
    room.tick();
    expect(room.stage).toBe('flop'); expect(host.lastAction).toBe('Check');
  });
  it('changes blind levels only between hands and observes scheduled breaks',() => {
    let now = 100000;
    const levels = [{small:25,big:50,ante:0,minutes:1},{small:50,big:100,ante:10,minutes:1}];
    const {room,players} = table(2,{levels,breakEveryLevels:1,breakMinutes:1},{clock:() => now});
    room.start(players[0].id);
    now += 60001;
    expect(room.levelIndex).toBe(0);
    checkDown(room);
    room.nextHand(players[0].id);
    expect(room.stage).toBe('showdown'); expect(room.breakEndsAt).toBe(now+60000);
    expect(() => room.nextHand(players[0].id)).toThrow('scheduled break');
    now += 60000;
    room.tick();
    expect(room.stage).toBe('preflop'); expect(room.currentLevel.big).toBe(100); expect(room.pot).toBe(170);
  });
  it('allows a bounded rebuy between hands and rejects one during a hand',() => {
    const makeDeck = rig(['2d','As','3d','Ad','2h','Ks','Qh','8c','4h','5s','6h','9d']);
    const {room,players:[aces,low]} = table(2,{rebuys:true,maxRebuys:1},{makeDeck});
    aces.chips = 100; low.chips = 100;
    room.start(aces.id);
    expect(() => room.rebuy(low.id)).toThrow('not available');
    room.act(aces.id,{type:'all-in'}); room.act(low.id,{type:'call'});
    expect(low.status).toBe('out'); expect(room.stage).toBe('showdown');
    expect(room.viewFor(low.id).canRebuy).toBe(true);
    room.rebuy(low.id);
    expect(low.chips).toBe(10000); expect(low.rebuyCount).toBe(1);
    expect(() => room.rebuy(low.id)).toThrow('not available');
  });
  it('validates settings bounds and strips unknown settings instead of trusting client objects',() => {
    expect(() => validateSettings({maxPlayers:13})).toThrow();
    expect(() => validateSettings({levels:[]})).toThrow();
    expect(() => validateSettings({levels:[{small:100,big:50,ante:0,minutes:15}]})).toThrow();
    expect(() => validateSettings({startingStack:NaN})).toThrow();
    expect(validateSettings({intruder:'no'} as Partial<GameSettings>)).not.toHaveProperty('intruder');
  });
  it('conserves chips and completes legal randomized games across 2–12 seats',() => {
    for (const count of [2,3,6,12]) {
      const {room,players} = table(count);
      const host = players[0].id;
      room.start(host);
      let actions = 0;
      let seed = 2718+count;
      const roll = () => {seed = (seed*1664525+1013904223)>>>0; return seed/4294967296;};
      while (room.stage !== 'finished' && room.handNumber <= 15) {
        if (++actions > 12000) throw new Error('Game failed to make progress');
        if (room.stage === 'showdown') { room.nextHand(host); continue; }
        const id = room.turnPlayerId!;
        const available = room.availableActions(id)!;
        const r = roll();
        if (available.canRaise && r < 0.2) room.act(id,{type:'raise',amount:Math.min(available.maxRaiseTo,available.minRaiseTo+Math.floor(roll()*500))});
        else if (available.canCall && r < 0.3) room.act(id,{type:'fold'});
        else room.act(id,{type:available.canCheck ? 'check' : 'call'});
        const inPlay = room.isPlaying ? room.pot : 0;
        expect(room.players.reduce((sum,p) => sum+p.chips,0)+inPlay).toBe(count*10000);
        expect(room.players.every(p => p.chips >= 0 && Number.isInteger(p.chips))).toBe(true);
      }
    }
  });
});
