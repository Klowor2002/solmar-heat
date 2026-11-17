// Solmar Heat — combat: hitscan pistol with raycast, tracers and a muzzle
// flash, fists at close range, Vulture gang enemies who approach, strafe and
// shoot with inaccuracy, and cash/health/token pickups dropped by kills.
import * as THREE from 'three';
import { dist2d, clamp } from './utils.js';
import { raiseWanted } from './police.js';
import { resolveColliders } from './city.js';
import { completeMission } from './missions.js';

function makeGangMesh() {
  const g = new THREE.Group();
  const vest = new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.85 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.95, 0.42), vest);
  torso.position.y = 1.2;
  g.add(torso);
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.77, 0.18, 0.44), new THREE.MeshStandardMaterial({ color: 0xd21f2b, roughness: 0.7 }));
  band.position.y = 1.45;
  g.add(band);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), new THREE.MeshStandardMaterial({ color: 0xb98a68, roughness: 0.8 }));
  head.position.y = 1.95;
  g.add(head);
  const legMat = new THREE.MeshStandardMaterial({ color: 0x1e1e24, roughness: 0.9 });
  const legs = [];
  for (const lx of [-0.19, 0.19]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.85, 0.26), legMat);
    leg.geometry.translate(0, -0.28, 0);
    leg.position.set(lx, 0.85, 0);
    g.add(leg);
    legs.push(leg);
  }
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.14, 0.42), new THREE.MeshStandardMaterial({ color: 0x181818, roughness: 0.4, metalness: 0.6 }));
  gun.position.set(0.48, 1.35, 0.2);
  g.add(gun);
  g.userData.legs = legs;
  return g;
}

// Spawn one Vulture at (x, z). Gang members have 100 health.
export function spawnGang(S, x, z) {
  const mesh = makeGangMesh();
  mesh.position.set(x, 0, z);
  S.scene.add(mesh);
  const e = { mesh, x, z, health: 100, heading: 0, shootTimer: 1 + S.rng.next(), strafeDir: S.rng.next() < 0.5 ? 1 : -1, strafeTimer: 0, phase: S.rng.next() * 6 };
  S.enemies.push(e);
  return e;
}

function tracer(S, from, to) {
  const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.9 }));
  S.scene.add(line);
  S.tracers.push({ line, life: 0.09 });
}

// The pistol: 12 rounds a magazine, a shot every 0.22 s, 34 damage, 70 range.
// Raycast from the camera; a hit on a gang member, cop or ped registers.
export function tryShoot(S) {
  const p = S.player;
  if (p.inCar || p.weapon !== 'pistol' || p.shootCooldown > 0) return;
  if (p.ammo <= 0) { S.toast('Out of ammo — press R to reload'); S.audio?.jingle(220); p.shootCooldown = 0.3; return; }
  p.shootCooldown = 0.22;
  p.ammo -= 1;
  S.shotsFiredRecently = 1.2;
  S.audio?.gunshot();
  const origin = new THREE.Vector3();
  S.camera.getWorldPosition(origin);
  const dir = new THREE.Vector3();
  S.camera.getWorldDirection(dir);
  // A little spread so the gun feels alive, not laser-perfect.
  dir.x += (S.rng.next() - 0.5) * 0.02;
  dir.y += (S.rng.next() - 0.5) * 0.02;
  dir.z += (S.rng.next() - 0.5) * 0.02;
  dir.normalize();
  const ray = new THREE.Raycaster(origin, dir, 0.1, 70);
  const targets = [];
  for (const e of S.enemies) targets.push(e.mesh);
  for (const c of S.cops) targets.push(c.mesh);
  for (const ped of S.peds) targets.push(ped.mesh);
  const hits = ray.intersectObjects(targets, true);
  const end = origin.clone().addScaledVector(dir, 70);
  if (hits.length > 0) {
    const hit = hits[0];
    end.copy(hit.point);
    // Walk up to the group that owns this mesh part.
    let obj = hit.object;
    while (obj.parent && !S.enemies.some((e) => e.mesh === obj) && !S.cops.some((c) => c.mesh === obj) && !S.peds.some((p2) => p2.mesh === obj)) obj = obj.parent;
    const enemy = S.enemies.find((e) => e.mesh === obj);
    if (enemy) {
      enemy.health -= 34;
      S.audio?.hit?.();
      if (enemy.health <= 0) killEnemy(S, enemy);
    } else {
      const cop = S.cops.find((c) => c.mesh === obj);
      if (cop) {
        raiseWanted(S, 2);
        S.toast('You shot a cop — wanted level up');
      } else if (S.peds.some((p2) => p2.mesh === obj)) {
        raiseWanted(S, 1);
        S.toast('A pedestrian was hit — wanted level up');
      }
    }
  }
  tracer(S, origin.clone().addScaledVector(dir, 1.2), end);
  // Muzzle flash: a brief point light at the camera.
  if (S.muzzleLight) {
    S.muzzleLight.position.copy(origin).addScaledVector(dir, 1);
    S.muzzleLight.intensity = 6;
  }
  S.shake = Math.max(S.shake || 0, 0.12);
}

