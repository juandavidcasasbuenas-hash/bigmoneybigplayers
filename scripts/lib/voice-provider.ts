import 'dotenv/config';
import { createHash } from 'node:crypto';
import { mkdir, writeFile, rename, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { VOICE_MODEL, VOICE_CAST } from '../../shared/voiceLines.js';

// Authoring tool only. The running game never imports this module.
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
