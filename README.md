# Solmar Heat

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/Klowor2002/solmar-heat/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/Klowor2002/solmar-heat/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

**Solmar Heat** is an original open-world crime game set in Solmar City, a
fictional coastal city at dusk — built for the make.fun **gta6-01 "Make GTA 6"**
competition. No Rockstar names, places, characters, art or music appear
anywhere: the city, the story and the sound are all original work.

## Play it

Serve the `game/` folder with any static file server and open
`game/index.html` in a desktop browser. No build step, no network requests:
three.js 0.170.0 is vendored under `game/vendor/`.

```sh
node serve.ts
# then open http://localhost:8080
```

## The game

You are **Jax Moreno**, a driver trying to go straight, pulled back in by
**Mona Reyes**, a garage owner and fixer. The rival crew is **The Vultures**,
led by **Kane**; the law is **Detective Okafor** and the Solmar police.

- **A living city:** a 10×10 block grid with roads, traffic, pedestrians,
  Solmar Tower, the Bank, Mona's Garage, the Chop Shop, Hotel Palm, a pier,
  a beach and the sea — all at neon dusk (golden hour via `?palette=golden`).
- **On foot and by car:** third-person walking and sprinting, jumping,
  arcade driving, stealing parked and traffic cars (the red Comet GT tops
  out fastest).
- **Wanted system:** 0–5 stars, foot cops who chase, arrest and shoot,
  patrol cars that ram, and wanted decay when you slip away unseen.
- **Combat:** hitscan pistol, fists, tracers, muzzle flash, and Vulture
  gang members who approach, strafe and shoot back.
- **Six story missions** — First Pickup, Hot Wheels, Vulture Trouble, The
  Getaway, Dockside Deal and The Big Score — plus courier runs, a street
  race, ten hidden Solmar tokens and a hospital health pack.
- **HUD with a circular minimap**, health and sprint bars, weapon and ammo,
  speed, clock and radio; **save** to local storage; **WebAudio synth**
  sound: engine, sirens, gunshots and a sunset chord loop.

## Controls

WASD move · mouse look · Shift sprint · Space jump · E enter/exit/steal car ·
click shoot · 1/2 fists/pistol · R reload · M next mission · T courier run ·
G street race · H horn · Esc pause.

## Screenshots

The four staged shots are deterministic (seed 1, 150 fixed pre-sim steps):

1. `1-cover.jpg` — a police chase downtown (`?shot=cover&seed=1`)
2. `2-street.jpg` — on foot in the Old Town (`?shot=street&seed=1`)
3. `3-mission.jpg` — the alley shootout (`?shot=mission&seed=1`)
4. `4-city.jpg` — the city from above (`?shot=city&seed=1`)

## License

MIT — see [LICENSE](LICENSE).