// Fists: a short-range swing on click, weaker than the pistol.
export function tryPunch(S) {
  const p = S.player;
  if (p.inCar || p.weapon !== 'fists' || p.shootCooldown > 0) return;
  p.shootCooldown = 0.4;
  S.audio?.punch?.();
  const px = p.pos.x, pz = p.pos.z;
  for (const e of [...S.enemies]) {
    if (dist2d(e.x, e.z, px, pz) < 2.2) {
      e.health -= 18;
      if (e.health <= 0) killEnemy(S, e);
    }
  }
  for (const c of S.cops) {
    if (dist2d(c.x, c.z, px, pz) < 2.2) raiseWanted(S, 1);
  }
}

function killEnemy(S, enemy) {
  S.enemies = S.enemies.filter((e) => e !== enemy);
  S.scene.remove(enemy.mesh);
  // Kills drop cash, and sometimes a health pickup.
  dropPickup(S, 'cash', enemy.x + 1, enemy.z, 25 + Math.floor(S.rng.next() * 40));
  if (S.rng.next() < 0.4) dropPickup(S, 'health', enemy.x - 1, enemy.z, 25);
  S.kills = (S.kills || 0) + 1;
  // Killing a gang member in the open is a crime the law notices.
  raiseWanted(S, 1);
  if (S.mission.index === 3 && S.mission.stage === 'kill') {
    S.mission.killed = (S.mission.killed || 0) + 1;
    setObjective(S, `Clear out the Vultures, ${S.mission.killed} of 4`);
    if (S.mission.killed >= 4) completeMission(S);
  }
  if (S.mission.index === 5 && S.mission.stage === 'waves') {
    S.mission.waveKilled = (S.mission.waveKilled || 0) + 1;
  }
}

export function dropPickup(S, kind, x, z, amount) {
  const color = kind === 'cash' ? 0x2ad44a : kind === 'health' ? 0xff5a5a : 0xffd24a;
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 0.7, 0.7),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.7, roughness: 0.4 }),
  );
  mesh.position.set(x, 0.6, z);
  S.scene.add(mesh);
  S.pickups.push({ mesh, kind, x, z, amount, spin: S.rng.next() * 6 });
}

