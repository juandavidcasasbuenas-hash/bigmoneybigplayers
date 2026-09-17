// Archived experiment. The game uses native ToonAvatar geometry; this script is never run by the app.
import 'dotenv/config';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
const [id,imagePath]=process.argv.slice(2);
if(!id||!imagePath||!/^[a-z]+$/.test(id))throw new Error('Usage: tsx scripts/generate-head.ts character image.png');
if(!process.env.FAL_KEY)throw new Error('FAL_KEY required');
// Queue receipts are saved before polling, so an interrupted run resumes instead of generating twice.
const model='tripo3d/h3.1/image-to-3d';
const headers={Authorization:`Key ${process.env.FAL_KEY}`,'Content-Type':'application/json'};
const receiptPath=`docs/assets/${id}-request.json`;
await mkdir('docs/assets',{recursive:true});
let receipt:{request_id:string;status_url:string;response_url:string};
try{receipt=JSON.parse(await readFile(receiptPath,'utf8'))}catch{
 const bytes=await readFile(imagePath);
 const input={image_url:`data:image/png;base64,${bytes.toString('base64')}`,face_limit:18000,texture:true,pbr:true,texture_quality:'detailed',geometry_quality:'standard',orientation:'align_image',texture_alignment:'original_image'};
 const response=await fetch(`https://queue.fal.run/${model}`,{method:'POST',headers,body:JSON.stringify(input),signal:AbortSignal.timeout(45000)});
 if(!response.ok)throw new Error(`3D submission failed (${response.status})`);
 receipt=await response.json() as typeof receipt;
 await writeFile(receiptPath,JSON.stringify(receipt,null,2));
}
console.log(`${id}: Tripo H3.1 textured head queued (18,000 face target).`);
let previous='';
for(let attempt=0;attempt<150;attempt++){
 const check=await fetch(receipt.status_url,{headers,signal:AbortSignal.timeout(30000)});
 if(!check.ok)throw new Error(`3D status unavailable (${check.status}); rerun to resume this job.`);
 const status=await check.json() as {status:string};
 if(status.status!==previous){console.log(`${id}: ${status.status}`);previous=status.status}
 if(status.status==='COMPLETED')break;
 if(status.status==='FAILED')throw new Error('3D generation failed; receipt retained for inspection.');
 if(attempt===149)throw new Error('Still rendering. Rerun to resume this job.');
 await delay(8000);
}
const resultResponse=await fetch(receipt.response_url,{headers,signal:AbortSignal.timeout(30000)});
if(!resultResponse.ok)throw new Error(`3D result failed (${resultResponse.status})`);
const result=await resultResponse.json() as {model_mesh?:{url:string};model_glb?:{url:string};model_urls?:{glb?:{url:string}};rendered_image?:{url:string};thumbnail?:{url:string}};
const url=result.model_urls?.glb?.url||result.model_mesh?.url||result.model_glb?.url;
if(!url)throw new Error('No mesh returned');
const asset=await fetch(url,{signal:AbortSignal.timeout(120000)});if(!asset.ok)throw new Error('Model download failed');
const out=resolve('assets/previous-characters/heads');await mkdir(out,{recursive:true});const bytes=Buffer.from(await asset.arrayBuffer());
if(bytes.toString('utf8',0,4)!=='glTF')throw new Error('Provider returned a format other than GLB');
await writeFile(resolve(out,`${id}.glb`),bytes);
await writeFile(`docs/assets/${id}-model.json`,JSON.stringify({model,faceTarget:18000,materials:'PBR',input:imagePath,bytes:bytes.length,result},null,2));
const thumbnail=result.rendered_image||result.thumbnail;
if(thumbnail){const thumb=await fetch(thumbnail.url);if(thumb.ok)await writeFile(`assets/previous-characters/references/${id}-model-preview.png`,Buffer.from(await thumb.arrayBuffer()))}
console.log(`${id} ready: ${Math.round(bytes.length/1024)} KiB in assets/previous-characters/heads/${id}.glb`);
