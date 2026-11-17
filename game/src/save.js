// Solmar Heat — save: money, missions done, tokens, health, position and
// story completion persist to local storage under solmar-heat-save-v1.
// Loading is defensive: a corrupt or missing save just starts a new game.
export const SAVE_KEY = 'solmar-heat-save-v1';

export function saveGame(S) {
  try {
    const p = S.player;
    const data = {
      money: Math.floor(p.money),
      missionsDone: S.missionsDone || 0,
      missionIndex: S.mission?.index || 0,
      tokensGot: S.tokensGot || 0,
      tokensTaken: S.tokens.map((t) => t.taken),
      health: Math.round(p.health),
      pos: { x: p.pos.x, z: p.pos.z },
      storyDone: (S.mission?.index || 0) >= 6,
      kills: S.kills || 0,
      savedAt: Date.now(),
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function loadGame(S) {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data.money !== 'number') return null;
    return data;
  } catch {
    return null;
  }
}

export function hasSave() {
  try {
    return localStorage.getItem(SAVE_KEY) !== null;
  } catch {
    return false;
  }
}

// Apply a loaded save to a fresh world: money, health, position, tokens.
export function applySave(S, data) {
  const p = S.player;
  p.money = data.money;
  p.health = typeof data.health === 'number' ? data.health : 100;
  if (data.pos) p.pos.set(data.pos.x, 0, data.pos.z);
  S.missionsDone = data.missionsDone || 0;
  if (S.mission) S.mission.index = data.missionIndex || 0;
  S.tokensGot = data.tokensGot || 0;
  if (Array.isArray(data.tokensTaken)) {
    S.tokens.forEach((t, i) => {
      if (data.tokensTaken[i]) {
        t.taken = true;
        S.scene.remove(t.mesh);
      }
    });
  }
  S.kills = data.kills || 0;
  if (data.storyDone) {
    S.objective = 'Story complete — Solmar is yours. Free roam!';
  } else if (S.mission && S.mission.index > 0) {
    S.objective = `Press M for the next job: mission ${S.mission.index + 1} of 6`;
  }
}
