// Solmar Heat — the four deterministic staged screenshots. Each scene uses
// seed 1 and is pre-simulated for 150 fixed steps of 1/60 s, then frozen, so
// the captured frame is identical on every run. main.js does the pre-sim;
// this module only stages the world and the fixed camera for each shot.
import { spawnGang, setObjective } from './combat.js';
import { spawnPoliceCar } from './vehicles.js';
import { showMarker } from './missions.js';

// Put the player in a car at (x, z) with a heading and a starting speed.
// The car mesh is the one the player drives; the player figure hides.
function seatPlayerInCar(S, car, x, z, heading, speed) {
  car.x = x; car.z = z; car.heading = heading; car.speed = speed;
  car.mesh.position.set(x, 0, z);
  car.mesh.rotation.y = heading;
  const p = S.player;
  p.inCar = true;
  p.car = car;
  p.pos.set(x, 0, z);
  p.mesh.visible = false;
}

export function setupShot(S, name) {
  const p = S.player;
  S.shot = { name, autodrive: false, fixedCamera: null };
  if (name === 'cover') {
    // Shot 1, the cover: a police chase downtown. The player in the red Comet
    // GT cruises south at 24 from (0, 60); two police cars chase from behind;
    // wanted level 3. After the pre-sim the player is near (0, 120) with the
    // cops about six units behind, staggered.
    const comet = S.comet;
    const car = { mesh: comet.mesh, x: 0, z: 60, heading: 0, speed: 24, topSpeed: 46 };
    seatPlayerInCar(S, car, 0, 60, 0, 24);
    S.shot.autodrive = true;
    S.shot.autodriveSpeed = 24;
    const cop1 = spawnPoliceCar(S, 2, 54);
    cop1.speed = 24;
    const cop2 = spawnPoliceCar(S, -2, 50);
    cop2.speed = 22;
    S.wanted = 3;
    S.mission.index = 3;
    S.mission.stage = 'escape';
    S.mission.timer = 45;
    setObjective(S, 'The Getaway — reach the safehouse before the timer runs out');
    // Clear traffic off the x=0 chase corridor so nothing blocks the shot.
    for (const t of [...S.traffic]) {
      if (t.axis === 'x' && t.line === 0) { S.scene.remove(t.mesh); S.traffic = S.traffic.filter((q) => q !== t); }
    }
    S.shot.fixedCamera = { pos: [0, 3.6, 130], look: [0, 1.5, 108] };
  } else if (name === 'street') {
    // Shot 2, the street: on foot in the Old Town. The player stands at
    // (-40, 116) facing the mission marker at (-40, 120); camera yaw pi puts
    // the camera behind him, looking down the street.
    p.pos.set(-40, 0, 116);
    p.camYaw = Math.PI;
    p.yaw = 0;
    S.mission.index = 0;
    S.mission.stage = 'go';
    S.mission.target = { x: -40, z: 120 };
    setObjective(S, 'Go to the Old Town alley, Mona has work');
    showMarker(S, -40, 120);
    S.shot.fixedCamera = null; // follow camera: yaw pi, behind the player
  } else if (name === 'mission') {
    // Shot 3, the mission: the alley shootout. The player stands on the
    // sidewalk at (-33, 116), pistol drawn, twelve rounds; mission three is
    // jumped straight to its kill stage with four Vulture members closing in
    // from (-40, 132); wanted level two. Nearby traffic is cleared so no car
    // can wander between the camera and the fight.
    p.pos.set(-33, 0, 116);
    p.weapon = 'pistol';
    p.ammo = 12;
    for (const [gx, gz] of [[-40, 132], [-36, 136], [-44, 136], [-40, 140]]) spawnGang(S, gx, gz);
    S.wanted = 2;
    S.mission.index = 2;
    S.mission.stage = 'kill';
    S.mission.killed = 0;
    S.mission.target = { x: -40, z: 132 };
    setObjective(S, 'Clear out the Vultures, 0 of 4');
    showMarker(S, -40, 132);
    for (const t of [...S.traffic]) {
      const tx = t.mesh.position.x, tz = t.mesh.position.z;
      if (Math.hypot(tx + 33, tz - 116) < 40) { S.scene.remove(t.mesh); S.traffic = S.traffic.filter((q) => q !== t); }
    }
    // Aim the camera at the nearest gang member, the player facing the gang
    // with the camera behind him.
    const gx = -40, gz = 132;
    const dirX = gx - p.pos.x, dirZ = gz - p.pos.z;
    const len = Math.hypot(dirX, dirZ);
    const ux = dirX / len, uz = dirZ / len;
    p.yaw = Math.atan2(ux, uz);
    p.camYaw = Math.atan2(-ux, -uz);
    S.shot.fixedCamera = null; // follow camera with the staged yaw
  } else if (name === 'city') {
    // Shot 4, the city: the aerial. The player drives a blue car from
    // (0, 180) north at speed 12; the fixed camera sits high north looking
    // south, so the frame holds the whole grid, Solmar Tower with its red
    // spire, the beach and the sea beyond.
    const blue = S.parked.find((c) => c.color === 0x3a6ab8) || S.parked[1];
    const car = { mesh: blue.mesh, x: 0, z: 180, heading: Math.PI, speed: 12, topSpeed: 36 };
    seatPlayerInCar(S, car, 0, 180, Math.PI, 12);
    S.shot.autodrive = true;
    S.shot.autodriveSpeed = 12;
    setObjective(S, 'Free roam, press M for the next job');
    for (const t of [...S.traffic]) {
      if (t.axis === 'x' && t.line === 0) { S.scene.remove(t.mesh); S.traffic = S.traffic.filter((q) => q !== t); }
    }
    S.shot.fixedCamera = { pos: [0, 130, -240], look: [0, 0, 120] };
  } else {
    throw new Error(`unknown shot: ${name}`);
  }
  S.state = 'playing';
}

// After the pre-sim, park the camera for the frozen frame.
export function applyShotCamera(S) {
  if (!S.shot?.fixedCamera) return;
  const [px, py, pz] = S.shot.fixedCamera.pos;
  const [lx, ly, lz] = S.shot.fixedCamera.look;
  S.camera.position.set(px, py, pz);
  S.camera.lookAt(lx, ly, lz);
}

// The debug readout the page carries in shot mode: player and cop positions,
// wanted level and any errors, so a screenshot run can be checked at a glance.
export function debugText(S) {
  const p = S.player;
  const cops = S.cops.map((c) => `(${Math.round(c.x)},${Math.round(c.z)})`).join(' ');
  const pcars = S.policeCars.map((c) => `(${Math.round(c.x)},${Math.round(c.z)})`).join(' ');
  return [
    `player=(${Math.round(p.pos.x)},${Math.round(p.pos.z)}) wanted=${S.wanted}`,
    `cops=${cops || 'none'} policeCars=${pcars || 'none'}`,
    `enemies=${S.enemies.length} state=${S.state} errors=${S.errors.length}`,
    S.errors.length ? `ERRORS: ${S.errors.join(' | ')}` : 'no errors',
  ].join('\n');
}
