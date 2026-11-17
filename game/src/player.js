// Solmar Heat — the player on foot: third-person movement, sprinting with
// stamina, jumping with gravity, entering/exiting/stealing cars, and the chase
// camera. The camera convention matters: the camera sits at the player plus
// (sin(camYaw), cos(camYaw)) * distance, so W moves the player away from the
// camera, along the view direction. (An earlier draft had W walking toward the
// camera; the walk test caught it.)
import * as THREE from 'three';
import { clamp, dist2d } from './utils.js';
import { resolveColliders, clampToWorld } from './city.js';

const WALK_SPEED = 6;
const SPRINT_SPEED = 9;

// The player figure: a driver in a red jacket, built from boxes so he reads
// at any distance. His limbs swing when he walks.
export function makePlayerMesh() {
  const g = new THREE.Group();
  const jacket = new THREE.MeshStandardMaterial({ color: 0xb8322a, roughness: 0.85 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.95, 0.42), jacket);
  torso.position.y = 1.2;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), new THREE.MeshStandardMaterial({ color: 0xd9a986, roughness: 0.8 }));
  head.position.y = 1.95;
  g.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.31, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x1a1210, roughness: 0.95 }));
  hair.position.y = 2.0;
  g.add(hair);
  const legMat = new THREE.MeshStandardMaterial({ color: 0x2a2a33, roughness: 0.9 });
  const legs = [];
  for (const lx of [-0.19, 0.19]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.85, 0.26), legMat);
    leg.geometry.translate(0, -0.28, 0);
    leg.position.set(lx, 0.85, 0);
    g.add(leg);
    legs.push(leg);
  }
  const arms = [];
  for (const ax of [-0.48, 0.48]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.75, 0.2), jacket);
    arm.geometry.translate(0, -0.28, 0);
    arm.position.set(ax, 1.55, 0);
    g.add(arm);
    arms.push(arm);
  }
  // The pistol appears in his right hand when the gun is drawn.
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.14, 0.42), new THREE.MeshStandardMaterial({ color: 0x181818, roughness: 0.4, metalness: 0.6 }));
  gun.position.set(0, -0.6, 0.18);
  arms[1].add(gun);
  gun.visible = false;
  g.userData.legs = legs; g.userData.arms = arms; g.userData.gun = gun;
  return g;
}

// On-foot step: WASD relative to the camera, Shift to sprint, Space to jump.
// Movement is axis-separated against building colliders, so Jax slides along
// walls instead of sticking to them.
export function updatePlayer(S, dt) {
  const p = S.player;
  const input = S.input;
  if (p.inCar) return;
  const { dx, dy } = input.consumeMouse();
  p.camYaw -= dx * 0.0028;
  p.camPitch = clamp((p.camPitch || 0) - dy * 0.002, -0.5, 0.6);
  // View direction is the opposite of the camera offset: W walks away from
  // the camera, never toward it.
  const fx = -Math.sin(p.camYaw), fz = -Math.cos(p.camYaw);
  const rx = -fz, rz = fx;
  let mx = 0, mz = 0;
  if (input.down('KeyW') || input.down('ArrowUp')) { mx += fx; mz += fz; }
  if (input.down('KeyS') || input.down('ArrowDown')) { mx -= fx; mz -= fz; }
  if (input.down('KeyA') || input.down('ArrowLeft')) { mx -= rx; mz -= rz; }
  if (input.down('KeyD') || input.down('ArrowRight')) { mx += rx; mz += rz; }
  const moving = mx !== 0 || mz !== 0;
  const sprinting = moving && (input.down('ShiftLeft') || input.down('ShiftRight')) && p.stamina > 0;
  if (sprinting) p.stamina = Math.max(0, p.stamina - 26 * dt);
  else p.stamina = Math.min(100, p.stamina + 14 * dt);
  const speed = sprinting ? SPRINT_SPEED : WALK_SPEED;
  if (moving) {
    const len = Math.hypot(mx, mz);
    mx /= len; mz /= len;
    p.yaw = Math.atan2(mx, mz);
    const nx = p.pos.x + mx * speed * dt;
    const nz = p.pos.z + mz * speed * dt;
    const r1 = resolveColliders(S, nx, p.pos.z, 0.7);
    p.pos.x = r1.x;
    const r2 = resolveColliders(S, p.pos.x, nz, 0.7);
    p.pos.z = r2.z;
    const cl = clampToWorld(p.pos.x, p.pos.z);
    p.pos.x = cl.x; p.pos.z = cl.z;
    p.walkPhase += dt * (sprinting ? 11 : 7);
  }
  // Jump + gravity.
  if (input.down('Space') && p.onGround) { p.velY = 7.5; p.onGround = false; }
  if (!p.onGround) {
    p.velY -= 22 * dt;
    p.pos.y += p.velY * dt;
    if (p.pos.y <= 0) { p.pos.y = 0; p.velY = 0; p.onGround = true; }
  }
  // Weapon switching and reload are handled here so combat stays dumb.
  if (input.pressed('Digit1')) { p.weapon = 'fists'; S.hudDirty = true; }
  if (input.pressed('Digit2')) { p.weapon = 'pistol'; S.hudDirty = true; }
  if (input.pressed('KeyR') && p.weapon === 'pistol') {
    p.ammo = 12;
    S.audio?.jingle(660);
    S.toast('Reloaded — 12 rounds');
  }
  p.mesh.position.copy(p.pos);
  p.mesh.rotation.y = p.yaw;
  p.mesh.visible = true;
  p.mesh.userData.gun.visible = p.weapon === 'pistol';
  const swing = moving ? Math.sin(p.walkPhase) * 0.55 : 0;
  p.mesh.userData.legs[0].rotation.x = swing;
  p.mesh.userData.legs[1].rotation.x = -swing;
  p.mesh.userData.arms[0].rotation.x = -swing * 0.7;
  p.mesh.userData.arms[1].rotation.x = p.weapon === 'pistol' ? -1.2 : swing * 0.7;
  p.speed = moving ? speed : 0;
}

