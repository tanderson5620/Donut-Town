# FAM JAM: Andersons vs Gormans (2D arcade)

A 2-on-2 arcade basketball game in the style of the classic 90s arcade cabinets: side-on camera that slides along the court, a packed crowd, digitized-looking players with big heads, SHOOT / PASS / TURBO, monster dunks and "on fire" streaks. Andersons vs Gormans. Made for phones (landscape) and desktop browsers. Plain HTML + JavaScript on a 2D canvas, no build step and no 3D at runtime.

Play: https://tanderson5620.github.io/Donut-Town/famjam/ (the old `/jam/` link redirects here). On iPhone, Share > Add to Home Screen runs it fullscreen.

## Controls

| | Phone | Keyboard |
|---|---|---|
| Move | Left thumb (joystick appears where you touch) | Arrows / WASD |
| Shoot | Hold SHOOT, release at the top of the jump (green on the meter) | Hold J or Space |
| Turbo | Push the stick past its ring (the ring is your turbo meter and lights up) | Shift or L |
| Dunk | DUNK button (lit when you're in range), or turbo + SHOOT running at the rim | Shift/L + J |
| Pass | PASS | K |
| Shove | SHOVE button (the third button whenever you don't have the ball, offense or defense) | Shift/L + K |
| Defense | SHOOT = jump/block, PASS = steal | same keys |
| Teamwork | PASS with no ball = call for it; SHOOT = tell your teammate to shoot | same keys |
| Pause | II | Esc / P |

Ratings (1-10): SPD, POWER, 3PTS, STEAL, DUNK, BLOCK and PASS. POWER wins shoves, dunk rejections (a stronger blocker flattens the dunker for 2 s), posterizes and box-outs. PASS makes passes faster, truer and harder to intercept, and good passers show off: behind the back (wrapping round his back), a 360 spin, a flip with the release at the top, a football snap back through his legs to a teammate behind him, over the head or a no-look - the ball stays in his hand through the move.

Four quarters of 1:00 (default), 1:30, 2:00 or 3:00, picked on the team card and remembered on the device; overtime is half a quarter (30-60 s).

Three straight baskets by one player sets him on fire (flaming ball, unlimited turbo, near-automatic shots) until the other team scores.

Going on fire is a 2-second golden power-up: the game freezes and the camera zooms in on him, he crosses his forearms over his chest to charge, then throws both arms down by his legs. A flash and a shockwave go off, his hair turns gold and stands up in spikes, his muscles pump up and a gold aura ignites. He plays powered up (gold hair, aura, pumped-up sprites) until he cools off.

On fire, a player's best rating (his specialty) is turned up even more: speed - 30% faster with afterimages; pass - every pass is a fancy move and can't be intercepted; 3PTS - every release is green, about 99% from anywhere, and the net catches fire on a three; dunk - takes off from much farther out, longer hang time in flames, usually shatters the glass, and only a defender on fire can reject it; block - blocks almost everything with longer reach; power - every shove flattens and nobody can move him; steal - much better steals and interceptions.

Ball handlers (Alan, Katelyn) change direction with a crossover or a behind-the-back dribble, which protects the ball; on fire it can put the defender on the floor. Goaltending is legal, shoving is encouraged.

Every knockdown (shove, dunk rejection, posterize, ankle-breaker) is a hard hit: a freeze-frame with a comic impact star, his head snaps back, the screen shakes and he's launched backwards; he slams into the floor with a cracked crater, dust and blood where his head lands (more when a stronger player did it).

## How the players are made

Like the arcade originals, players are flat sprites (digitized frames) with a big head pasted on top.

- **Bodies**: `tools/gen.html` poses the realistic athlete body from `../hoops` through every move (run, dribble, jump shot, dunk, pass, steal, shove, fall, celebrate) in three facings and saves sprite sheets to `sprites/<id>.png` + `<id>.json` (frame anchors for the feet, head and hands).
- **Extras** (`sprites/<id>_x.png/.json`, a second sheet per player): the power-up (`powerup`, straight at the camera), the pumped-up `idle_buff`, `run_buff`, `drun_buff` and `dribble_buff`, and the taunts (`*_point`, `*_chopU`, `*_chopD`). The muscle pump scales bones in the skinned body while it renders (`BUFF` in gen.html).
- **Gold hair**: `faces/<id>_ssj.png` and `_ssj_back.png` are the photo heads with the hair turned gold and spiked up; `HW.SSJ_PAD` in `js/data.js` says where the photo sits in the bigger canvas.
- **Heads**: every player's face is cut out of a real photo (`faces/<id>_photo.png`, used for players with `photo: true` in `js/data.js`); the back of the head (`faces/<id>_back.png`) is rendered from the 3D head. A player without `photo: true` gets a rendered `faces/<id>_front.png` instead.

Rebuild the sprites after changing a player's look in `js/data.js` (`HW.PLAYERS` and `LOOK`; the athlete body itself comes from `../hoops/js/`). Needs Playwright:

```bash
node famjam/tools/gen.js
```

## Files

```
famjam/index.html           canvas, touch buttons, rotate-your-phone card
famjam/css/jam.css          layout, touch controls
famjam/js/data.js           roster, teams, types, difficulty, announcer lines
famjam/js/font.js           arcade bitmap font
famjam/js/crowd.js          packed pixel crowd in the stands
famjam/js/audio.js          synthesized sound effects
famjam/js/gfx.js            camera, scanline floor, crowd, hoops, sprites + big heads, ball, particles
famjam/js/game.js           rules: turbo, timed jump shots, dunks, passes, steals, shoves, blocks, rebounds, on fire, clock
famjam/js/ai.js             computer players
famjam/js/ui.js             input, menus (team select, player cards, matchup), HUD, callouts
famjam/js/main.js           boot and main loop
famjam/sprites, faces       generated art
famjam/img                  link-preview image (share.png, 1200x630) and home-screen icon (icon.png, 512x512)
famjam/manifest.webmanifest home-screen app name, icon, fullscreen landscape
jam/index.html              redirect from the old /jam/ link
famjam/tools                sprite factory
```

`?quick` in the URL jumps straight to a matchup.
