# Donut Town VR

A WebXR game for Meta Quest 2, built as one self-contained HTML file (`donut-town-vr.html`). It runs in the Quest Browser and on desktop browsers. It's hosted on GitHub Pages; open the page and tap **Enter VR**.

## Tech constraints (keep these)
- **Single file.** All HTML, CSS and JS live in `donut-town-vr.html`. There are no build step, no bundler and no local assets.
- **three.js r128** is loaded as a UMD script from `https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js`. ES-module imports and examples/jsm addons aren't used; VRButton, controller models and BufferGeometryUtils are hand-rolled instead.
- **All textures are procedural**, drawn to `<canvas>` and wrapped with `CanvasTexture` through the `canvasTex()` helper. There are no image files.
  - Exception: Rimshot's baked body mesh and normal/AO maps are generated offline by `tools/rimshot/` (Blender as a Python module) and embedded as JSON in the `RIMSHOT-DATA` block near the top of the HTML. If that block is missing or broken, the game falls back to the procedural body.
- **Quest 2 performance budget:**
  - Lambert materials are used for the environment; Standard is used only for characters, turtles and donuts.
  - Repeated objects (pines, rocks, grass tufts, flowers) use `InstancedMesh` with `frustumCulled = false`.
  - Pixel ratio is capped at 1.5, foveation is set to 1, and no real-time shadows are used. Blob shadow decals are used instead.
  - Static scenery is built under `staticRoot` and merged per material by `bakeStatic()` at the end of setup.
- **Audio** is synthesized with the WebAudio API (`tone()` and `noise()` helpers). There are no sound files.

## Controls
- **Quest:** left stick moves (head-relative), right stick snap-turns 30°. Point a controller and pull the trigger to press buttons or grab donuts; touching a donut with a hand also catches it. A wrist HUD is attached to the left controller.
- **Desktop:** WASD or arrow keys to move (Shift to run), drag to look, click to interact. The HUD is a corner overlay that reuses the same canvas.

## Locomotion and collisions
- The player is `rig`, a Group that contains the camera and both controllers.
- `movePlayer()` moves the rig. `snapTurn()` rotates the rig around the head.
- `resolve()` pushes the head position out of the AABB `colliders` list and the lake circle, and clamps the player to world bounds.
- `box(..., collide=true)` automatically registers a collider; `solid()` registers an invisible one.

## World layout
Units are meters. -Z is "north", the direction you face at spawn.
- **Spawn:** (0, 0, 6), at a wooden welcome sign.
- **Main street:** cobblestone, x ∈ [-3, 3], z from 9 to -31. Flagstone sidewalks run alongside it, with lamps and pines.
- **Plaza:** center (0, -12), radius 5. It has a fountain with a giant rotating donut, benches, and Glaze at (-2.7, -12.6) beside a café table.
- **Shops:** open-front buildings with pitched shingle roofs, awnings, wooden signs, windowed side walls and an interior counter. The left side is x≈-7..-12 and the right side is x≈7..12.
  - Donut Stand (-x, z=-4): a minigame where donuts fly from a wall chute while the player stands inside.
  - Sprinkle Bakery (+x, z=-4): rainbow, chocolate or pink sprinkle donuts for 3 each.
  - Flower Shop (-x, z=-20): a bouquet for 10.
  - Arcade (+x, z=-20): a date night ticket for 25.
- **Scenery:**
  - Two procedural mountain rings built by `buildRange()`: a near ring at r 60–235 and a far, hazy ring at r 240–400. Terrain is ridged value noise, with colors chosen by height and slope: meadow, forest, rock, snow.
  - Alpine lake centered at (-32, -42) with radius 13.
  - Instanced pine forest, boulders, grass and wildflowers.
  - Sprite clouds, and a sky dome with a sun.

## Gameplay loop
1. Catch donuts at the Donut Stand. Burnt donuts cost 2.
2. Buy gifts at the shops; they go into the inventory `S.inv`.
3. Give the gifts to Glaze from the gift board next to her.
4. Her affection meter goes from 0 to 100. At 100 she agrees to be your girlfriend, and a "Start a new story" button resets the game.

Affection per gift:
- Correct sprinkle (`S.pref`): +14. There's a 40% chance she then changes her preference.
- Wrong sprinkle: +3.
- Flowers: +18.
- Date ticket: +34.

The content stays wholesome and non-sexual. Keep it that way.

## Characters
Both characters are built with `buildPerson(opts)`: a hierarchical rig of hips, thighs, knees, spine, shoulders, elbows and head. `limbGeo()` makes capsule-like lathe limbs and `torsoGeo()` makes lathe torsos. `buildFace()` adds eyes (sclera, iris, pupil, glint, blinking eyelid), nose, ears, brows, lips and a hidden mouth opening.

