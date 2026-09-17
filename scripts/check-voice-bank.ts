import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { VOICE_CATALOG } from '../server/voiceCatalog.js';

// Deployment validation is separate from the paid asset authoring command.
const directory = resolve('public/audio/voices');
const manifest = JSON.parse(await readFile(resolve(directory, 'manifest.json'), 'utf8'));
if (JSON.stringify(manifest.clips) !== JSON.stringify(VOICE_CATALOG)) {
  throw new Error('The recorded voice manifest is out of date. Run npm run voices:build locally and commit its output.');
}
const missing = (await Promise.all(VOICE_CATALOG.map(async clip => {
  try {
    if ((await stat(resolve(directory, `${clip.key}.mp3`))).size > 100) return null;
  } catch { /* Report all missing assets together. */ }
  return `${clip.speaker}: ${clip.text}`;
}))).filter(Boolean);
if (missing.length) throw new Error(`Missing ${missing.length} recorded clips. Run npm run voices:build locally.\n${missing.slice(0, 5).join('\n')}`);
console.log(`Recorded voices: ${VOICE_CATALOG.length} bundled clips ready; no provider access.`);
