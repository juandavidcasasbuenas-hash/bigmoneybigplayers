import 'dotenv/config';
import express, { type Express } from 'express';
import { createHash, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { PokerRoom } from './engine.js';
import { EMOTE_DELIVERY as EXPRESSIONS } from '../shared/playerDialogue.js';
import type { Emote } from '../shared/types.js';

export const VOICE_MODEL = 'fal-ai/elevenlabs/tts/eleven-v3';
/** Stock character casting, not clones or impersonations of the people pictured. */
export const VOICE_CAST: Record<string, { voice:string; description:string }> = {
  dealer:{voice:'Daniel',description:'The house dealer · warm British storyteller'},
  juan:{voice:'Charlie',description:'Easygoing and confidently cheeky'},
  jack:{voice:'Brian',description:'Deep, warm, and entirely unruffled'},
  clive:{voice:'George',description:'Dry wit with a knowing smile'},
  doug:{voice:'Bill',description:'A friendly rasp and a good story'},
  nat:{voice:'Roger',description:'Polished delivery. Questionable decisions.'},
  tian:{voice:'Liam',description:'Relaxed, quietly mischievous'},
  humfrey:{voice:'Eric',description:'Smooth, measured, suspiciously calm'},
  diego:{voice:'Callum',description:'Expressive, theatrical confidence'},
};
export const PREVIEW_LINES: Record<Emote,string> = {
  bluff:'I definitely know what I’m doing. This is what confidence looks like.',
  cheers:'Big money. Big players. To questionable decisions!',
  stand:'Right. I’m off. Unless the river helps. Who wants a drink?',
  laugh:'Oh, this is going in the group chat. Absolutely calculated. Probably.',
  cry:'My beautiful, imaginary fortune. Tell my chips I loved them.',
  chips:'A little chip choreography.',
  'chip-roll':'Watch the fingers.',
  'chip-toss':'Nothing up my sleeve.',
  shush:'Quiet please. I’m doing important maths. Let the chips do the talking.',
};

const INTRO='I’m Monty, your dealer. I’ll call the cards and settle the pots. You lot can supply the questionable decisions.';
export interface VoiceAudio { audioUrl:string; voice:string; model:string }
export type Synth = (text:string,speaker:string)=>Promise<VoiceAudio>;
class VoiceQueueError extends Error {}

/** Keep a public runout together without opening an unbounded provider backlog. */
export function createQueuedSynth(provider:Synth,{concurrency=5,maxQueued=48,maxWaitMs=30000}:{concurrency?:number;maxQueued?:number;maxWaitMs?:number}={}):Synth {
  let active=0;
  const waiting:{start:()=>void;timeout?:ReturnType<typeof setTimeout>}[]=[];
  return (text,speaker)=>new Promise<VoiceAudio>((resolve,reject)=>{
    const job:{start:()=>void;timeout?:ReturnType<typeof setTimeout>}={start:()=>{
      clearTimeout(job.timeout);
      active++;
      // A synchronous provider failure must release its slot too.
      void Promise.resolve().then(()=>provider(text,speaker)).then(resolve,reject).finally(()=>{
        active--;
        waiting.shift()?.start();
      });
    }};
    if(active<concurrency){job.start();return}
    if(waiting.length>=maxQueued){reject(new VoiceQueueError('The voice queue is full. The table log is still available; try again shortly.'));return}
    job.timeout=setTimeout(()=>{
      const index=waiting.indexOf(job);
      if(index<0)return;
      waiting.splice(index,1);
      reject(new VoiceQueueError('The voice queue took too long. The table log is still available; try again shortly.'));
    },maxWaitMs);
    waiting.push(job);
  });
}

const cacheDir=resolve(process.env.VOICE_CACHE_DIR||'voice-cache');
const pending=new Map<string,Promise<VoiceAudio>>();
let generatedChars=0, budgetDay='';
const budget=()=>Math.max(1000,Number(process.env.VOICE_DAILY_CHAR_LIMIT)||50000);

function voiceAsset(text:string,speaker:string){
  const cast=VOICE_CAST[speaker];
  if(!cast)throw new Error('Unknown voice.');
  if(!text||text.length>800)throw new Error('Invalid voice script.');
  const hash=createHash('sha256').update(JSON.stringify([VOICE_MODEL,cast.voice,text,.5])).digest('hex');
  const result={audioUrl:`/api/voice/audio/${hash}.mp3`,voice:cast.voice,model:'eleven-v3'};
  const filename=resolve(cacheDir,`${hash}.mp3`);
  return {cast,hash,result,filename};
}

const generateVoice=createQueuedSynth(async(text,speaker)=>{
  const {cast,result,filename}=voiceAsset(text,speaker);
  if(!process.env.FAL_KEY)throw new Error('ElevenLabs voice is not configured.');
  // Charge only jobs that actually start, including failures that may incur a provider charge.
  const day=new Date().toISOString().slice(0,10);if(day!==budgetDay){budgetDay=day;generatedChars=0}
  if(generatedChars+text.length>budget())throw new Error('The daily voice allowance has been reached.');
  generatedChars+=text.length;
  const response=await fetch(`https://fal.run/${VOICE_MODEL}`,{
    method:'POST',headers:{Authorization:`Key ${process.env.FAL_KEY}`,'Content-Type':'application/json'},
    body:JSON.stringify({text,voice:cast.voice,stability:.5,language_code:'en',apply_text_normalization:'on'}),
    signal:AbortSignal.timeout(45000),
  });
  if(!response.ok)throw new Error(`Voice provider unavailable (${response.status}).`);
  const data=await response.json() as {audio?:{url?:string}};
  const url=new URL(data.audio?.url||'');
  if(url.protocol!=='https:'||!(url.hostname==='fal.media'||url.hostname.endsWith('.fal.media')))throw new Error('Invalid voice asset response.');
  const audio=await fetch(url,{signal:AbortSignal.timeout(20000)});
  if(!audio.ok)throw new Error('The voice clip could not be downloaded.');
  const declared=Number(audio.headers.get('content-length')||0);
  if(declared>5_000_000)throw new Error('The generated voice clip was too large.');
  const bytes=Buffer.from(await audio.arrayBuffer());
  if(bytes.length<100||bytes.length>5_000_000)throw new Error('Invalid generated voice clip.');
  await mkdir(cacheDir,{recursive:true});
  const temp=`${filename}.${process.pid}.tmp`;await writeFile(temp,bytes);await rename(temp,filename);
  return result;
});

export const synthesizeVoice: Synth = async (text,speaker) => {
  const {hash,result,filename}=voiceAsset(text,speaker);
  try {if((await stat(filename)).size>100)return result} catch { /* cache miss */ }
  const previous=pending.get(hash);if(previous)return previous;
  // Deduplicate before taking a queue slot: twelve listeners still buy one clip.
  const generation=generateVoice(text,speaker);
  pending.set(hash,generation);
  try{return await generation}finally{pending.delete(hash)}
};
function tokenMatches(a:string,b:string){const first=Buffer.from(a),second=Buffer.from(b);return first.length===second.length&&timingSafeEqual(first,second)}

export function registerVoiceRoutes(app:Express,rooms:Map<string,PokerRoom>,options:{synth?:Synth;enabled?:boolean}={}){
  const synth=options.synth||synthesizeVoice;
  const enabled=()=>options.enabled??!!process.env.FAL_KEY;
  const requests=new Map<string,{n:number;until:number}>();
  const memo=new Map<string,Promise<VoiceAudio>>();
  const produce=(text:string,speaker:string)=>{
    const key=`${speaker}:${text}`;const existing=memo.get(key);if(existing)return existing;
    const promise=synth(text,speaker);memo.set(key,promise);
    promise.catch(()=>memo.delete(key));
    if(memo.size>1000)memo.delete(memo.keys().next().value!);
    return promise;
  };
  app.use('/api/voice',express.json({limit:'4kb'}));
  // Split frontend/backend deployments may use the same allowed-origin list as Socket.IO.
  app.use('/api/voice',(req,res,next)=>{
    const origin=req.headers.origin;const allowed=process.env.ALLOWED_ORIGINS?.split(',').map(s=>s.trim());
    if(origin&&allowed?.includes(origin)){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Headers','Content-Type');res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS')}
    if(req.method==='OPTIONS'){res.status(204).end();return}
    next();
  });
  app.get('/api/voice/status',(_req,res)=>res.json({enabled:enabled(),provider:'elevenlabs',model:'eleven-v3',dealer:VOICE_CAST.dealer,cast:VOICE_CAST}));
  app.get('/api/voice/audio/:file',(req,res,next)=>{
    if(!/^[a-f0-9]{64}\.mp3$/.test(req.params.file)){res.status(404).end();return}
    res.setHeader('Cache-Control','public, max-age=31536000, immutable');
    res.sendFile(resolve(cacheDir,req.params.file),{headers:{'Content-Type':'audio/mpeg'}},err=>{if(err&&!res.headersSent)res.status(404).json({ok:false,error:'Voice clip not found.'});else if(err)next(err)});
  });
  const limit=(ip:string,max=120)=>{
    const now=Date.now();for(const [key,item]of requests)if(now>item.until)requests.delete(key);
    const current=requests.get(ip);if(current&&current.n>=max)throw new Error('Give the dealer a moment to catch up.');
    requests.set(ip,{n:(current?.n||0)+1,until:current?.until||now+60000});
  };
  app.get('/api/voice/preview/:speaker',async(req,res)=>{
    try{
      limit(req.ip||'local');if(!enabled()){res.status(503).json({ok:false,error:'ElevenLabs voice is not configured.'});return}
      const speaker=req.params.speaker;
      if(!Object.hasOwn(VOICE_CAST,speaker)){res.status(400).json({ok:false,error:'Unknown voice.'});return}
      const emote=req.query.emote as string|undefined;
      if(emote&&!Object.hasOwn(PREVIEW_LINES,emote)){res.status(400).json({ok:false,error:'Unknown reaction.'});return}
      const text=speaker==='dealer'?INTRO:PREVIEW_LINES[(emote||'cheers') as Emote];
      const script=speaker==='dealer'?text:`${EXPRESSIONS[(emote||'cheers') as Emote]} ${text}`;
      const result=await produce(script,speaker);res.json({ok:true,...result,text});
    }catch(error){res.status(503).json({ok:false,error:error instanceof VoiceQueueError?error.message:'The voice booth is unavailable. Please try again shortly.'})}
  });
  app.post('/api/voice',async(req,res)=>{
    try{
      limit(`ip:${req.ip||'local'}`,1200);
      const body=req.body;
      if(!body||typeof body!=='object'||typeof body.roomCode!=='string'||typeof body.token!=='string'||body.token.length>200){res.status(401).json({ok:false,error:'Join the table to hear its dealer.'});return}
      // Reject arbitrary client-supplied scripts and unrecognised fields explicitly.
      const allowed=body.kind==='dealer'?['roomCode','token','kind','messageId']:body.kind==='action'?['roomCode','token','kind','eventId']:['roomCode','token','kind','playerId','at'];
      if(Object.keys(body).some(key=>!allowed.includes(key))){res.status(400).json({ok:false,error:'Speech must come from a table event.'});return}
      const room=rooms.get(body.roomCode.toUpperCase());
      const player=room?.players.find(p=>tokenMatches(p.token,body.token));
      if(!room||!player){res.status(401).json({ok:false,error:'That table session is no longer available.'});return}
      limit(`seat:${room.code}:${player.id}`,90);
      const view=room.viewFor(player.id);
      let text='',script='',speaker='dealer',segments:string[]|undefined;
      if(body.kind==='dealer'){
        if(!room.settings.dealerVoice){res.status(403).json({ok:false,error:'Dealer voice is off at this table.'});return}
        const message=view.dealerMessages.find(m=>m.id===body.messageId);
        if(!message||Date.now()-message.at>120000){res.status(404).json({ok:false,error:'That announcement has passed.'});return}
        if(!message.kind||message.kind==='log'){res.status(403).json({ok:false,error:'This table update is a silent log entry.'});return}
        text=message.speech||message.text;script=text;segments=message.segments;
      }else if(body.kind==='action'){
        if(!room.settings.dealerVoice){res.status(403).json({ok:false,error:'Table voices are off.'});return}
        const event=view.tableEvents?.find(e=>e.id===body.eventId);
        if(!event || event.handNumber!==room.handNumber || Date.now()-(event.presentAt??event.at)>15000 || !event.speech || !('playerId' in event) || (event.type==='bet'&&event.forced)){
          res.status(404).json({ok:false,error:'That action has passed.'});return;
        }
        const actor=view.players.find(p=>p.id===event.playerId);
        if(!actor){res.status(404).end();return}
        speaker=actor.avatarId; text=event.speech; script=text;
      }else if(body.kind==='emote'){
        const actor=view.players.find(p=>p.id===body.playerId);
        const emote=actor?.emote;
        if(!room.settings.dealerVoice || !room.settings.banter || !emote || emote.at!==body.at || Date.now()-emote.at>8000){
          res.status(403).json({ok:false,error:'That reaction is not available to this listener.'});return;
        }
        speaker=actor!.avatarId; text=emote.text; script=`${EXPRESSIONS[emote.type]} ${text}`;
      }else{res.status(400).json({ok:false,error:'Unknown voice event.'});return}
      if(!enabled()){res.status(503).json({ok:false,error:'ElevenLabs voice is not configured.'});return}
      if(segments?.length){
        const clips=await Promise.all(segments.map(async line=>({...await produce(line,speaker),text:line})));
        res.json({ok:true,...clips[0],text,clips});
      }else{const result=await produce(script,speaker);res.json({ok:true,...result,text});}
    }catch(error){res.status(503).json({ok:false,error:error instanceof VoiceQueueError?error.message:'The voice booth is unavailable. Check the table audio controls.'})}
  });
}
