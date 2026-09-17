import express, { type Express } from 'express';
import { timingSafeEqual } from 'node:crypto';
import type { PokerRoom } from './engine.js';
import { EMOTE_DELIVERY as EXPRESSIONS } from '../shared/playerDialogue.js';
import type { Emote } from '../shared/types.js';
import { VOICE_CAST, PREVIEW_LINES, INTRO } from '../shared/voiceLines.js';
import { VOICE_LOOKUP, voiceKey } from './voiceCatalog.js';
export { VOICE_CAST, PREVIEW_LINES } from '../shared/voiceLines.js';
export interface VoiceAudio { audioUrl:string; voice:string; model:string }
export type Synth = (text:string,speaker:string)=>Promise<VoiceAudio>;

/** Pure catalog lookup. A running game cannot synthesize or fetch provider audio. */
export const synthesizeVoice: Synth = async (text, speaker) => {
  const clip = VOICE_LOOKUP.get(voiceKey(speaker, text));
  if (!clip) throw new Error('Unknown recorded dialogue.');
  return {audioUrl:clip.audioUrl, voice:VOICE_CAST[speaker].voice, model:'recorded-eleven-v3'};
};
function tokenMatches(a:string,b:string){const first=Buffer.from(a),second=Buffer.from(b);return first.length===second.length&&timingSafeEqual(first,second)}

export function registerVoiceRoutes(app:Express,rooms:Map<string,PokerRoom>,options:{synth?:Synth;enabled?:boolean}={}){
  const synth=options.synth||synthesizeVoice;
  const enabled=()=>options.enabled??true;
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
  app.get('/api/voice/status',(_req,res)=>res.json({enabled:enabled(),provider:'bundled',model:'recorded-eleven-v3',dealer:VOICE_CAST.dealer,cast:VOICE_CAST}));
  const limit=(ip:string,max=120)=>{
    const now=Date.now();for(const [key,item]of requests)if(now>item.until)requests.delete(key);
    const current=requests.get(ip);if(current&&current.n>=max)throw new Error('Give the dealer a moment to catch up.');
    requests.set(ip,{n:(current?.n||0)+1,until:current?.until||now+60000});
  };
  app.get('/api/voice/preview/:speaker',async(req,res)=>{
    try{
      limit(req.ip||'local');if(!enabled()){res.status(503).json({ok:false,error:'Recorded table voices are disabled.'});return}
      const speaker=req.params.speaker;
      if(!Object.hasOwn(VOICE_CAST,speaker)){res.status(400).json({ok:false,error:'Unknown voice.'});return}
      const emote=req.query.emote as string|undefined;
      if(emote&&!Object.hasOwn(PREVIEW_LINES,emote)){res.status(400).json({ok:false,error:'Unknown reaction.'});return}
      const text=speaker==='dealer'?INTRO:PREVIEW_LINES[(emote||'cheers') as Emote];
      const script=speaker==='dealer'?text:`${EXPRESSIONS[(emote||'cheers') as Emote]} ${text}`;
      const result=await produce(script,speaker);res.json({ok:true,...result,text});
    }catch(error){res.status(503).json({ok:false,error:'This recorded voice clip is unavailable.'})}
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
      if(!enabled()){res.status(503).json({ok:false,error:'Recorded table voices are disabled.'});return}
      if(segments?.length){
        const clips=await Promise.all(segments.map(async line=>({...await produce(line,speaker),text:line})));
        res.json({ok:true,...clips[0],text,clips});
      }else{const result=await produce(script,speaker);res.json({ok:true,...result,text});}
    }catch(error){res.status(503).json({ok:false,error:'This recorded voice clip is unavailable.'})}
  });
}