// Chase camera: behind and above the player (or the car), looking slightly
// above his head; driving kicks the field of view up a touch with speed.
export function updateCamera(S, dt) {
  const p = S.player;
  const cam = S.camera;
  let cx, cy, cz, tx, ty, tz, dist;
  if (p.inCar && p.car) {
    dist = 9;
    cx = p.car.x + Math.sin(p.car.heading + Math.PI) * dist * 0 + Math.sin(p.car.heading) * -dist;
    cz = p.car.z + Math.cos(p.car.heading) * -dist;
    cy = 3.8;
    tx = p.car.x; ty = 1.4; tz = p.car.z;
    cam.fov = 62 + Math.min(8, Math.abs(p.car.speed) * 0.18);
    cam.updateProjectionMatrix();
  } else {
    dist = 6.5;
    cx = p.pos.x + Math.sin(p.camYaw) * dist;
    cz = p.pos.z + Math.cos(p.camYaw) * dist;
    cy = p.pos.y + 2.5 + (p.camPitch || 0) * 2;
    tx = p.pos.x; ty = p.pos.y + 1.6; tz = p.pos.z;
    if (Math.abs(cam.fov - 62) > 0.01) { cam.fov = 62; cam.updateProjectionMatrix(); }
  }
  // Keep the camera out of buildings: pull it in toward the player if a
  // collider sits between them.
  const hit = resolveColliders(S, cx, cz, 0.5);
  if (hit.hit) { cx = hit.x; cz = hit.z; }
  const shake = S.shake || 0;
  if (shake > 0) {
    cx += (S.rng.next() - 0.5) * shake;
    cy += (S.rng.next() - 0.5) * shake;
    S.shake = Math.max(0, shake - dt * 1.2);
  }
  cam.position.set(cx, cy, cz);
  cam.lookAt(tx, ty, tz);
}

// E: enter the nearest car (traffic or parked) or step out of the one driven.
// Stealing a car a cop can see raises the wanted level.
export function tryEnterExitCar(S) {
  const p = S.player;
  if (p.inCar) {
    const car = p.car;
    p.inCar = false; p.car = null;
    p.pos.set(car.x + 3, 0, car.z + 1);
    p.mesh.visible = true;
    S.audio?.jingle(440);
    return;
  }
  let best = null, bestD = 4.5;
  const candidates = [...S.parked, ...S.traffic.map((t) => ({ mesh: t.mesh, x: t.mesh.position.x, z: t.mesh.position.z, speed: 0, heading: t.mesh.rotation.y, topSpeed: 36, traffic: t }))];
  for (const c of candidates) {
    const d = dist2d(p.pos.x, p.pos.z, c.x, c.z);
    if (d < bestD) { bestD = d; best = c; }
  }
  if (!best) return;
  const wasParked = S.parked.includes(best);
  const wasTraffic = best.traffic !== undefined;
  if (wasTraffic) {
    // Pull the traffic car out of circulation and hand it to the player.
    S.traffic = S.traffic.filter((t) => t !== best.traffic);
  }
  if (wasParked) best.stolen = true;
  p.inCar = true;
  p.car = { mesh: best.mesh, x: best.x, z: best.z, heading: best.heading ?? 0, speed: 0, topSpeed: best.sport ? 46 : 36 };
  p.mesh.visible = false;
  S.audio?.engineStart?.();
  // A cop watching the theft notices: stealing in view is a crime.
  const seen = S.cops.some((c) => dist2d(c.x, c.z, p.pos.x, p.pos.z) < 40);
  if ((wasParked || wasTraffic) && (seen || S.wanted > 0)) {
    S.wanted = Math.max(S.wanted, 1);
    S.toast('Stolen in view — the cops noticed');
  }
  if (best.name === 'Comet GT' && S.mission.index === 2 && S.mission.stage === 'steal') {
    S.mission.stage = 'deliver';
    setObjective(S, 'Deliver the Comet GT to the Chop Shop');
  }
}
