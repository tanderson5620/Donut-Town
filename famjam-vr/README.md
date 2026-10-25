# FAM JAM VR

FAM JAM in a 3D arena for Meta Quest and other WebXR headsets. It's played at https://tanderson5620.github.io/Donut-Town/famjam-vr/: open the link in the Quest browser and tap **ENTER VR**. Without a headset, the same page shows the arena on screen and plays with the keyboard.

## How it's built
- **The game is the real one, unchanged.** `index.html` sets `<base href="../famjam/">`, so every script, sprite sheet, face and sound loads straight from `famjam/`. `vr.js` reads `famjam/index.html` for the script list, so a FAM JAM update (new moves, new files) reaches VR by itself. Nothing in `famjam/` is edited for VR; `vr.js` only wraps what the game already exposes.
- **The frame loop.** The game's `requestAnimationFrame` calls are queued by `vr.js` and run from the headset's frame (the page's own frames stop in VR), or from the screen's outside VR.
- **The arena** (three.js r128 from cdnjs, the same build as Donut Town and Hoops Jam):
  - The court picture `gfx.js` draws its floor from, in the two families' colors. The floor writes no depth, so the players' faint reflections show through it.
  - Hoops after the arcade art: padded base, steel arms, glass board, rim, and a net that swings after a swish.
  - Twelve rows of stands on all four sides, packed with fans who stand up with their arms raised on big plays (`X.hype`). The near stands show fans from behind.
  - Courtside ad boards, a lighting truss with lamps, the families' banners, and a center-hung jumbotron showing the arcade picture (scoreboard, slow-motion close-ups, the cut-ins).
- **The players** are stand-up cards that turn to face you. Each one is drawn every frame by the game's own `X.drawPlayer`: for a moment `X.proj` maps court meters onto the card, so the sprites, photo heads, gold aura, afterimages, the cartoon dunk arm and hit flashes are exactly the game's. The 3D floor adds the shadows, your green ring and the fire glow. Over your player: **YOU**, the shot meter while you shoot (the same bar and green window as the HUD), and a man-down countdown.
- **The ball** is a real ball where the game puts it. In a player's hands it sits on his card in front of or behind him, the way the arcade picture layers it.
- **Effects:** `X.burst`, `flame`, `goldSpark`, `blood`, `crater`, `ring` and `powerFlash` are wrapped, so every spark, flame, blood pool, crater, impact star and power-up shockwave also appears in 3D, with a controller buzz on hits.
- **Callouts** (BANG!!!, BLOCKED BY JAMES!…) float big over the court, drawn by the game's own `UI.drawCallouts`.
- **Menus** go on a big screen in front of you (the arcade picture itself). Point a controller at it and pull the trigger, which sets `HW.In.tap` in the picture's pixels.
- **Online play works as normal.** A VR player can host or join. The invite link sends phones to the regular game (`famjam/?room=…`).
- **Voice chat** (the game's `voice.js`): turn on VOICE in the lobby or the pause menu to talk with everyone in the game. Tap **MIC FOR VOICE CHAT** on this page before ENTER VR, so the headset asks about the microphone outside VR (`#vrmic`); after that VOICE just works in the headset.
- **Invites without texting:** ONLINE > BUZZ A PHONE pushes an invite to a family member's phone (their phone set up once with GET BUZZED, the free ntfy app), and tapping it drops them into your room. CHALLENGE still reaches anyone who has the game open.

## Seats
Press **X** (or click the right stick, or **V** on a keyboard) to switch seats:
- **Upper deck** (the default): row 5 of the near stands, with the whole court in view.
- **Courtside:** the near sideline, life size.
- **Tabletop:** the whole arena in miniature on a table, with the arcade picture on a TV behind it.

## Controls
| | Quest Touch | Keyboard |
| --- | --- | --- |
| Move | left stick (or right stick) | arrows / WASD |
| Shoot (hold, let go at the top); on defense, jump to block | A | J / Space |
| Pass; on defense, a steal attempt | B | K |
| Shove (dunk with the ball) | right trigger | turbo + pass |
| Turbo | grip or left trigger (works like Shift: + pass shoves, + shoot at the rim dunks) | Shift / L |
| Pause | Y | Esc / P |
| Change seat | X or right-stick click | V |
| Menus | point + trigger, stick to move, A to confirm, B back | click, arrows, Enter, Esc |

On a screen, drag with the right mouse button to look around.

## Testing
There's no headset in CI. Headless Chromium with SwiftShader renders the page outside VR, with three.js served from npm (`three@0.128.0`). The fake Touch controllers go through `FJVR.applyPads(left, right)` (gamepad-shaped objects), and `FJVR.three` exposes the scene for checks. Final checks need a real Quest.
