// Solmar Heat — vehicles: box cars with body, cabin, wheels and lights, a
// police variant with a flashing light bar and a sport variant with a spoiler.
// Spawns 24 traffic cars plus parked cars, drives the player car with arcade
// physics, and runs police pursuit. Traffic stays on the road grid and turns
// at intersections, so it never collides with buildings.
import * as THREE from 'three';
import { GRID_STEP, GRID_MIN, GRID_MAX, clamp, dist2d, makeRng, angleDiff } from './utils.js';
import { resolveColliders, clampToWorld } from './city.js';

const CAR_COLORS = [0x3a6ab8, 0xb83a3a, 0x3a8a4a, 0xc9c9c9, 0x222226, 0xd8a83a, 0x7a3ab8, 0x3a9a9a];

// A low-poly car: body, cabin, four wheels, headlights and taillights.
// opts: { color, police, sport, topSpeed }
export function makeCarMesh(color, opts = {}) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: opts.police ? 0xe8e8e8 : color, roughness: 0.35, metalness: 0.5 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2, 0.7, 4.4), bodyMat);
  body.position.y = 0.55;
  g.add(body);
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.7, 0.6, 2.2),
    new THREE.MeshStandardMaterial({ color: 0x18202c, roughness: 0.15, metalness: 0.6 }),
  );
  cabin.position.set(0, 1.15, -0.2);
  g.add(cabin);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 10);
  wheelGeo.rotateZ(Math.PI / 2);
  for (const [wx, wz] of [[-1, 1.4], [1, 1.4], [-1, -1.4], [1, -1.4]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.position.set(wx, 0.38, wz);
    g.add(w);
  }
  const headMat = new THREE.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xffedb0, emissiveIntensity: 1.2 });
  for (const hx of [-0.6, 0.6]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.1), headMat);
    h.position.set(hx, 0.6, 2.21);
    g.add(h);
  }
  const tailMat = new THREE.MeshStandardMaterial({ color: 0xd21f2b, emissive: 0xa01018, emissiveIntensity: 1 });
  for (const tx of [-0.6, 0.6]) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.1), tailMat);
    t.position.set(tx, 0.6, -2.21);
    g.add(t);
  }
  if (opts.police) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.25, 0.5), new THREE.MeshStandardMaterial({ color: 0x111111 }));
    bar.position.set(0, 1.6, -0.2);
    g.add(bar);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.22, 0.4), new THREE.MeshStandardMaterial({ color: 0xff2020, emissive: 0xff2020, emissiveIntensity: 2 }));
    red.position.set(-0.35, 1.62, -0.2);
    g.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.22, 0.4), new THREE.MeshStandardMaterial({ color: 0x2040ff, emissive: 0x2040ff, emissiveIntensity: 2 }));
    blue.position.set(0.35, 1.62, -0.2);
    g.add(blue);
    g.userData.barRed = red; g.userData.barBlue = blue;
  }
  if (opts.sport) {
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.08, 0.4), new THREE.MeshStandardMaterial({ color: 0x181818, roughness: 0.3, metalness: 0.6 }));
    spoiler.position.set(0, 1.15, -2.1);
    g.add(spoiler);
  }
  g.userData.opts = opts;
  return g;
}

// One traffic car: { mesh, axis, line, along, dir, speed, color }
export function spawnTraffic(S) {
  const rng = makeRng(S.seed + 7);
  S.traffic = [];
  S.parked = [];
  const lines = [];
  for (let v = GRID_MIN; v <= GRID_MAX; v += GRID_STEP) lines.push(v);
  for (let i = 0; i < 24; i++) {
    const axis = rng.next() < 0.5 ? 'x' : 'z';
    const line = rng.pick(lines);
    const along = rng.range(GRID_MIN, GRID_MAX);
    const dir = rng.next() < 0.5 ? 1 : -1;
    const color = rng.pick(CAR_COLORS);
    const mesh = makeCarMesh(color);
    mesh.position.set(axis === 'x' ? along : line + (dir > 0 ? 2.5 : -2.5), 0, axis === 'x' ? line + (dir > 0 ? 2.5 : -2.5) : along);
    S.scene.add(mesh);
    S.traffic.push({ mesh, axis, line, along, dir, speed: rng.range(8, 14), color, stopped: 0 });
  }
  // Parked cars at fixed sidewalk spots, including the red Comet GT for mission 2.
  const parkedSpots = [
    { x: -120, z: -104, color: 0xd21f2b, sport: true, name: 'Comet GT' },
    { x: 40, z: -76, color: 0x3a6ab8 },
    { x: -40, z: 44, color: 0xc9c9c9 },
    { x: 120, z: -36, color: 0x3a8a4a },
    { x: -80, z: 124, color: 0xd8a83a },
    { x: 80, z: 84, color: 0x222226 },
    { x: 160, z: 44, color: 0x7a3ab8 },
    { x: -160, z: -36, color: 0x3a9a9a },
  ];
  for (const s of parkedSpots) {
    const mesh = makeCarMesh(s.color, { sport: !!s.sport });
    mesh.position.set(s.x, 0, s.z);
    mesh.rotation.y = rng.next() * Math.PI * 2;
    S.scene.add(mesh);
    S.parked.push({ mesh, x: s.x, z: s.z, color: s.color, sport: !!s.sport, name: s.name || 'car', stolen: false, speed: 0, heading: mesh.rotation.y });
  }
  S.comet = S.parked[0];
}

