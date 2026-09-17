import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import * as THREE from "three";
import CameraControls from "camera-controls";
import {
  CAMERA_MAX_SPEED,
  CAMERA_SMOOTH_TIME,
  moveToShot,
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