- **Glaze:** an original character, the love interest. She wears a pink jacket and jeans, with a hair bun and gold hoops. She faces the player, breathes, blinks, hops on good gifts and cheers when you win. Her blush opacity tracks affection.
- **Rimshot:** an original basketball player, teal #77 jersey. He isn't modeled on any real person; keep it that way.
  - Built by `buildAthlete()`, not `buildPerson()`: an 18-bone `THREE.Skeleton` drives `SkinnedMesh`es for the skin, jersey, shorts and a compression sleeve (r128 materials need `skinning: true`). Limbs and torso are sculpted ring grids (`skinGrid()`) with muscle bumps and blended joint weights.
  - The head is a sculpted grid (`headPoint()`), split along the mouth line so a jaw bone can open it. It has teeth, a tongue, textured eyeballs that track the player, blinking eyelids, eyebrows, ears, a fade haircut and a headband. Hands (jointed fingers, nails) and sneakers are rigid parts on their bones.
  - Skin uses procedural color and pore normal maps. The jersey neck and arm holes are cut with an alpha mask. He is about 99k triangles (beard and hair are alpha-tested shells: stacked offset copies of the skin whose coil texture thins per layer). Skin uses `addSkinShading()`, an `onBeforeCompile` patch that wraps light past the terminator with a warm tint (fake subsurface scattering) plus a soft rim, and the face has a roughness map for the oily T-zone and lips. He dribbles in endless circles around the player at a radius of 2.8 m and about 4.2 m/s. Every 5 laps he runs this state machine (`RS.mode`):
  - `run`: circles the player for 5 laps.
  - `approach`: jogs to 1.4 m in front of where the player is looking.
  - `stare`: about 2.4 s, wide eyes, head tracks the player.
  - `puke`: about 2.4 s, three heaves. Green-yellow particles fly from his mouth, a shiny puddle grows and fades after about 15 s, and there's a retch sound and a controller rumble.
  - `recover`: wipes his mouth, then returns to `run`.

## Giant flying sea turtles
- Four turtles, built by `buildTurtle()`:
  - Lathe shell with a top-down planar UV, so the canvas scute texture lines up.
  - Plastron, barnacles, beaked head on a neck, and extruded flippers.
- Each turtle is scaled 5–10×, about 15–25 m long.
- They fly straight lines across the valley at 26–50 m altitude:
  - Front flippers flap and feather.
  - Each turtle gives a deep call when it passes overhead.
  - Each one casts a blob shadow on the ground.
  - They respawn on a new heading after leaving a 200 m radius.

## Code map (top to bottom in the script)
1. Helpers: `rr`, `wrap`, noise (`hash2`, `vnoise`, `ridged`)
2. Renderer, scene, lights, camera rig
3. Procedural textures (`canvasTex`, `retile`, `stones`, `awningTex`, and so on)
4. Materials (`M`), geometry helpers (`box`, `flat`, `limbGeo`, `torsoGeo`, `merge`, `bakeStatic`), panels and `woodSign`
5. Town ground, fountain, `makeDonut`, lamps, benches, welcome sign
6. Sky, sun, mountains, lake, forest, rocks, grass and flowers, clouds
7. Turtles and `updateScenery()`
8. Stores (`makeStore`, `windowAt`, `pendant`), shop buttons, per-store decor
9. People (`buildFace`, `buildPerson`), Glaze, café furniture, Rimshot, `updateGlaze()` and `updateRunner()`
10. Speech bubble, gift board, audio, game state (`S`, `reset`, `buy`, `give`)
11. HUD, flying donuts, particles, controllers, desktop input, movement and collisions
12. Start buttons and the main `setAnimationLoop`

## Rebuilding Rimshot's baked data
From `tools/rimshot/`, with Playwright and `pip install bpy==4.2.0 numpy pillow` (Python 3.11):
1. `node export_src.js`: dumps his rest-pose geometry and skin weights from the page to `rim_src.json` (paths inside assume the repo root and a local three.js; adjust them for your setup).
2. `python bake.py rim_src.json bake_out`: voxel-remeshes body and hands into one seamless sculpt, adds veins, wrinkles and folds, decimates to a 34k-triangle game mesh, transfers weights and bakes normal + AO maps (about 90 s on 4 cores).
3. `python embed.py bake_out ../../donut-town-vr.html`: writes the data block into the game.

## Testing
There's no browser in CI. Syntax-check by extracting the inline script and running `node --check`. A useful smoke test mocks `THREE` and `document` with deep Proxies, runs the script, then calls the animation loop a few hundred times. That catches reference and runtime errors in setup and per-frame code.

Headless Chromium with SwiftShader (`--use-angle=swiftshader --enable-unsafe-swiftshader`) also renders the desktop mode. If the CDN is unreachable, serve r128 from npm (`npm pack three@0.128.0`) by routing `**/three.min.js` to the local file. Frame rate is very low there, so override `clock.getDelta = () => 0.05` to step the simulation. Final checks have to happen in a real browser or on the Quest.

## Ideas not done yet
- A lighter "performance mode" toggle for Quest 2.
- A true installable app (APK) would require porting to Unity or Godot with real 3D models.
