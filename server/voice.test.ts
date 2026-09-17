import { createQueuedSynth } from '../scripts/lib/voice-provider.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { PokerRoom } from './engine.js';
import { registerVoiceRoutes, VOICE_CAST, type Synth } from './voice.js';

/** All synthesis is injected; these tests never contact fal or spend voice credits. */
describe('voice authentication, table visibility, and bounded synthesis',() => {
  let room: PokerRoom;
  let host: ReturnType<PokerRoom['addPlayer']>;
  let guest: ReturnType<PokerRoom['addPlayer']>;
  let rail: ReturnType<PokerRoom['addPlayer']>;
  let server: ReturnType<typeof createServer>;
  let url: string;
  let synth: ReturnType<typeof vi.fn<Synth>>;

  beforeEach(async () => {
    room = new PokerRoom('VOICE2',{autoNextHand:false});
    host = room.addPlayer('Host','juan');
    guest = room.addPlayer('Guest','jack');
    rail = room.addPlayer('Rail','nat',{spectator:true});
    room.start(host.id);
    synth = vi.fn<Synth>(async (_text,speaker) => ({audioUrl:`/fake/${speaker}.mp3`,voice:VOICE_CAST[speaker].voice,model:'eleven-v3'}));
    const app = express();
    // Exercise the offline authoring scheduler with an injected lookup; no provider is called.
    registerVoiceRoutes(app,new Map([[room.code,room]]),{synth:createQueuedSynth(synth),enabled:true});
    server = createServer(app);
    await new Promise<void>(resolve => server.listen(0,'127.0.0.1',resolve));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterEach(async () => {
    await new Promise<void>((resolve,reject) => server.close(error => error ? reject(error) : resolve()));
  });
  const post = async (body: unknown) => {
    const response = await fetch(`${url}/api/voice`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const raw = await response.text();
    // Express may reject malformed JSON before the route and return its generic 400 body.
    let parsed: any;
    try { parsed=JSON.parse(raw); } catch { parsed={raw}; }
    return {status:response.status,body:parsed};
  };
  const dealerRequest = () => ({roomCode:room.code,token:host.token,kind:'dealer',messageId:room.dealerMessages.at(-1)!.id});
  const emoteRequest = (viewer = host,actor = guest) => ({roomCode:room.code,token:viewer.token,kind:'emote',playerId:actor.id,at:actor.emote!.at});

  it('exposes only public provider status and no server credentials',async () => {
    const response = await fetch(`${url}/api/voice/status`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({enabled:true,provider:'bundled',model:'recorded-eleven-v3',dealer:VOICE_CAST.dealer,cast:VOICE_CAST});
    expect(synth).not.toHaveBeenCalled();
  });

  it('requires a valid token belonging to the requested room before synthesis',async () => {
    for (const body of [
      {}, null, {kind:'dealer'}, {...dealerRequest(),token:''},
      {...dealerRequest(),token:'a'.repeat(64)}, {...dealerRequest(),token:host.name},
      {...dealerRequest(),token:'a'.repeat(201)}, {...dealerRequest(),roomCode:'OTHER2'},
    ]) {
      const response = await post(body);
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.body.ok).not.toBe(true);
    }
    expect(synth).not.toHaveBeenCalled();
  });

  it('resolves a dealer script from the authenticated table snapshot and shares a cached clip',async () => {
    const message = room.dealerMessages.at(-1)!;
    const first = await post({...dealerRequest(),roomCode:room.code.toLowerCase()});
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ok:true,text:message.speech,audioUrl:'/fake/dealer.mp3'});
    expect(synth).toHaveBeenCalledExactlyOnceWith(message.speech,'dealer');
    const watched = await post({...dealerRequest(),token:rail.token});
    expect(watched.status).toBe(200);
    expect(synth).toHaveBeenCalledTimes(1);
    const emittedText = synth.mock.calls.map(([text]) => text).join(' ');
    for (const card of [...host.holeCards,...guest.holeCards]) expect(emittedText).not.toContain(card);
    expect(JSON.stringify(first.body)).not.toContain(host.token);
    expect(JSON.stringify(first.body)).not.toContain(guest.token);
  });

  it('rejects arbitrary scripts, speaker overrides, and unknown event fields',async () => {
    for (const added of [{text:'Read this custom request'}, {speaker:'dealer'}, {voice:'Someone else'}, {playerId:guest.id}]) {
      expect((await post({...dealerRequest(),...added})).status).toBe(400);
    }
    expect((await post({...dealerRequest(),kind:'custom'})).status).toBe(400);
    expect(synth).not.toHaveBeenCalled();
  });

  it('voices every manual chip trick in the actor’s voice, preserving separate rail privacy',async () => {
    for (const type of ['chips','chip-roll','chip-toss'] as const) {
      guest.emote=null; rail.emote=null;
      room.emote(guest.id,type);room.emote(rail.id,type);
      expect((await post(emoteRequest(host,guest))).body).toMatchObject({ok:true,voice:'Brian',text:guest.emote!.text});
      expect((await post(emoteRequest(host,rail))).status).toBe(403);
      expect((await post(emoteRequest(rail,rail))).body).toMatchObject({ok:true,voice:'Roger'});
    }
  });

  it('casts every character independently and voices only accepted public actions',async()=>{
    expect(new Set(Object.values(VOICE_CAST).map(c=>c.voice)).size).toBe(9);
    room.act(host.id,{type:'call'});
    const event=room.tableEvents.at(-1)!;
    const request={roomCode:room.code,token:rail.token,kind:'action',eventId:event.id};
    expect((await post(request)).body).toMatchObject({ok:true,voice:'Charlie',text:event.speech});
    expect(synth).toHaveBeenCalledWith(event.speech,'juan');
    expect((await post({...request,text:'arbitrary'})).status).toBe(400);
    expect((await post({...request,eventId:room.tableEvents.find(e=>e.type==='bet'&&e.forced)!.id})).status).toBe(404);
    event.at=Date.now()-16000;
    expect((await post(request)).status).toBe(404);
  });

  it('speaks voluntary table reactions while keeping the separate rail private',async()=>{
    room.emote(guest.id,'cheers');
    expect((await post(emoteRequest())).body).toMatchObject({ok:true,voice:'Brian',text:guest.emote!.text});
    room.emote(rail.id,'laugh');
    expect((await post(emoteRequest(host,rail))).status).toBe(403);
    expect((await post(emoteRequest(rail,rail))).body).toMatchObject({ok:true,voice:'Roger'});
  });

  it('keeps joins and routine action logs silent even when a client asks to read them',async () => {
    room.addPlayer('New mate','doug',{spectator:true});
    const joins=room.dealerMessages.filter(message=>message.kind==='log');
    expect(joins.length).toBeGreaterThan(2);
    for (const message of joins) expect((await post({...dealerRequest(),messageId:message.id})).status).toBe(403);
    expect(synth).not.toHaveBeenCalled();
  });

  it('rejects unknown and expired announcements and stale reaction timestamps',async () => {
    expect((await post({...dealerRequest(),messageId:'not-a-table-announcement'})).status).toBe(404);
    room.dealerMessages.at(-1)!.at = Date.now()-120001;
    expect((await post(dealerRequest())).status).toBe(404);
    room.emote(guest.id,'cheers');
    expect((await post({...emoteRequest(),at:guest.emote!.at-1})).status).toBe(403);
    guest.emote!.at = Date.now()-30001;
    expect((await post(emoteRequest())).status).toBe(403);
    expect(synth).not.toHaveBeenCalled();
  });

  it('obeys dealer and banter table switches on the server',async () => {
    room.emote(guest.id,'cheers');
    room.updateSettings(host.id,{dealerVoice:false,banter:false});
    expect((await post(dealerRequest())).status).toBe(403);
    expect((await post(emoteRequest())).status).toBe(403);
    expect(synth).not.toHaveBeenCalled();
  });

  it('limits previews to the fixed cast and ignores arbitrary query text',async () => {
    for (const path of ['/api/voice/preview/unknown','/api/voice/preview/__proto__','/api/voice/preview/constructor','/api/voice/preview/juan?emote=custom']) {
      expect((await fetch(url+path)).status).toBe(400);
    }
    expect(synth).not.toHaveBeenCalled();
    const response = await fetch(`${url}/api/voice/preview/dealer?text=an-arbitrary-paid-script`);
    expect(response.status).toBe(200);
    expect((await response.json()).text).toContain('I’m Monty');
    expect(synth).toHaveBeenCalledTimes(1);
    expect(synth.mock.calls[0][1]).toBe('dealer');
    expect(synth.mock.calls[0][0]).not.toContain('arbitrary');
    await fetch(`${url}/api/voice/preview/dealer?text=a-different-arbitrary-script`);
    expect(synth).toHaveBeenCalledTimes(1);
  });

  it('deduplicates simultaneous requests from twelve viewers before the synth resolves',async () => {
    let complete!: (value:Awaited<ReturnType<Synth>>) => void;
    synth.mockImplementation(() => new Promise(resolve => { complete=resolve; }));
    const responses = Array.from({length:12},() => post(dealerRequest()));
    await vi.waitFor(() => expect(synth).toHaveBeenCalledTimes(1));
    complete({audioUrl:'/fake/shared.mp3',voice:'Daniel',model:'eleven-v3'});
    const results = await Promise.all(responses);
    expect(results.every(result => result.status===200 && result.body.audioUrl==='/fake/shared.mp3')).toBe(true);
    expect(synth).toHaveBeenCalledTimes(1);
  });

  it('delivers every all-in runout and champion announcement while limiting synthesis to five clips',async () => {
    host.holeCards=['As','Ad'];
    guest.holeCards=['Kc','Kd'];
    room.deck=['Ts','9c','8h','7d','6s','5c','4h','3d'];
    const previous=new Set(room.dealerMessages.map(message=>message.id));
    room.act(room.turnPlayerId!,{type:'all-in'});
    room.act(room.turnPlayerId!,{type:'call'});
    expect(room.stage).toBe('finished');
    const announcements=room.dealerMessages.filter(message=>!previous.has(message.id)&&message.kind!=='log');
    expect(announcements.length).toBeGreaterThan(5);
    expect(announcements.at(-1)!.text).toContain('takes the tournament');
    let active=0,peak=0;
    const finish:(()=>void)[]=[];
    synth.mockImplementation((_text,speaker)=>new Promise(resolve=>{
      peak=Math.max(peak,++active);
      finish.push(()=>{active--;resolve({audioUrl:`/fake/${speaker}.mp3`,voice:VOICE_CAST[speaker].voice,model:'eleven-v3'})});
    }));
    // Two listeners request the complete same burst; each line needs only one generation.
    const responses=announcements.flatMap(message=>[host,rail].map(viewer=>post({roomCode:room.code,token:viewer.token,kind:'dealer',messageId:message.id})));
    await vi.waitFor(()=>expect(synth).toHaveBeenCalledTimes(5));
    const scripts=[...new Set(announcements.flatMap(message=>message.segments||[message.speech||message.text]))];
    let completed=0;
    while(completed<scripts.length){
      const batch=finish.splice(0);
      batch.forEach(complete=>complete());
      completed+=batch.length;
      if(completed<scripts.length)await vi.waitFor(()=>expect(finish.length).toBeGreaterThan(0));
    }
    const results=await Promise.all(responses);
    expect(results.every(result=>result.status===200)).toBe(true);
    expect(synth.mock.calls.map(([text])=>text).sort()).toEqual(scripts.sort());
    expect(peak).toBe(5);
    const champion = announcements.find(message => message.kind === 'champion')!;
    expect(results.some(result=>result.body.text === champion.speech)).toBe(true);
  });

  it('sanitizes provider errors and evicts a failed cached generation for retry',async () => {
    synth.mockRejectedValueOnce(new Error('Private upstream authorization diagnostic: TEST_SECRET_MUST_NOT_ESCAPE'));
    const failed = await post(dealerRequest());
    expect(failed.status).toBe(503);
    expect(JSON.stringify(failed.body)).not.toContain('TEST_SECRET_MUST_NOT_ESCAPE');
    expect((await post(dealerRequest())).status).toBe(200);
    expect(synth).toHaveBeenCalledTimes(2);
  });

  it('bounds repeated synthesis requests per authenticated seat',async () => {
    const request = dealerRequest();
    const responses = await Promise.all(Array.from({length:121},() => post(request)));
    expect(responses.filter(response => response.status===200)).toHaveLength(90);
    expect(responses.filter(response => response.status>=400)).toHaveLength(31);
    expect(synth).toHaveBeenCalledTimes(1);
  },20000);

  it('rejects invalid audio file names without exposing filesystem contents',async () => {
    for (const path of ['/api/voice/audio/not-an-audio-file.mp3','/api/voice/audio/.env','/api/voice/audio/'+('a'.repeat(63))+'.mp3']) {
      expect((await fetch(url+path)).status).toBe(404);
    }
    expect(synth).not.toHaveBeenCalled();
  });
});

describe('voice generation queue backpressure',()=>{
  afterEach(()=>vi.useRealTimers());
  const clip={audioUrl:'/fake/queued.mp3',voice:'Daniel',model:'eleven-v3'};

  it('bounds the waiting queue, preserves FIFO order, and releases a slot after a provider failure',async()=>{
    const pending:{resolve:(audio:typeof clip)=>void;reject:(error:Error)=>void}[]=[];
    const provider=vi.fn<Synth>(()=>new Promise((resolve,reject)=>pending.push({resolve,reject})));
    const queued=createQueuedSynth(provider,{concurrency:1,maxQueued:2});
    const first=queued('first','dealer').catch(error=>error);
    const second=queued('second','dealer');
    const third=queued('third','dealer');
    await expect(queued('overflow','dealer')).rejects.toThrow('voice queue is full');
    expect(provider).toHaveBeenCalledExactlyOnceWith('first','dealer');
    pending[0].reject(new Error('provider failure'));
    await expect(first).resolves.toEqual(new Error('provider failure'));
    await vi.waitFor(()=>expect(provider).toHaveBeenCalledTimes(2));
    pending[1].resolve(clip);
    await expect(second).resolves.toEqual(clip);
    await vi.waitFor(()=>expect(provider).toHaveBeenCalledTimes(3));
    pending[2].resolve(clip);
    await expect(third).resolves.toEqual(clip);
    expect(provider.mock.calls.map(([text])=>text)).toEqual(['first','second','third']);
  });

  it('expires queued work without calling the provider, then accepts new work',async()=>{
    vi.useFakeTimers();
    let release!:()=>void;
    const provider=vi.fn<Synth>().mockImplementationOnce(()=>new Promise(resolve=>{release=()=>resolve(clip)})).mockResolvedValue(clip);
    const queued=createQueuedSynth(provider,{concurrency:1,maxQueued:1,maxWaitMs:30_000});
    const active=queued('active','dealer');
    const expired=queued('expired','dealer').catch(error=>error);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(await expired).toMatchObject({message:expect.stringContaining('voice queue took too long')});
    expect(provider).toHaveBeenCalledExactlyOnceWith('active','dealer');
    const replacement=queued('replacement','dealer');
    release();
    await active;
    await expect(replacement).resolves.toEqual(clip);
    expect(provider.mock.calls.map(([text])=>text)).toEqual(['active','replacement']);
  });
});
