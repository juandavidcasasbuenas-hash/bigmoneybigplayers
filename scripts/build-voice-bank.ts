import 'dotenv/config';
import { copyFile, mkdir, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { VOICE_CATALOG } from '../server/voiceCatalog.js';
import { synthesizeVoice } from './lib/voice-provider.js';

const output = resolve('public/audio/voices');
const cache = resolve(process.env.VOICE_CACHE_DIR || 'voice-cache');
const valid = async (path: string) => { try { return (await stat(path)).size > 100; } catch { return false; } };
const missing = [];
for (const clip of VOICE_CATALOG) if (!await valid(resolve(output, `${clip.key}.mp3`)) && !await valid(resolve(cache, `${clip.key}.mp3`))) missing.push(clip);
console.log(JSON.stringify({total:VOICE_CATALOG.length, toGenerate:missing.length, characters:missing.reduce((n,c)=>n+c.text.length,0)}));
if (process.argv.includes('--dry-run')) process.exit(0);
await mkdir(output, {recursive:true});
const jobs = [...VOICE_CATALOG];
let completed = 0;
const failures: string[] = [];
await Promise.all(Array.from({length:3}, async () => {
  while (jobs.length) {
    const clip = jobs.shift()!;
    try {
      const destination = resolve(output, `${clip.key}.mp3`);
      if (!await valid(destination)) {
        await synthesizeVoice(clip.text, clip.speaker);
        await copyFile(resolve(cache, `${clip.key}.mp3`), destination);
      }
      completed++;
      if (completed % 25 === 0) console.log(`${completed}/${VOICE_CATALOG.length} bundled clips ready`);
    } catch (error) {
      failures.push(clip.key);
      console.error(`Clip ${clip.key}: ${error instanceof Error ? error.message : 'asset generation failed'}`);
    }
  }
}));
if (failures.length) throw new Error(`${failures.length} clips missing. Rerun the authoring command to resume.`);
await writeFile(resolve(output,'manifest.json'), JSON.stringify({version:1, clips:VOICE_CATALOG},null,2)+'\n');
console.log(`Complete: ${completed} recorded clips. No runtime provider or API key required.`);
