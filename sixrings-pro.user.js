// ==UserScript==
// @name         SixRings Pro — Autoplay
// @namespace    autoplay.sixrings.pro
// @version      1.0.0
// @description  Local keyboard-driven autoplay controls and configurable basketball playstyles for SixRings ISO 3D.
// @match        https://databallr.com/sixrings/iso/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  const VERSION = '1.0.0';
  const STORE_KEY = 'sixrings-pro:v1';
  const DEFAULTS = {
    personality: 'lebron',
    settings: { aggression: 68, shooting: 52, dribbling: 58, movement: 64, defense: 62, pace: 58, risk: 48, intensity: 64, long: 42, mid: 58, close: 76, dribbleStyle: 'adaptive', dribbleFrequency: 58, shotHold: 570, autoRestart: false, autoDribble: true, autoGuard: true, sound: false, notifications: true, accent: '#9b6bff', scale: 100, compact: false },
    profiles: [], stats: { games: 0, completed: 0, shots: 0, makes: 0, misses: 0, threes: 0, midrange: 0, close: 0, dribbles: 0, possessions: 0, best: 0, history: [], byPersonality: {} },
    logs: []
  };

  const PERSONALITIES = {
    lebron: { name: 'LeBron James', tag: 'Power drive · transition', icon: '01', description: 'Basket-first pressure, fast transitions, and strong finishes.', values: { aggression: 84, shooting: 50, dribbling: 53, movement: 75, defense: 70, pace: 77, risk: 58, intensity: 78, long: 35, mid: 52, close: 88, dribbleStyle: 'power' } },
    curry: { name: 'Stephen Curry', tag: 'Deep range · quick release', icon: '30', description: 'Rapid perimeter movement, high-volume threes, and quick decisions.', values: { aggression: 70, shooting: 88, dribbling: 72, movement: 82, defense: 46, pace: 88, risk: 68, intensity: 83, long: 94, mid: 59, close: 34, dribbleStyle: 'quick' } },
    kyrie: { name: 'Kyrie Irving', tag: 'Handle · create space', icon: '11', description: 'Agile direction changes, creative handles, and close-range craft.', values: { aggression: 75, shooting: 64, dribbling: 92, movement: 89, defense: 48, pace: 80, risk: 75, intensity: 78, long: 52, mid: 70, close: 82, dribbleStyle: 'creative' } },
    jordan: { name: 'Michael Jordan', tag: 'Mid-range · two-way', icon: '23', description: 'Relentless scoring pressure, balanced positioning, and alert defense.', values: { aggression: 84, shooting: 71, dribbling: 68, movement: 72, defense: 78, pace: 73, risk: 59, intensity: 82, long: 39, mid: 84, close: 74, dribbleStyle: 'adaptive' } },
    kobe: { name: 'Kobe Bryant', tag: 'Volume scorer · tough shots', icon: '24', description: 'Independent shot creation, mid-range volume, and unwavering attack.', values: { aggression: 94, shooting: 79, dribbling: 74, movement: 66, defense: 62, pace: 73, risk: 82, intensity: 94, long: 47, mid: 90, close: 67, dribbleStyle: 'creator' } },
    custom: { name: 'Custom AI', tag: 'Your system · your rules', icon: '＋', description: 'Tune every tendency, then save it as a reusable profile.', values: {} }
  };

  const clamp = (n, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Number(n) || 0));
  const clone = value => JSON.parse(JSON.stringify(value));
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const safeRead = (obj, key) => { try { return obj?.[key]; } catch { return undefined; } };
  const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  class Store {
    constructor() {
      try { this.data = { ...clone(DEFAULTS), ...JSON.parse(localStorage.getItem(STORE_KEY) || '{}') }; }
      catch { this.data = clone(DEFAULTS); }
      this.data.settings = { ...DEFAULTS.settings, ...(this.data.settings || {}) };
      this.data.stats = { ...DEFAULTS.stats, ...(this.data.stats || {}) };
      this.data.profiles = Array.isArray(this.data.profiles) ? this.data.profiles : [];
      this.data.logs = Array.isArray(this.data.logs) ? this.data.logs.slice(-100) : [];
      this.save();
    }
    save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(this.data)); } catch (e) { console.warn('[SixRings Pro] storage unavailable', e); } }
    log(level, text) {
      this.data.logs.unshift({ time: Date.now(), level, text });
      this.data.logs.length = Math.min(this.data.logs.length, 100);
      this.save();
    }
  }

  class GameBridge {
    constructor() {
      this.canvas = null;
      this.text = '';
      this.lastScore = null;
      this.lastCue = 'Waiting for game';
      this.gameOver = false;
      this.observer = new MutationObserver(() => this.refresh());
      this.observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['data-state', 'aria-label', 'class'] });
      this.refresh();
    }
    refresh() {
      this.canvas = document.querySelector('canvas') || this.canvas;
      const candidates = [...document.querySelectorAll('body *')].filter(el => el.children.length === 0 && el.textContent?.trim());
      this.text = candidates.map(el => el.textContent.trim()).join(' ').replace(/\s+/g, ' ').slice(0, 10000);
      const lower = this.text.toLowerCase();
      const hud = [...document.querySelectorAll('[aria-live], [role="status"], [data-state], [data-possession], [data-game-state]')]
        .map(el => `${el.textContent || ''} ${el.getAttribute('data-state') || ''} ${el.getAttribute('data-possession') || ''} ${el.getAttribute('data-game-state') || ''}`)
        .join(' ').toLowerCase();
      this.gameOver = /game over|final score|you win|you lose/.test(hud) || ([...document.querySelectorAll('button')].some(b => /play again|rematch/i.test(b.textContent || b.getAttribute('aria-label') || '')));
      if (/opponent.?s ball|their possession|defensive possession|you are defending/.test(hud)) this.lastCue = 'Defense (HUD cue)';
      else if (/your ball|your possession|offensive possession|you have the ball/.test(hud)) this.lastCue = 'Offense (HUD cue)';
      const scoreNodes = [...document.querySelectorAll('[data-score], [class*="score" i], [aria-label*="score" i]')].map(el => `${el.textContent || ''} ${el.getAttribute('data-score') || ''} ${el.getAttribute('aria-label') || ''}`).join(' ');
      const scoreMatch = (scoreNodes || this.text).match(/(?:^|\D)(\d{1,2})\s*[-–:]\s*(\d{1,2})(?:\D|$)/);
      if (scoreMatch) this.lastScore = [Number(scoreMatch[1]), Number(scoreMatch[2])];
    }
    focusGame() {
      this.canvas ||= document.querySelector('canvas');
      if (!this.canvas) return false;
      if (!this.canvas.hasAttribute('tabindex')) this.canvas.tabIndex = 0;
      this.canvas.focus({ preventScroll: true });
      return true;
    }
    key(key, down) {
      const target = this.canvas || document.activeElement || document.body;
      const codeMap = { ' ': 32, w: 87, a: 65, s: 83, d: 68, j: 74, k: 75, l: 76 };
      const code = codeMap[key.toLowerCase()] ?? key.toUpperCase().charCodeAt(0);
      const event = new KeyboardEvent(down ? 'keydown' : 'keyup', { key, code: key === ' ' ? 'Space' : `Key${key.toUpperCase()}`, keyCode: code, which: code, bubbles: true, cancelable: true, composed: true, repeat: false });
      target.dispatchEvent(event);
    }
    async tap(key, ms = 90) { this.key(key, true); await sleep(ms); this.key(key, false); }
    async hold(key, ms) { this.key(key, true); await sleep(ms); this.key(key, false); }
    get scoreLabel() { return this.lastScore ? `${this.lastScore[0]} — ${this.lastScore[1]}` : '—'; }
  }

  class InputBus {
    constructor(bridge) { this.bridge = bridge; this.held = new Set(); this.busy = false; this.stopped = false; }
    releaseAll() { for (const key of this.held) this.bridge.key(key, false); this.held.clear(); }
    async tap(key, ms) {
      if (this.stopped) return;
      this.bridge.key(key, true); this.held.add(key);
      await sleep(ms);
      this.bridge.key(key, false); this.held.delete(key);
    }
    async sequence(keys, hold = 160, gap = 70) {
      for (const key of keys) { if (this.stopped) break; await this.tap(key, hold); await sleep(gap); }
    }
    stop() { this.stopped = true; this.releaseAll(); }
    resume() { this.stopped = false; }
  }

  class AutoplayEngine {
    constructor(store, bridge, ui) {
      this.store = store; this.bridge = bridge; this.ui = ui; this.bus = new InputBus(bridge);
      this.status = 'idle'; this.startedAt = 0; this.elapsedBeforePause = 0; this.timer = null;
      this.phase = 'offense'; this.action = 'Standing by'; this.direction = 'w'; this.lastDirectionAt = 0; this.lastDribbleAt = 0;
      this.possessionStarted = Date.now(); this.previousScore = null; this.pendingShot = null; this.actionCount = 0; this.lastLogAction = ''; this.gameOverHandled = false;
      this.personality = () => this.store.data.personality;
    }
    get profile() { return this.store.data.settings; }
    get style() { return PERSONALITIES[this.personality()] || PERSONALITIES.lebron; }
    get elapsed() { return this.status === 'running' ? this.elapsedBeforePause + (Date.now() - this.startedAt) : this.elapsedBeforePause; }
    setStatus(next, message) {
      this.status = next;
      if (message) {
        this.action = message; this.store.log(next === 'error' ? 'error' : 'system', message);
        if (next === 'error') {
          if (this.profile.sound) this.beep();
          if (this.profile.notifications && 'Notification' in window && Notification.permission === 'granted') new Notification('SixRings Pro', { body: message });
        }
      }
      this.ui.render();
    }
    beep() {
      try { const ctx = new AudioContext(); const osc = ctx.createOscillator(); const gain = ctx.createGain(); osc.connect(gain); gain.connect(ctx.destination); osc.frequency.value = 660; gain.gain.value = 0.04; osc.start(); osc.stop(ctx.currentTime + 0.12); osc.onended = () => ctx.close(); } catch {}
    }
    start() {
      if (this.status === 'running') return;
      if (!this.bridge.focusGame()) { this.setStatus('error', 'Game canvas not found. Open the ISO 3D game first.'); return; }
      this.bus.resume(); this.elapsedBeforePause = 0; this.startedAt = Date.now(); this.phase = 'offense'; this.possessionStarted = Date.now();
      this.setStatus('running', `${this.style.name} autoplay started`);
      this.store.log('system', 'Autoplay started — local keyboard controls active.');
      this.tick();
    }
    pause() {
      if (this.status !== 'running') return;
      this.elapsedBeforePause = this.elapsed; this.bus.stop(); this.setStatus('paused', 'Autoplay paused');
    }
    resume() {
      if (this.status !== 'paused') return;
      if (!this.bridge.focusGame()) return;
      this.bus.resume(); this.startedAt = Date.now(); this.setStatus('running', 'Autoplay resumed'); this.tick();
    }
    stop() {
      if (this.status === 'idle') return;
      this.bus.stop(); this.clearMovement(); this.elapsedBeforePause = this.elapsed;
      this.setStatus('idle', 'Autoplay stopped');
    }
    restart() { this.stop(); this.elapsedBeforePause = 0; this.start(); }
    clearMovement() { this.bus.releaseAll(); }
    detectPhase() {
      const cue = this.bridge.lastCue;
      if (cue.startsWith('Defense')) return 'defense';
      if (cue.startsWith('Offense')) return 'offense';
      // The game exposes no public possession signal in the page text. Alternate
      // plausible 1v1 possessions rather than claiming to see hidden game state.
      const duration = 10500 + (100 - this.profile.pace) * 65;
      if (Date.now() - this.possessionStarted > duration) {
        this.phase = this.phase === 'offense' ? 'defense' : 'offense';
        this.possessionStarted = Date.now();
        this.store.data.stats.possessions++;
        this.store.save();
        this.logAction(`Possession estimate changed to ${this.phase}`);
      }
      return this.phase;
    }
    scoreCheck() {
      const score = this.bridge.lastScore;
      if (!score) return;
      const signature = score.join(':');
      if (this.previousScore === null) { this.previousScore = signature; return; }
      if (signature !== this.previousScore) {
        const [beforeA, beforeB] = this.previousScore.split(':').map(Number);
        const [afterA, afterB] = score;
        const delta = (afterA - beforeA) + (afterB - beforeB);
        if (delta > 0) {
          this.store.data.stats.makes++;
          if (this.pendingShot?.range === 'long') this.store.data.stats.threes++;
          this.pendingShot = null;
          this.store.log('success', `Score changed: ${score[0]} — ${score[1]}`);
        } else if (this.pendingShot) { this.store.data.stats.misses++; this.pendingShot = null; }
        this.store.data.stats.best = Math.max(this.store.data.stats.best, Math.max(...score));
        this.store.save(); this.ui.renderStats();
        if (this.bridge.gameOver) this.onGameOver();
        this.previousScore = signature;
      }
    }
    onGameOver() {
      if (this.gameOverHandled) return;
      this.gameOverHandled = true;
      this.store.data.stats.completed++;
      this.store.data.stats.games++;
      this.store.data.stats.history.unshift({ date: Date.now(), score: this.bridge.scoreLabel, personality: this.style.name, duration: this.elapsed });
      this.store.data.stats.history.length = 30;
      this.store.save();
      this.store.log('success', `Game complete — ${this.bridge.scoreLabel}`);
      if (this.profile.autoRestart) {
        const button = [...document.querySelectorAll('button')].find(b => /play again|rematch|restart/i.test(b.textContent || b.getAttribute('aria-label') || ''));
        if (button) { button.click(); this.phase = 'offense'; this.possessionStarted = Date.now(); this.previousScore = null; return; }
      }
      this.pause();
    }
    logAction(text) {
      this.action = text;
      if (text !== this.lastLogAction) { this.store.log('action', text); this.lastLogAction = text; }
      this.ui.renderLive();
    }
    async tick() {
      if (this.status !== 'running' || this.bus.busy) return;
      this.bus.busy = true;
      try {
        this.bridge.refresh(); this.scoreCheck();
        if (this.status !== 'running') return;
        if (!this.bridge.gameOver) this.gameOverHandled = false;
        if (this.bridge.gameOver) { this.onGameOver(); return; }
        this.phase = this.detectPhase();
        if (this.phase === 'defense' && this.profile.autoGuard) await this.defend();
        else await this.attack();
      } catch (error) {
        this.store.log('error', `Control loop: ${error.message || error}`);
        this.action = 'Input loop recovered after an error';
      } finally {
        this.bus.busy = false;
        if (this.status === 'running') { this.ui.renderLive(); this.timer = setTimeout(() => this.tick(), 80); }
      }
    }
    async attack() {
      const cfg = this.profile;
      if (!this.bridge.focusGame()) { this.setStatus('error', 'Game canvas disappeared; autoplay paused.'); this.bus.stop(); return; }
      const now = Date.now();
      const style = this.style.values;
      const driveBias = ((style.close ?? cfg.close) * 0.55 + cfg.aggression * 0.3 + cfg.movement * 0.15);
      const shotChance = clamp((cfg.shooting * 0.55 + (style.long ?? cfg.long) * 0.2 + cfg.risk * 0.25) / 100);
      if (now - this.lastDirectionAt > (1250 + (100 - cfg.movement) * 18)) {
        this.direction = this.nextDirection(); this.lastDirectionAt = now;
      }
      this.actionCount++;
      if (cfg.autoDribble && now - this.lastDribbleAt > (1800 - cfg.dribbleFrequency * 11)) {
        await this.dribbleMove(); this.lastDribbleAt = Date.now();
        if (this.status !== 'running') return;
      }
      // Drive-heavy personas prioritize L; perimeter styles make space with K.
      if (this.actionCount % 5 === 0 && driveBias > 58) {
        this.logAction('Driving toward the basket'); await this.bus.tap('l', 110); await this.bus.tap(this.direction, 450 + cfg.pace * 3); return;
      }
      if (this.actionCount % 4 === 0 && driveBias < 57) {
        this.logAction('Creating space on the perimeter'); await this.bus.tap('k', 110); await this.bus.tap(this.direction, 280); return;
      }
      await this.bus.tap(this.direction, 430 + cfg.pace * 2.2);
      const shouldShoot = (this.actionCount % Math.max(2, Math.round(6 - shotChance * 4)) === 0) || (this.actionCount % 9 === 0);
      if (shouldShoot) {
        const range = cfg.close >= cfg.long + 20 ? 'close' : cfg.long > cfg.mid ? 'long' : 'mid';
        this.store.data.stats.shots++;
        if (range === 'close') this.store.data.stats.close++;
        else if (range === 'mid') this.store.data.stats.midrange++;
        this.pendingShot = { range, time: Date.now() };
        this.store.save();
        this.logAction(`Shot attempt · ${range === 'long' ? 'perimeter' : range === 'mid' ? 'mid-range' : 'close range'}`);
        await this.bus.tap(' ', clamp(cfg.shotHold, 240, 1300));
        this.ui.renderStats();
      } else this.logAction(this.phase === 'offense' ? 'Advancing with the ball' : 'Repositioning');
    }
    nextDirection() {
      const dirs = ['w', 'a', 'w', 'd', 's'];
      const i = Math.floor(Math.random() * dirs.length);
      return dirs[i];
    }
    async dribbleMove() {
      const cfg = this.profile;
      const style = cfg.dribbleStyle;
      const move = style === 'quick' ? ['j'] : style === 'power' ? ['l'] : style === 'creative' ? ['j', 'j'] : style === 'creator' ? ['k', 'j'] : [Math.random() > 0.5 ? 'j' : 'k'];
      this.logAction(`Ball handling · ${style === 'creative' ? 'change of direction' : style === 'power' ? 'drive setup' : style === 'quick' ? 'quick crossover' : style === 'creator' ? 'step-back setup' : 'controlled crossover'}`);
      for (const key of move) { if (this.status !== 'running') return; await this.bus.tap(key, 85 + cfg.dribbling * 0.7); await sleep(90); }
      this.store.data.stats.dribbles++;
      this.store.save();
    }
    async defend() {
      const cfg = this.profile;
      if (!this.bridge.focusGame()) return;
      // Visible telemetry does not expose opponent coordinates. Keep a forward
      // defensive stance with measured lateral shading instead of fake tracking.
      const roll = Math.random();
      const dir = roll < 0.54 ? 'w' : roll < 0.77 ? 'a' : 'd';
      const aggression = cfg.defense;
      this.logAction(aggression > 72 ? 'Closing the gap · defensive pressure' : 'Shading the lane · defensive position');
      await this.bus.tap(dir, 260 + cfg.movement * 2);
    }
  }

  const CSS = `
  #srpro-root{--accent:#9b6bff;--bg:#0a0910;--panel:#111019;--panel2:#171521;--line:#282536;--text:#f4f1fb;--muted:#9290a4;--good:#7ce2b1;--warn:#ffca72;position:fixed;z-index:2147483646;top:22px;right:22px;width:390px;max-width:calc(100vw - 24px);max-height:calc(100vh - 44px);font:13px/1.45 Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--text);background:var(--bg);border:1px solid #343044;border-radius:18px;box-shadow:0 24px 100px #000b,0 0 0 1px #ffffff08;overflow:hidden;transform:scale(var(--scale,1));transform-origin:top right;}
  #srpro-root *{box-sizing:border-box} #srpro-root button,#srpro-root input,#srpro-root select{font:inherit;color:inherit} #srpro-root button{cursor:pointer} #srpro-root .sr-head{height:60px;padding:0 15px;display:flex;align-items:center;gap:11px;border-bottom:1px solid var(--line);cursor:move;background:linear-gradient(120deg,#161321,#100f17)}
  #srpro-root .sr-logo{width:31px;height:31px;border-radius:10px;background:linear-gradient(135deg,#c49dff,#7040ec);display:grid;place-items:center;color:#130d20;font-size:16px;font-weight:900;box-shadow:0 4px 18px #8e5bff44}
  #srpro-root .sr-brand{font-size:13px;font-weight:800;letter-spacing:.03em} #srpro-root .sr-brand small{display:block;color:var(--muted);font-size:10px;font-weight:500;letter-spacing:.08em;text-transform:uppercase}
  #srpro-root .sr-head-right{margin-left:auto;display:flex;align-items:center;gap:7px} #srpro-root .sr-live-dot{width:7px;height:7px;border-radius:50%;background:#686578} #srpro-root[data-status=running] .sr-live-dot{background:var(--good);box-shadow:0 0 12px var(--good);animation:srpulse 1.6s infinite} @keyframes srpulse{50%{opacity:.45}}
  #srpro-root .sr-iconbtn{border:1px solid var(--line);background:#ffffff05;border-radius:8px;width:28px;height:28px;padding:0;color:var(--muted)}
  #srpro-root .sr-tabs{display:flex;gap:3px;padding:10px 12px 0;border-bottom:1px solid var(--line);overflow:auto} #srpro-root .sr-tab{border:0;border-bottom:2px solid transparent;background:transparent;padding:8px 9px;color:var(--muted);font-size:11px;white-space:nowrap} #srpro-root .sr-tab.active{color:#d5c5ff;border-bottom-color:var(--accent)}
  #srpro-root .sr-body{padding:14px;overflow-y:auto;max-height:calc(100vh - 160px)} #srpro-root .sr-panel{display:none} #srpro-root .sr-panel.active{display:block;animation:srfade .18s ease-out}@keyframes srfade{from{opacity:.4;transform:translateY(3px)}to{opacity:1;transform:none}}
  #srpro-root .sr-eyebrow{font-size:10px;letter-spacing:.12em;color:var(--muted);text-transform:uppercase;font-weight:700} #srpro-root .sr-row{display:flex;align-items:center;gap:9px} #srpro-root .sr-between{justify-content:space-between} #srpro-root .sr-card{border:1px solid var(--line);border-radius:13px;background:linear-gradient(145deg,#171521,#111019);padding:13px;margin-bottom:10px} #srpro-root .sr-main-card{padding:15px;background:radial-gradient(ellipse at top right,#32204f66,transparent 65%),linear-gradient(145deg,#191624,#111019)}
  #srpro-root .sr-status-label{font-size:20px;font-weight:750;margin:3px 0 1px} #srpro-root .sr-sub{color:var(--muted);font-size:11px} #srpro-root .sr-pill{display:inline-flex;align-items:center;gap:5px;padding:4px 8px;border:1px solid var(--line);background:#ffffff06;border-radius:20px;color:#c8c3d5;font-size:10px}
  #srpro-root .sr-controls{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:11px 0} #srpro-root .sr-btn{border:1px solid #3a3150;background:#211a2e;border-radius:10px;padding:10px 11px;font-weight:700;font-size:11px;transition:.16s} #srpro-root .sr-btn:hover{border-color:var(--accent);transform:translateY(-1px)} #srpro-root .sr-btn.primary{grid-column:span 2;color:#170e21;border:0;background:linear-gradient(100deg,#c5a1ff,#9360ff);box-shadow:0 7px 22px #8550e832} #srpro-root .sr-btn.danger{background:#26171e;border-color:#4b2934;color:#ff9ca9}
  #srpro-root .sr-grid2{display:grid;grid-template-columns:1fr 1fr;gap:8px} #srpro-root .sr-stat{padding:11px;border-radius:11px;background:#ffffff04;border:1px solid #ffffff0b} #srpro-root .sr-stat strong{font-size:19px;display:block;letter-spacing:-.04em} #srpro-root .sr-stat span{color:var(--muted);font-size:10px}
  #srpro-root .sr-action{display:flex;gap:9px;padding:8px 0;border-bottom:1px solid #ffffff09} #srpro-root .sr-action:last-child{border:0} #srpro-root .sr-action-dot{margin-top:5px;width:6px;height:6px;border-radius:50%;background:var(--accent);flex:none} #srpro-root .sr-action time{display:block;color:var(--muted);font-size:10px;margin-top:2px}
  #srpro-root .sr-personas{display:grid;grid-template-columns:1fr 1fr;gap:8px} #srpro-root .sr-persona{min-height:116px;text-align:left;border:1px solid var(--line);background:var(--panel);border-radius:12px;padding:11px;transition:.16s} #srpro-root .sr-persona:hover,#srpro-root .sr-persona.selected{border-color:#9a72e6;background:linear-gradient(135deg,#211a30,#14121b)} #srpro-root .sr-persona .sr-number{font-size:10px;color:#bf9aff;font-weight:800} #srpro-root .sr-persona strong{display:block;margin:6px 0 2px;font-size:12px} #srpro-root .sr-persona small{color:var(--muted);font-size:10px;line-height:1.35;display:block}
  #srpro-root .sr-setting{padding:9px 0;border-bottom:1px solid #ffffff0b} #srpro-root .sr-setting:last-child{border:0} #srpro-root .sr-setting-head{display:flex;justify-content:space-between;align-items:center;font-size:11px;margin-bottom:6px} #srpro-root .sr-setting-head output{color:#c9aaff;font-variant-numeric:tabular-nums} #srpro-root input[type=range]{width:100%;height:4px;accent-color:var(--accent)} #srpro-root select,#srpro-root input[type=text],#srpro-root input[type=number]{width:100%;border:1px solid var(--line);background:#0c0b12;border-radius:8px;padding:8px 9px;outline:none} #srpro-root select:focus,#srpro-root input:focus{border-color:var(--accent)}
  #srpro-root .sr-toggle{appearance:none;width:33px;height:18px;border-radius:20px;background:#393646;position:relative;cursor:pointer;transition:.15s} #srpro-root .sr-toggle:checked{background:var(--accent)} #srpro-root .sr-toggle:after{content:'';position:absolute;left:2px;top:2px;width:14px;height:14px;background:#fff;border-radius:50%;transition:.15s} #srpro-root .sr-toggle:checked:after{left:17px}
  #srpro-root .sr-footer{padding:10px 14px;border-top:1px solid var(--line);display:flex;justify-content:space-between;color:var(--muted);font-size:10px} #srpro-root .sr-note{padding:9px;border:1px solid #56452e;border-radius:9px;background:#ffca720a;color:#d3bd98;font-size:10px;line-height:1.45;margin:10px 0} #srpro-root .sr-list{max-height:260px;overflow:auto} #srpro-root .sr-empty{padding:22px 8px;text-align:center;color:var(--muted);font-size:11px}
  #srpro-root.sr-compact{width:310px} #srpro-root.sr-collapsed .sr-tabs,#srpro-root.sr-collapsed .sr-body,#srpro-root.sr-collapsed .sr-footer{display:none} #srpro-root.sr-sidebar-hidden .sr-tabs{display:none} #srpro-root .sr-separator{height:1px;background:var(--line);margin:12px 0} #srpro-root .sr-inline{display:flex;gap:7px;align-items:center} #srpro-root .sr-small-btn{padding:6px 8px;border:1px solid var(--line);background:#ffffff06;border-radius:7px;font-size:10px}
  `;

  class Dashboard {
    constructor(store) {
      this.store = store; this.engine = null; this.activeTab = 'overview'; this.root = null;
      this.mount();
    }
    mount() {
      const style = document.createElement('style'); style.textContent = CSS; document.head.append(style);
      this.root = document.createElement('div'); this.root.id = 'srpro-root'; this.root.dataset.status = 'idle';
      this.root.style.setProperty('--accent', this.store.data.settings.accent);
      this.root.style.setProperty('--scale', this.store.data.settings.scale / 100);
      this.root.innerHTML = this.template(); document.body.append(this.root);
      this.bind(); this.render(); this.drag();
    }
    template() {
      const tabs = [['overview','Overview'],['styles','Playstyles'],['tuning','Tuning'],['stats','Stats'],['logs','Activity']];
      return `<header class="sr-head"><div class="sr-logo">S</div><div class="sr-brand">SIXRINGS PRO<small>autoplay system · ${VERSION}</small></div><div class="sr-head-right"><span class="sr-live-dot"></span><span class="sr-eyebrow sr-state-short">Idle</span><button class="sr-iconbtn" data-action="collapse" title="Collapse">−</button></div></header><nav class="sr-tabs">${tabs.map(([id,label])=>`<button class="sr-tab ${id==='overview'?'active':''}" data-tab="${id}">${label}</button>`).join('')}</nav><main class="sr-body">${this.panelOverview()}${this.panelStyles()}${this.panelTuning()}${this.panelStats()}${this.panelLogs()}</main><footer class="sr-footer"><span>SixRings ISO · local inputs</span><span>F6 toggle · F7 pause</span></footer>`;
    }
    panelOverview() {
      return `<section class="sr-panel active" data-panel="overview"><div class="sr-card sr-main-card"><div class="sr-row sr-between"><span class="sr-eyebrow">AUTOPLAY STATUS</span><span class="sr-pill"><i class="sr-live-dot"></i><span class="sr-status-pill">Standby</span></span></div><div class="sr-status-label sr-state">Ready</div><div class="sr-sub sr-action-text">Start when the game is loaded and focused.</div><div class="sr-controls"><button class="sr-btn primary" data-action="toggle">▶ &nbsp;Start Autoplay</button><button class="sr-btn" data-action="pause">Ⅱ &nbsp;Pause / Resume</button><button class="sr-btn" data-action="restart">↻ &nbsp;Restart Session</button><button class="sr-btn danger" data-action="stop">■ &nbsp;Stop</button></div><div class="sr-row"><span class="sr-pill sr-personality-pill">LeBron James</span><span class="sr-pill">Game <b class="sr-score">—</b></span><span class="sr-pill sr-time">00:00</span></div></div><div class="sr-row sr-between" style="margin:14px 1px 8px"><span class="sr-eyebrow">LIVE SYSTEMS</span><button class="sr-small-btn" data-action="configure">Configure</button></div><div class="sr-grid2"><div class="sr-card" style="margin:0"><div class="sr-row sr-between"><div><strong style="font-size:11px">Auto Dribble</strong><div class="sr-sub dribble-state">Enabled</div></div><input class="sr-toggle" type="checkbox" data-setting="autoDribble"></div></div><div class="sr-card" style="margin:0"><div class="sr-row sr-between"><div><strong style="font-size:11px">Auto Guard</strong><div class="sr-sub guard-state">Enabled</div></div><input class="sr-toggle" type="checkbox" data-setting="autoGuard"></div></div></div><div class="sr-row sr-between" style="margin:15px 1px 8px"><span class="sr-eyebrow">SESSION SNAPSHOT</span><span class="sr-sub">Local observations</span></div><div class="sr-grid2"><div class="sr-stat"><strong class="stat-shots">0</strong><span>SHOTS ATTEMPTED</span></div><div class="sr-stat"><strong class="stat-accuracy">—</strong><span>SHOT ACCURACY</span></div></div><div class="sr-row sr-between" style="margin:15px 1px 8px"><span class="sr-eyebrow">RECENT ACTIONS</span><button class="sr-small-btn" data-tab="logs">View all</button></div><div class="sr-card sr-recent" style="margin:0"><div class="sr-empty">No actions yet. Start autoplay to begin.</div></div><div class="sr-note">State detection is limited to visible HUD text and score changes. Possession and shot outcomes may be estimated when the game exposes no readable signal.</div></section>`;
    }
    panelStyles() {
      return `<section class="sr-panel" data-panel="styles"><div class="sr-row sr-between" style="margin-bottom:10px"><div><div class="sr-eyebrow">SELECT A PLAYSTYLE</div><div class="sr-sub" style="margin-top:4px">Switches tendencies immediately.</div></div><button class="sr-small-btn" data-action="custom-profile">＋ Save profile</button></div><div class="sr-personas">${Object.entries(PERSONALITIES).map(([id,p])=>`<button class="sr-persona ${this.store.data.personality===id?'selected':''}" data-personality="${id}"><span class="sr-number">${p.icon} · ${p.tag}</span><strong>${p.name}</strong><small>${p.description}</small></button>`).join('')}</div><div class="sr-separator"></div><div class="sr-row sr-between"><div><div class="sr-eyebrow">SAVED CUSTOM PROFILES</div><div class="sr-sub">Stored in this browser.</div></div></div><div class="sr-custom-profiles" style="margin-top:9px"></div></section>`;
    }
    panelTuning() {
      const sliders = [['aggression','Offensive aggression'],['shooting','Shooting preference'],['dribbling','Dribbling preference'],['movement','Movement preference'],['defense','Defensive aggression'],['pace','Gameplay pace'],['risk','Risk tolerance'],['intensity','Playstyle intensity'],['long','Long-range preference'],['mid','Mid-range preference'],['close','Close-range preference'],['dribbleFrequency','Dribble frequency'],['shotHold','Shot hold (ms)',200,1300]];
      return `<section class="sr-panel" data-panel="tuning"><div class="sr-eyebrow">BEHAVIOR CONFIGURATION</div><div class="sr-sub" style="margin:4px 0 12px">Adjust the active personality or save a custom profile.</div><div class="sr-card">${sliders.map(([key,label,min=0,max=100])=>`<div class="sr-setting"><div class="sr-setting-head"><label for="sr-${key}">${label}</label><output data-output="${key}">${this.store.data.settings[key]}</output></div><input id="sr-${key}" type="range" min="${min}" max="${max}" value="${this.store.data.settings[key]}" data-setting="${key}"></div>`).join('')}<div class="sr-setting"><div class="sr-setting-head"><label for="sr-style">Dribble style</label></div><select id="sr-style" data-setting="dribbleStyle"><option value="adaptive">Adaptive</option><option value="quick">Quick crossover</option><option value="creative">Creative direction changes</option><option value="power">Power drive setup</option><option value="creator">Step-back creator</option></select></div></div><div class="sr-card"><div class="sr-eyebrow">AUTOMATION OPTIONS</div>${this.toggleSetting('autoDribble','Auto Dribble','Use crossover / drive setup while advancing.')}${this.toggleSetting('autoGuard','Auto Guard','Pressure and lane-shading inputs when in defense phase.')}${this.toggleSetting('autoRestart','Auto-restart','Click a visible rematch button after game end.')}${this.toggleSetting('sound','Sound effects','Play brief local status tones.')}${this.toggleSetting('notifications','Notifications','Show browser notifications for errors.')}<div class="sr-setting"><div class="sr-setting-head"><label for="sr-accent">Accent color</label></div><input id="sr-accent" type="color" value="${this.store.data.settings.accent}" data-setting="accent" style="width:100%;height:34px;border:1px solid var(--line);background:#0c0b12;border-radius:8px;padding:3px"></div><div class="sr-setting"><div class="sr-setting-head"><label for="sr-scale">Interface scale</label><output data-output="scale">${this.store.data.settings.scale}%</output></div><input id="sr-scale" type="range" min="80" max="120" value="${this.store.data.settings.scale}" data-setting="scale"></div>${this.toggleSetting('compact','Compact interface','Use a narrower dashboard.')}</div><button class="sr-btn" style="width:100%" data-action="save-profile">Save current settings as profile</button><div class="sr-note">The game documents WASD movement, Space shooting, J crossover, K step-back, and L drive. Synthetic keyboard events may be ignored by builds that require trusted physical input.</div></section>`;
    }
    toggleSetting(key,label,desc) { return `<div class="sr-setting sr-row sr-between"><div><strong style="font-size:11px">${label}</strong><div class="sr-sub">${desc}</div></div><input class="sr-toggle" type="checkbox" data-setting="${key}"></div>`; }
    panelStats() { return `<section class="sr-panel" data-panel="stats"><div class="sr-row sr-between"><div><div class="sr-eyebrow">PERFORMANCE</div><div class="sr-sub" style="margin-top:3px">Recorded from visible score changes and bot actions.</div></div><button class="sr-small-btn" data-action="reset-stats">Reset</button></div><div class="sr-grid2" style="margin-top:12px"><div class="sr-stat"><strong data-stat="games">0</strong><span>GAMES SEEN</span></div><div class="sr-stat"><strong data-stat="shots">0</strong><span>SHOT ATTEMPTS</span></div><div class="sr-stat"><strong data-stat="makes">0</strong><span>MADE (SCORE CHANGE)</span></div><div class="sr-stat"><strong data-stat="accuracy">—</strong><span>OBSERVED ACCURACY</span></div><div class="sr-stat"><strong data-stat="dribbles">0</strong><span>DRIBBLE ACTIONS</span></div><div class="sr-stat"><strong data-stat="possessions">0</strong><span>POSSESSION ESTIMATES</span></div><div class="sr-stat"><strong data-stat="threes">0</strong><span>PERIMETER SCORE CHANGES</span></div><div class="sr-stat"><strong data-stat="best">0</strong><span>BEST SCORE OBSERVED</span></div></div><div class="sr-separator"></div><div class="sr-eyebrow" style="margin-bottom:8px">SESSION HISTORY</div><div class="sr-history"></div></section>`; }
    panelLogs() { return `<section class="sr-panel" data-panel="logs"><div class="sr-row sr-between"><div><div class="sr-eyebrow">ACTIVITY LOG</div><div class="sr-sub" style="margin-top:3px">Recent bot decisions and system events.</div></div><button class="sr-small-btn" data-action="clear-logs">Clear</button></div><div class="sr-list sr-logs" style="margin-top:10px"></div></section>`; }
    bind() {
      this.root.addEventListener('click', e => {
        const tab = e.target.closest('[data-tab]'); if (tab) { this.openTab(tab.dataset.tab); return; }
        const person = e.target.closest('[data-personality]'); if (person) { this.selectPersonality(person.dataset.personality); return; }
        const action = e.target.closest('[data-action]')?.dataset.action; if (action) this.action(action);
      });
      this.root.addEventListener('input', e => { const input = e.target.closest('[data-setting]'); if (input) this.updateSetting(input); });
      this.root.addEventListener('change', e => { const input = e.target.closest('[data-setting]'); if (input) this.updateSetting(input); });
      document.addEventListener('keydown', e => {
        if (e.key === 'F6') { e.preventDefault(); this.engine?.status === 'running' ? this.engine.pause() : this.engine?.start(); }
        if (e.key === 'F7') { e.preventDefault(); this.engine?.status === 'running' ? this.engine.pause() : this.engine?.resume(); }
      });
      setInterval(() => this.renderLive(), 1000);
    }
    action(name) {
      if (name === 'toggle') this.engine?.status === 'running' ? this.engine.pause() : this.engine?.status === 'paused' ? this.engine.resume() : this.engine?.start();
      if (name === 'pause') this.engine?.status === 'running' ? this.engine.pause() : this.engine?.resume();
      if (name === 'stop') this.engine?.stop();
      if (name === 'restart') this.engine?.restart();
      if (name === 'collapse') this.root.classList.toggle('sr-collapsed');
      if (name === 'configure') this.openTab('tuning');
      if (name === 'reset-stats' && confirm('Reset all locally stored performance statistics?')) { this.store.data.stats = clone(DEFAULTS.stats); this.store.save(); this.renderStats(); }
      if (name === 'clear-logs') { this.store.data.logs = []; this.store.save(); this.renderLogs(); }
      if (name === 'save-profile' || name === 'custom-profile') this.saveProfile();
    }
    selectPersonality(id) {
      this.store.data.personality = id;
      if (id !== 'custom' && PERSONALITIES[id]) Object.assign(this.store.data.settings, PERSONALITIES[id].values);
      this.store.save(); this.render();
      this.store.log('system', `Playstyle selected: ${PERSONALITIES[id]?.name || id}`);
    }
    updateSetting(input) {
      const key = input.dataset.setting;
      this.store.data.settings[key] = input.type === 'checkbox' ? input.checked : input.type === 'range' || input.type === 'number' ? Number(input.value) : input.value;
      if (key === 'accent') this.root.style.setProperty('--accent', input.value);
      if (key === 'scale') this.root.style.setProperty('--scale', Number(input.value) / 100);
      if (key === 'compact') this.root.classList.toggle('sr-compact', input.checked);
      const output = this.root.querySelector(`[data-output="${key}"]`); if (output) output.textContent = input.value;
      if (key === 'autoDribble') this.root.querySelector('.dribble-state').textContent = input.checked ? 'Enabled' : 'Disabled';
      if (key === 'autoGuard') this.root.querySelector('.guard-state').textContent = input.checked ? 'Enabled' : 'Disabled';
      this.store.save();
    }
    saveProfile() {
      const name = prompt('Name this playstyle profile:'); if (!name?.trim()) return;
      const profile = { id: `profile-${Date.now()}`, name: name.trim().slice(0, 32), settings: clone(this.store.data.settings), personality: this.store.data.personality };
      this.store.data.profiles.push(profile); this.store.save(); this.renderCustomProfiles(); this.openTab('styles');
      this.store.log('system', `Saved profile: ${profile.name}`);
    }
    loadProfile(profile) { Object.assign(this.store.data.settings, profile.settings); this.store.data.personality = 'custom'; this.store.save(); this.render(); this.store.log('system', `Loaded profile: ${profile.name}`); }
    openTab(id) {
      this.activeTab = id;
      this.root.querySelectorAll('.sr-tab').forEach(el => el.classList.toggle('active', el.dataset.tab === id));
      this.root.querySelectorAll('.sr-panel').forEach(el => el.classList.toggle('active', el.dataset.panel === id));
      if (id === 'stats') this.renderStats(); if (id === 'logs') this.renderLogs(); if (id === 'styles') this.renderCustomProfiles();
    }
    drag() {
      const head = this.root.querySelector('.sr-head'); let sx, sy, left, top, dragging = false;
      head.addEventListener('pointerdown', e => { if (e.target.closest('button')) return; dragging = true; head.setPointerCapture(e.pointerId); const r = this.root.getBoundingClientRect(); sx = e.clientX; sy = e.clientY; left = r.left; top = r.top; this.root.style.right = 'auto'; this.root.style.left = `${left}px`; this.root.style.top = `${top}px`; });
      head.addEventListener('pointermove', e => { if (!dragging) return; this.root.style.left = `${Math.max(0, Math.min(innerWidth - this.root.offsetWidth, left + e.clientX - sx))}px`; this.root.style.top = `${Math.max(0, Math.min(innerHeight - 50, top + e.clientY - sy))}px`; });
      head.addEventListener('pointerup', () => dragging = false);
    }
    render() {
      this.root.dataset.status = this.engine?.status || 'idle';
      const name = PERSONALITIES[this.store.data.personality]?.name || 'Custom AI';
      this.root.querySelector('.sr-personality-pill').textContent = name;
      this.root.querySelectorAll('[data-personality]').forEach(el => el.classList.toggle('selected', el.dataset.personality === this.store.data.personality));
      this.root.querySelectorAll('[data-setting]').forEach(el => { const key=el.dataset.setting; if (this.store.data.settings[key] !== undefined) { if (el.type === 'checkbox') el.checked = Boolean(this.store.data.settings[key]); else el.value = this.store.data.settings[key]; } });
      this.root.querySelectorAll('[data-output]').forEach(el => el.textContent = this.store.data.settings[el.dataset.output]);
      this.root.classList.toggle('sr-compact', !!this.store.data.settings.compact);
      this.renderLive(); this.renderStats(); this.renderLogs(); this.renderCustomProfiles();
    }
    renderLive() {
      if (!this.root) return;
      const status = this.engine?.status || 'idle';
      this.root.dataset.status = status;
      const labels = { idle: 'Idle', running: 'Autoplay active', paused: 'Paused', error: 'Needs attention' };
      this.root.querySelector('.sr-state-short').textContent = labels[status] || status;
      this.root.querySelector('.sr-status-pill').textContent = labels[status] || status;
      this.root.querySelector('.sr-state').textContent = status === 'running' ? 'Playing' : status === 'paused' ? 'Paused' : status === 'error' ? 'Error' : 'Ready';
      this.root.querySelector('.sr-action-text').textContent = this.engine?.action || 'Start when the game is loaded and focused.';
      this.root.querySelector('.sr-time').textContent = this.formatTime(this.engine?.elapsed || 0);
      const start = this.root.querySelector('[data-action="toggle"]');
      start.textContent = status === 'running' ? 'Ⅱ  Pause Autoplay' : status === 'paused' ? '▶  Resume Autoplay' : '▶  Start Autoplay';
      this.root.querySelector('.sr-score').textContent = this.bridge?.scoreLabel || '—';
      this.root.querySelector('.sr-personality-pill').textContent = PERSONALITIES[this.store.data.personality]?.name || 'Custom AI';
      const actions = this.store.data.logs.filter(x=>x.level==='action').slice(0,3);
      this.root.querySelector('.sr-recent').innerHTML = actions.length ? actions.map(x=>this.logRow(x)).join('') : '<div class="sr-empty">No actions yet. Start autoplay to begin.</div>';
    }
    renderStats() {
      const s = this.store.data.stats;
      const accuracy = s.shots ? `${Math.round(s.makes / s.shots * 100)}%` : '—';
      this.root.querySelector('.stat-shots').textContent = s.shots;
      this.root.querySelector('.stat-accuracy').textContent = accuracy;
      for (const [key,value] of Object.entries({ games:s.games, shots:s.shots, makes:s.makes, accuracy, dribbles:s.dribbles, possessions:s.possessions, threes:s.threes, best:s.best })) {
        const el=this.root.querySelector(`[data-stat="${key}"]`); if(el) el.textContent=value;
      }
      this.root.querySelector('.sr-history').innerHTML = s.history.length ? s.history.slice(0,10).map(g=>`<div class="sr-action"><i class="sr-action-dot"></i><div><strong>${escapeHTML(g.score)} · ${escapeHTML(g.personality)}</strong><time>${new Date(g.date).toLocaleString()}</time></div></div>`).join('') : '<div class="sr-empty">Completed games will appear here.</div>';
    }
    logRow(item) { return `<div class="sr-action"><i class="sr-action-dot" style="background:${item.level==='error'?'#ff727e':item.level==='success'?'var(--good)':'var(--accent)'}"></i><div>${escapeHTML(item.text)}<time>${new Date(item.time).toLocaleTimeString()}</time></div></div>`; }
    renderLogs() { const el=this.root?.querySelector('.sr-logs'); if(el) el.innerHTML=this.store.data.logs.length ? this.store.data.logs.map(x=>this.logRow(x)).join('') : '<div class="sr-empty">Activity will appear here.</div>'; }
    renderCustomProfiles() {
      const el=this.root?.querySelector('.sr-custom-profiles'); if(!el)return;
      el.innerHTML=this.store.data.profiles.length ? this.store.data.profiles.map(p=>`<div class="sr-card sr-row sr-between" style="padding:9px;margin-bottom:6px"><div><strong style="font-size:11px">${escapeHTML(p.name)}</strong><div class="sr-sub">${PERSONALITIES[p.personality]?.name||'Custom'} · saved profile</div></div><div class="sr-inline"><button class="sr-small-btn" data-load-profile="${p.id}">Load</button><button class="sr-small-btn" data-duplicate-profile="${p.id}">Copy</button><button class="sr-small-btn" data-rename-profile="${p.id}">Rename</button><button class="sr-small-btn" data-delete-profile="${p.id}">×</button></div></div>`).join('') : '<div class="sr-empty">No saved profiles.</div>';
      el.querySelectorAll('[data-load-profile]').forEach(b=>b.onclick=()=>{const p=this.store.data.profiles.find(x=>x.id===b.dataset.loadProfile);if(p)this.loadProfile(p);});
      el.querySelectorAll('[data-duplicate-profile]').forEach(b=>b.onclick=()=>{const p=this.store.data.profiles.find(x=>x.id===b.dataset.duplicateProfile);if(p){const copy=clone(p);copy.id=`profile-${Date.now()}`;copy.name=`${copy.name} copy`;this.store.data.profiles.push(copy);this.store.save();this.renderCustomProfiles();}});
      el.querySelectorAll('[data-rename-profile]').forEach(b=>b.onclick=()=>{const p=this.store.data.profiles.find(x=>x.id===b.dataset.renameProfile);if(p){const name=prompt('Rename profile:',p.name);if(name?.trim()){p.name=name.trim().slice(0,32);this.store.save();this.renderCustomProfiles();}}});
      el.querySelectorAll('[data-delete-profile]').forEach(b=>b.onclick=()=>{this.store.data.profiles=this.store.data.profiles.filter(x=>x.id!==b.dataset.deleteProfile);this.store.save();this.renderCustomProfiles();});
    }
    formatTime(ms) { const n=Math.floor(ms/1000); return `${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`; }
  }

  const store = new Store();
  const bridge = new GameBridge();
  const ui = new Dashboard(store);
  const engine = new AutoplayEngine(store, bridge, ui);
  ui.engine = engine; ui.bridge = bridge; ui.render();

  // Keep independently enabled modules non-overlapping: one serialized input
  // queue owns all keys; pausing always releases any key currently held.
  window.addEventListener('blur', () => { if (engine.status === 'running') engine.pause(); });
  window.addEventListener('beforeunload', () => engine.bus.releaseAll());
  console.info(`[SixRings Pro] ${VERSION} ready. F6 start/pause, F7 pause/resume.`);
})();
