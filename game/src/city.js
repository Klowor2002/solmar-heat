// Solmar Heat — the city: a 9x9 block grid at dusk, built from one seeded RNG
// so the skyline is identical on every run. Ground texture, buildings with lit
// windows, landmarks, beach and sea, hills, palms, lamps and drifting clouds.
// Exports buildCity(S), which fills S.colliders with building circles.
import * as THREE from 'three';
import { GRID_STEP, GRID_MIN, GRID_MAX, makeRng } from './utils.js';

// Paint the 420-unit ground: asphalt, road lines with dashes, crosswalks and
// pale sidewalk pads, all in one canvas so the renderer draws a single plane.
function groundTexture(rng) {
  const c = document.createElement('canvas');
  c.width = c.height = 1024;
  const g = c.getContext('2d');
  const px = (v) => ((v + 210) / 420) * 1024; // world -> canvas
  g.fillStyle = '#2e2a3e';
  g.fillRect(0, 0, 1024, 1024);
  // Block pads (sidewalks) first, roads drawn over them.
  for (let bx = GRID_MIN; bx <= GRID_MAX; bx += GRID_STEP) {
    for (let bz = GRID_MIN; bz <= GRID_MAX; bz += GRID_STEP) {
      g.fillStyle = '#4a4360';
      g.fillRect(px(bx - 15), px(bz - 15), px(30) - px(0), px(30) - px(0));
    }
  }
  // Roads: dark asphalt bands along every multiple-of-40 line — the same
  // lattice the traffic, the missions and the colliders use, so the painted
  // street always matches the street the cars drive on.
  g.fillStyle = '#262233';
  for (let v = -200; v <= 200; v += GRID_STEP) {
    g.fillRect(px(v - 5), 0, px(10) - px(0), 1024);
    g.fillRect(0, px(v - 5), 1024, px(10) - px(0));
  }
  // Centre dashes along each road, and crosswalk stripes at each intersection.
  g.fillStyle = '#c9a94a';
  for (let v = -200; v <= 200; v += GRID_STEP) {
    for (let u = -200; u <= 200; u += GRID_STEP) {
      if (((u - v) / GRID_STEP) % 2 === 0) continue;
      g.fillRect(px(v) - 2, px(u) - 8, 4, 16);
      g.fillRect(px(u) - 8, px(v) - 2, 16, 4);
    }
  }
  g.fillStyle = 'rgba(230,230,220,0.55)';
  for (let v = -200; v <= 200; v += GRID_STEP) {
    for (let w = -200; w <= 200; w += GRID_STEP) {
      for (let s = -1; s <= 1; s++) {
        g.fillRect(px(v + s * 3.4) - 2, px(w - 15), 4, 7);
        g.fillRect(px(v + s * 3.4) - 2, px(w + 8), 4, 7);
        g.fillRect(px(v - 15), px(w + s * 3.4) - 2, 7, 4);
        g.fillRect(px(v + 8), px(w + s * 3.4) - 2, 7, 4);
      }
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// A window grid texture whose repeat is matched to the building size, so the
// windows stay square whether the tower is 8 or 78 units tall.
function windowTexture(rng, w, h, litRatio) {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#2c2840';
  g.fillRect(0, 0, 64, 128);
  for (let y = 8; y < 120; y += 16) {
    for (let x = 6; x < 58; x += 14) {
      const lit = rng.next() < litRatio;
      g.fillStyle = lit ? '#ffb45e' : '#191624';
      g.fillRect(x, y, 9, 10);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(Math.max(1, Math.round(w / 14)), Math.max(1, Math.round(h / 16)));
  return tex;
}

function box(w, h, d, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

export function buildCity(S) {
  const rng = makeRng(S.seed);
  const scene = S.scene;
  S.colliders = [];
  S.buildings = [];

  // --- sky, sun, lights -------------------------------------------------
  const dusk = S.palette !== 'golden';
  scene.background = new THREE.Color(dusk ? 0x2a1e4f : 0xf7b98a);
  scene.fog = new THREE.Fog(dusk ? 0x2a1e4f : 0xf7b98a, 260, 620);
  scene.add(new THREE.AmbientLight(dusk ? 0x8a7bd8 : 0xffe0b8, dusk ? 0.55 : 0.75));
  const hemi = new THREE.HemisphereLight(dusk ? 0x6a5acd : 0xffd9a0, 0x1a1426, 0.5);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(dusk ? 0xff8c42 : 0xffe9c4, dusk ? 1.1 : 1.4);
  sun.position.set(dusk ? -140 : 120, dusk ? 55 : 190, dusk ? -60 : 40);
  scene.add(sun);
  S.sun = sun;

  // --- ground ------------------------------------------------------------
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(420, 420),
    new THREE.MeshStandardMaterial({ map: groundTexture(rng), roughness: 0.95, metalness: 0 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = false;
  scene.add(ground);

  // --- buildings ---------------------------------------------------------
  const downtown = (x, z) => Math.max(Math.abs(x), Math.abs(z)) <= 60;
  for (let bx = GRID_MIN; bx <= GRID_MAX; bx += GRID_STEP) {
    for (let bz = GRID_MIN; bz <= GRID_MAX; bz += GRID_STEP) {
      if ((bx === 0 && bz === 0) || (bx === 60 && bz === -60) || (bx === -120 && bz === -120) || (bx === -160 && bz === 160)) continue;
      const count = rng.next() < 0.45 ? 2 : 1;
      for (let i = 0; i < count; i++) {
        const w = rng.range(12, 20), d = rng.range(12, 20);
        const h = downtown(bx, bz) ? rng.range(22, 52) : rng.range(8, 22);
        const ox = count === 1 ? rng.range(-5, 5) : (i === 0 ? -7 : 7) + rng.range(-2, 2);
        const oz = count === 1 ? rng.range(-5, 5) : rng.range(-4, 4);
        const x = bx + ox, z = bz + oz;
        const winTex = windowTexture(rng, w, h, dusk ? 0.55 : 0.3);
        const mat = new THREE.MeshStandardMaterial({
          map: winTex, roughness: 0.85, metalness: 0.05,
          // Lit windows glow at dusk — but only where the texture has a lit
          // window: the same canvas is the emissive map, so the walls stay
          // dark instead of washing out to flat tan.
          emissive: 0xffffff, emissiveMap: winTex, emissiveIntensity: dusk ? 0.85 : 0,
        });
        const b = box(w, h, d, mat, x, h / 2, z);
        scene.add(b);
        S.buildings.push(b);
        // Box collider: a building's walls stop at its faces, never past
        // them, so a road beside it stays open (a circle collider's corners
        // overreach and pinch the street shut).
        S.colliders.push({ x, z, hw: w / 2, hd: d / 2 });
      }
    }
  }

  // --- landmarks ---------------------------------------------------------
  const towerTex = windowTexture(rng, 24, 78, 0.7);
  const towerMat = new THREE.MeshStandardMaterial({ map: towerTex, emissive: 0xffffff, emissiveMap: towerTex, emissiveIntensity: dusk ? 0.85 : 0, roughness: 0.8 });
  const tower = box(24, 78, 24, towerMat, 60, 39, -60);
  scene.add(tower);
  S.colliders.push({ x: 60, z: -60, hw: 12, hd: 12 });
  S.landmarkBoxes = [{ x: 60, z: -60, hw: 12, hd: 12 }];
  const spire = new THREE.Mesh(new THREE.ConeGeometry(3, 14, 8), new THREE.MeshStandardMaterial({ color: 0xd21f2b, emissive: 0x8a0f16, emissiveIntensity: 0.6 }));
  spire.position.set(60, 85, -60);
  scene.add(spire);
  S.tower = tower;

  // Mona's Garage: low wide block with a warm awning strip.
  const garage = box(26, 9, 18, new THREE.MeshStandardMaterial({ color: 0x7a4a2b, roughness: 0.9 }), -120, 4.5, -120);
  scene.add(garage);
  const awning = box(27, 1, 6, new THREE.MeshStandardMaterial({ color: 0xffb45e, emissive: 0xff9a2a, emissiveIntensity: 0.7 }), -120, 6.5, -109);
  scene.add(awning);
  S.colliders.push({ x: -120, z: -120, hw: 13, hd: 9 });
  S.landmarkBoxes.push({ x: -120, z: -120, hw: 13, hd: 9 });

  // Solmar Bank at the centre: pale stone with columns out front.
  const bank = box(28, 16, 20, new THREE.MeshStandardMaterial({ color: 0xcfc4a8, roughness: 0.85 }), 0, 8, 0);
  scene.add(bank);
  const colMat = new THREE.MeshStandardMaterial({ color: 0xe8e0c8, roughness: 0.8 });
  for (let i = -2; i <= 2; i++) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 12, 10), colMat);
    col.position.set(i * 5, 6, 12);
    scene.add(col);
  }
  S.colliders.push({ x: 0, z: 0, hw: 14, hd: 10 });
  S.landmarkBoxes.push({ x: 0, z: 0, hw: 14, hd: 10 });

  // Chop Shop: dark shed with a neon sign bar.
  const chop = box(24, 8, 16, new THREE.MeshStandardMaterial({ color: 0x2e2a33, roughness: 0.9 }), -160, 4, 160);
  scene.add(chop);
  const neon = box(20, 1.2, 0.6, new THREE.MeshStandardMaterial({ color: 0x00e5ff, emissive: 0x00c8e0, emissiveIntensity: 1.4 }), -160, 8.5, 151);
  scene.add(neon);
  S.colliders.push({ x: -160, z: 160, hw: 12, hd: 8 });
  S.landmarkBoxes.push({ x: -160, z: 160, hw: 12, hd: 8 });

  // Hotel Palm on the beach road.
  const hotelTex = windowTexture(rng, 22, 26, 0.6);
  const hotel = box(22, 26, 16, new THREE.MeshStandardMaterial({ map: hotelTex, emissive: 0xffffff, emissiveMap: hotelTex, emissiveIntensity: dusk ? 0.8 : 0, roughness: 0.85 }), 60, 13, 216);
  scene.add(hotel);
  S.colliders.push({ x: 60, z: 216, hw: 11, hd: 8 });
  S.landmarkBoxes.push({ x: 60, z: 216, hw: 11, hd: 8 });

  // --- beach, sea, hills -------------------------------------------------
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(420, 30), new THREE.MeshStandardMaterial({ color: 0xd9b380, roughness: 1 }));
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.05, 220);
  scene.add(sand);
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(900, 300),
    new THREE.MeshStandardMaterial({ color: dusk ? 0x1a3a5e : 0x2a6a8a, roughness: 0.25, metalness: 0.35 }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, 0.02, 385);
  scene.add(sea);
  // Pier reaching into the sea at x 120.
  const pier = box(8, 1, 70, new THREE.MeshStandardMaterial({ color: 0x6a4a2e, roughness: 1 }), 120, 0.6, 265);
  scene.add(pier);
  for (let z = 240; z <= 296; z += 14) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 3, 6), new THREE.MeshStandardMaterial({ color: 0x4a3220 }));
    post.position.set(116, 0.5, z);
    scene.add(post);
    const post2 = post.clone(); post2.position.x = 124; scene.add(post2);
  }
  // Green hills north of the grid.
  const hillMat = new THREE.MeshStandardMaterial({ color: dusk ? 0x1e3a24 : 0x3a6a3a, roughness: 1 });
  for (let i = 0; i < 9; i++) {
    const hill = new THREE.Mesh(new THREE.ConeGeometry(rng.range(28, 48), rng.range(18, 38), 7), hillMat);
    hill.position.set(-200 + i * 50 + rng.range(-8, 8), 0, -245 + rng.range(-12, 12));
    scene.add(hill);
  }

  // --- palms and lamps ----------------------------------------------------
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8a6a45, roughness: 1 });
  const frondMat = new THREE.MeshStandardMaterial({ color: dusk ? 0x2a7a3a : 0x2a7a3a, roughness: 0.9 });
  const lampMat = new THREE.MeshStandardMaterial({ color: 0x333340, roughness: 0.6, metalness: 0.4 });
  const bulbMat = new THREE.MeshStandardMaterial({ color: 0xffe9a8, emissive: 0xffc85e, emissiveIntensity: 1.6 });
  for (let bx = GRID_MIN; bx <= GRID_MAX; bx += GRID_STEP) {
    for (let bz = GRID_MIN; bz <= GRID_MAX; bz += GRID_STEP) {
      if (rng.next() < 0.5) {
        // Palms sit on the sidewalk pads, a few units in from the road edge,
        // so they frame the street instead of standing in it.
        const px = bx + (rng.next() < 0.5 ? -10 : 10), pz = bz + rng.range(-10, 10);
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 7, 6), trunkMat);
        trunk.position.set(px, 3.5, pz);
        scene.add(trunk);
        const crown = new THREE.Mesh(new THREE.ConeGeometry(2.6, 3, 7), frondMat);
        crown.position.set(px, 8, pz);
        scene.add(crown);
      }
      if ((bx + bz) % 80 === 0) {
        const lx = bx + 7, lz = bz + 7;
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 6, 6), lampMat);
        pole.position.set(lx, 3, lz);
        scene.add(pole);
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), bulbMat);
        bulb.position.set(lx, 6.2, lz);
        scene.add(bulb);
      }
    }
  }

  // --- clouds -------------------------------------------------------------
  S.clouds = [];
  const cloudMat = new THREE.MeshStandardMaterial({ color: dusk ? 0x8a7ab8 : 0xfff2e0, roughness: 1, transparent: true, opacity: 0.85 });
  for (let i = 0; i < 10; i++) {
    const cloud = new THREE.Group();
    for (let j = 0; j < 3; j++) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(rng.range(6, 12), 8, 6), cloudMat);
      puff.position.set(j * 8 - 8, rng.range(-1, 1), rng.range(-3, 3));
      puff.scale.y = 0.45;
      cloud.add(puff);
    }
    cloud.position.set(rng.range(-200, 200), rng.range(70, 110), rng.range(-200, 200));
    scene.add(cloud);
    S.clouds.push(cloud);
  }
}

