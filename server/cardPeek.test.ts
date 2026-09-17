import { describe, expect, it } from 'vitest';
import { PokerRoom } from './engine';
import { cardPeekProgress, PEEK_LOWER_MS, PEEK_RAISE_MS, type CardPeekRequest } from '../shared/cardPeek';

function setup() {
  let now = 100000;
  const room = new PokerRoom('PEEK01', {autoNextHand:false}, {clock: () => now, paced:true});
  const owner = room.addPlayer('Owner','juan');
  const other = room.addPlayer('Other','nat');
  const rail = room.addPlayer('Rail','jack',{spectator:true});
  room.start(owner.id);
  const ready = () => { now = room.turnStartsAt!; room.tick(); };
  const advance = (ms:number) => { now += ms; };
  const request = (holding:boolean) => ({holding,handNumber:room.handNumber});
  return {room,owner,other,rail,ready,advance,request,now:()=>now};
}
describe('live, private card checking', () => {
  it('publishes the same gesture to owner, opponents and spectators, with faces private', () => {
    const {room,owner,other,rail,ready,request} = setup(); ready();
    // It need not be this player's betting turn.
    expect(room.turnPlayerId).not.toBe(other.id);
    room.peekCards(other.id, request(true));
    for (const viewer of [owner, other, rail]) {
      const player = room.viewFor(viewer.id).players.find(p=>p.id===other.id)!;
      expect(player.peek).toEqual(other.peek);
      expect(player.peek).not.toBe(other.peek);
      expect(player.holeCards).toHaveLength(viewer===other?2:0);
      expect(Object.keys(player.peek!)).toEqual(['handNumber','startedAt','releasedAt','from']);
    }
    expect(room.turnPlayerId).toBe(owner.id);
  });
  it('lowers continuously on a quick release, re-press and repeated release', () => {
    const {room,owner,ready,advance,request,now} = setup(); ready();
    room.peekCards(owner.id,request(true)); advance(420);
    const halfway=cardPeekProgress(owner.peek,now());
    expect(halfway).toBeGreaterThan(0); expect(halfway).toBeLessThan(1);
    room.peekCards(owner.id,request(false));
    expect(cardPeekProgress(owner.peek,now())).toBeCloseTo(halfway);
    advance(200); const lower=cardPeekProgress(owner.peek,now());
    expect(lower).toBeLessThan(halfway);
    room.peekCards(owner.id,request(true));
    expect(cardPeekProgress(owner.peek,now())).toBeCloseTo(lower);
    advance(PEEK_RAISE_MS);
    expect(cardPeekProgress(owner.peek,now())).toBe(1);
    room.peekCards(owner.id,request(false));
    const released=owner.peek!.releasedAt;
    advance(50); room.peekCards(owner.id,request(false));
    expect(owner.peek!.releasedAt).toBe(released);
    advance(PEEK_LOWER_MS);
    expect(cardPeekProgress(owner.peek,now())).toBe(0);
  });
  it.each(['disconnect','reconnect','pause','action','emote','leave'] as const)('unwinds on %s', reason => {
    const {room,owner,ready,advance,request,now} = setup(); ready();
    room.peekCards(owner.id,request(true)); advance(1000);
    if(reason==='disconnect') room.disconnect(owner.id);
    if(reason==='reconnect') room.reconnect(owner.token);
    if(reason==='pause') room.pause(owner.id,true);
    if(reason==='action') room.act(owner.id,{type:'call'});
    if(reason==='emote') room.emote(owner.id,'chips');
    if(reason==='leave') room.leave(owner.id);
    expect(owner.peek!.releasedAt).toBe(now());
    advance(PEEK_LOWER_MS);
    expect(cardPeekProgress(owner.peek,now())).toBe(0);
  });
  it('rejects premature, stale, folded and spectator requests; clears on the next deal', () => {
    const {room,owner,other,rail,ready,advance,request} = setup();
    expect(()=>room.peekCards(owner.id,request(true))).toThrow('arrive');
    ready();
    for(const bad of [null,{}, {holding:'true',handNumber:room.handNumber}, {...request(true),handNumber:0}])
      expect(()=>room.peekCards(owner.id,bad as CardPeekRequest)).toThrow();
    expect(()=>room.peekCards(rail.id,request(true))).toThrow('live hand');
    room.peekCards(other.id,request(true));
    room.act(owner.id,{type:'fold'});
    expect(other.peek!.releasedAt).not.toBeNull();
    expect(()=>room.peekCards(owner.id,request(true))).toThrow('live hand');
    const old=request(false);
    advance(60000); room.startHand();
    expect(owner.peek).toBeNull(); expect(other.peek).toBeNull();
    expect(()=>room.peekCards(other.id,old)).toThrow('moved on');
  });
});
