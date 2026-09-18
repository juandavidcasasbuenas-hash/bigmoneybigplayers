import { beforeAll, describe, expect, it } from 'vitest';
import { Quaternion, Vector3 } from 'three';
import { loadContactPhysics } from './contactPhysics';
import { BODY, FELT_Y, holeCardRest, seatedStance, solveArm, wristJoint, workZ, smooth } from './contactMotion';
import { foldTableCard, foldTableHand, peekCardSurface, peekHandPose, privateCardOrigin, privateCardTransform, restingCardHand, tablePeekHand, PEEK_CARD_WIDTH } from './cardPeek';
beforeAll(() => loadContactPhysics());

describe('table-side card checking', () => {
  it('keeps the far edge planted, the bend above the felt, and the back facing up at rest', () => {
    for (let frame=0;frame<=20;frame++) {
      const amount=frame/20;
      expect(peekCardSurface(0,0,amount).position.toArray()).toEqual(peekCardSurface(0,0,0).position.toArray());
      for(let y=0;y<=28;y++) expect(peekCardSurface(0,y/28,amount).position.y).toBeGreaterThanOrEqual(0);
    }
    expect(peekCardSurface(0,1,0).normal.y).toBe(-1);
    expect(peekCardSurface(0,1,1).normal.z).toBeLessThan(-0.6);
  });
  it('pins both thumbs to the outer edges below the rank indices through the whole curl at every seat', () => {
    for(let seat=0;seat<12;seat++) for(let index=0;index<2;index++) for(let frame=0;frame<=20;frame++) {
      const amount=frame/20;
      const hand=peekHandPose(index,amount), card=privateCardTransform(index);
      const fingertip=hand.thumbTip.clone().applyQuaternion(hand.rotation).add(hand.position);
      const corner=peekCardSurface((index===0?1:-1)*PEEK_CARD_WIDTH*(.47+.03*amount),1-.27*amount,amount).position.applyQuaternion(card.rotation).add(card.position);
      expect(fingertip.distanceTo(corner)).toBeLessThan(1e-8);
      const rest=holeCardRest(workZ(seat),index);
      expect(rest.position.distanceTo(card.position.clone().add(privateCardOrigin(seat)))).toBeLessThan(1e-8);
    }
  });
  it('keeps both arms reachable and clear of the rail while peeking and folding at all 12 seats', () => {
    let worstError=0, worstGap=Infinity, context='', errorContext='';
    for(let seat=0;seat<12;seat++) for(const motion of ['peek','fold','rest'] as const) for(let i=0;i<=30;i++) {
      const t=i/30, lean=motion==='peek'?.08+t*.08:motion==='fold'?.08+.14*smooth(t,0,.2)*(1-smooth(t,.75,1)):.08;
      const rotation=new Quaternion().setFromAxisAngle(new Vector3(1,0,0),lean);
      for(const side of [-1,1]) {
        const hand=motion==='peek'?tablePeekHand(seat,side>0?0:1,t):motion==='fold'?foldTableHand(t,seat,side):restingCardHand(seat,side);
        const shoulder=new Vector3(side*.44,1.7-BODY.hipY,.125).applyQuaternion(rotation).add(seatedStance(0).hip);
        const arm=solveArm(shoulder,wristJoint(hand),side,seat);
        if(arm.error>worstError) {worstError=arm.error;errorContext=`${seat}/${motion}/${t}/${side}`;}
        if(arm.clearance<worstGap) {worstGap=arm.clearance;context=`${seat}/${motion}/${t}/${side}`;}
      }
    }
    expect(worstError,errorContext).toBeLessThan(.002);
    expect(worstGap,context).toBeGreaterThanOrEqual(-.008);
  },20000);
  it('folds the same face-down cards from rest without teleporting at release', () => {
    for(let seat=0;seat<12;seat++) for(let index=0;index<2;index++) {
      expect(foldTableCard(0,seat,index).position.distanceTo(holeCardRest(workZ(seat),index).position)).toBeLessThan(1e-8);
      expect(foldTableCard(.43+1e-6,seat,index).position.distanceTo(foldTableCard(.43,seat,index).position)).toBeLessThan(.0001);
      for(let p=0;p<=1;p+=.025) expect(foldTableCard(p,seat,index).position.y).toBeGreaterThan(FELT_Y);
    }
  });
});
