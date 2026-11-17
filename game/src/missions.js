// Solmar Heat — the story: six missions in order, plus courier runs, a
// street race, ten hidden Solmar tokens and the hospital health pack. Every
// mission marker sits on a road intersection (coordinates that are multiples
// of forty), so it is never inside a building. The marker is a golden
// octahedron floating above a translucent beam.
import * as THREE from 'three';
import { dist2d } from './utils.js';
import { spawnGang, dropPickup, setObjective } from './combat.js';

// The six jobs, in story order: target, payout and the line Mona gives Jax.
export const MISSIONS = [
  { name: 'First Pickup', text: 'Go to the Old Town alley, Mona has work', target: { x: -40, z: 120 }, pay: 200 },
  { name: 'Hot Wheels', text: 'Steal the red Comet GT and deliver it to the Chop Shop', target: { x: -120, z: -104 }, pay: 350 },
  { name: 'Vulture Trouble', text: 'Clear out the Vultures, 0 of 4', target: { x: -40, z: 132 }, pay: 500 },
  { name: 'The Getaway', text: 'The Getaway — reach the safehouse before the timer runs out', target: { x: 120, z: -120 }, pay: 600 },
  { name: 'Dockside Deal', text: 'Survive the ambush at the docks', target: { x: 120, z: 200 }, pay: 800 },
  { name: 'The Big Score', text: 'Grab the three bank bags and get clear', target: { x: 0, z: 0 }, pay: 1500 },
];

// Ten token spots, all on safe open ground — the beach and the pier included.
export const TOKEN_SPOTS = [
  { x: 120, z: 220 }, { x: 120, z: 290 }, { x: -160, z: 220 }, { x: 0, z: 220 },
  { x: 200, z: 0 }, { x: -200, z: -40 }, { x: 80, z: -160 }, { x: -80, z: 80 },
  { x: 160, z: -200 }, { x: -40, z: -200 },
];

export function buildMissions(S) {
  // The golden marker: an octahedron diamond bobbing over a light beam.
  const diamond = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.85),
    new THREE.MeshStandardMaterial({ color: 0xffd24a, emissive: 0xcc9010, emissiveIntensity: 1.2, roughness: 0.3, metalness: 0.4 }),
  );
  diamond.position.y = 6;
  S.scene.add(diamond);
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(1.5, 1.5, 26, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd24a, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }),
  );
  beam.position.y = 13;
  S.scene.add(beam);
  S.marker = { diamond, beam };
  S.marker.visible = false;

  S.mission = { index: 0, stage: 'idle', target: null, timer: 0, killed: 0, wave: 0, waveKilled: 0, bags: 0 };
  S.courier = { active: false, target: null, timer: 0 };
  S.race = { active: false, checkpoint: 0, timer: 0 };
  S.tokens = [];
  for (const spot of TOKEN_SPOTS) {
    const mesh = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.6),
      new THREE.MeshStandardMaterial({ color: 0xffd24a, emissive: 0xcc9010, emissiveIntensity: 1.4, roughness: 0.3 }),
    );
    mesh.position.set(spot.x, 1.2, spot.z);
    S.scene.add(mesh);
    S.tokens.push({ ...spot, mesh, taken: false });
  }
  // Hospital health pack, respawning every thirty seconds.
  S.hospital = { x: 80, z: 120, timer: 0, mesh: null };
  const pack = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 0.9, 0.9),
    new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xff5a5a, emissiveIntensity: 0.5 }),
  );
  pack.position.set(80, 0.7, 120);
  S.scene.add(pack);
  S.hospital.mesh = pack;
}

