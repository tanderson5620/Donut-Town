# Hoops Jam (2D arcade)

A 2-on-2 arcade basketball game in the style of the classic 90s arcade cabinets: side-on camera that slides along the court, a packed crowd, digitized-looking players with big heads, SHOOT / PASS / TURBO, monster dunks and "on fire" streaks. Andersons vs Gormans. Made for phones (landscape) and desktop browsers. Plain HTML + JavaScript on a 2D canvas, no build step and no 3D at runtime.

Play: `https://<your-user>.github.io/<repo>/jam/`. On iPhone, Share > Add to Home Screen runs it fullscreen.

## Controls

| | Phone | Keyboard |
|---|---|---|
| Move | Left thumb (joystick appears where you touch) | Arrows / WASD |
| Shoot | Hold SHOOT, release at the top of the jump (green on the meter) | Hold J or Space |
| Dunk | TURBO + SHOOT near the rim | Shift/L + J |
| Pass | PASS | K |
| Turbo | Hold TURBO | Shift or L |
| Defense | SHOOT = jump/block, PASS = steal, TURBO + PASS = shove | same keys |
| Teamwork | PASS with no ball = call for it; SHOOT = tell your teammate to shoot | same keys |
| Pause | II | Esc / P |

Three straight baskets by one player sets him on fire (flaming ball, unlimited turbo, near-automatic shots) until the other team scores. Goaltending is legal, shoving is encouraged.

## How the players are made

Like the arcade originals, players are flat sprites (digitized frames) with a big head pasted on top.

- **Bodies**: `tools/gen.html` poses the realistic athlete body from `../hoops` through every move (run, dribble, jump shot, dunk, pass, steal, shove, fall, celebrate) in three facings and saves sprite sheets to `sprites/<id>.png` + `<id>.json` (frame anchors for the feet, head and hands).
- **Heads**: `faces/<id>_front.png` and `faces/<id>_back.png`. Alan's front face is cut out of a real photo; the others are rendered from their 3D heads. Drop a cut-out photo face (transparent PNG, about 96 x 123) into `faces/<id>_front.png` to give anyone a real face.

Rebuild the sprites after changing a player's look in `../hoops/js/config.js` (needs Playwright):

```bash
node jam/tools/gen.js
```

## Files

```
jam/index.html        canvas, touch buttons, rotate-your-phone card
jam/css/jam.css       layout, touch controls
jam/js/data.js        roster, teams, types, difficulty, announcer lines
jam/js/audio.js       synthesized sound effects
jam/js/gfx.js         camera, scanline floor, crowd, hoops, sprites + big heads, ball, particles
jam/js/game.js        rules: turbo, timed jump shots, dunks, passes, steals, shoves, blocks, rebounds, on fire, clock
jam/js/ai.js          computer players
jam/js/ui.js          input, menus (team select, player cards, matchup), HUD, callouts
jam/js/main.js        boot and main loop
jam/sprites, faces    generated art
jam/tools             sprite factory
```

`?quick` in the URL jumps straight to a matchup.
