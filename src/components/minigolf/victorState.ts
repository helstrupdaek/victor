/**
 * Victor's behaviour state, and the pure decision that starts the Easter egg.
 *
 * Separate from ballState because the flow is the other way round: <Ball>
 * writes ballState and Victor reads it, whereas the fields here are written by
 * Victor and read by <Ball>, <GameCamera> and the HUD. Keeping the two
 * directions in separate records makes it obvious which component owns what,
 * and keeps the "Victor cannot affect the simulation" rule checkable — the
 * only things he may ask of the ball are listed here and nowhere else.
 */

/**
 * Every state Victor can be in. WANDERING and IDLE are the approved ambient
 * behaviour; the rest are the steal sequence, in order.
 *
 * The abortable/committed boundary is exactly one transition:
 * APPROACHING_BALL is the last state the player can interrupt, PICKING_UP is
 * the first that cannot be. Nothing else in the file may blur that.
 */
export type VictorState =
  | 'WANDERING'
  | 'IDLE'
  | 'CHASING_BALL'
  | 'HIT_REACTION'
  | 'NOTICED_BALL'
  | 'APPROACHING_BALL'
  | 'PICKING_UP'
  | 'HOLDING'
  | 'TRANSFORMING'
  | 'PREPARING_KICK'
  | 'KICKING'
  | 'WATCHING'
  | 'RETURNING_TO_WANDER'

/**
 * The three ambient states — everything that is NOT the steal sequence. Victor
 * spends almost all his time in CHASING_BALL now; WANDERING and IDLE are the
 * fallbacks for when there is no ball worth walking towards.
 */
export const AMBIENT: VictorState[] = ['WANDERING', 'IDLE', 'CHASING_BALL']

/** States in which the player may still save the shot by playing it. */
export const ABORTABLE: VictorState[] = ['NOTICED_BALL', 'APPROACHING_BALL']
/** States in which the sequence is committed and shot input is locked out. */
export const COMMITTED: VictorState[] = [
  'HIT_REACTION', 'PICKING_UP', 'HOLDING', 'TRANSFORMING', 'PREPARING_KICK', 'KICKING', 'WATCHING',
]

export const victorState = {
  state: 'IDLE' as VictorState,
  /** Seconds in the current state — read by the DEV handle and the tests. */
  elapsed: 0,
  /** Ordered log of transitions, DEV only, so a test can assert the path. */
  history: [] as VictorState[],
  /** What started the current sequence. DEV/reporting only. */
  trigger: 'none' as 'none' | 'idle' | 'forced' | 'contact' | 'hit',
  /** Bumped every time the hit sensor fires. Lets a test count the events. */
  hitSerial: 0,

  // --- What Victor asks of the ball. Nothing else may touch these. --------
  /** Ball is held: <Ball> goes kinematic and follows heldPos, no impulse. */
  held: false,
  heldX: 0,
  heldY: 0,
  heldZ: 0,
  /** Golf ball mesh hidden — it has visually become the football. */
  hidden: false,
  /** Shot input ignored while the sequence is committed. */
  inputLocked: false,
  /** Bumped to ask <Ball> to restore itself at the tee. Never adds a stroke. */
  respawnSerial: 0,

  /** Where the camera should look, and how strongly, during the sequence. */
  focusX: 0,
  focusY: 0,
  focusZ: 0,
  focusWeight: 0,
}

export function setVictorState(next: VictorState) {
  if (victorState.state === next) return
  victorState.state = next
  victorState.elapsed = 0
  victorState.history.push(next)
  if (victorState.history.length > 64) victorState.history.shift()
}

// --- The trigger ----------------------------------------------------------

export interface StealDecisionInput {
  /** Seconds since the player last did anything. */
  idleSeconds: number
  /** The randomised threshold for THIS idle cycle, in seconds. */
  idleThreshold: number
  /** Horizontal ball speed, m/s. */
  ballSpeed: number
  /** True while the player is dragging a shot. */
  aiming: boolean
  /** True once the ball has been holed. */
  holed: boolean
  /** True while the ball is being reset or is otherwise not in normal play. */
  resetting: boolean
  /** True if Victor is already in a sequence. */
  victorBusy: boolean
  /** 0..1. Injected so tests can seed it. */
  rng: () => number
  probability: number
}

/**
 * Whether to begin the steal. PURE: no clock, no globals, no side effects, so
 * it can be driven by a fake clock and a seeded RNG instead of by waiting.
 *
 * The caller must invoke this at most ONCE per eligible idle cycle. Rolling
 * every frame would fire almost immediately at any sane probability — at 30%
 * per frame and 60 fps the expected wait is about 55 milliseconds.
 */
export function shouldStartSteal(i: StealDecisionInput): boolean {
  if (i.victorBusy) return false
  if (i.aiming) return false
  if (i.holed) return false
  if (i.resetting) return false
  if (i.ballSpeed > BALL_STATIONARY_SPEED) return false
  if (i.idleSeconds < i.idleThreshold) return false
  return i.rng() < i.probability
}

/** Below this the ball counts as stationary, m/s. */
export const BALL_STATIONARY_SPEED = 0.05

/** The idle window, in seconds — randomised per cycle so it is not a timer. */
export const IDLE_THRESHOLD_MIN = 25
export const IDLE_THRESHOLD_MAX = 35
/** Chance of the Easter egg once the window is reached. */
export const STEAL_PROBABILITY = 0.3

/**
 * The live values, and the only test seam in the feature.
 *
 * The natural trigger is a 30-second wait followed by a 30% coin flip, which
 * is not something a test can wait for OR rely on. Rather than give the test a
 * shortcut into the sequence — which would leave the trigger itself, the part
 * most likely to be miswired, permanently unverified — the test narrows the
 * window and sets the probability to 1, then watches the REAL trigger fire the
 * REAL sequence.
 *
 * Only the DEV handle in <Victor> ever writes these, and that handle is
 * stripped from production builds. The defaults are the constants above.
 */
export const stealTuning = {
  /**
   * Whether he walks the ball down at all. Production leaves this on; the
   * Easter-egg tests turn it off so they can exercise the idle trigger without
   * him simply strolling over and punting the ball mid-test.
   */
  chase: true,
  /**
   * Holds Victor still. DEV/testing only; production never sets it.
   *
   * The hit tests have to put a ball through a target 0.9 m wide from up to
   * fifteen metres away, and the shot is airborne for a second or two while his
   * idle pause is only 2.5-6 s — so he routinely walked out of the way after the
   * aim was taken. A miss and a broken sensor look identical to the assertion,
   * which is what made those tests flaky rather than wrong.
   *
   * Freezing him removes the only non-deterministic thing in the setup. The
   * tests still freeze him at a spot he WALKED to rather than his spawn, so
   * "the sensor follows him" is exercised either way.
   */
  freeze: false,
  /**
   * Whether a direct hit triggers the gag. Off, the sensor still reports the
   * overlap but Victor ignores it — which is how the "he does not deflect the
   * ball" test watches a shot pass clean through him.
   */
  hit: true,
  probability: STEAL_PROBABILITY,
  idleMin: IDLE_THRESHOLD_MIN,
  idleMax: IDLE_THRESHOLD_MAX,
}

export function rollIdleThreshold(rng: () => number = Math.random) {
  return stealTuning.idleMin + rng() * (stealTuning.idleMax - stealTuning.idleMin)
}