// M: start the next story mission (or the next stage of the current one).
export function startMission(S) {
  const m = S.mission;
  if (m.index >= 6) { S.toast('Story complete — free roam, press T for courier work'); return; }
  const def = MISSIONS[m.index];
  m.stage = m.index === 1 ? 'steal' : m.index === 2 ? 'kill' : m.index === 3 ? 'escape' : m.index === 4 ? 'waves' : m.index === 5 ? 'bags' : 'go';
  m.target = { ...def.target };
  m.timer = m.index === 3 ? 90 : 0;
  m.killed = 0; m.wave = 0; m.waveKilled = 0; m.bags = 0;
  setObjective(S, def.text);
  S.toast(`Mission ${m.index + 1}: ${def.name}`);
  S.audio?.jingle(660);
  if (m.index === 2) {
    // The alley shootout: four Vultures closing in from the south side.
    for (const [gx, gz] of [[-40, 132], [-36, 136], [-44, 136], [-40, 140]]) spawnGang(S, gx, gz);
  }
  if (m.index === 3) {
    S.wanted = Math.max(S.wanted, 3);
  }
  if (m.index === 4) {
    startWave(S, 1);
  }
  if (m.index === 5) {
    // The three bank bags wait just outside the bank's walls (the marker
    // floats above the bank itself, but the bags are on the plaza).
    for (const [bx, bz] of [[-17, 0], [17, 0], [0, 13]]) dropPickup(S, 'cash', bx, bz, 0);
    S.mission.bagsTotal = 3;
  }
  showMarker(S, m.target.x, m.target.z);
}

function startWave(S, wave) {
  S.mission.wave = wave;
  S.mission.waveKilled = 0;
  for (let i = 0; i < 3; i++) {
    spawnGang(S, 120 + (i - 1) * 8, 200 + (i % 2) * 6);
  }
  setObjective(S, `Dockside Deal — survive wave ${wave} of 2`);
}

export function showMarker(S, x, z) {
  S.marker.diamond.position.set(x, 6, z);
  S.marker.beam.position.set(x, 13, z);
  S.marker.visible = true;
  S.marker.diamond.visible = true;
  S.marker.beam.visible = true;
}
export function hideMarker(S) { S.marker.visible = false; S.marker.diamond.visible = false; S.marker.beam.visible = false; }

// Pay out and advance the story; mission six ends the game with the banner.
export function completeMission(S) {
  const def = MISSIONS[S.mission.index];
  S.player.money += def.pay;
  S.toast(`Mission complete — +$${def.pay}`);
  S.audio?.jingle(880);
  S.missionsDone = (S.missionsDone || 0) + 1;
  S.mission.index += 1;
  S.mission.stage = 'idle';
  S.mission.target = null;
  hideMarker(S);
  if (S.mission.index >= 6) {
    setObjective(S, 'Story complete — Solmar is yours. Free roam!');
    S.state = 'end';
    S.endReason = 'story';
    S.banner('SOLMAR HEAT', 'You pulled off the Big Score. The city is yours.');
  } else {
    setObjective(S, `Press M for the next job: ${MISSIONS[S.mission.index].name}`);
  }
  S.saveGame?.();
}

