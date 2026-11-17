// Solmar Heat — police and the wanted system: wanted 0–5, foot cops who
// chase, punch and (at 3 stars or more) shoot, patrol cars that ram, a three
// second arrest at 1–2 stars that ends busted, and wanted decay after nine
// seconds unseen. Foot cops spawn on road intersections near the player —
// never on the player's own intersection, never inside a building.
import * as THREE from 'three';
import { GRID_STEP, GRID_MIN, GRID_MAX, clamp, dist2d } from './utils.js';
import { resolveColliders, clampToWorld } from './city.js';
import { spawnPoliceCar } from './vehicles.js';

function makeCopMesh() {
  const g = new THREE.Group();
  const navy = new THREE.MeshStandardMaterial({ color: 0x1a2a5e, roughness: 0.85 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.95, 0.42), navy);
  torso.position.y = 1.2;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), new THREE.MeshStandardMaterial({ color: 0xc98e6a, roughness: 0.8 }));
  head.position.y = 1.95;
  g.add(head);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.33, 0.12, 10), new THREE.MeshStandardMaterial({ color: 0x101838, roughness: 0.7 }));
  cap.position.y = 2.18;
  g.add(cap);
  const legMat = new THREE.MeshStandardMaterial({ color: 0x141c3a, roughness: 0.9 });
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
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.75, 0.2), navy);
    arm.geometry.translate(0, -0.28, 0);
    arm.position.set(ax, 1.55, 0);
    g.add(arm);
    arms.push(arm);
  }
  g.userData.legs = legs; g.userData.arms = arms;
  return g;
}

// A spawn intersection near the player: 20–40 units away, snapped to the grid,
// and never the intersection the player is standing on.
function spawnPointNear(S) {
  const px = S.player.pos.x, pz = S.player.pos.z;
  const playerIx = Math.round(px / GRID_STEP) * GRID_STEP;
  const playerIz = Math.round(pz / GRID_STEP) * GRID_STEP;
  for (let tries = 0; tries < 12; tries++) {
    const ix = Math.round((px + S.rng.range(-40, 40)) / GRID_STEP) * GRID_STEP;
    const iz = Math.round((pz + S.rng.range(-40, 40)) / GRID_STEP) * GRID_STEP;
    const d = dist2d(ix, iz, px, pz);
    if (d < 18 || d > 45) continue;
    if (ix === playerIx && iz === playerIz) continue;
    if (ix < GRID_MIN || ix > GRID_MAX || iz < GRID_MIN || iz > GRID_MAX) continue;
    return { x: ix, z: iz };
  }
  return { x: playerIx + 40, z: playerIz };
}

export function spawnFootCop(S) {
  const spot = spawnPointNear(S);
  const mesh = makeCopMesh();
  mesh.position.set(spot.x, 0, spot.z);
  S.scene.add(mesh);
  const cop = { mesh, x: spot.x, z: spot.z, heading: 0, arrestTimer: 0, shootTimer: 0, phase: S.rng.next() * 6, state: 'chase' };
  S.cops.push(cop);
  return cop;
}

// How many cops and cars the wanted level calls for.
function desiredForce(wanted) {
  if (wanted <= 0) return { cops: 0, cars: 0 };
  if (wanted === 1) return { cops: 2, cars: 0 };
  if (wanted === 2) return { cops: 3, cars: 0 };
  if (wanted === 3) return { cops: 4, cars: 1 };
  if (wanted === 4) return { cops: 5, cars: 2 };
  return { cops: 6, cars: 3 };
}

