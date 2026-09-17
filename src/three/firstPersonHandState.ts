import { holePickupAt } from '../../shared/dealTiming';
import type { TableMotion } from '../../shared/tableTimeline';

export function canHoldPrivateCards(cards: string[], status?: string) {
  return cards.length === 2 && (status === 'active' || status === 'all-in');
}

export function privateCardsReadyAt(motions: TableMotion[], actorId: string) {
  const deal = motions.find(m => m.type === 'hand-start');
  if (!deal || deal.type !== 'hand-start') return 0;
  const index = deal.playerIds.indexOf(actorId);
  return index < 0 ? Infinity : deal.startAt + holePickupAt(deal.playerIds.length, index);
}
