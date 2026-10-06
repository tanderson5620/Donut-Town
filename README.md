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
- **Quest:** left stick moves (head-relative), right stick snap-turns 30°. Point a controller and pull the trigger to press buttons or grab donuts; touching a donut with a hand also catches it. A wrist HUD is attached to the left controller. Hands follow each controller's reported handedness and are rebuilt if the Quest swaps controller slots. You see your own hands (fingers curl with the trigger and grip) and sleeved arms, solved with 2-bone IK from the head to each controller (`attachPlayerHand`, `updatePlayerArms`).
- **Dev shortcuts (temporary, `pollDev`):** press **Y** (left controller, or the Y key) to reload the page (a completely fresh game). Press **X** (or Y + X) to skip the 1v1: Rimshot leaves and Beau appears right away.
- **Sprint** (`SPRINT`): click the left stick to toggle (VR; it ends when you stop moving) or hold Shift (desktop). You move 4x faster at 75% of your eye height, and can't interact with anything (no pointing, grabbing, punching or petting) until you stop.
- **Phone / tablet** (`MOBILE`): the start button reads **Play on phone**; it goes fullscreen and tries to lock landscape. A joystick (bottom-left) drives the WASD keys, drag anywhere to look, tap to interact, and hold-buttons on the right change with the mode (`updateMobileUI`: Sprint / Boost / Fast, Defense, Up / Down, Get out / Land). Small top-right buttons: 🐶 (get Beau) and ↻ (restart). Pixel ratio is capped at 1.25 on phones.
- **Third-person view** (`chaseCam`, `showAvatar`): on desktop and phone, the car, motorcycle, helicopter and hoverboard switch to a zoomed-out chase camera behind the vehicle, with your character visible in the seat or on the board. In VR it stays first person.
- **Desktop:** WASD or arrow keys to move (Shift to sprint), drag to look, click to interact. The HUD is a corner overlay that reuses the same canvas.

## Locomotion and collisions
- The player is `rig`, a Group that contains the camera and both controllers.
- `movePlayer()` moves the rig. `snapTurn()` rotates the rig around the head.
- `resolve()` pushes the head position out of the AABB `colliders` list and the lake circle, and clamps the player to world bounds.
- `box(..., collide=true)` automatically registers a collider; `solid()` registers an invisible one.

## World layout
Units are meters. -Z is "north", the direction you face at spawn.
- **Spawn:** (0, 0, 6), at a wooden welcome sign.
- **Main street:** cobblestone, x ∈ [-3, 3], z from 9 to -31. Flagstone sidewalks run alongside it, with lamps and pines.
- **Plaza:** center (0, -12), radius 5. It has a fountain with a giant rotating donut, benches, and Paige Glaze at (-2.7, -12.6) beside a café table.
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
3. Give the gifts to Paige Glaze from the gift board next to her.
4. Her affection meter goes from 0 to 100. At 100 she agrees to be your girlfriend, and a "Start a new story" button resets the game.

Affection per gift:
- Correct sprinkle (`S.pref`): +14. There's a 40% chance she then changes her preference.
- Wrong sprinkle: +3.
- Flowers: +18.
- Date ticket: +34.

The content stays non-sexual. By request, combat in the wasteland is graphic: blood sprays and pools, bloodied clothes and severed arms on big hits (`blood`, `bloodPool`, `severLimb`).

