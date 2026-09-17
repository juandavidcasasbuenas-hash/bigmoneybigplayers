import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { VOICE_CATALOG, voiceKey } from './voiceCatalog';
import { synthesizeVoice } from './voice';
import { PokerRoom } from './engine';

afterEach(() => vi.unstubAllGlobals());

it('ships a recording for every allowed script, with no network synthesis fallback', async () => {
  const network = vi.fn(() => { throw new Error('Runtime provider access forbidden'); });
  vi.stubGlobal('fetch', network);
  const manifest = JSON.parse(await readFile(resolve('public/audio/voices/manifest.json'), 'utf8'));
  expect(manifest.clips).toEqual(VOICE_CATALOG);
  expect(VOICE_CATALOG).toHaveLength(543);
  for (const clip of VOICE_CATALOG) {
    expect(await synthesizeVoice(clip.text, clip.speaker)).toMatchObject({ audioUrl: clip.audioUrl, model: 'recorded-eleven-v3' });
    expect((await stat(resolve('public', clip.audioUrl.slice(1)))).size).toBeGreaterThan(100);
  }
  await expect(synthesizeVoice('Please synthesize my arbitrary name and winnings', 'juan')).rejects.toThrow('Unknown recorded dialogue');
  expect(network).not.toHaveBeenCalled();
});

it.each([true, false])('covers real complete hands, results and tournament announcements (banter=%s)', async banter => {
  vi.stubGlobal('fetch', () => { throw new Error('No providers'); });
  const room = new PokerRoom('STATIC', { banter, autoNextHand: false });
  const a = room.addPlayer('An arbitrary name 123', 'juan'), b = room.addPlayer('Another name', 'nat');
  room.start(a.id);
  const start = room.dealerMessages.find(m => m.kind === 'hand-start')!;
  await synthesizeVoice(start.speech!, 'dealer');
  room.act(a.id, { type: 'all-in' }); room.act(b.id, { type: 'call' });
  const keys = new Set(VOICE_CATALOG.map(c => c.key));
  for (const message of room.dealerMessages.filter(m => m.kind && m.kind !== 'log')) {
    for (const text of message.segments || [message.speech || message.text]) {
      expect(keys.has(voiceKey('dealer', text)), text).toBe(true);
      await synthesizeVoice(text, 'dealer');
    }
  }
  for (const event of room.tableEvents.filter(e => e.speech)) {
    const actor = 'playerId' in event ? room.player(event.playerId) : null;
    if (actor) await synthesizeVoice(event.speech!, actor.avatarId);
  }
});