export function updateMissions(S, dt) {
  const m = S.mission;
  const p = S.player;
  const px = p.inCar && p.car ? p.car.x : p.pos.x;
  const pz = p.inCar && p.car ? p.car.z : p.pos.z;
  // Marker bob and spin.
  if (S.marker.visible) {
    S.marker.diamond.rotation.y += dt * 1.5;
    S.marker.diamond.position.y = 6 + Math.sin(S.time * 2) * 0.5;
  }
  if (m.target) {
    const d = dist2d(px, pz, m.target.x, m.target.z);
    if (m.index === 0 && m.stage === 'go' && d < 4) {
      dropPickup(S, 'cash', m.target.x, m.target.z, 0);
      completeMission(S);
    } else if (m.index === 1 && m.stage === 'deliver' && p.inCar && p.car && p.car.mesh === S.comet.mesh && d < 6) {
      completeMission(S);
    } else if (m.index === 3 && m.stage === 'escape') {
      m.timer -= dt;
      setObjective(S, `The Getaway — stay clear for ${Math.max(0, Math.ceil(m.timer))}s`);
      if (m.timer <= 0) completeMission(S);
      if (S.wanted === 0 && m.timer > 0) { /* still counts down only on the clock */ }
    } else if (m.index === 4 && m.stage === 'waves') {
      if (m.wave === 1 && m.waveKilled >= 3) startWave(S, 2);
      else if (m.wave === 2 && m.waveKilled >= 3) completeMission(S);
    } else if (m.index === 5 && m.stage === 'bags') {
      // Bank bags are the cash pickups around the bank; count them as collected.
      const bagsLeft = S.pickups.filter((pk) => pk.kind === 'cash' && dist2d(pk.x, pk.z, 0, 0) < 20).length;
      const got = 3 - bagsLeft;
      if (got !== m.bags) { m.bags = got; setObjective(S, `The Big Score — bags ${got} of 3`); }
      if (bagsLeft === 0 && S.wanted >= 4) completeMission(S);
      else if (bagsLeft === 0 && S.wanted < 4) {
        S.wanted = 4;
        setObjective(S, 'The Big Score — lose the heat and get clear!');
        hideMarker(S);
        showMarker(S, 120, -120);
        m.target = { x: 120, z: -120 };
        m.stage = 'flee';
      }
    } else if (m.index === 5 && m.stage === 'flee' && d < 5) {
      completeMission(S);
    }
  }

  // Courier runs: T after mission one, seventy-five seconds, eighty dollars.
  if (S.courier.active) {
    S.courier.timer -= dt;
    const d = dist2d(px, pz, S.courier.target.x, S.courier.target.z);
    setObjective(S, `Courier — deliver in ${Math.max(0, Math.ceil(S.courier.timer))}s`);
    if (d < 4) {
      S.courier.active = false;
      p.money += 80;
      S.toast('Courier delivered — +$80');
      S.audio?.jingle(880);
      hideMarker(S);
      setObjective(S, 'Free roam — press M for the next job');
    } else if (S.courier.timer <= 0) {
      S.courier.active = false;
      S.toast('Courier failed — too slow');
      hideMarker(S);
      setObjective(S, 'Free roam — press M for the next job');
    }
  }

  // Street race: five checkpoints in one hundred seconds from (0, 180).
  if (S.race.active) {
    S.race.timer -= dt;
    const cp = S.race.checkpoints[S.race.checkpoint];
    const d = dist2d(px, pz, cp.x, cp.z);
    showMarker(S, cp.x, cp.z);
    setObjective(S, `Street race — checkpoint ${S.race.checkpoint + 1} of 5, ${Math.max(0, Math.ceil(S.race.timer))}s`);
    if (d < 6) {
      S.race.checkpoint += 1;
      S.audio?.jingle(700);
      if (S.race.checkpoint >= 5) {
        S.race.active = false;
        p.money += 150;
        S.toast('Race won — +$150');
        hideMarker(S);
        setObjective(S, 'Free roam — press M for the next job');
      }
    } else if (S.race.timer <= 0) {
      S.race.active = false;
      S.toast('Race failed — out of time');
      hideMarker(S);
      setObjective(S, 'Free roam — press M for the next job');
    }
  }

  // Tokens: walk or drive over one to collect it.
  for (const t of S.tokens) {
    if (t.taken) continue;
    t.mesh.rotation.y += dt * 2;
    if (dist2d(px, pz, t.x, t.z) < 2.5) {
      t.taken = true;
      S.scene.remove(t.mesh);
      p.money += 25;
      S.tokensGot = (S.tokensGot || 0) + 1;
      S.toast(`Solmar token ${S.tokensGot} of 10 — +$25`);
      S.audio?.jingle(990);
    }
  }

  // Hospital health pack, respawning every thirty seconds.
  const h = S.hospital;
  if (h.mesh.visible && dist2d(px, pz, h.x, h.z) < 2.5 && p.health < 100) {
    p.health = 100;
    h.mesh.visible = false;
    h.timer = 30;
    S.toast('Patched up at the hospital — full health');
  }
  if (!h.mesh.visible) {
    h.timer -= dt;
    if (h.timer <= 0) h.mesh.visible = true;
  }
}

// T starts a courier run; the race starts from the south gate with a key.
export function startCourier(S) {
  if (S.mission.index < 1) { S.toast('Finish the First Pickup first'); return; }
  if (S.courier.active || S.race.active) return;
  const spots = [{ x: 120, z: -120 }, { x: -160, z: -40 }, { x: 80, z: 160 }, { x: -120, z: 40 }];
  const target = spots[Math.floor(S.rng.next() * spots.length)];
  S.courier = { active: true, target, timer: 75 };
  showMarker(S, target.x, target.z);
  S.toast('Courier run — 75 seconds, $80');
}

export function startRace(S) {
  if (S.race.active || S.courier.active) return;
  S.race = {
    active: true, checkpoint: 0, timer: 100,
    checkpoints: [{ x: 0, z: 120 }, { x: 80, z: 40 }, { x: 80, z: -120 }, { x: -80, z: -120 }, { x: -80, z: 40 }],
  };
  showMarker(S, 0, 120);
  S.toast('Street race — five checkpoints, 100 seconds');
}