## Minigames
- **DONUT DASH** (Arcade): press **Play** on the first cabinet. A Pac-Man-style game on a big screen: you're a pink donut eating sprinkles; coffee cups let you chomp the Burnt Bunch ghosts. Move with either thumbstick or WASD/arrows. Every 150 points pays 1 donut. State lives in `DD`.
- **Punch Rimshot**: any time he's around (`punchable()`), swing a fist into him (VR), point and pull the trigger, or click him (desktop). He staggers comically, then challenges you. When he starts puking (until you've won Beau), a pop-up says "Hit him when he's down to win a dog!" (`showPopup`).
- **1v1 at Rimshot's Court** (east of town, about x 18-33, z -6 to 8): punch Rimshot, or point at / click the court sign (`COURT_SIGN`, `courtChallenge()`) to start straight away. first to 3, one point per basket. VR: hold the trigger, swing and release to throw (aim assist helps). Desktop: hold the mouse to charge, release at mid power to shoot. Grab rebounds by touching the ball or just standing over a loose one; steal by touching his dribble (VR) or clicking the ball nearby (desktop). Make it, take it: the scorer keeps the ball at the top of the 3-point line.
  - **Dribbling:** in VR, push the ball down (a quick downward hand move, trigger not held) and it bounces back up to your hand; catch it (`startDribble`, possession `'dribble'`). You move 1.6x faster with the ball. The dribble moves with you and homes in on your hand on the way up, so catches are sure-handed; Rimshot only pokes away very low dribbles, rarely. Moving more than ~2.2 m with the ball without dribbling is **Traveling** (`traveling()`, Rimshot's ball). Lose the bounce and it's a loose ball; Rimshot can poke a low dribble away. Desktop dribbles automatically while you move.
  - **Defense stance:** press **A** (right controller) or **Space** to toggle (`BB.stance`): you crouch, shuffle sideways faster and back/forward slower. Standing in his drive path in a stance slows him down and makes him reroute. Rimshot reads your arms (`guardShape`): he attacks the side your hands don't cover, drives all the way when your hands are up and pulls up for a jumper when they're low (`pickDriveSpot`).
  - Rimshot dribbles in an athletic base (bent knees, hips down), pumping the dribble arm with a wrist snap, guarding with the other arm, with crossovers on drives.
  - **Punching in the 1v1:** you can punch him any time during or right after the game (the hand holding the ball doesn't count); he staggers and drops the ball if he had it (`bbPunch`).
  - Block his shots: raise a hand to about head height near the ball or its path during his rise or the first ~0.9 s of the shot (VR; forgiving), or click within ~2 m in front of him (desktop). You can also swat it out of his hands as he rises; a block pops up "Get that shit out of here!". Rimshot defends in a low, wide stance with shuffle steps and a high/low hand. Winning makes Rimshot leave for the rest of the session (`RS.mode = 'gone'`) and wins you **Beau**. State lives in `BB`; `MODE` is 'town' | 'arcade' | 'bball'.
- **Beau**: a black miniature schnauzer (bushy brows, beard, folded ears, teal collar) built by `buildBeau()`. After you beat Rimshot he walks about 2.6 m dead ahead of you (in view without looking down), facing the way you're heading; he trots when you move and sits when you stop, wags, and yips. Pet him by touching his head (VR) or clicking him (desktop). Every 3 s he turns back to smile and wag at you; every 10 s (if Paige is within 40 m) he runs over, hops up to lick her face ("Missed you Beau, so much!") and runs back (`BEAU.mode`: follow / paige / lick / back / beg / chase / eat / return / fart).
- **Beau's menu** (`BMENU`): point at Beau and pull the trigger, or click him, to open: Pet Beau, Good boy ("You're a good boy, Beau!"), Take him for a ride, Play jumps, Take me to a turtle, Helicopter ride, Close. Touching his head in VR still pets him directly.
  - **Take him for a ride** (`CAR`, `MODE = 'drive'`): a black compact sedan (no real-brand logos) drives up and honks; you're put in the driver's seat (head locked to the seat with `lockHead`) and Beau rides shotgun. VR: right trigger gas, left trigger brake/reverse, left stick steer (stick up/down also works), **B** gets out. Desktop: W/S, A/D, Shift boost, **E** gets out. The car follows `terrainH()` and bumps off `colliders` and water.
  - **Play jumps** (`COUCH`, `MODE = 'couch'`): you teleport to your house in Hayward (Donut Town; `HOUSE`, west of Main Street at about (-24, 10), front door facing town) and sit on the living-room couch with your own legs visible (`LEG_POSES`). Beau runs three commands side to side, facing the way he runs: **Through!** (jumps through the hoop your legs make), **Tunnel!** (goes under both legs held out), **Clear it!** (a big high jump over one leg resting on the other). Then you stand back up.
  - **Helicopter ride** (`HELI`, `MODE = 'heli'`): a blue bubble helicopter flies down and lands in front of you; you're the pilot (left seat) with Beau beside you. VR: right trigger up, left trigger down, left stick fly forward/back and sideways, right stick turn, **B** lands and lets you out. Desktop: Space up, C down, W/S forward/back, A/D turn, Shift fast, **E** lands and lets you out. It can fly anywhere in the world (up to 400 m), land on the Golden Gate or Bay Bridge decks (or fly under them), but won't set down on water; bumps off buildings and tilts its nose with speed while your view stays level.
  - **Take me to a turtle** (`SKY`, `MODE = 'turtle'` then `'sky'`): pick one of the four turtles; heading north means San Francisco, south means Los Angeles. You and Beau ride on its shell (it speeds up and climbs to ~115 m), you can walk around on the shell while it flies (`SKY.local`, `shellY`). Over downtown you both jump, open your own parachutes and float down to a downtown intersection (`DROP`). Walk off the shell's edge mid-flight and you both parachute to the ground below (`leaveTurtle(true)`), then a red motorcycle (`MOTO`) pulls up so you can ride the rest of the way, Beau sitting on the tank in front of you; it drives like the car (`updateVehicle`).
- **Treats**: a jar on the fountain rim (`JAR`). Grab one by touching the jar and pulling the trigger, or pointing at it (VR), or clicking it (desktop); you say "Want a treat? Yeah, big Beau?" and Beau sits facing you, begging. Swing and release the trigger to throw it (hand speed ×4.5, 14-26 m/s, so 100+ ft), or click again on desktop (about 150 ft). Beau sits and watches it fly, then leaps there in one big arc from wherever he stood, however far it went (`BEAU.jump`), eats it disgustingly loudly, trots back and farts near you. Paige watches Beau fly (turning to track him), leaps after him 3 s later (`paigeLeap`), scoops him onto her right shoulder and runs back to you singing "He's the cutest boy, Beau's the cutest boy!" (Beau mode `ride`), shows him off on her shoulder for 2 s with the song still up, sets him down, then strolls back to her spot (`GZ.trip`). State lives in `TREAT`.

## The open road (section 6b)
- `rangeH()` carves passes through both mountain rings along x ≈ 0 and tapers the rings' outer edges to the lowlands. The ground plane is 4.6 km across; the sky follows the rig.
- Roads run north from Main Street to **San Francisco** and south to **Los Angeles** (around z 1300 to 1850: stucco blocks, a glass downtown, palm-lined streets, a beach and a pier with a turning Ferris wheel, and big white "LOS ANGELES" letters on a hill). Lowland foothills (`HILLS`) and oak trees line the way.
- **San Francisco is modeled on the real city** (section 6b, `sfx`/`sfz`/`sfp` map real longitude/latitude to game meters: north = -z, east = +x, 1 game m ≈ 9 real m; hills ×1/4.5, towers ×1/3.5). The highway arrives from the south like US-101 at the Daly City line (z -1300) and the city runs ~1.2 km to the Golden Gate (z ≈ -2560).
  - Real coastline: `SF_SHORE` is the city's shoreline polygon (lon/lat); north of the city line everything outside it is water (`inSFLand`, `SF_SEA`), except `SF_LANDS` (Marin Headlands, Alcatraz, Yerba Buena, Treasure Island). Open water planes continue the Pacific and the bay past the map edge: Ocean Beach on the west, the Golden Gate to the north, the bay along the Embarcadero to the east. The city ground is one terrain mesh (land and water triangles split, the world grass plane dips underneath).
  - Real hills (`CITY_HILLS` by lat/lon): Twin Peaks, Mt Davidson, Mt Sutro, Nob, Russian, Telegraph, Pacific Heights, Bernal, Potrero, Buena Vista, Lone Mountain, Alamo Square; parks and forests by real extent (`SF_PARKS`: Golden Gate Park + Panhandle, Presidio, Lands End, Dolores, McLaren, Lake Merced, Union Square, Civic Center…).
  - Streets: a grid aligned on Powell and Geary (`SF_G` = 64 m) wherever there's city, plus the real arterials (`SF_SPECIAL_ROADS`): Market St (Ferry Building → Castro), the Embarcadero, Columbus Ave, Doyle Dr/Lombard to the Golden Gate Bridge, Park Presidio/19th Ave, the Great Highway, US-101 and the Bay Bridge approach. Buildings by district (`SF_DIST`): Financial District and Transbay towers, downtown, SoMa brick, and pastel row houses everywhere else.
  - Landmarks at their real spots (`sfLandmarks`): Ferry Building (clock tower facing Market St) with the **Bay Bridge** beside it (Rincon Hill → Yerba Buena, silver, drivable), **Salesforce Tower**, **Transamerica Pyramid**, 555 California, 181 Fremont, Millennium Tower, Embarcadero Center, Coit Tower on Telegraph Hill, crooked Lombard St on Russian Hill, Fisherman's Wharf, Pier 39 with sea lions, Ghirardelli Square, Alcatraz, the **Golden Gate Bridge** (Presidio → Marin, drivable; `suspensionBridge`), Palace of Fine Arts, City Hall, Union Square, the Chinatown gate, Oracle Park, the Painted Ladies on Steiner St at Alamo Square, the Castro rainbow flag, Haight-Ashbury (colorful Victorians along Haight St and a peace sign), Sutro Tower, Golden Gate Park (Conservatory of Flowers, de Young, Japanese Tea Garden pagoda, Stow Lake + Strawberry Hill, Spreckels Lake, the Dutch windmill), Dolores Park palms, a cable car running up Powell St (`SF_CABLE`), a ferry running Ferry Building → Alcatraz → Sausalito and sailboats on the bay, and tourist-map style pins (sprites) floating over the top attractions.
  - Restaurants at their real addresses, snapped to the nearest lot (`SF_REST_SPOTS`, `sfLot`): Tadich Grill (FiDi), Swan Oyster Depot (Polk St), La Taqueria (Mission), Boudin Bakery (Fisherman's Wharf). The Tenderloin block is near Eddy/Jones.
- `terrainH(x, z)` gives ground height anywhere (rings, hills, the bridge and pier `DECKS`); walking, Beau, treats and the car all use it. `inWater()` blocks the bay and the ocean. City buildings add `colliders`. Each city group is hidden beyond ~1.15 km (`updateWorld`).

## The wasteland (raiders) and city pedestrians
- Between each mountain pass and its city line (|z| 420 to 1270, `WASTE`, `inWaste`) the highway is Mad Max country, with wrecked cars and tire piles. Raiders on foot (`FOES`, low-poly `buildFigure` with mohawks and goggles) spawn around you, chase, wind up melee swings and throw rocks (`ROCKS`); spiked buggies (`BUGGIES`) hunt you while you drive and ram you.
- You have health (`PH`, HUD bar "HP" + WASTELAND/SAFE). Damage flashes red; the car absorbs some. At 0 you're "wrecked" (`wasted()`): back to Donut Town at full health. Health regenerates outside the wasteland. High in the helicopter you're out of reach.
- Fight back: punch raiders (VR fist; desktop click/tap them or press **F**; phone **Punch** button) – two hits knock one out; run them down at speed in the car/motorcycle (one hit) or with a low helicopter; ram a buggy head-on above ~15 m/s to wreck it. Knockouts are cartoony (they fall over with stars and fade away).
- **Looks like Mad Max:** sand over the whole stretch, dead trees, red rock spires and mesas, desert-colored foothills, burning barrels by the road, and an orange dust haze (fog + sky tint, `updateHaze`) while you're out there.
- **Fire cannons** (`CANNONS`, 12 spiked turrets): when you fly the helicopter over the wasteland they track you and lob flaming cannonballs (`FIREBALLS`, leading your speed) that hit at any altitude (15 damage). Destroy them with weapons.
- **"Glazed & Confused" outposts** (`OUTPOSTS`, one on each highway at |z| 850, x 20-70, gate facing the road): a scrap-walled fort with spikes, shacks, a giant tire-donut sign and a trader. Inside is safe (raiders and cannons ignore you). The workbench holds three **exclusive weapons** you can't get anywhere else (touch / point+trigger / click to take one; one at a time, `WPN`):
  - **Sprinkle Blaster**: rapid rainbow bolts (raiders 2 hits, buggies 4, cannons 6).
  - **Glaze Cannon**: lobbed glaze bomb that explodes (radius ~7 m): knocks out raiders, wrecks buggies, destroys cannons.
  - **Torch Glazer**: short-range flamethrower cone.
  - Fire: VR squeeze the right grip (aim with the right controller); desktop hold **F** (aims where you look); phone **Fire** button. Works on foot, driving and flying.
- **Hoverboard** (`HOVER`, Subway Surfers style): a fourth exclusive on each outpost workbench (it doesn't replace your weapon). Once you own it, press **H** (desktop), click the right stick (VR) or tap **Board** (phone) to hop on or off. W / right trigger to go, S / left trigger to brake, A/D / left stick to carve. It's the fastest thing in the game: it builds up to 3,800 m/s and climbs as it speeds up (up to ~70 m, so it clears the cities). LA to San Francisco takes about 2 s. It only bumps into things below 40 m/s. Beau rides on the nose.
- **Stunt jump:** a ramp on the road shoulder by each outpost launches your car or motorcycle (vehicles can now go airborne off ramps, `placeVehicle`) through a ring of fire for a STUNT bonus with fireworks.
- **Hit reactions** (no blood or gore): every hit snaps the raider's upper body away from the impact (`F.chest`), flings the arms and slides him back (`F.react`, `F.kb`). Punches throw dust; Sprinkle Blaster bolts throw sparks and smoke and leave scorch marks on the clothes (`F.char`). Knockdowns are physical (`koFoe`): they fall away from the hit, get launched and tumble from explosions and car hits, bounce and settle with splayed limbs. The Torch Glazer sets them on fire (`igniteFoe`): they panic-run and pat at the flames while their clothes char black and glow, then collapse and smolder. Glaze Cannon blasts leave glaze-pink, charred victims and scorch marks on the ground (`SCORCH`). Wrecked buggies launch, flip onto their roofs and burn with black smoke.
- At exactly the city line (red/white stripe across the road at the welcome signs) nobody can hurt you: raiders and buggies stop at the line and give up. Inside San Francisco and LA, peaceful pedestrians (`PEDS`) walk the sidewalks and step out of the way of vehicles.

## Characters
Both characters are built with `buildPerson(opts)`: a hierarchical rig of hips, thighs, knees, spine, shoulders, elbows and head. `limbGeo()` makes capsule-like lathe limbs and `torsoGeo()` makes lathe torsos. `buildFace()` adds eyes (sclera, iris, pupil, glint, blinking eyelid), nose, ears, brows, lips and a hidden mouth opening.

- **Paige Glaze** (`GLAZE` in code): an original character, the love interest. She's a Black woman with dark brown skin and black hair. She wears a pink jacket and jeans, with a hair bun and gold hoops. She faces the player, breathes, blinks, hops on good gifts and cheers when you win. Her blush opacity tracks affection.
- **Rimshot:** an original basketball player, teal #77 jersey. He isn't modeled on any real person; keep it that way.
  - Built by `buildAthlete()`, not `buildPerson()`: an 18-bone `THREE.Skeleton` drives `SkinnedMesh`es for the skin, jersey, shorts and a compression sleeve (r128 materials need `skinning: true`). Limbs and torso are sculpted ring grids (`skinGrid()`) with muscle bumps and blended joint weights.
  - The head is a sculpted grid (`headPoint()`), split along the mouth line so a jaw bone can open it. It has teeth, a tongue, textured eyeballs that track the player, blinking eyelids, eyebrows, ears, a fade haircut and a headband. Hands (jointed fingers, nails) and sneakers are rigid parts on their bones.
  - Skin uses procedural color and pore normal maps. The jersey neck and arm holes are cut with an alpha mask. He is kept light for Quest 2 (see the triangle count below; beard and hair are alpha-tested shells: stacked offset copies of the skin whose coil texture thins per layer). Skin uses `addSkinShading()`, an `onBeforeCompile` patch that wraps light past the terminator with a warm tint (fake subsurface scattering) plus a soft rim, and the face has a roughness map for the oily T-zone and lips. He dribbles in endless circles around the player at a radius of 2.8 m and about 4.2 m/s. Every 5 laps he runs this state machine (`RS.mode`):
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
  - Shoot one (any weapon) and it gets angry (`angerTurtle`, `updateTurtleMood`): it stops flying, turns and stares down at you; the third hit and it projectile-vomits on you for 50 damage (half your health) wherever you are.
  - They're solid: they climb over mountains and hills in their path (look-ahead on `terrainH`, `tt.curAlt`), and flying the helicopter into one blows it up in mid-air (`heliCrash`): you and Beau fall to the ground (`MODE = 'fall'`, `updateFall`). You wake up back at the spawn, but Beau dies for good (`killBeau`): a numbered grave ("BEAU 1", "BEAU 2", … `makeGrave`) appears beside the spawn sign, and Rimshot comes back so you can earn a new Beau in a 1v1.

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
2. `python bake.py rim_src.json bake_out`: voxel-remeshes body and hands into one seamless sculpt, adds veins, wrinkles and folds, decimates to an 18k-triangle game mesh (`BODY_TRIS` env var), transfers weights and bakes normal + AO maps (about 90 s on 4 cores).
3. `python embed.py bake_out ../../donut-town-vr.html`: writes the data block into the game.

## Testing
There's no browser in CI. Syntax-check by extracting the inline script and running `node --check`. A useful smoke test mocks `THREE` and `document` with deep Proxies, runs the script, then calls the animation loop a few hundred times. That catches reference and runtime errors in setup and per-frame code.

Headless Chromium with SwiftShader (`--use-angle=swiftshader --enable-unsafe-swiftshader`) also renders the desktop mode. If the CDN is unreachable, serve r128 from npm (`npm pack three@0.128.0`) by routing `**/three.min.js` to the local file. Frame rate is very low there, so override `clock.getDelta = () => 0.05` to step the simulation. Final checks have to happen in a real browser or on the Quest.

## Ideas not done yet
- A lighter "performance mode" toggle for Quest 2.
- A true installable app (APK) would require porting to Unity or Godot with real 3D models.