export function updatePolice(S, dt) {
  const p = S.player;
  // A staged shot keeps exactly the force it was staged with: no rebalancing.
  if (!S.shot) {
    const want = desiredForce(S.wanted);
    while (S.cops.length < want.cops) spawnFootCop(S);
    while (S.cops.length > want.cops) {
      const cop = S.cops.pop();
      S.scene.remove(cop.mesh);
    }
    while (S.policeCars.length < want.cars) {
      const spot = spawnPointNear(S);
      spawnPoliceCar(S, spot.x, spot.z);
    }
    while (S.policeCars.length > want.cars) {
      const car = S.policeCars.pop();
      S.scene.remove(car.mesh);
    }
  }

  // A cop "sees" the player within 45 units; unseen time decays the wanted level.
  const anyNear = S.cops.some((c) => dist2d(c.x, c.z, p.pos.x, p.pos.z) < 45) || S.policeCars.some((c) => dist2d(c.x, c.z, p.pos.x, p.pos.z) < 50);
  if (anyNear) { S.unseenTimer = 0; S.lastSeenAt = S.time; }
  else S.unseenTimer = (S.unseenTimer || 0) + dt;
  if (S.wanted > 0 && S.unseenTimer > 9) {
    S.wanted = 0;
    S.unseenTimer = 0;
    S.toast('You lost them — wanted level cleared');
    S.audio?.jingle(520);
  }

  for (const cop of S.cops) {
    const d = dist2d(cop.x, cop.z, p.pos.x, p.pos.z);
    const wantHeading = Math.atan2(p.pos.x - cop.x, p.pos.z - cop.z);
    let diff = wantHeading - cop.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    cop.heading += clamp(diff, -3 * dt, 3 * dt);
    const speed = S.wanted >= 3 ? 5.2 : 4.4;
    if (d > 1.6) {
      const nx = cop.x + Math.sin(cop.heading) * speed * dt;
      const nz = cop.z + Math.cos(cop.heading) * speed * dt;
      const r1 = resolveColliders(S, nx, cop.z, 0.6);
      cop.x = r1.x;
      const r2 = resolveColliders(S, cop.x, nz, 0.6);
      cop.z = r2.z;
      const cl = clampToWorld(cop.x, cop.z);
      cop.x = cl.x; cop.z = cl.z;
    }
    cop.phase += dt * 8;
    const swing = Math.sin(cop.phase) * 0.5;
    cop.mesh.userData.legs[0].rotation.x = swing;
    cop.mesh.userData.legs[1].rotation.x = -swing;
    cop.mesh.userData.arms[0].rotation.x = -swing * 0.7;
    cop.mesh.userData.arms[1].rotation.x = swing * 0.7;
    cop.mesh.position.set(cop.x, 0, cop.z);
    cop.mesh.rotation.y = cop.heading;

    if (S.state !== 'playing') continue;
    if (S.wanted >= 3 && d < 40 && d > 6) {
      // Foot cops shoot at 3 stars and up, with a slow, dodgeable cadence.
      cop.shootTimer -= dt;
      if (cop.shootTimer <= 0) {
        cop.shootTimer = 1.6 + S.rng.next() * 0.8;
        if (S.rng.next() < 0.35) {
          p.health -= 6;
          S.shake = 0.3;
          S.audio?.gunshot();
          S.flashDamage?.();
        }
      }
    }
    if (d < 2) {
      if (S.wanted <= 2) {
        // Arrest: a cop on top of the player for three seconds ends it busted.
        cop.arrestTimer += dt;
        if (cop.arrestTimer > 0.5 && cop.arrestTimer < 0.6) S.toast('A cop is arresting you — run!');
        if (cop.arrestTimer >= 3) {
          S.state = 'busted';
          S.endReason = 'busted';
          return;
        }
      } else {
        // At high wanted they punch instead of arresting.
        cop.arrestTimer = 0;
        p.health -= 12 * dt;
        S.flashDamage?.();
      }
    } else {
      cop.arrestTimer = 0;
    }
  }
  if (p.health <= 0 && S.state === 'playing') {
    S.state = 'wasted';
    S.endReason = 'wasted';
  }
}

// Crimes feed the wanted level: shooting a cop or a ped, stealing in view,
// or killing a gang member in the open.
export function raiseWanted(S, amount) {
  S.wanted = Math.min(5, S.wanted + amount);
  S.unseenTimer = 0;
}
