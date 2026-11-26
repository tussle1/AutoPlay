# SixRings Pro — Autoplay Userscript

A local, browser-side autoplay userscript for Databallr SixRings ISO 3D. It sends the game's documented keyboard controls, presents a configurable dashboard, and keeps profiles, logs, and statistics in local storage. It does not make network requests or alter game/server state.

## Install

1. Install Tampermonkey or Violentmonkey in your browser.
2. Create a new userscript and paste in [`sixrings-pro.user.js`](./sixrings-pro.user.js), then save it.
3. Open <https://databallr.com/sixrings/iso/v3?level=1> and wait for the dashboard.
4. Start a game, then press **Start Autoplay**. The canvas receives focus while the bot runs.

The dashboard can be dragged by its header. **F6** starts/pauses, **F7** pauses/resumes. Pause releases keys immediately; browser focus loss also pauses the engine.

## Controls and behavior

The script uses the page's documented controls: **WASD** to move, **Space** to shoot, **J** to cross, **K** to step back, and **L** to drive. Its serialized input queue prevents the offense, Auto Dribble, and Auto Guard routines from holding conflicting keys at once. Dribble styles change the mix of crossover, drive, and step-back inputs. Personality presets tune the aggression, pace, movement, and shot preferences. Custom profiles can be saved, loaded, copied, renamed, and deleted.

SixRings does not expose a documented public gameplay-state API to this userscript. The script therefore reads only visible page/HUD signals and otherwise estimates possession phases and uses a forward/lateral defensive movement pattern. It cannot reliably see player coordinates, ball location, defender distance, shot-meter timing, or which side of a score changed. Shooting outcomes and some statistics are consequently estimates, not authoritative game telemetry. Auto Guard cannot perform coordinate-based opponent tracking or know when a steal/block is valid. Auto-restart clicks a visible rematch button only if the page exposes one.

Browser-generated keyboard events are synthetic. If the current game build ignores synthetic events, the dashboard will still run but gameplay inputs will not register; the browser does not let a userscript manufacture trusted physical key events. The game can also change its key bindings or DOM between releases.

## Files

- `sixrings-pro.user.js` — standalone Tampermonkey/Violentmonkey userscript.
