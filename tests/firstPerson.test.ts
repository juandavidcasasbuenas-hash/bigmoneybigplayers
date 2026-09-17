import { describe, expect, it } from 'vitest';
import { presentationFocus, planTableMotions } from '../shared/tableTimeline';
import { holePickupAt } from '../shared/dealTiming';
import { canHoldPrivateCards, privateCardsReadyAt } from '../src/three/firstPersonHandState';
import type { TableEventData } from '../shared/types';
const plan = (...data: TableEventData[]) => planTableMotions(data.map((e, i) => ({...e, id:String(i), sequence:i+1, at:1000, handNumber:1})), 1000);

describe('first-person presentation', () => {
  it('holds the acting player when a network snapshot arrives ahead of the UI clock', () => {
    const motions = plan({type:'check',playerId:'first'});
    expect(presentationFocus(motions, 920)).toEqual({actorId:'first',table:false});
    expect(presentationFocus(motions, 1000)).toEqual({actorId:'first',table:false});
    expect(presentationFocus(motions, 2699)).toEqual({actorId:'first',table:false});
    expect(presentationFocus(motions, 2700)).toEqual({actorId:undefined,table:false});
  });
  it('follows the presentation order through a bet, board reveal and next action', () => {
    const motions = plan(
      {type:'bet',playerId:'first',amount:50,to:50,forced:false},
      {type:'street',stage:'flop',board:['Ah','Kd','Qs']},
      {type:'check',playerId:'next'},
    );
    expect(presentationFocus(motions, 900).actorId).toBe('first');
    expect(presentationFocus(motions, motions[1].startAt)).toEqual({actorId:undefined,table:true});
    expect(presentationFocus(motions, motions[2].startAt).actorId).toBe('next');
  });
  it('does not pull the camera to a blind posting its forced bet', () => {
    expect(presentationFocus(plan({type:'bet',playerId:'blind',amount:25,to:25,forced:true}), 1000)).toEqual({actorId:undefined,table:false});
  });
  it('shows held cards only for a live private hand and waits for the dealer to deliver both', () => {
    expect(canHoldPrivateCards(['6h','6c'],'active')).toBe(true);
    expect(canHoldPrivateCards(['6h','6c'],'all-in')).toBe(true);
    for(const status of ['folded','out','spectator','waiting',undefined])
      expect(canHoldPrivateCards(['6h','6c'],status)).toBe(false);
    expect(canHoldPrivateCards([],'active')).toBe(false);
    expect(canHoldPrivateCards(['6h'],'active')).toBe(false);
    const motions=plan({type:'hand-start',playerIds:['other','you']});
    expect(privateCardsReadyAt(motions,'you')).toBe(1000+holePickupAt(2,1));
    expect(privateCardsReadyAt(motions,'rail')).toBe(Infinity);
    expect(privateCardsReadyAt([],'you')).toBe(0);
  });
});
