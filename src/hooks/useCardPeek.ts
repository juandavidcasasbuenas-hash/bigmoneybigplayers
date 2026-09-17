import { useCallback, useEffect, useRef, useState } from 'react';
import type { Ack } from '../../shared/types';

/** Press/release is public; card identities stay in the owner's private snapshot. */
export function useCardPeek(enabled: boolean, handKey: string, handNumber: number,
  send: (event: string, data: unknown) => Promise<Ack>) {
  const held = useRef<{key: string; handNumber: number} | null>(null);
  const [heldFor, setHeldFor] = useState<string | null>(null);
  const stop = useCallback(() => {
    const previous = held.current;
    held.current = null;
    setHeldFor(null);
    if (previous) void send('peek-cards', {handNumber: previous.handNumber, holding: false});
  }, [send]);
  const start = useCallback(() => {
    if (!enabled || held.current) return;
    const request = {key: handKey, handNumber};
    held.current = request;
    setHeldFor(handKey);
    void send('peek-cards', {handNumber, holding: true}).then(ack => {
      if (!ack.ok && held.current === request) stop();
    });
  }, [enabled, handKey, handNumber, send, stop]);
  useEffect(() => { stop(); return stop; }, [enabled, handKey, stop]);
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.code !== 'KeyP' || event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return;
      if (enabled) { event.preventDefault(); start(); }
    };
    const up = (event: KeyboardEvent) => { if (['KeyP', 'Space', 'Enter', 'Escape'].includes(event.code)) stop(); };
    const visibility = () => { if (document.hidden) stop(); };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    window.addEventListener('blur', stop);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
      window.removeEventListener('blur', stop);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [enabled, start, stop]);
  return { peeking: enabled && heldFor === handKey, start, stop };
}
