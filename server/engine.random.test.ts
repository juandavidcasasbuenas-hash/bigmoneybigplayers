import { describe, expect, it } from 'vitest';
import { PokerRoom } from './engine.js';

const seededRandom = (seed: number) => () => {
  seed = (Math.imul(seed,1664525)+1013904223)>>>0;
  return seed/4294967296;
};

/** A fixed seed makes every stack, deck, and action sequence reproducible on failure. */
function scenario(seats: number, seed: number) {
  const random = seededRandom(seed);
  const integer = (limit: number) => Math.floor(random()*limit);
  const big = [10,50,100][integer(3)];
  const ante = [0,1,Math.floor(big/2),big][integer(4)];
  const room = new PokerRoom(`R${seed}`,{
    autoNextHand:false,
    levels:[{small:big/2,big,ante,minutes:15}],
  },{
    makeDeck:() => {
      const deck = [...'23456789TJQKA'].flatMap(rank => [...'cdhs'].map(suit => rank+suit));
      for (let i=deck.length-1;i>0;i--) {
        const j = integer(i+1);
        [deck[i],deck[j]] = [deck[j],deck[i]];
      }
      return deck;
    },
  });
  const players = Array.from({length:seats},(_,index) => {
    const player = room.addPlayer(`Seat ${index}`,'juan');
    // Frequent stacks below one blind and below one ante exercise exhausted forced bets.
    player.chips = random() < 0.45 ? 1+integer(big) : 1+integer(4000);
    return player;
  });
  const bankroll = players.reduce((sum,p) => sum+p.chips,0);
  return {room,players,bankroll,random,integer,big,ante};
}

describe('varied stack, forced bet and side-pot conservation',() => {
  it('finishes 400 reproducible 2–12 seat hands with every chip accounted for',() => {
    let completed = 0, decisions = 0, allIns = 0, multiPots = 0, automaticRunouts = 0;
    for (const seats of [2,3,6,12]) for (let sample=0;sample<100;sample++) {
      const seed = seats*100000+sample+719;
      const {room,players,bankroll,random,integer} = scenario(seats,seed);
      room.start(players[0].id);
      let turns = 0;
      if (!room.isPlaying) automaticRunouts++;
      while (room.isPlaying) {
        expect(++turns,`seed ${seed}: finite hand`).toBeLessThan(1000);
        const id = room.turnPlayerId!;
        const actions = room.availableActions(id);
        expect(actions,`seed ${seed}: action exists`).not.toBeNull();
        const choice = random();
        if (actions!.canRaise && choice < 0.25) {
          allIns++;
          room.act(id,{type:'all-in'});
        } else if (actions!.canRaise && choice < 0.50) {
          const minimum = Math.min(actions!.minRaiseTo,actions!.maxRaiseTo);
          room.act(id,{type:'raise',amount:minimum+integer(actions!.maxRaiseTo-minimum+1)});
        } else if (actions!.canCall && choice < 0.65) {
          room.act(id,{type:'fold'});
        } else {
          room.act(id,{type:actions!.canCheck ? 'check' : 'call'});
        }
        decisions++;
        const total = players.reduce((sum,p) => sum+p.chips,0)+(room.isPlaying ? room.pot : 0);
        expect(total,`seed ${seed}: turn ${turns}`).toBe(bankroll);
        expect(players.every(p => p.chips >= 0 && Number.isSafeInteger(p.chips)),`seed ${seed}: valid stacks`).toBe(true);
        const visibleCards = [...room.board,...players.flatMap(p => p.holeCards)];
        expect(new Set(visibleCards).size,`seed ${seed}: unique cards`).toBe(visibleCards.length);
      }
      expect(room.stage === 'showdown' || room.stage === 'finished',`seed ${seed}: hand settled`).toBe(true);
      expect(players.reduce((sum,p) => sum+p.chips,0),`seed ${seed}: final stacks`).toBe(bankroll);
      expect(room.winners.reduce((sum,w) => sum+w.amount,0),`seed ${seed}: awards equal pot`).toBe(room.pot);
      expect(room.viewFor(players[0].id).pots.reduce((sum,pot) => sum+pot.amount,0),`seed ${seed}: pots sum`).toBe(room.pot);
      if (room.settledPots.length > 1) multiPots++;
      completed++;
    }
    expect(completed).toBe(400);
    expect(allIns).toBeGreaterThan(100);
    expect(multiPots).toBeGreaterThan(100);
    expect(automaticRunouts).toBeGreaterThan(0);
    console.info(`Stress coverage: ${completed} hands; ${decisions} decisions; ${allIns} deliberate all-ins; ${multiPots} hands with side pots; ${automaticRunouts} forced-bet runouts.`);
  });

  it('keeps chip ownership correct as blind and ante stacks exhaust at every seat',() => {
    let cases = 0;
    for (const seats of [2,3,6,12]) for (const ante of [0,1,25,50]) for (const stack of [1,24,25,26,49,50,51]) {
      const room = new PokerRoom(`F${cases}`,{
        autoNextHand:false,
        levels:[{small:25,big:50,ante,minutes:15}],
      });
      const players = Array.from({length:seats},(_,index) => {
        const p = room.addPlayer(`Player ${index}`,'nat'); p.chips = stack; return p;
      });
      room.start(players[0].id);
      let actions = 0;
      while (room.isPlaying) {
        expect(++actions).toBeLessThan(100);
        const id = room.turnPlayerId!;
        room.act(id,{type:room.availableActions(id)!.canCheck ? 'check' : 'call'});
      }
      expect(players.reduce((sum,p) => sum+p.chips,0),`${seats} seats; ante ${ante}; stack ${stack}`).toBe(seats*stack);
      expect(room.board).toHaveLength(5);
      expect(room.winners.reduce((sum,w) => sum+w.amount,0)).toBe(room.pot);
      cases++;
    }
    expect(cases).toBe(112);
  });
});
