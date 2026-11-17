// Solmar Heat — shared helpers: a seeded RNG so every run is deterministic,
// small math helpers, and the keyboard/mouse/pointer-lock input class.
// Written fresh for this build; nothing here is copied from any other game.

export function mulberry32(seed) {
  // A tiny deterministic generator: same seed, same city, same traffic, same shots.
  let a = seed >>> 0;
  return function next() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeRng(seed) {
  const next = mulberry32(seed);
  return {
    next,
    range(min, max) { return min + next() * (max - min); },
    int(min, max) { return Math.floor(min + next() * (max - min + 1)); },
    pick(list) { return list[Math.floor(next() * list.length)]; },
  };
}

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;

// Shortest signed turn between two headings, so cops and cars steer the short way.
export function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
export const angleLerp = (a, b, t) => a + angleDiff(a, b) * t;
export const dist2d = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);

// The city grid: roads run where either coordinate is a multiple of 40.
export const GRID_STEP = 40;
export const GRID_MIN = -180;
export const GRID_MAX = 180;
export function nearestRoadCoord(v) { return Math.round(v / GRID_STEP) * GRID_STEP; }
export function onRoad(x, z, halfWidth = 5.5) {
  const dx = Math.abs(x - nearestRoadCoord(x));
  const dz = Math.abs(z - nearestRoadCoord(z));
  return dx <= halfWidth || dz <= halfWidth;
}

// Keyboard + mouse input with pointer lock. All look/movement state lives here
// so the player and camera modules share one source of truth.
export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.clicked = false;
    this.locked = false;
    this.canvas = canvas;
    this._onKeyDown = (e) => {
      if (e.code === 'Space') e.preventDefault();
      this.keys.add(e.code);
    };
    this._onKeyUp = (e) => this.keys.delete(e.code);
    this._onMouseMove = (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX || 0;
      this.mouseDY += e.movementY || 0;
    };
    this._onMouseDown = (e) => {
      if (e.button === 0) this.clicked = true;
      if (!this.locked && this.canvas) this.canvas.requestPointerLock?.();
    };
    this._onLockChange = () => { this.locked = document.pointerLockElement === this.canvas; };
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('mousedown', this._onMouseDown);
    document.addEventListener('pointerlockchange', this._onLockChange);
  }
  down(code) { return this.keys.has(code); }
  // Edge-triggered key: true once per press, so E / M / T / R fire a single action.
  pressed(code) {
    if (!this.keys.has(code)) return false;
    this.keys.delete(code);
    return true;
  }
  consumeMouse() { const dx = this.mouseDX, dy = this.mouseDY; this.mouseDX = 0; this.mouseDY = 0; return { dx, dy }; }
  consumeClick() { const c = this.clicked; this.clicked = false; return c; }
}