// Push a circle out of every building box; returns true if it hit one.
// Circle-vs-box: the closest point on the box to the circle centre decides
// the push direction, so a walker or car slides along a flat wall instead of
// catching on a corner. Callers move one axis at a time for the same reason.
export function resolveColliders(S, x, z, r) {
  let hit = false;
  for (const c of S.colliders) {
    const cx = Math.max(c.x - c.hw, Math.min(x, c.x + c.hw));
    const cz = Math.max(c.z - c.hd, Math.min(z, c.z + c.hd));
    const dx = x - cx, dz = z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= r * r) continue;
    hit = true;
    if (d2 > 0.0001) {
      const d = Math.sqrt(d2);
      const push = (r - d) / d;
      x += dx * push; z += dz * push;
    } else {
      // Centre inside the box: push out along the shallowest axis.
      const px = c.hw + r - Math.abs(x - c.x);
      const pz = c.hd + r - Math.abs(z - c.z);
      if (px < pz) x += (x >= c.x ? px : -px);
      else z += (z >= c.z ? pz : -pz);
    }
  }
  return { x, z, hit };
}

// Keep a point inside the playable bounds (city plus beach, never the sea).
export function clampToWorld(x, z) {
  return { x: Math.max(-205, Math.min(205, x)), z: Math.max(-205, Math.min(232, z)) };
}
