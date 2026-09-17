import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import * as THREE from "three";
import CameraControls from "camera-controls";
import {
  CAMERA_MAX_SPEED,
  CAMERA_SMOOTH_TIME,
  moveToShot,
  firstPersonShot,
  FirstPersonMotion,
} from "./cameraMotion";
CameraControls.install({ THREE });
// The controller stores a DOM rectangle even without a connected canvas.
beforeAll(() =>
  vi.stubGlobal(
    "DOMRect",
    class {
      x = 0;
      y = 0;
      width = 0;
      height = 0;
    },
  ),
);
afterAll(() => vi.unstubAllGlobals());
function setup() {
  const camera = new THREE.PerspectiveCamera(40, 1.5, 0.1, 55);
  const control = new CameraControls(camera);
  control.smoothTime = CAMERA_SMOOTH_TIME;
  control.maxSpeed = CAMERA_MAX_SPEED;
  return { camera, control };
}
describe("smooth table cameras", () => {
  it('keeps the first-person eye fixed while smoothly tracking all other seats', () => {
    for(let hero=0; hero<12; hero++) {
      const {camera,control}=setup(), motion=new FirstPersonMotion();
      const origin=firstPersonShot(hero);
      moveToShot(control,origin.position,origin.target,true); control.update(1/60);
      for(let actor=0; actor<12; actor++) {
        const shot=firstPersonShot(hero,actor);
        let maxRotation=0;
        for(let frame=0;frame<240;frame++) {
          const before=camera.quaternion.clone();
          motion.update(control,camera,shot.position,shot.target,1/60); control.update(1/60);
          maxRotation=Math.max(maxRotation,before.angleTo(camera.quaternion));
          expect(camera.position.distanceTo(origin.position)).toBeLessThan(0.00001);
        }
        expect(maxRotation).toBeLessThan(0.03);
        const direction=new THREE.Vector3().subVectors(shot.target,camera.position).normalize();
        expect(camera.getWorldDirection(new THREE.Vector3()).angleTo(direction)).toBeLessThan(0.002);
      }
    }
  });
  it('enters first-person without teleporting and has matching 30/60 fps timing', () => {
    const run=(fps:number) => {
      const {camera,control}=setup(), motion=new FirstPersonMotion(), shot=firstPersonShot(5,0);
      moveToShot(control,new THREE.Vector3(1,6,12),new THREE.Vector3(0,1.5,0),true); control.update(1/fps);
      for(let i=0;i<fps;i++) {
        const before=camera.position.clone();
        motion.update(control,camera,shot.position,shot.target,1/fps); control.update(1/fps);
        expect(before.distanceTo(camera.position)).toBeLessThan(1.2);
      }
      return camera;
    };
    const a=run(30), b=run(60);
    expect(a.position.distanceTo(b.position)).toBeLessThan(0.02);
    expect(a.quaternion.angleTo(b.quaternion)).toBeLessThan(0.02);
  });
  it.each([24, 30, 60, 120])('eases into a large head turn at %i fps, with a capped speed and level horizon', fps => {
    const {camera, control} = setup(), motion = new FirstPersonMotion();
    const origin = firstPersonShot(5, 4), goal = firstPersonShot(5, 6);
    motion.update(control, camera, origin.position, origin.target, 1 / fps, true); control.update(1 / fps);
    let previousSpeed = 0;
    for (let frame = 0; frame < fps * 4; frame++) {
      const before = camera.quaternion.clone();
      motion.update(control, camera, goal.position, goal.target, 1 / fps); control.update(1 / fps);
      const step = before.angleTo(camera.quaternion), speed = step * fps;
      if (frame === 0) expect(step).toBeLessThan(0.012);
      expect(speed).toBeLessThan(1.75);
      expect(Math.abs(speed - previousSpeed) * fps).toBeLessThan(12);
      expect(Math.abs(new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion).y)).toBeLessThan(0.00001);
      previousSpeed = speed;
    }
  });
  it('does not snap when retargeted mid-pan or after a slow frame', () => {
    const {camera, control} = setup(), motion = new FirstPersonMotion();
    const origin = firstPersonShot(5, 4);
    motion.update(control, camera, origin.position, origin.target, 1/30, true); control.update(1/30);
    for (const seat of [6, 2, 10, 0]) {
      const goal = firstPersonShot(5, seat);
      for (const dt of [1/30, 1/30, 1/30, 0.25, 1/30]) {
        const before = camera.quaternion.clone();
        motion.update(control, camera, goal.position, goal.target, dt); control.update(dt);
        expect(before.angleTo(camera.quaternion)).toBeLessThan(0.088);
        expect(camera.position.distanceTo(origin.position)).toBeLessThan(0.00001);
      }
    }
  });
  it("moves between shots without cutting or overshooting", () => {
    const { camera, control } = setup(),
      target = new THREE.Vector3(0, 1.5, 0);
    moveToShot(control, new THREE.Vector3(1, 6, 12), target, true);
    control.update(1 / 60);
    const before = camera.position.clone(),
      goal = new THREE.Vector3(-3, 3, 2);
    moveToShot(control, goal, target);
    expect(camera.position.distanceTo(before)).toBe(0);
    let maxStep = 0;
    for (let i = 0; i < 240; i++) {
      const previous = camera.position.clone();
      control.update(1 / 60);
      maxStep = Math.max(maxStep, camera.position.distanceTo(previous));
      expect(camera.position.toArray().every(Number.isFinite)).toBe(true);
    }
    expect(maxStep).toBeLessThan(0.3);
    expect(camera.position.distanceTo(goal)).toBeLessThan(0.03);
  });
  it("crosses the angular wrap by the short arc", () => {
    const { camera, control } = setup();
    const target = new THREE.Vector3(0, 1.5, 0);
    const p = (degrees: number) =>
      new THREE.Vector3(
        Math.sin((degrees * Math.PI) / 180) * 4,
        3,
        Math.cos((degrees * Math.PI) / 180) * 4,
      );
    moveToShot(control, p(179), target, true);
    control.update(1 / 60);
    moveToShot(control, p(-179), target);
    let travelled = 0;
    for (let i = 0; i < 180; i++) {
      const previous = camera.position.clone();
      control.update(1 / 60);
      travelled += previous.distanceTo(camera.position);
    }
    expect(travelled).toBeLessThan(0.2);
    expect(camera.position.distanceTo(p(-179))).toBeLessThan(0.01);
  });
  it("has matching transition timing at 30 and 60 fps", () => {
    const run = (fps: number) => {
      const { camera, control } = setup(),
        target = new THREE.Vector3(0, 1.5, 0);
      moveToShot(control, new THREE.Vector3(1, 6, 12), target, true);
      control.update(1 / fps);
      moveToShot(control, new THREE.Vector3(-3, 3, 2), target);
      for (let i = 0; i < fps; i++) control.update(1 / fps);
      return camera.position;
    };
    expect(run(30).distanceTo(run(60))).toBeLessThan(0.08);
  });
});
