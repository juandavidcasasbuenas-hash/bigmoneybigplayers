import type CameraControls from "camera-controls";
import { Camera, Vector3 } from "three";
import { damp3, dampAngle } from "maath/easing";
import { seatPosition } from './seating';

export const CAMERA_SMOOTH_TIME = 0.85;
export const CAMERA_MAX_SPEED = 8;

export function firstPersonShot(heroSeat: number, actorSeat?: number) {
  const hero = seatPosition(heroSeat, 12).position;
  const position = new Vector3(hero[0] * 0.89, 2.67, hero[2] * 0.89);
  const actor = actorSeat !== undefined && actorSeat !== heroSeat ? seatPosition(actorSeat, 12).position : null;
  return { position, target: actor ? new Vector3(actor[0], 2.08, actor[2]) : new Vector3(0, 1.47, -0.2) };
}

/** Turn the head at a fixed seat. Orbit interpolation otherwise swings the eye
 * around a moving target and can carry it through neighbouring players. */
export const HEAD_TURN_SMOOTH_TIME = 0.48;
export const HEAD_TURN_MAX_SPEED = 1.5; // radians/second, including across +/-180 degrees

export class FirstPersonMotion {
  private position = new Vector3();
  private direction = new Vector3();
  private target = new Vector3();
  private angles = { yaw: 0, pitch: 0 };
  private initialized = false;

  reset() { this.initialized = false; }

  update(controls: CameraControls, camera: Camera, eye: Vector3, look: Vector3, delta: number, immediate = false) {
    const dt = Math.max(0, Math.min(delta, 0.05));
    if (!this.initialized || immediate) {
      this.position = camera.position.clone();
      camera.getWorldDirection(this.direction);
      // A fresh object also clears the damper's stored velocity when changing camera modes.
      this.angles = {
        yaw: Math.atan2(this.direction.x, -this.direction.z),
        pitch: Math.atan2(this.direction.y, Math.hypot(this.direction.x, this.direction.z)),
      };
      this.initialized = true;
    }
    // Small integration steps keep velocity limits consistent at 24/30/60/120 fps.
    const steps = Math.max(1, Math.ceil(dt * 120));
    for (let i = 0; i < steps; i++) {
      if (immediate) this.position.copy(eye);
      else damp3(this.position, eye, 0.48, dt / steps, CAMERA_MAX_SPEED, undefined, 0.000001);
      this.direction.subVectors(look, this.position).normalize();
      const yaw = Math.atan2(this.direction.x, -this.direction.z);
      const pitch = Math.atan2(this.direction.y, Math.hypot(this.direction.x, this.direction.z));
      if (immediate) Object.assign(this.angles, { yaw, pitch });
      else {
        // Retain velocity across frames and retargets; keep the horizon level.
        dampAngle(this.angles, 'yaw', yaw, HEAD_TURN_SMOOTH_TIME, dt / steps, HEAD_TURN_MAX_SPEED, undefined, 0.000001);
        dampAngle(this.angles, 'pitch', pitch, HEAD_TURN_SMOOTH_TIME, dt / steps, 0.8, undefined, 0.000001);
      }
    }
    const horizontal = Math.cos(this.angles.pitch);
    this.target.set(Math.sin(this.angles.yaw) * horizontal, Math.sin(this.angles.pitch), -Math.cos(this.angles.yaw) * horizontal)
      .multiplyScalar(Math.max(1, this.position.distanceTo(look))).add(this.position);
    moveToShot(controls, this.position, this.target, true);
  }
}

export function moveToShot(
  controls: CameraControls,
  position: Vector3,
  target: Vector3,
  immediate = false,
) {
  void controls.setLookAt(
    position.x,
    position.y,
    position.z,
    target.x,
    target.y,
    target.z,
    !immediate,
  );
  // Normalize after assigning the destination so crossing +/-180 degrees takes
  // the short arc instead of making almost a complete turn around the table.
  controls.normalizeRotations();
}
