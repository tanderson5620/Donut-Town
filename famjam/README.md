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

Ratings (1-10): SPD, POWER, 3PTS, STEAL, DUNK, BLOCK and PASS. POWER wins shoves, dunk rejections (a stronger blocker flattens the dunker for 2 s), posterizes and box-outs. PASS makes passes faster, truer and harder to intercept, and good passers show off: behind the back (wrapping round his back), a 360 spin, a flip with the release at the top, a football snap back through his legs to a teammate behind him, over the head, a no-look, or a moonwalk (gliding backward toward his man, then a flick back over the shoulder) - the ball stays in his hand through the move.

Four quarters of 1:00 (default), 1:30, 2:00 or 3:00, picked on the team card and remembered on the device; overtime is half a quarter (30-60 s).

Three straight baskets by one player sets him on fire (flaming ball, unlimited turbo, near-automatic shots) until the other team scores.

Going on fire is a 2-second golden power-up: the game freezes and the camera zooms in on him, he crosses his forearms over his chest to charge, then throws both arms down by his legs. A flash and a shockwave go off, his hair turns gold and stands up in spikes, his muscles pump up and a gold aura ignites. He plays powered up (gold hair, aura, pumped-up sprites) until he cools off. Gator's is different: 5 s of twerking (`G.TW`, `G.show` kind 'pu'), side-on, with just him and Lisa on screen, to the first 5 seconds of "Add It Up" (Blah Blah) by Bonkers Beat Club (`sfx/gator_song.mp3`, Epidemic Sound).
- **The booty:** he squats with his hands on his knees and his rear stuck way out, with two basketball-sized cheeks (spheres in his shorts' cloth on the hips bone, `pose.booty` in gen.html). It's a butt twerk, not a back twerk: his back, head and arms hold perfectly still while the pelvis alone pops up and drops, rolling round as it goes (`pose.pelvis`: the pelvis turns about the base of the spine, the spine is turned back by as much, and a small IK, `legTo`, keeps his feet planted). Both feet stay flat and level on the floor (`pose.flat`) and both hands stay planted on his knees (`pose.knees`, arm IK, `handOnKnee`). He's turned a touch past profile (`yaw`) so the far arm hides behind the near one, and the skin under the shorts is tucked in deeper for the squat (`pose.tuck`).
- **The slow-motion smack:** Lisa walks in behind him (`cameo: 'lisa'`, drawn by `G.showCameo` in place of the real her; her sprites load for any game with Gator, `G.loadIds`). In slow motion with cinema bars she winds up and smacks it at 2.5 s, and her hand lands on the back of the booty (the factory records `meta.butt`). That smack is his flash: gold hair, aura, pumped muscles, a bull-whip crack (`sfx/whip.mp3`, Epidemic Sound) and SMACK!.
- **After the flash:** he twerks harder and nearly twice as fast (`twerk_hard`, pumped), with pursed lips (a pixel-art pout on his mouth, `lipsSprite`), while she smacks it 3 more times (whip cracks, the cheeks rippling, `twerk_hit_hard`) and walks off.
- **Quarter starts and the buzzer:** he just twerks (kind 'solo', no Lisa) at the start of every quarter while everyone waits for the inbound, and at the final buzzer. The tip-off runs 1.6 s longer, and he steps up to the near sideline in front of everyone, then jogs back to his spot before the whistle.
- **Team card:** his picture fades into his twerking sprite and back every 5 seconds (`twerkCard`, `X.drawFrameAt`).

On fire, his best 3 ratings jump to 10 for as long as he stays on fire. On top of that, his best rating (his specialty) is turned up even more: speed - 30% faster with afterimages; pass - every pass is a fancy move and can't be intercepted; 3PTS - every release is green, about 99% from anywhere, and the net catches fire on a three; dunk - takes off from much farther out, longer hang time in flames, usually shatters the glass, and only a defender on fire can reject it; block - blocks almost everything with longer reach; power - every shove flattens and nobody can move him; steal - much better steals and interceptions.

3-point shooters (Tyler, Karen) pulling up for a three while moving side to side (across the line to the rim) do a Harden step-back first (`stepback`: gather the dribble, hop back about 0.7 m, land square, then the jump shot 0.34 s in; let go of SHOOT during it and the shot goes up on its own at the top of the jump as an ok look, and a make is called STEP-BACK THREE!). They shoot a Kobe-style fadeaway when they pull up while moving away from the basket (`shoot_fade`: leaning back, the near knee kicked out, drifting away from the rim), and about 2 in 10 of their made threes end in a Steph-style shoulder shimmy once they land (`shimmy`). A dunker on fire (DUNK among his top three ratings) can take off from behind the 3-point line (range at least 1.6 m past the arc), and a dunk launched from behind the line counts for 3 ("3-POINT DUNK!"). Dunkers with DUNK 9+ (on fire counts) throw signature dunks, 12 smooth frames each, same timing and block window as any dunk: under the legs (2.5 s of slow motion up to the slam, 30 frames, the camera in close on the whole body, face kept upright to the camera; the ball is rendered into these frames in 3D with him (`DK_BALL` in gen.html) so his legs hide it right: in his near hand, under his raised near thigh, out in front in his far hand and up to the rim, while the game's own ball stays hidden until the slam), behind the back, off the backboard to himself (from close in; the dunkers pick it for about 1 in 4 of their close signature dunks, everyone else 1 in 6; slow motion from the toss until it's back in his hand, 2.5 s, the camera zooming in on the spinning ball as it flies to the glass and back out after the bounce, full view and full speed again as he catches it), a front flip, a mid-air double-biceps flex to the camera, a bounce to himself, and from way out the stretched-arm cartoon dunk or the free-throw-line dunk (tongue out). A beat after every slam a guy shouts "woo-hoo!": the dunker, or her teammate when a woman dunks (not when two women are teamed up).

Bruisers (STR 9+, on fire counts) shove with a roundhouse kick, a Superman punch or a kick to the shins, and a bruiser rejecting a dunk hammers it with both fists from a bent-back C in the air, launching the dunker out to midcourt. The moonwalk pass is only for PASS 9+ (on fire counts).

Ball handlers, the point guards (Gator, Bianca, Katelyn), change direction with a crossover or a behind-the-back dribble, which protects the ball; on fire it can put the defender on the floor. Goaltending is legal, shoving is encouraged.

Alan Anderson goes by Gator and Kenny Gorman by Uncle Kenny on screen (`first` in `data.js`; a name too wide for its card is squeezed to half width, `nameFit` in `ui.js`). Bianca plays point guard for the Andersons (pink #2). Knockdown trash talk follows the family tree (Alan + Lisa Anderson with Tyler and Carl; Karen, Alan's sister, + Kenny Gorman with Katelyn, Kody and Kameron): an uncle or aunt flattening a niece or nephew gets WHO'S YOUR UNCLE?!?! / WHO'S YOUR AUNTIE?!?! (with a double crotch chop), SIT DOWN JUNIOR!!! or KIDDIE TABLE'S OVER THERE! (pointing off at it); cousin on cousin, WEAKEST COUSIN I KNOW!; a woman dropping a guy, WIMP! and friends. Bianca isn't placed in the tree yet (no `gen` in `HW.FAMILY`), so she gets the woman-drops-a-guy lines but no uncle, aunt or cousin ones. Catchphrases (`HW.CATCHPHRASE`) take the place of a set share of a player's taunts, whoever they flattened, keeping the gesture of the line they replace: Uncle Kenny's HOOCHIE MAMA! is exactly one of every 10 of his, and Lisa's WOOOO WEEEEEE! one of every 5. The taunts last 2 s on top of normal play: he keeps running, catching and blocking as usual.

Every knockdown (shove, dunk rejection, posterize, ankle-breaker) is a hard hit: a freeze-frame with a comic impact star, his head snaps back, the screen shakes and he's launched backwards; he slams into the floor with a cracked crater, dust and blood where his head lands (more when a stronger player did it).

## How the players are made

Like the arcade originals, players are flat sprites (digitized frames) with a big head pasted on top.

- **Bodies**: `tools/gen.html` poses the realistic athlete body from `../hoops` through every move (run, dribble, jump shot, dunk, pass, steal, shove, fall, celebrate) in three facings and saves sprite sheets to `sprites/<id>.png` + `<id>.json` (frame anchors for the feet, head and hands).
- **Extras** (`sprites/<id>_x.png/.json`, a second sheet per player): the power-up (`powerup`, straight at the camera), the pumped-up `idle_buff`, `run_buff`, `drun_buff` and `dribble_buff`, and the taunts (`*_point`, `*_chopU`, `*_chopD`). The muscle pump scales bones in the skinned body while it renders (`BUFF` in gen.html).
- **Gold hair**: `faces/<id>_ssj.png` and `_ssj_back.png` are the photo heads with the hair turned gold and spiked up; `HW.SSJ_PAD` in `js/data.js` says where the photo sits in the bigger canvas. Carl's on-fire head is a different photo, his scowl, lined up on his normal head (same size and place), so he wears that face for as long as he's on fire; `HW.MOUTH_SSJ` puts the free-throw-line dunk's tongue on its mouth. His slow-motion dunks (under the legs, off the backboard) get yet another photo, his yell (`HW.DUNK_FACE`, `faces/carl_dunk.png`, and `carl_dunk_ssj.png` with the gold hair when he's on fire), from the moment the slow motion starts until he lands (`p.dunkFace`, sent to online guests with the tongue flag). The faces carry the sprites' version tag (`SHEET_V`).
- **Heads**: every player's face is cut out of a real photo (`faces/<id>_photo.png`, used for players with `photo: true` in `js/data.js`); the back of the head (`faces/<id>_back.png`) is rendered from the 3D head. A player without `photo: true` gets a rendered `faces/<id>_front.png` instead.

Rebuild the sprites after changing a player's look in `js/data.js` (`HW.PLAYERS` and `LOOK`; the athlete body itself comes from `../hoops/js/`). Needs Playwright:

```bash
node famjam/tools/gen.js
```

## Online (the family on their own phones)

Tap **ONLINE** on the title screen.

1. **Host:** one person taps HOST A GAME and gets a 4-digit room code. SEND INVITE opens the phone's share sheet with a link (`?room=1234`); on a computer the button copies the link instead.
2. **Join:** everyone else taps the link, or taps JOIN A GAME and types the code.
3. **Pick players:** in the lobby each person taps who they want to be. That's up to 4 people with 2 on a team; a player someone has already taken can't be picked.
4. **Together or against:** the host also sets the mode. **TOGETHER** puts up to 2 people on one team against the CPU, picking from either family; a team with one of each family plays as the **Family** (`setup.names`, `G.team()`). **AGAINST** puts people on opposite teams, at most 2 per family.
5. **Start:** the host picks the CPU difficulty and quarter length and taps START. Spots nobody picked are played by the CPU.

How it works (`js/net.js`):
- **The host runs the game.** Its phone runs the real game for everyone. The other phones only send their stick and buttons. The host sends back the picture about 60 times a second (every player, the ball, the scoreboard and the callouts, about 0.6 KB each), plus every sound and effect the game makes.
- **Guests draw it smoothly.** Each guest draws the host's game 0.08 s in the past and blends between updates, so it doesn't stutter.
- **Fair shooting.** A guest's jump-shot release is judged by where their own screen showed the jump when they let go (`p.relSt`), so lag doesn't spoil their timing.
- **Connections.** Phones connect straight to each other over WebRTC. PeerJS (`js/lib/peerjs.min.js`, MIT, loaded only when you go online) uses its free cloud server to introduce them, and its TURN servers relay when a network blocks a direct line.
- **Menus don't stop the game.** Opening the menu (II) on any phone doesn't pause it for everyone.
- **Someone drops out.** If a guest's phone drops, the CPU takes over their player. Tapping TRY AGAIN puts them back as the same player.
- **The host leaves.** If the host leaves, the game ends for everyone.
- **The host has a small edge.** The host plays with no lag at all, so the person with the best connection should host.
- **Testing.** For testing, `?peer=127.0.0.1:9000` points the game at your own PeerServer (npm `peer`) instead of the cloud one.

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
famjam/js/net.js            online play: room codes, lobby, host runs the game, guests send buttons and draw the host's game
famjam/js/lib               PeerJS (WebRTC connections, MIT), loaded only for online play
famjam/js/ui.js             input, menus (team select, player cards, matchup, online lobby and room-code keypad), HUD, callouts
famjam/js/main.js           boot and main loop
famjam/sprites, faces       generated art
famjam/img                  link-preview image (share.png, 1200x630) and home-screen icon (icon.png, 512x512)
famjam/manifest.webmanifest home-screen app name, icon, fullscreen landscape
jam/index.html              redirect from the old /jam/ link
famjam/tools                sprite factory
```

`?quick` in the URL jumps straight to a matchup.

The code files in `index.html` carry a version tag (`?v=18`). Bump it with every update so phones fetch the new code instead of a saved copy, the same as `SHEET_V` and `SFX_V`.

The menus play one of two songs, a coin flip each time they come up: "Bang Bang" by Matt Large or "Talk About It" (instrumental) by Ira Moon (Epidemic Sound, supplied by the owner; `sfx/menu_music.mp3`, `sfx/menu_music2.mp3`, streamed through an `<audio>` element into the mix), starting on the first tap and fading out at tip-off; from the final buzzer through the stats screen it's "Plenty Bands" (instrumental) by Enophi (`sfx/post_music.mp3`), crossfading back to the menu music on the way out. The background crowd alternates two Epidemic Sound arena clips (`sfx/crowd_a.mp3`, `sfx/crowd_b.mp3`, supplied by the owner) with a 1 s crossfade; the basket cheer (`sfx/cheer_made.mp3`, an arena crowd trimmed so it is already roaring when the ball drops) and the net on a made jump shot (`sfx/net0-11.mp3`, goal-in-basket and net-rustle takes) is from Epidemic Sound too, every shove comes with an attack yell (`sfx/shove_f0-2.mp3` for the women, `sfx/shove_m0-7.mp3` for the men) and, when it lands, a punch to the face (`sfx/hit0-3.mp3`, also on every knockdown); a knocked-down player hits the floor with a body landing on boards (`sfx/land.mp3`), and a guy sent flying 3+ m (or hammered to midcourt) screams on the way (`sfx/scream.mp3`). Powering up, the guys yell (`sfx/yell0-6.mp3`, anime battle yells, each lined up so its loudest moment lands on the blast) and the women let out a warrior's battle scream through the whole transformation (`sfx/yell_f0.mp3`), over a fireball whoosh that swells into the blast for everyone (`sfx/fireball0-1.mp3`). After a dunk a guy shouts "woo-hoo!" (`sfx/shout0.mp3`), a guy who knocks someone down talks trash now and then (explicit, `sfx/trash0-1.mp3`; never on a block - blocks have no voices), a woman who takes a hit grunts (`sfx/pain_f0-3.mp3`), a thief laughs like a cartoon bad guy after some steals (`sfx/laugh0.mp3`), a guy left on the floor by a hard hit sometimes calls for help (`sfx/help0-8.mp3`), a guy on defense yells "incoming!" when a dunker takes off from way out (`sfx/incoming0-3.mp3`; every time when he's on fire, at most once every 10 s) - those spoken lines take turns, never talking over each other - a guy goes "hup!" taking off for a dunk or jumping to block (`sfx/hup0-3.mp3`), a badly mistimed shot that misses gets an "ew!" (`sfx/ew0-2.mp3`), a posterizer or a shattered backboard gets a "wow!" in place of the woo-hoo (`sfx/wow0-5.mp3`), going on fire gets an excited "oh!" (`sfx/happy0-2.mp3`), a fan yells "baba booey!" after a made three - always the first of the game, then about 1 in 3 (`sfx/baba0-2.mp3`) - and at the final buzzer a guy on the winning team whoops "yeah!" (`sfx/shout1.mp3`). The trick-pass whoosh (`sfx/pass_whoosh.mp3`, on every fancy pass as the ball leaves the hand), the steal swipes (`sfx/steal1.wav`, `sfx/steal2.wav`, taking turns on every attempt) and the dribble bounces (`sfx/dribble0-3.wav`, WAV so there is no encoder delay and each thump lands on the frame the ball touches the floor) are from Epidemic Sound, supplied by the owner, and so are the dunk slams (`sfx/dunk0-4.wav`, five rim hits with the rim ringing, never the same one twice running) and the catch taps on passes, interceptions and rebounds (`sfx/catch0-1.wav`). Each tip-off starts with a recorded referee whistle (`sfx/whistle.mp3`, Epidemic Sound): two short blasts, then the long one right on GO. Sound URLs carry a version tag (`SFX_V` in `audio.js`), and so do the sprite sheets (`SHEET_V` in `gfx.js`); bump it when a file is replaced under the same name so phones don't keep a saved copy. The other recorded sounds in `sfx/` (announcer voice and impacts) are from Kenney.nl, CC0 public domain (see `sfx/LICENSE-kenney-CC0.txt`).
