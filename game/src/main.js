// Solmar Heat — bootstrap: builds the world, runs the title / playing /
// paused / end state machine, wires the input actions, steps the simulation
// once per frame, and runs the deterministic shot mode (?shot=cover|street|
// mission|city&seed=1) that pre-simulates 150 fixed steps and freezes.
import * as THREE from 'three';
import { Input, makeRng } from './utils.js';
import { buildCity } from './city.js';
import { spawnTraffic, updateTraffic, drivePlayerCar, updatePoliceCars } from './vehicles.js';
import { spawnPeds, updatePeds } from './peds.js';
import { makePlayerMesh, updatePlayer, updateCamera, tryEnterExitCar } from './player.js';
import { updatePolice } from './police.js';
import { tryShoot, tryPunch, updateEnemies } from './combat.js';
import { buildMissions, startMission, updateMissions, startCourier, startRace } from './missions.js';
import { bindHud, updateHud, toast, showBanner, hideBanner } from './hud.js';
import { AudioSys } from './audio.js';
import { saveGame, loadGame, applySave, hasSave } from './save.js';
import { setupShot, applyShotCamera, debugText } from './shots.js';

const params = new URLSearchParams(location.search);
const seed = Number(params.get('seed')) || 1;
const shotName = params.get('shot');
const palette = params.get('palette') === 'golden' ? 'golden' : 'dusk';

// --- the one shared state object every module reads and writes -------------
const S = {
  seed, palette, time: 0, state: 'title', endReason: null,
  wanted: 0, unseenTimer: 0, lastSeenAt: 0,
  objective: 'Welcome to Solmar City — press M for the next job',
  radio: 'SOLMAR FM', shake: 0, errors: [], kills: 0, missionsDone: 0, tokensGot: 0,
  shotsFiredRecently: 0, tracers: [], enemies: [], cops: [], policeCars: [],
  pickups: [], clouds: [], shot: null, rng: makeRng(seed),
  player: {
    pos: new THREE.Vector3(-40, 0, 116), yaw: 0, camYaw: Math.PI, camPitch: 0,
    velY: 0, onGround: true, health: 100, stamina: 100, money: 0,
    inCar: false, car: null, weapon: 'fists', ammo: 12, shootCooldown: 0,
    walkPhase: 0, speed: 0, mesh: null,
  },
};

// Any uncaught error is recorded on the state and in the debug readout
// instead of silently killing the frame loop.
window.addEventListener('error', (e) => { S.errors.push(String(e.message || e.error)); });
window.addEventListener('unhandledrejection', (e) => { S.errors.push(String(e.reason?.message || e.reason)); });

// --- renderer, scene, camera ------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.getElementById('game').appendChild(renderer.domElement);
S.renderer = renderer;
S.scene = new THREE.Scene();
S.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);
S.camera.position.set(-40, 3, 109);
S.scene.add(new THREE.PointLight(0xffe9a8, 0, 30)); // muzzle flash light, parked at 0 intensity
S.muzzleLight = S.scene.children[S.scene.children.length - 1];
S.muzzleLight.intensity = 0;

S.input = new Input(renderer.domElement);
S.audio = new AudioSys();
bindHud(S);

// Helpers the modules call through S so they never touch the DOM directly.
S.toast = (text) => toast(S, text);
S.banner = (title, text) => showBanner(S, title, text);
S.saveGame = () => saveGame(S);
S.flashDamage = () => {
  const el = document.getElementById('damage-flash');
  if (el) { el.style.opacity = '0.45'; setTimeout(() => { el.style.opacity = '0'; }, 120); }
};

// --- build the world --------------------------------------------------------
buildCity(S);
spawnTraffic(S);
spawnPeds(S);
buildMissions(S);
S.player.mesh = makePlayerMesh();
S.player.mesh.position.copy(S.player.pos);
S.scene.add(S.player.mesh);

// --- screens -----------------------------------------------------------------
const screens = {
  title: document.getElementById('title-screen'),
  pause: document.getElementById('pause-screen'),
  end: document.getElementById('end-screen'),
};
function showScreen(name) {
  for (const [key, el] of Object.entries(screens)) el.style.display = key === name ? 'flex' : 'none';
  document.getElementById('hud').style.display = name ? 'none' : 'block';
}
function showEnd(title, text) {
  document.getElementById('end-title').textContent = title;
  document.getElementById('end-text').textContent = text;
  showScreen('end');
}
document.getElementById('new-game').addEventListener('click', () => {
  S.audio.ensure(); S.audio.startMusic();
  S.state = 'playing';
  showScreen(null);
  hideBanner(S);
});
document.getElementById('continue-game').addEventListener('click', () => {
  const data = loadGame(S);
  if (data) applySave(S, data);
  S.audio.ensure(); S.audio.startMusic();
  S.state = 'playing';
  showScreen(null);
  hideBanner(S);
});
document.getElementById('resume-game').addEventListener('click', () => { S.state = 'playing'; showScreen(null); });
document.getElementById('retry-game').addEventListener('click', () => {
  S.player.health = 100;
  S.player.pos.set(-40, 0, 116);
  S.wanted = 0;
  S.state = 'playing';
  showScreen(null);
});
document.getElementById('title-game').addEventListener('click', () => { S.state = 'title'; showScreen('title'); refreshTitle(); });
if (hasSave()) document.getElementById('continue-game').style.display = 'inline-block';
function refreshTitle() {
  document.getElementById('continue-game').style.display = hasSave() ? 'inline-block' : 'none';
}

