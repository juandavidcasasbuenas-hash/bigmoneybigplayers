import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { io, type Socket } from 'socket.io-client';
import type { AddressInfo } from 'node:net';
import { createPokerServer } from './index.js';
import type { Ack, RoomState } from '../shared/types.js';

describe('real Socket.IO sessions and private room snapshots',() => {
  const server = createPokerServer({serveStatic:false,tickMs:25});
  const clients: Socket[] = [];
  const snapshots = new Map<string,RoomState>();
  let url = '';
  beforeAll(async () => {
    await new Promise<void>(resolve => server.http.listen(0,'127.0.0.1',resolve));
    url = `http://127.0.0.1:${(server.http.address() as AddressInfo).port}`;
  });
  afterEach(() => { clients.splice(0).forEach(socket => socket.disconnect()); snapshots.clear(); });
  afterAll(async () => { await server.close(); });
  const connect = async () => {
    const socket = io(url,{transports:['websocket'],forceNew:true,reconnection:false,autoConnect:false});
    clients.push(socket);
    socket.on('room-state',(state: RoomState) => snapshots.set(socket.id!,state));
    await new Promise<void>((resolve,reject) => { socket.once('connect',resolve);socket.once('connect_error',reject);socket.connect(); });
    return socket;
  };
  const emit = (socket: Socket,event: string,payload?: unknown): Promise<Ack> => socket.timeout(2000).emitWithAck(event,payload);
  const state = async (socket: Socket,predicate: (s:RoomState) => boolean = () => true) => {
    const end = Date.now()+6000;
    while (Date.now()<end) {
      const snapshot = snapshots.get(socket.id!);
      if (snapshot && predicate(snapshot)) return snapshot;
      await new Promise(resolve => setTimeout(resolve,10));
    }
    throw new Error('Room snapshot timed out');
  };
  const joinTable = async () => {
    const host = await connect(), guest = await connect(), rail = await connect();
    const created = await emit(host,'create-room',{name:'Host',avatarId:'juan',settings:{autoNextHand:false}});
    expect(created.ok).toBe(true);
    const joined = await emit(guest,'join-room',{roomCode:created.roomCode,name:'Guest',avatarId:'nat'});
    const watched = await emit(rail,'join-room',{roomCode:created.roomCode,name:'Rail',avatarId:'jack',spectator:true});
    return {host,guest,rail,created,joined,watched};
  };

  it('serves a health endpoint and accepts share-code joins',async () => {
    expect(await (await fetch(`${url}/api/health`)).json()).toMatchObject({ok:true,mode:'play-money'});
    const {host,created} = await joinTable();
    expect(created.roomCode).toMatch(/^[A-Z2-9]{6}$/);
    expect(created.token).toHaveLength(64);
    const snapshot = await state(host,s => s.players.length === 3);
    expect(snapshot.players.map(p => p.name)).toEqual(['Host','Guest','Rail']);
  });
  it('does not send opponent cards, a deck, or reconnect tokens even to the host or rail',async () => {
    const {host,guest,rail,created,joined} = await joinTable();
    expect((await emit(host,'start-game')).ok).toBe(true);
    const [hostState,guestState,railState] = await Promise.all([host,guest,rail].map(socket => state(socket,s => s.stage === 'preflop')));
    expect(hostState.players.find(p => p.id === created.playerId)?.holeCards).toHaveLength(2);
    expect(hostState.players.find(p => p.id === joined.playerId)?.holeCards).toHaveLength(0);
    expect(guestState.players.find(p => p.id === joined.playerId)?.holeCards).toHaveLength(2);
    expect(guestState.players.find(p => p.id === created.playerId)?.holeCards).toHaveLength(0);
    expect(railState.players.every(p => p.holeCards.length === 0)).toBe(true);
    for (const snapshot of [hostState,guestState,railState]) {
      const json = JSON.stringify(snapshot);
      expect(json).not.toContain('"deck"'); expect(json).not.toContain('"token"');
      expect(json).not.toContain(created.token); expect(json).not.toContain(joined.token);
    }
  });
  it('broadcasts live peeks and releases to opponents and the rail without showing private faces',async () => {
    const {host,guest,rail,created,joined} = await joinTable();
    await emit(host,'start-game');
    const ready=await state(host,s=>!!s.actions);
    const request={holding:true,handNumber:ready.handNumber,playerId:created.playerId};
    // The forged playerId is ignored: each connection can move only its own hands.
    expect(await emit(guest,'peek-cards',request)).toMatchObject({ok:true});
    const views=await Promise.all([host,guest,rail].map(s=>state(s,r=>r.players.find(p=>p.id===joined.playerId)?.peek?.releasedAt===null)));
    const gesture=views[0].players.find(p=>p.id===joined.playerId)!.peek;
    for(const [i,view] of views.entries()) {
      expect(view.players.find(p=>p.id===joined.playerId)!.peek).toEqual(gesture);
      expect(view.players.find(p=>p.id===joined.playerId)!.holeCards).toHaveLength(i===1?2:0);
      expect(view.players.find(p=>p.id===created.playerId)!.peek).toBeNull();
    }
    expect(await emit(rail,'peek-cards',request)).toMatchObject({ok:false});
    expect(await emit(guest,'peek-cards',{...request,holding:false})).toMatchObject({ok:true});
    await Promise.all([host,guest,rail].map(s=>state(s,r=>typeof r.players.find(p=>p.id===joined.playerId)?.peek?.releasedAt==='number')));
    // A quick tap does not wait for the press acknowledgement to send release.
    const acks=await Promise.all([
      emit(guest,'peek-cards',request),
      emit(guest,'peek-cards',{...request,holding:false}),
    ]);
    expect(acks.every(a=>a.ok)).toBe(true);
    await emit(guest,'peek-cards',request);
    await state(rail,r=>r.players.find(p=>p.id===joined.playerId)?.peek?.releasedAt===null);
    guest.disconnect();
    const stopped=await state(rail,r=>!r.players.find(p=>p.id===joined.playerId)?.connected);
    expect(stopped.players.find(p=>p.id===joined.playerId)?.peek?.releasedAt).not.toBeNull();
  });
  it('enforces host authority and derives action identity from the connection',async () => {
    const {host,guest,rail,created} = await joinTable();
    expect(await emit(guest,'start-game')).toMatchObject({ok:false,error:expect.stringContaining('Only the host')});
    expect(await emit(guest,'add-bot')).toMatchObject({ok:false});
    await emit(host,'start-game');
    expect(await emit(rail,'action',{type:'fold',playerId:created.playerId})).toMatchObject({ok:false});
    expect(await emit(guest,'action',{type:'fold',playerId:created.playerId})).toMatchObject({ok:false});
    expect((await state(host,s => s.stage === 'preflop')).turnPlayerId).toBe(created.playerId);
    const dealing=await state(host);
    expect(dealing.actions).toBeNull();
    expect(dealing.turnStartsAt).toBeGreaterThan(Date.now());
    expect(await emit(host,'action',{type:'call',turnId:dealing.turnId})).toMatchObject({ok:false});
    expect(await emit(host,'action',{type:'call',turnId:(await state(host,s => !!s.actions)).turnId})).toMatchObject({ok:true});
    const holding=await state(guest,s=>s.turnPlayerId===s.you);
    expect(holding.actions).toBeNull();
    expect(holding.turnEndsAt!-holding.turnStartsAt!).toBe(30000);
    expect((await state(guest,s => s.turnPlayerId === s.you && !!s.actions)).actions?.canCheck).toBe(true);
  },12000);
  it('restores the exact seat and private hand with a token, never with a matching display name',async () => {
    const {host,created} = await joinTable();
    await emit(host,'start-game');
    const before = await state(host,s => s.stage === 'preflop');
    const cards = before.players.find(p => p.id === created.playerId)!.holeCards;
    host.disconnect();
    const restored = await connect();
    expect(await emit(restored,'join-room',{roomCode:created.roomCode,token:created.token})).toMatchObject({ok:true,playerId:created.playerId});
    const after = await state(restored);
    expect(after.you).toBe(created.playerId);
    expect(after.players.find(p => p.id === created.playerId)!.holeCards).toEqual(cards);
    expect(after.players).toHaveLength(3);
    const fake = await connect();
    expect(await emit(fake,'join-room',{roomCode:created.roomCode,token:'a'.repeat(64),name:'Host'})).toMatchObject({ok:false});
    expect(await emit(fake,'join-room',{roomCode:created.roomCode,name:'Host',avatarId:'juan'})).toMatchObject({ok:true,playerId:expect.not.stringMatching(created.playerId!)});
    expect((await state(fake)).players.find(p => p.id === created.playerId)?.holeCards).toEqual([]);
  });
  it('keeps queued actions private, authenticates the owner and invalidates them on a raise', async () => {
    const {host,guest,rail,created} = await joinTable();
    await emit(host,'start-game');
    const waiting = await state(guest,s=>s.stage==='preflop');
    const request = {type:'check',handNumber:waiting.handNumber,stage:waiting.stage,currentBet:waiting.currentBet};
    expect(await emit(rail,'pre-action',{...request,playerId:created.playerId})).toMatchObject({ok:false});
    expect(await emit(guest,'pre-action',request)).toMatchObject({ok:true});
    expect((await state(guest,s=>!!s.preAction)).preAction?.type).toBe('check');
    await emit(host,'request-state');
    expect((await state(host)).preAction).toBeNull();
    expect((await state(rail)).preAction).toBeNull();
    const turn = await state(host,s=>!!s.actions);
    expect(await emit(host,'action',{type:'raise',amount:100,turnId:turn.turnId})).toMatchObject({ok:true});
    expect((await state(guest,s=>s.currentBet===100)).preAction).toBeNull();
    expect(await emit(guest,'pre-action',request)).toMatchObject({ok:false,error:expect.stringContaining('changed')});
  },12000);
  it('rejects a duplicate wager after that player becomes the actor on a new street',async () => {
    const {host,guest} = await joinTable();
    await emit(host,'start-game');
    const original = (await state(host,s => s.stage === 'preflop' && !!s.actions)).turnId;
    expect(await emit(host,'action',{type:'call',turnId:original})).toMatchObject({ok:true});
    const bigBlindTurn = (await state(guest,s => s.turnPlayerId === s.you && !!s.actions)).turnId;
    expect(await emit(guest,'action',{type:'check',turnId:bigBlindTurn})).toMatchObject({ok:true});
    const flopTurn = (await state(guest,s => s.stage === 'flop' && !!s.actions)).turnId;
    expect(await emit(guest,'action',{type:'check',turnId:flopTurn})).toMatchObject({ok:true});
    const hostFlop = await state(host,s => s.stage === 'flop' && s.turnPlayerId === s.you && !!s.actions);
    expect(hostFlop.turnId).not.toBe(original);
    expect(await emit(host,'action',{type:'call',turnId:original})).toMatchObject({ok:false,error:expect.stringContaining('already moved on')});
    expect(await emit(host,'action',{type:'check',turnId:hostFlop.turnId})).toMatchObject({ok:true});
  },20000);
  it('can recover its own session from an authenticated snapshot acknowledgement',async () => {
    const {host,created} = await joinTable();
    expect(await emit(host,'request-state')).toMatchObject({ok:true,roomCode:created.roomCode,playerId:created.playerId,token:created.token});
    const outsider = await connect();
    expect(await emit(outsider,'request-state')).toMatchObject({ok:false});
  });
  it('replaces a previous socket safely when the same token is opened in another tab',async () => {
    const {host,created} = await joinTable();
    const replaced = new Promise(resolve => host.once('session-replaced',resolve));
    const replacement = await connect();
    expect(await emit(replacement,'join-room',{roomCode:created.roomCode,token:created.token})).toMatchObject({ok:true});
    await replaced;
    expect((await state(replacement)).players.find(p => p.id === created.playerId)?.connected).toBe(true);
    expect((await emit(replacement,'start-game')).ok).toBe(true);
  });
  it('keeps rail chat and rail emotes away from seated players during a hand',async () => {
    const {host,rail,watched} = await joinTable();
    await emit(host,'start-game');
    await emit(rail,'chat',{text:'This commentary stays on the rail.'});
    await emit(rail,'emote',{type:'bluff'});
    expect((await state(rail,s => s.chat.length === 1)).chat[0].channel).toBe('spectators');
    await emit(host,'request-state');
    const snapshot = await state(host,s => s.stage === 'preflop');
    expect(snapshot.chat).toEqual([]);
    expect(snapshot.players.find(p => p.id === watched.playerId)?.emote).toBe(null);
  });
  it('returns a clear error for missing rooms and malformed settings instead of crashing',async () => {
    const socket = await connect();
    expect(await emit(socket,'join-room',{roomCode:'GONE42',name:'Nobody'})).toMatchObject({ok:false,error:expect.stringContaining('not here')});
    expect(await emit(socket,'create-room',{name:'Host',avatarId:'juan',settings:{maxPlayers:1000}})).toMatchObject({ok:false});
    expect(await emit(socket,'create-room',null)).toMatchObject({ok:false});
    expect(await emit(socket,'create-room',{name:'Host',avatarId:'juan'})).toMatchObject({ok:true});
  });
  it('authorizes show/muck over the real socket and shares only the requesting player’s cards', async () => {
    const { host, guest, rail, created, joined } = await joinTable();
    await emit(host, 'start-game');
    const turn = await state(host, s => !!s.actions);
    expect(await emit(host, 'show-cards', { choice: 'show', handNumber: 1 })).toMatchObject({ ok: false });
    await emit(host, 'action', { type: 'fold', turnId: turn.turnId });
    await state(guest, s => !!s.canShowCards);
    expect(await emit(rail, 'show-cards', { choice: 'show', handNumber: 1 })).toMatchObject({ ok: false });
    expect(await emit(guest, 'show-cards', { choice: 'show', handNumber: 0 })).toMatchObject({ ok: false });
    expect(await emit(host, 'show-cards', { choice: 'muck', handNumber: 1 })).toMatchObject({ ok: true });
    expect(await emit(guest, 'show-cards', { choice: 'show', handNumber: 1, playerId: created.playerId })).toMatchObject({ ok: true });
    const view = await state(rail, s => s.players.some(p => p.id === joined.playerId && p.disclosure === 'shown'));
    expect(view.players.find(p => p.id === joined.playerId)?.holeCards).toHaveLength(2);
    expect(view.players.find(p => p.id === created.playerId)).toMatchObject({ holeCards: [], disclosure: 'mucked' });
    expect(await emit(host, 'next-hand')).toMatchObject({ ok: false, error: expect.stringMatching(/chips settle|show or muck/) });
  }, 15000);
});