// Traffic step: cruise along the road line, turn at intersections, brake for
// the car ahead. Movement is axis-separated so a car never clips a building.
export function updateTraffic(S, dt) {
  for (const car of S.traffic) {
    if (car.stopped > 0) { car.stopped -= dt; continue; }
    // Brake if another traffic car is just ahead on the same line.
    let blocked = false;
    for (const other of S.traffic) {
      if (other === car || other.axis !== car.axis || other.line !== car.line || other.dir !== car.dir) continue;
      const gap = (other.along - car.along) * car.dir;
      if (gap > 0 && gap < 9) { blocked = true; break; }
    }
    if (blocked) continue;
    // Landmarks sit on three intersections (Bank, Garage, Chop Shop): never
    // drive through one — turn off at the next intersection instead.
    const aheadX = car.axis === 'x' ? car.along + car.dir * 10 : car.line + (car.dir > 0 ? 2.5 : -2.5);
    const aheadZ = car.axis === 'x' ? car.line + (car.dir > 0 ? 2.5 : -2.5) : car.along + car.dir * 10;
    const blockedByLandmark = (S.landmarkBoxes || []).some((b) =>
      aheadX > b.x - b.hw - 4 && aheadX < b.x + b.hw + 4 && aheadZ > b.z - b.hd - 4 && aheadZ < b.z + b.hd + 4);
    if (blockedByLandmark) car.avoid = true;
    if (car.avoid) {
      // Too close with no turn taken: turn around rather than clip the wall.
      const cx = car.axis === 'x' ? car.along : car.line;
      const cz = car.axis === 'x' ? car.line : car.along;
      const nearBox = (S.landmarkBoxes || []).some((b) =>
        Math.abs(cx - b.x) < b.hw + 12 && Math.abs(cz - b.z) < b.hd + 12);
      if (nearBox && Math.abs(car.along - Math.round(car.along / GRID_STEP) * GRID_STEP) > 6) {
        car.dir *= -1;
        car.avoid = false;
      }
    }
    car.along += car.dir * car.speed * dt;
    if (car.along > GRID_MAX + 20) car.along = GRID_MIN - 20;
    if (car.along < GRID_MIN - 20) car.along = GRID_MAX + 20;
    // At an intersection, sometimes turn onto the crossing road — and always
    // turn when avoiding a landmark.
    const near = Math.abs(car.along - Math.round(car.along / GRID_STEP) * GRID_STEP);
    if (near < 0.4 && (S.rng.next() < 0.02 || car.avoid)) {
      const newLine = Math.round(car.along / GRID_STEP) * GRID_STEP;
      car.axis = car.axis === 'x' ? 'z' : 'x';
      car.line = newLine;
      car.along = car.line === newLine ? car.along : car.along;
      car.dir = S.rng.next() < 0.5 ? 1 : -1;
      car.avoid = false;
    }
    const x = car.axis === 'x' ? car.along : car.line + (car.dir > 0 ? 2.5 : -2.5);
    const z = car.axis === 'x' ? car.line + (car.dir > 0 ? 2.5 : -2.5) : car.along;
    car.mesh.position.set(x, 0, z);
    car.mesh.rotation.y = car.axis === 'x' ? (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (car.dir > 0 ? 0 : Math.PI);
  }
}

// Arcade driving for the car the player sits in: throttle, brake, steering
// proportional to speed, a little drift, and axis-separated collision so the
// car slides along walls instead of wedging on them.
export function drivePlayerCar(S, dt) {
  const car = S.player.car;
  if (!car) return;
  const input = S.input;
  // In a staged shot the car cruises at its staged speed: the shot holds
  // the throttle steady instead of accelerating to the top speed.
  const fwd = input.down('KeyW') || input.down('ArrowUp');
  const back = input.down('KeyS') || input.down('ArrowDown');
  const left = input.down('KeyA') || input.down('ArrowLeft');
  const right = input.down('KeyD') || input.down('ArrowRight');
  const top = car.topSpeed || 36;
  if (S.shot?.autodrive) car.speed = S.shot.autodriveSpeed;
  else if (fwd) car.speed = Math.min(top, car.speed + 26 * dt);
  else if (back) car.speed = Math.max(-12, car.speed - 30 * dt);
  else car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 14 * dt);
  const steer = (left ? 1 : 0) - (right ? 1 : 0);
  const steerAmount = steer * 1.9 * clamp(Math.abs(car.speed) / 12, 0, 1) * (car.speed >= 0 ? 1 : -1);
  car.heading += steerAmount * dt;
  // Drift: the car keeps a touch of its old sideways motion at speed.
  const nx = car.x + Math.sin(car.heading) * car.speed * dt;
  const nz = car.z + Math.cos(car.heading) * car.speed * dt;
  const r1 = resolveColliders(S, nx, car.z, 2.2);
  car.x = r1.x;
  const r2 = resolveColliders(S, car.x, nz, 2.2);
  car.z = r2.z;
  const cl = clampToWorld(car.x, car.z);
  car.x = cl.x; car.z = cl.z;
  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = car.heading;
  // The player rides in this car: keep his position on the car, so the
  // police, the missions and the debug readout all chase the right spot.
  S.player.pos.set(car.x, 0, car.z);
  // Light-bar flash on police cars, alternating with the clock.
  if (car.mesh.userData.barRed) {
    const on = Math.floor(S.time * 6) % 2 === 0;
    car.mesh.userData.barRed.material.emissiveIntensity = on ? 3 : 0.2;
    car.mesh.userData.barBlue.material.emissiveIntensity = on ? 0.2 : 3;
  }
  S.player.speed = Math.abs(car.speed);
}

