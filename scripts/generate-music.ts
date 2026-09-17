import 'dotenv/config';
import {mkdir,readFile,writeFile,stat} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {execFileSync} from 'node:child_process';
const model='fal-ai/lyria2';
const tracks=[
  ['after-hours','A warm intimate instrumental jazz lounge loop for a cozy English pub poker table at night. Muted upright piano plays sparse playful chord voicings in D minor, soft plucked double bass, barely audible brushed snare and warm vinyl texture. Relaxed 82 BPM, restrained dynamics, plenty of space for conversation. A continuous middle section, no dramatic intro or ending. Original small ensemble, no singing or speech.'],
  ['on-the-button','Instrumental late-night pub lounge music, soft hollow-body jazz guitar with a few warm electric piano chords, round upright bass and whisper quiet brushed drums. D minor, relaxed 82 BPM, gently mischievous and comfortable, understated repeating musical phrases. Background for a social poker game, never foreground, consistent mellow dynamics. Continuous section, no intro or finale, no vocals.'],
  ['last-orders','Quiet cozy pub instrumental, mellow felt piano and lightly plucked jazz guitar trading small phrases over a soft acoustic bass pulse. D minor, 82 BPM, candlelit warmth and gentle dry wit. Minimal brushed percussion, soft warm recording, small ensemble. A relaxed continuous background groove, no big melody, no build-up, no ending, no voices.'],
] as const;
await mkdir('public/audio/music',{recursive:true});await mkdir('docs/assets/music',{recursive:true});
const headers={Authorization:`Key ${process.env.FAL_KEY}`,'Content-Type':'application/json'};
for(const [name,prompt] of tracks){
 const out=`public/audio/music/${name}.mp3`,record=`docs/assets/music/${name}.json`,raw=`docs/assets/music/${name}.wav`;
 try{if((await stat(out)).size>100){console.log(`${name}: cached`);continue}}catch{}
 if(!process.env.FAL_KEY)throw new Error('FAL_KEY missing');
 let receipt:{request_id:string;status_url:string;response_url:string};
 try{receipt=JSON.parse(await readFile(record,'utf8')).receipt}catch{
  const input={prompt,negative_prompt:'singing, speech, vocals, lyrics, loud drums, horns, brass stabs, dramatic crescendos, suspense, casino sound effects, silence, abrupt endings',seed:8217+tracks.findIndex(t=>t[0]===name)};
  const response=await fetch(`https://queue.fal.run/${model}`,{method:'POST',headers,body:JSON.stringify(input),signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw new Error(`Music submission failed (${response.status})`);
  receipt=await response.json() as typeof receipt;await writeFile(record,JSON.stringify({model,input,receipt},null,2));
 }
 for(let i=0;i<120;i++){
  const r=await fetch(receipt.status_url,{headers,signal:AbortSignal.timeout(20000)});if(!r.ok)throw new Error(`Music status ${r.status}`);
  const s=await r.json() as {status:string};if(s.status==='COMPLETED')break;if(s.status==='FAILED'||i===119)throw new Error('Music generation did not complete');await delay(2000);
 }
 const r=await fetch(receipt.response_url,{headers,signal:AbortSignal.timeout(30000)});if(!r.ok)throw new Error(`Music result ${r.status}`);
 const data=await r.json() as {audio:{url:string}};const url=new URL(data.audio.url);if(url.protocol!=='https:'||!url.hostname.endsWith('.fal.media'))throw new Error('Unexpected music asset host');
 const asset=await fetch(url,{signal:AbortSignal.timeout(30000)});if(!asset.ok)throw new Error('Music download failed');await writeFile(raw,Buffer.from(await asset.arrayBuffer()));
 execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',raw,'-af','highpass=f=55,lowpass=f=10000,loudnorm=I=-20:TP=-3:LRA=5','-ar','44100','-b:a','160k',out]);
 console.log(`${name}: ready`);
}
