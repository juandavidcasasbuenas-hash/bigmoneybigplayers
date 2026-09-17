import { describe, it, expect } from "vitest";
import { nextReadyCue } from "./voiceQueue";
import { dealerCueTiming, isCurrentDealerCue } from "../../shared/dealerPolicy";
import { PokerRoom } from "../../server/engine";

describe("table speech scheduling", () => {
  it("lets ready player speech through while Monty is still loading, then keeps his cue eligible", () => {
    const pending = {
        priority: 1,
        expiresAt: 30000,
        result: undefined as unknown,
      },
      player = { priority: 3, expiresAt: 7500, result: { ok: true } };
    expect(nextReadyCue([pending, player], 3000)).toBe(1);
    pending.result = { ok: true };
    expect(nextReadyCue([pending], 8000)).toBe(0);
  });
  it("never starts a prepared future street early or plays a stale player action", () => {
    const future = {
        priority: 1,
        notBefore: 5000,
        expiresAt: 12000,
        result: {},
      },
      stale = { priority: 3, expiresAt: 2000, result: {} };
    expect(nextReadyCue([future, stale], 3000)).toBe(-1);
    expect(nextReadyCue([future, stale], 5000)).toBe(0);
  });
  it('keeps elimination log entries with the award instead of spoiling a pending runout',()=>{
    let now=100000;
    const room=new PokerRoom('LOGTIM',{autoNextHand:false},{paced:true,clock:()=>now});
    const a=room.addPlayer('Juan','juan'),b=room.addPlayer('Diego','diego');room.start(a.id);
    a.holeCards=['As','Ad'];b.holeCards=['Kc','Kd'];room.deck=['Ts','9c','8h','7d','6s','5c','4h','3d'];
    now=room.turnStartsAt!;room.act(a.id,{type:'all-in'});now=room.turnStartsAt!;room.act(b.id,{type:'call'});
    const view=room.viewFor(a.id),elimination=view.dealerMessages.find(m=>m.afterAward)!;
    expect(elimination).toBeDefined();expect(elimination.kind).toBe('log');
    expect(dealerCueTiming(view,elimination).notBefore).toBe(view.tableEvents?.find(e=>e.type==='award')?.presentAt);
    expect(dealerCueTiming(view,elimination).notBefore).toBeGreaterThan(now);
    expect(isCurrentDealerCue(view,elimination,now)).toBe(false);
  });
  it("retains each public all-in card call when the authoritative room is already finished", () => {
    let now = 100000;
    const room = new PokerRoom(
      "VOICEX",
      { autoNextHand: false },
      { paced: true, clock: () => now },
    );
    const a = room.addPlayer("Juan", "juan");
    room.addPlayer("Nat", "nat");
    room.start(a.id);
    now = room.turnStartsAt!;
    room.act(room.turnPlayerId!, { type: "all-in" });
    now = room.turnStartsAt!;
    room.act(room.turnPlayerId!, { type: "call" });
    const view = room.viewFor(a.id),
      calls = view.dealerMessages.filter((m) => m.kind === "street");
    expect(calls).toHaveLength(3);
    for (const message of calls) {
      const timing = dealerCueTiming(view, message);
      expect(isCurrentDealerCue(view, message, now)).toBe(true);
      expect(timing.notBefore).toBeGreaterThan(now);
      expect(timing.expiresAt).toBeGreaterThan(timing.notBefore);
      expect(isCurrentDealerCue(view, message, timing.expiresAt + 1)).toBe(
        false,
      );
      expect(isCurrentDealerCue(view,message,timing.expiresAt+1,true)).toBe(true);
      expect(isCurrentDealerCue({...view,paused:true},message,timing.expiresAt+1,true)).toBe(false);
      expect(isCurrentDealerCue({...view,handNumber:2},message,timing.expiresAt+1,true)).toBe(false);
      expect(isCurrentDealerCue({ ...view, handNumber: 2 }, message, now)).toBe(
        false,
      );
    }
  });
});