// --- one simulation step ------------------------------------------------------
function step(dt) {
  S.time += dt;
  const p = S.player;
  const input = S.input;
  if (S.state !== 'playing') return;
  if (input.pressed('Escape')) { S.state = 'paused'; showScreen('pause'); return; }
  if (input.pressed('KeyM')) startMission(S);
  if (input.pressed('KeyT')) startCourier(S);
  // Note: R (reload) is consumed by updatePlayer, not here, so the press
  // is never eaten before the player module can see it.
  if (input.pressed('KeyE')) tryEnterExitCar(S);
  if (input.pressed('KeyH') && p.inCar) S.audio.horn();
  if (input.pressed('KeyG')) startRace(S);
  if (input.consumeClick()) {
    if (p.weapon === 'pistol') tryShoot(S);
    else tryPunch(S);
  }
  if (p.inCar && p.car) drivePlayerCar(S, dt);
  else updatePlayer(S, dt);
  updateTraffic(S, dt);
  updatePeds(S, dt);
  updatePolice(S, dt);
  updatePoliceCars(S, dt);
  updateEnemies(S, dt);
  updateMissions(S, dt);
  for (const cloud of S.clouds) {
    cloud.position.x += dt * 1.2;
    if (cloud.position.x > 240) cloud.position.x = -240;
  }
  S.audio.engine(p.inCar && p.car ? Math.abs(p.car.speed) / 46 : 0);
  S.audio.siren(S.wanted > 0);
  if (S.state === 'busted') showEnd('BUSTED', 'The Solmar police took you in. The story ends here — for now.');
  if (S.state === 'wasted') showEnd('WASTED', 'Jax went down in Solmar City. The story ends here — for now.');
  if (S.state === 'end') showEnd('SOLMAR HEAT', 'You pulled off the Big Score. The city is yours.');
}

// --- frame loop ----------------------------------------------------------------
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (S.frozen) {
    renderer.render(S.scene, S.camera);
    return;
  }
  if (S.state === 'playing') step(dt);
  else if (S.state === 'title' || S.state === 'paused') {
    // The city idles behind the title and pause screens.
    S.time += dt;
    updateTraffic(S, dt);
    updatePeds(S, dt);
    for (const cloud of S.clouds) {
      cloud.position.x += dt * 1.2;
      if (cloud.position.x > 240) cloud.position.x = -240;
    }
  }
  if (!S.shot?.fixedCamera) updateCamera(S, dt);
  else applyShotCamera(S);
  updateHud(S);
  renderer.render(S.scene, S.camera);
}

window.addEventListener('resize', () => {
  S.camera.aspect = window.innerWidth / window.innerHeight;
  S.camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- shot mode ------------------------------------------------------------------
// ?shot=cover&seed=1: stage the scene, pre-simulate 150 fixed steps of 1/60 s,
// freeze, and announce SHOT-READY in the title with a debug readout.
if (shotName) {
  try {
    setupShot(S, shotName);
    showScreen(null);
    hideBanner(S);
    for (let i = 0; i < 150; i++) step(1 / 60);
    S.frozen = true;
    if (S.shot.fixedCamera) applyShotCamera(S);
    else updateCamera(S, 0);
    updateHud(S);
    renderer.render(S.scene, S.camera);
    const debug = document.getElementById('debug');
    // The debug readout is a verification aid: show it only when the run
    // asks for it (?debug=1). The submitted frames stay clean.
    if (params.get('debug') === '1') {
      debug.style.display = 'block';
      debug.textContent = debugText(S);
    }
    document.title = 'SHOT-READY';
  } catch (err) {
    S.errors.push(String(err?.message || err));
    document.getElementById('debug').style.display = 'block';
    document.getElementById('debug').textContent = debugText(S);
    document.title = 'SHOT-ERROR';
  }
} else {
  showScreen('title');
  refreshTitle();
}

requestAnimationFrame(frame);
