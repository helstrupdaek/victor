/**
 * A one-way channel from the ball to the camera.
 *
 * The camera has to read the ball's position and velocity every frame. Doing
 * that through React state would re-render the whole scene 60 times a second,
 * and threading a ref through props would put camera concerns into the ball's
 * signature. This is a plain mutable record instead: <Ball> writes to it in its
 * existing useFrame, <GameCamera> reads it in its own.
 *
 * IMPORTANT: nothing here feeds back into the simulation. It is written by the
 * ball and read by the camera, never the reverse — no physics value is derived
 * from it, so the camera cannot affect how the ball behaves.
 */
export const ballState = {
  x: 0,
  y: 0,
  z: 0,
  /** Linear velocity, world units per second. */
  vx: 0,
  vy: 0,
  vz: 0,
  /** Horizontal speed only — vertical bounce should not read as "moving". */
  speed: 0,
  /** Bumped by <Ball> every time a shot is actually played. */
  shotSerial: 0,
  /** Set when the hole sensor fires, cleared on reset. */
  holed: false,
  /**
   * True from the instant a shot drag begins. Set SYNCHRONOUSLY in <Ball>'s
   * pointerdown, unlike the isAiming React state, which only lands after a
   * render. The camera's own pointer listener reads this one, so the very
   * first pointermove of a shot drag can never be mistaken for an aim gesture
   * — which is the gesture clash the old OrbitControls setup had.
   */
  aiming: false,
}

export function resetBallState() {
  ballState.holed = false
}