// Gang AI: close to about sixteen units, strafe sideways, and shoot with
// enough inaccuracy that the player can win a fair fight.
export function updateEnemies(S, dt) {
  const p = S.player;
  for (const e of [...S.enemies]) {
    const d = dist2d(e.x, e.z, p.pos.x, p.pos.z);
    const want = Math.atan2(p.pos.x - e.x, p.pos.z - e.z);
    let diff = want - e.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    e.heading += clamp(diff, -3 * dt, 3 * dt);
    e.strafeTimer -= dt;
    if (e.strafeTimer <= 0) { e.strafeDir *= -1; e.strafeTimer = 1.2 + S.rng.next() * 1.4; }
    let mx = 0, mz = 0;
    if (d > 18) { mx = Math.sin(e.heading); mz = Math.cos(e.heading); }
    else if (d < 10) { mx = -Math.sin(e.heading); mz = -Math.cos(e.heading); }
    mx += Math.cos(e.heading) * e.strafeDir * 0.6;
    mz += -Math.sin(e.heading) * e.strafeDir * 0.6;
    const len = Math.hypot(mx, mz) || 1;
    const nx = e.x + (mx / len) * 3.4 * dt;
    const nz = e.z + (mz / len) * 3.4 * dt;
    // Axis-separated, like the player: gang members slide along walls.
    const r1 = resolveColliders(S, nx, e.z, 0.6);
    e.x = r1.x;
    const r2 = resolveColliders(S, e.x, nz, 0.6);
    e.z = r2.z;
    e.phase += dt * 8;
    const swing = Math.sin(e.phase) * 0.5;
    e.mesh.userData.legs[0].rotation.x = swing;
    e.mesh.userData.legs[1].rotation.x = -swing;
    e.mesh.position.set(e.x, 0, e.z);
    e.mesh.rotation.y = e.heading;
    if (S.state === 'playing' && d < 45) {
      e.shootTimer -= dt;
      if (e.shootTimer <= 0) {
        e.shootTimer = 1.1 + S.rng.next() * 0.9;
        // Inaccurate on purpose: roughly one shot in three lands.
        if (S.rng.next() < 0.34) {
          p.health -= 7;
          S.shake = 0.25;
          S.audio?.gunshot();
          S.flashDamage?.();
        } else {
          S.audio?.gunshot();
        }
      }
    }
    if (p.health <= 0 && S.state === 'playing') { S.state = 'wasted'; S.endReason = 'wasted'; }
  }
  // Pickups: spin, bob, and collect on touch.
  for (const pk of [...S.pickups]) {
    pk.spin += dt * 3;
    pk.mesh.rotation.y = pk.spin;
    pk.mesh.position.y = 0.6 + Math.sin(S.time * 3 + pk.spin) * 0.15;
    const inCar = p.inCar && p.car;
    const px = inCar ? p.car.x : p.pos.x;
    const pz = inCar ? p.car.z : p.pos.z;
    if (dist2d(pk.x, pk.z, px, pz) < 2.2) {
      if (pk.kind === 'cash') { p.money += pk.amount; S.toast(`+$${pk.amount}`); }
      else if (pk.kind === 'health') { p.health = Math.min(100, p.health + pk.amount); S.toast(`+${pk.amount} health`); }
      else if (pk.kind === 'token') { p.money += pk.amount; S.toast(`Solmar token +$${pk.amount}`); }
      S.audio?.jingle(880);
      S.scene.remove(pk.mesh);
      S.pickups = S.pickups.filter((q) => q !== pk);
    }
  }
  // Tracer fade-out and muzzle-light decay.
  for (const t of [...S.tracers]) {
    t.life -= dt;
    t.line.material.opacity = Math.max(0, t.life / 0.09) * 0.9;
    if (t.life <= 0) { S.scene.remove(t.line); S.tracers = S.tracers.filter((q) => q !== t); }
  }
  if (S.muzzleLight) S.muzzleLight.intensity = Math.max(0, S.muzzleLight.intensity - dt * 60);
  if (p.shootCooldown > 0) p.shootCooldown -= dt;
  if (S.shotsFiredRecently > 0) S.shotsFiredRecently -= dt;
}

// Missions set the objective line; keep the helper here so combat and
// missions share one setter.
export function setObjective(S, text) {
  S.objective = text;
  const el = document.getElementById('objective');
  if (el) el.textContent = text;
}
