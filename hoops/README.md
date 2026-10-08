# Hoops Jam

A WebXR 2-on-2 arcade basketball game for **Meta Quest 2** (and any desktop browser). Andersons vs Gormans: over-the-top dunks, "on fire" streaks, shoving, steals, and fast 3-minute quarters. Plain HTML + JavaScript with three.js, no build step. It's a standalone game that just lives in the `hoops/` folder of this repo.

## Play it

- **Quest:** open the page in the Quest Browser, tap **ENTER VR**, point a controller at menu buttons and pull the trigger.
- **Desktop:** open the page and click through the menus. Click the court to capture the mouse (Esc releases it and pauses).

## Controls

| | Quest controllers | Desktop |
|---|---|---|
| Move | Left stick (head-relative) | WASD / arrows |
| Turn | Right stick (snap or smooth, set in Settings) | Mouse / left-right arrows |
| Turbo | Right trigger | Shift |
| Hold the ball | Grip (release while swinging to throw) | Hold the mouse button |
| Shoot | Swing the held ball up and let go | Hold click, release near the green zone |
| Pass | **A** (or throw flat at your teammate) | **Q** |
| Steal / shove | **B** (or swipe a hand at a dribble) | **E** / right click |
| Jump | **X**, or flick the left hand above your head | Space |
| Block | Put a hand in the way of a shot | Jump next to the shooter |
| Pause | **Y** | Esc |
| Recenter height | Left stick click | R |
| Camera | first person | **C** toggles behind / first person |

**Dunk:** hold turbo and drive at the rim from inside your dunk range. The game goes into slow-mo and plays a dunk style picked by your Dunk rating (windmills, 360s and backflips for Dunkers; the backboard can shatter).

**On fire:** three makes in a row. The ball burns, turbo is unlimited, you move a bit faster, and your shots are strongly assisted until the other team scores.

**Rules:** arcade. No fouls, no out of bounds, goaltending is off, shoving is allowed. 24 s shot clock, 4 quarters of 3 minutes, one-minute overtimes while tied. Threes are worth 3 (the white arc), everything else 2.

## Teams and player types

Stats are 1-10. The type sets how the player plays; the numbers feed the shot assist, speed, jump, steals, blocks and shoves.

| Type | Plays like | Shows up as |
|---|---|---|
| Dunker | Huge jump and range, spectacular dunk styles | Carl Anderson, Kameron Gorman |
| 3-Point Shooter | Wide green window from deep, strong shot assist | Tyler Anderson, Karen Gorman |
| Ball Handler | Fastest, big steal chance, slower turbo drain, crossovers (reverse the stick hard) | Alan Anderson, Katelyn Gorman |
| Max Strength | Shoves knock people down, big blocks | Lisa Anderson, Kody Gorman, Kenny Gorman |

The roster, colors, numbers and stats are all in `js/config.js`.

## Shooting and aim assist

In VR the ball follows your gripping hand and leaves with the hand's velocity (x1.6). `js/shooting.js` then looks at the release:

- A flat throw toward your teammate becomes a pass that leads them.
- A lofted throw toward the hoop becomes a shot. The assist pulls direction, arc and speed toward the ideal arc by an amount that scales with the shooter's 3PT rating, drops with a defender's hand in your face, and goes to 100% when on fire.
- Land inside the green window (wider for 3-Point Shooters from deep) and it is a guaranteed swish.

## AI and difficulty

Opponents and your teammate share one set of rules (`js/ai.js`): teammates cut to spots by type and show a "!" when open, defenders guard man-to-man, steal, shove and jump to block, shooters take threes, Dunkers attack the rim. **Easy / Normal / Hard** scale AI speed, shooting percentage, steal and block rates, and reaction time.

## Comfort

Settings (title screen or pause menu): snap or smooth turning (30/45/60 deg or three speeds), a vignette while moving or turning (and during dunks), standing or seated play with height recenter, and how much a jump or dunk lifts your view. Snap turning is the default, and you are moved back into position with a short fade between possessions. Choices are saved in `localStorage`.

## Project layout

```
hoops/
  index.html          page + script order
  css/style.css       VR button, desktop overlay
  js/config.js        court size, teams, players, types, difficulty
  js/util.js          math, canvas textures, storage
  js/audio.js         WebAudio synth sounds (no files), optional announcer voice
  js/fx.js            particles: flames, sparks, glass, confetti
  js/court.js         arena, hardwood, hoops, nets, blob shadows
  js/ball.js          ball physics (floor, backboard, rim ring, net), scoring
  js/shooting.js      ideal arcs, aim assist, pass assist
  js/xr.js            Enter VR button, controllers, gloves, lasers
  js/input.js         one input state for Quest and desktop
  js/ui.js            canvas panels, callouts, scoreboard, HUD
  js/player.js        low-poly player model and animation
  js/actions.js       carry/dribble, pickup, shoot, pass, steal, shove, block, dunk, crossover
  js/menus.js         laser-pointer menus
  js/ai.js            computer players
  js/game.js          match flow, clocks, scoring, on-fire, human control, camera
  js/main.js          renderer, rig, comfort overlays, main loop
```

Everything is a classic script sharing the `HW` global. three.js r128 comes from cdnjs. All textures are drawn to canvases and all sounds are synthesized, so there are no assets to host.

## Run locally

Start a static server in this folder:

```bash
cd hoops && python3 -m http.server 8000
```

Open `http://localhost:8000` in a desktop browser.

To try it on a Quest that is on the same computer, plug the headset in with USB, enable developer mode, then forward the port (`localhost` counts as a secure context, so WebXR works without HTTPS):

```bash
adb reverse tcp:8000 tcp:8000
```

Then open `http://localhost:8000` in the Quest Browser. Without `adb`, deploy to GitHub Pages (below): WebXR needs HTTPS and Pages provides it.

URL options: `?quick` (or `?quick=kameron`) skips the menus and starts a game as that player, `?debug` exposes `window.__hw` for the console.

## Deploy to GitHub Pages

1. Push the repository to GitHub (the `hoops` folder must be on the branch you publish).
2. In the repo go to **Settings > Pages**, set **Source** to **Deploy from a branch**, pick your branch (for example `main`) and the **/ (root)** folder, and save.
3. After a minute the game is at `https://<your-user>.github.io/<repo>/hoops/`. Open that URL in the Quest Browser and tap **ENTER VR**.

The repository root `index.html` redirects to Donut Town, so the `/hoops/` part of the URL is needed.

## Testing

There is no browser in CI. Syntax check every file:

```bash
for f in hoops/js/*.js; do node --check "$f" || echo "FAILED $f"; done
```

The game was exercised with headless Chromium (SwiftShader): desktop shooting and dunks, AI-vs-AI simulations of full quarters, the menu flow by mouse click, and the VR code paths using mocked controllers (grip hold, throw, jump flick, laser menus, pause, seated recenter). Real headset checks are listed in the commit notes for each stage.

## Tuning

- `js/config.js`: court size, rim size, `QUARTER_S`, shot clock, player stats, difficulty multipliers.
- `js/shooting.js`: arc choice (the arrival angle that avoids clipping the front rim) and the green window.
- `js/main.js` / `js/xr.js`: pixel ratio, foveation and frame rate request for Quest.
- Performance budget: about 230 draw calls, flat Lambert materials, no real-time shadows (blob shadows instead), pixel ratio capped at 1.5, fixed foveation.