// Police pursuit cars: spawn behind the player, steer toward him, ram gently,
// and slide along walls the same axis-separated way as the player car.
export function spawnPoliceCar(S, x, z) {
  const mesh = makeCarMesh(0xffffff, { police: true });
  mesh.position.set(x, 0, z);
  S.scene.add(mesh);
  const car = { mesh, x, z, heading: 0, speed: 0, topSpeed: 40, isPolice: true };
  S.policeCars.push(car);
  return car;
}

export function updatePoliceCars(S, dt) {
  const px = S.player.pos.x, pz = S.player.pos.z;
  // Each pursuit car trails a staggered slot behind the player — a lateral
  // offset and its own follow distance — so the pack reads as a chase, not
  // a single car stacked on itself.
  const pHeading = S.player.car ? S.player.car.heading : null;
  for (let i = 0; i < S.policeCars.length; i++) {
    const car = S.policeCars[i];
    const lateral = car.lateral ?? (i % 2 === 0 ? 3.5 : -3.5);
    const followDist = car.followDist ?? (6 + i * 3);
    car.lateral = lateral; car.followDist = followDist;
    let tx = px, tz = pz;
    if (pHeading !== null) {
      const fx = Math.sin(pHeading), fz = Math.cos(pHeading);
      tx = px - fx * followDist + (-fz) * lateral;
      tz = pz - fz * followDist + fx * lateral;
    } else {
      const d = Math.max(1, dist2d(car.x, car.z, px, pz));
      const dx = (px - car.x) / d, dz = (pz - car.z) / d;
      tx = px - dx * followDist + (-dz) * lateral;
      tz = pz - dz * followDist + dx * lateral;
    }
    const d = dist2d(car.x, car.z, tx, tz);
    const want = Math.atan2(tx - car.x, tz - car.z);
    car.heading += clamp(angleDiff(car.heading, want), -2.2 * dt, 2.2 * dt);
    const target = d > 10 ? 34 : 20;
    car.speed = Math.min(target, car.speed + 22 * dt);
    const nx = car.x + Math.sin(car.heading) * car.speed * dt;
    const nz = car.z + Math.cos(car.heading) * car.speed * dt;
    const r1 = resolveColliders(S, nx, car.z, 2.2);
    car.x = r1.x;
    const r2 = resolveColliders(S, car.x, nz, 2.2);
    car.z = r2.z;
    const cl = clampToWorld(car.x, car.z);
    car.x = cl.x; car.z = cl.z;
    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.heading;
    const on = Math.floor(S.time * 6) % 2 === 0;
    car.mesh.userData.barRed.material.emissiveIntensity = on ? 3 : 0.2;
    car.mesh.userData.barBlue.material.emissiveIntensity = on ? 0.2 : 3;
    // Ram: nudge the player's car and shake the camera a touch.
    if (S.player.car && dist2d(car.x, car.z, px, pz) < 4.5) {
      S.player.car.speed *= 0.94;
      S.shake = 0.25;
    }
  }
}
