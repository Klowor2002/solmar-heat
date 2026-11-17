// Solmar Heat — pedestrians: 28 walkers on the sidewalks who wander between
// intersections, swing their limbs as they walk, and flee from danger (gunfire
// or a speeding car) instead of standing in it.
import * as THREE from 'three';
import { GRID_STEP, GRID_MIN, GRID_MAX, makeRng, dist2d } from './utils.js';
import { resolveColliders, clampToWorld } from './city.js';

const SHIRTS = [0xc94a4a, 0x4a7ac9, 0x4ac97a, 0xc9a44a, 0x9a4ac9, 0x4ac9c9, 0xd8d8d8, 0x333333];

// A simple walker: torso, head, two legs and two arms that swing with the step.
function makePedMesh(rng) {
  const g = new THREE.Group();
  const shirt = rng.pick(SHIRTS);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.9, 0.4), new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.9 }));
  torso.position.y = 1.15;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), new THREE.MeshStandardMaterial({ color: 0xd9a986, roughness: 0.8 }));
  head.position.y = 1.85;
  g.add(head);
  const legMat = new THREE.MeshStandardMaterial({ color: 0x2a2a33, roughness: 0.9 });
  const legs = [];
  for (const lx of [-0.18, 0.18]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.8, 0.24), legMat);
    leg.position.set(lx, 0.4, 0);
    leg.geometry.translate(0, -0.2, 0);
    leg.position.y = 0.8;
    g.add(leg);
    legs.push(leg);
  }
  const armMat = new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.9 });
  const arms = [];
  for (const ax of [-0.45, 0.45]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.7, 0.2), armMat);
    arm.geometry.translate(0, -0.25, 0);
    arm.position.set(ax, 1.5, 0);
    g.add(arm);
    arms.push(arm);
  }
  g.userData.legs = legs; g.userData.arms = arms;
  return g;
}

export function spawnPeds(S) {
  const rng = makeRng(S.seed + 21);
  S.peds = [];
  for (let i = 0; i < 28; i++) {
    const mesh = makePedMesh(rng);
    // Start on a sidewalk corner: near a road line, offset onto the pad.
    const bx = GRID_MIN + Math.floor(rng.next() * 9) * GRID_STEP;
    const bz = GRID_MIN + Math.floor(rng.next() * 9) * GRID_STEP;
    const x = bx + rng.range(-14, 14);
    const z = bz + rng.range(-14, 14);
    mesh.position.set(x, 0, z);
    S.scene.add(mesh);
    S.peds.push({
      mesh, x, z, heading: rng.next() * Math.PI * 2,
      speed: rng.range(1.2, 2.2), target: null, fleeing: 0, phase: rng.next() * Math.PI * 2,
    });
  }
}

// Pick a fresh sidewalk destination: a nearby intersection corner.
function pickTarget(S, ped) {
  const bx = Math.round(ped.x / GRID_STEP) * GRID_STEP;
  const bz = Math.round(ped.z / GRID_STEP) * GRID_STEP;
  return { x: bx + (S.rng.next() < 0.5 ? -1 : 1) * GRID_STEP + S.rng.range(-8, 8), z: bz + (S.rng.next() < 0.5 ? -1 : 1) * GRID_STEP + S.rng.range(-8, 8) };
}

export function updatePeds(S, dt) {
  const px = S.player.pos.x, pz = S.player.pos.z;
  const danger = S.shotsFiredRecently > 0 || (S.player.car && Math.abs(S.player.car.speed) > 18);
  for (const ped of S.peds) {
    if (ped.fleeing > 0) ped.fleeing -= dt;
    const d = dist2d(ped.x, ped.z, px, pz);
    if (danger && d < 22) ped.fleeing = 1.5;
    let tx, tz, speed = ped.speed;
    if (ped.fleeing > 0) {
      // Run away from the player.
      const away = Math.atan2(ped.x - px, ped.z - pz);
      tx = ped.x + Math.sin(away) * 10; tz = ped.z + Math.cos(away) * 10;
      speed = 4.5;
    } else {
      if (!ped.target || dist2d(ped.x, ped.z, ped.target.x, ped.target.z) < 2) ped.target = pickTarget(S, ped);
      tx = ped.target.x; tz = ped.target.z;
    }
    const want = Math.atan2(tx - ped.x, tz - ped.z);
    let diff = want - ped.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    ped.heading += Math.max(-2.5 * dt, Math.min(2.5 * dt, diff));
    const nx = ped.x + Math.sin(ped.heading) * speed * dt;
    const nz = ped.z + Math.cos(ped.heading) * speed * dt;
    const r = resolveColliders(S, nx, nz, 0.6);
    ped.x = r.x; ped.z = r.z;
    const cl = clampToWorld(ped.x, ped.z);
    ped.x = cl.x; ped.z = cl.z;
    ped.mesh.position.set(ped.x, 0, ped.z);
    ped.mesh.rotation.y = ped.heading;
    // Limb swing, faster when fleeing.
    ped.phase += dt * (ped.fleeing > 0 ? 11 : 6);
    const swing = Math.sin(ped.phase) * (ped.fleeing > 0 ? 0.8 : 0.5);
    ped.mesh.userData.legs[0].rotation.x = swing;
    ped.mesh.userData.legs[1].rotation.x = -swing;
    ped.mesh.userData.arms[0].rotation.x = -swing * 0.8;
    ped.mesh.userData.arms[1].rotation.x = swing * 0.8;
  }
}
