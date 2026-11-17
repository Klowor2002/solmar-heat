// Solmar Heat — the heads-up display: money, objective, wanted stars, clock
// and radio, health and sprint bars, weapon/ammo/speed, crosshair, messages,
// and the circular minimap with roads, sea, beach and blips for the player,
// police, enemies, tokens and the mission target.
import { GRID_STEP, GRID_MIN, GRID_MAX } from './utils.js';

export function bindHud(S) {
  const $ = (id) => document.getElementById(id);
  S.hud = {
    money: $('money'), objective: $('objective'), stars: $('stars'),
    clock: $('clock'), radio: $('radio'), healthBar: $('health-bar'),
    sprintBar: $('sprint-bar'), weapon: $('weapon'), ammo: $('ammo'),
    speed: $('speed'), crosshair: $('crosshair'), message: $('message'),
    banner: $('banner'), bannerTitle: $('banner-title'), bannerText: $('banner-text'),
    toast: $('toast'), minimap: $('minimap'),
  };
  S.toastTimer = 0;
  S.messageTimer = 0;
}

export function toast(S, text) {
  if (!S.hud?.toast) return;
  S.hud.toast.textContent = text;
  S.hud.toast.style.opacity = '1';
  S.toastTimer = 3;
}

export function showBanner(S, title, text) {
  if (!S.hud?.banner) return;
  S.hud.bannerTitle.textContent = title;
  S.hud.bannerText.textContent = text;
  S.hud.banner.style.display = 'flex';
}

export function hideBanner(S) {
  if (S.hud?.banner) S.hud.banner.style.display = 'none';
}

// In-game clock: dusk reads 19:20, golden hour 17:40, advancing slowly.
function clockText(S) {
  const base = S.palette === 'golden' ? 17 * 60 + 40 : 19 * 60 + 20;
  const mins = (base + Math.floor(S.time / 12)) % (24 * 60);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function updateHud(S) {
  const h = S.hud;
  if (!h) return;
  const p = S.player;
  h.money.textContent = `$${Math.floor(p.money).toLocaleString('en-US')}`;
  if (S.objective) h.objective.textContent = S.objective;
  // Wanted stars: filled red for the level, dim outlines for the rest.
  h.stars.textContent = '★'.repeat(S.wanted) + '☆'.repeat(5 - S.wanted);
  h.stars.style.color = S.wanted > 0 ? '#ff4040' : '#c9a94a';
  h.clock.textContent = clockText(S);
  h.radio.textContent = S.radio || 'SOLMAR FM';
  h.healthBar.style.width = `${Math.max(0, p.health)}%`;
  h.healthBar.style.background = p.health > 50 ? '#2ad44a' : p.health > 25 ? '#ff9a2a' : '#ff4040';
  h.sprintBar.style.width = `${Math.max(0, p.stamina)}%`;
  h.weapon.textContent = p.inCar ? 'DRIVING' : p.weapon === 'pistol' ? 'PISTOL' : 'FISTS';
  h.ammo.textContent = p.inCar ? '—' : p.weapon === 'pistol' ? `${p.ammo} / 12` : '—';
  const speed = p.inCar && p.car ? Math.abs(p.car.speed) * 2.2 : p.speed * 2.2;
  h.speed.textContent = `${Math.round(speed)} mph`;
  h.crosshair.style.display = !p.inCar && p.weapon === 'pistol' ? 'block' : 'none';
  if (S.toastTimer > 0) {
    S.toastTimer -= 1 / 60;
    if (S.toastTimer <= 0) h.toast.style.opacity = '0';
  }
  drawMinimap(S);
}

// Circular minimap: the road grid, sea and beach at the bottom, the player as
// a white arrow, police blue, enemies red, tokens gold, mission target yellow.
function drawMinimap(S) {
  const canvas = S.hud.minimap;
  if (!canvas) return;
  const g = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const cx = W / 2, cy = H / 2, R = W / 2 - 2;
  const scale = (W / 2 - 6) / 235; // world -235..235 maps into the circle
  const toMap = (x, z) => [cx + x * scale, cy + z * scale];
  g.clearRect(0, 0, W, H);
  g.save();
  g.beginPath();
  g.arc(cx, cy, R, 0, Math.PI * 2);
  g.clip();
  g.fillStyle = '#232030';
  g.fillRect(0, 0, W, H);
  // Sea and beach along the south edge.
  const [, seaY] = toMap(0, 235);
  g.fillStyle = '#1a3a5e';
  g.fillRect(0, seaY, W, H - seaY);
  const [, beachY] = toMap(0, 205);
  g.fillStyle = '#d9b380';
  g.fillRect(0, beachY, W, seaY - beachY);
  // Roads.
  g.strokeStyle = '#555066';
  g.lineWidth = 2;
  for (let v = GRID_MIN; v <= GRID_MAX; v += GRID_STEP) {
    const [x1] = toMap(v, 0); const [, z1] = toMap(0, v);
    g.beginPath(); g.moveTo(x1, 0); g.lineTo(x1, H); g.stroke();
    g.beginPath(); g.moveTo(0, z1); g.lineTo(W, z1); g.stroke();
  }
  const dot = (x, z, color, r) => {
    const [mx, mz] = toMap(x, z);
    g.fillStyle = color;
    g.beginPath(); g.arc(mx, mz, r, 0, Math.PI * 2); g.fill();
  };
  for (const t of S.tokens) if (!t.taken) dot(t.x, t.z, '#ffd24a', 2.5);
  for (const c of S.cops) dot(c.x, c.z, '#4a8aff', 3);
  for (const c of S.policeCars) dot(c.x, c.z, '#4a8aff', 3.5);
  for (const e of S.enemies) dot(e.x, e.z, '#ff4040', 3);
  if (S.mission?.target) {
    const [mx, mz] = toMap(S.mission.target.x, S.mission.target.z);
    g.fillStyle = '#ffe94a';
    g.beginPath();
    g.moveTo(mx, mz - 6); g.lineTo(mx + 5, mz); g.lineTo(mx, mz + 6); g.lineTo(mx - 5, mz);
    g.closePath(); g.fill();
  }
  // The player: a white arrow pointing along his heading.
  const p = S.player;
  const px = p.inCar && p.car ? p.car.x : p.pos.x;
  const pz = p.inCar && p.car ? p.car.z : p.pos.z;
  const heading = p.inCar && p.car ? p.car.heading : p.yaw;
  const [mx, mz] = toMap(px, pz);
  g.save();
  g.translate(mx, mz);
  g.rotate(Math.atan2(Math.sin(heading), -Math.cos(heading)) + Math.PI);
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.moveTo(0, -7); g.lineTo(5, 5); g.lineTo(0, 2); g.lineTo(-5, 5);
  g.closePath(); g.fill();
  g.restore();
  g.restore();
  // The ring itself.
  g.strokeStyle = 'rgba(255,255,255,0.7)';
  g.lineWidth = 2;
  g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.stroke();
}
