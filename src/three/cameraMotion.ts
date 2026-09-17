import type CameraControls from "camera-controls";
import type { Vector3 } from "three";

export const CAMERA_SMOOTH_TIME = 0.85;
export const CAMERA_MAX_SPEED = 8;

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
