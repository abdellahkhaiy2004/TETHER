// ============================================================
// TETHER — Kinetic Resource Bidding PvP Game · Prototype v0.1
// ============================================================
(() => {
'use strict';

// ─────────────────── CONFIGURATION ───────────────────
const CFG = {
  MAX_ENERGY:     10,
  ENERGY_REGEN:   3,
  ROUND_TIMER:    3.0,
  CORE_DAMPING:   0.85,
  FORCE_SCALE:    0.028,
  MAX_VELOCITY:   0.30,
  SCORE_ZONE:     0.15,
  TRAP_COST:      3,
  TRAP_FORCE:     0.045,
  SHIELD_COST:    2,
  POINTS_TO_WIN:  5,
  WALL_BOUNCE_COR: 0.7,

  // Phase durations (seconds)
  REVEAL_DUR:   0.8,
  RESOLVE_DUR:  1.2,
  REGEN_DUR:    0.5,
  SCORE_DUR:    1.5,

  // Colors
  C: {
    BG:     '#000000',
    GRID:   '#0a0a0a',
    GRID2:  '#141414',
    CORE:   '#ffffff',
    P1:     '#00f0ff',
    P2:     '#ff00aa',
    GOLD:   '#ffd700',
    RED:    '#ff3333',
    GREEN:  '#33ff99',
    DIM:    '#444444',
    DIMMER: '#222222',
  },
};

// ─────────────────── VECTOR DIRECTIONS ───────────────────
// P1 (bottom) pulls core DOWN; P2 (top) pulls core UP.
const S = Math.SQRT1_2; // 0.707…
const VEC_DIR = [
  // Player 1 (index 0) — force toward bottom edge
  { a: { x: -S, y:  S }, b: { x: 0, y:  1 }, c: { x:  S, y:  S } },
  // Player 2 (index 1) — force toward top edge
  { a: { x: -S, y: -S }, b: { x: 0, y: -1 }, c: { x:  S, y: -S } },
];

// ─────────────────── CANVAS SETUP ───────────────────
const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');
let W = 0, H = 0;            // pixel dimensions
let AR = {};                  // arena rect in pixels

function resize() {
  const dpr = window.devicePixelRatio || 1;
  W = canvas.width  = window.innerWidth  * dpr;
  H = canvas.height = window.innerHeight * dpr;
  canvas.style.width  = window.innerWidth  + 'px';
  canvas.style.height = window.innerHeight + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  W = window.innerWidth;
  H = window.innerHeight;
  computeArena();
}

function computeArena() {
  const uiH = Math.min(H * 0.16, 130);
  AR = { x: 0, y: uiH, w: W, h: H - uiH * 2 };
}

// Game-coord (0-1) → pixel
function gx(nx) { return AR.x + nx * AR.w; }
function gy(ny) { return AR.y + ny * AR.h; }

// ─────────────────── GAME STATE ───────────────────
let phase     = 'MENU';   // MENU | ALLOCATE | REVEAL | RESOLVE | REGEN | SCORE_ANIM | RESULT
let phaseTime = 0;        // seconds elapsed in current phase
let roundNum  = 0;
let lastTime  = 0;

const core = { x: 0.5, y: 0.5, vx: 0, vy: 0 };
const coreTrail = [];

function freshPlayer() {
  return {
    energy: CFG.MAX_ENERGY,
    alloc: { a: 0, b: 0, c: 0 },
    shield: null,
    trap: false,
    score: 0,
    pendingTrap: null,   // {x,y} active trap on field
    graze: 0,
  };
}

let P = [freshPlayer(), freshPlayer()];
let particles = [];
let shake = { x: 0, y: 0, t: 0, mag: 0 };
let flashAlpha = 0;
let scorer = -1;             // who just scored (0 or 1) during SCORE_ANIM
let winner = -1;             // match winner during RESULT
let animCore = { x: 0.5, y: 0.5 }; // for smooth resolve animation

// ─────────────────── UTILITIES ───────────────────
function lerp(a, b, t) { return a + (b - a) * t; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function dist(x1, y1, x2, y2) { return Math.hypot(x2 - x1, y2 - y1); }
function rnd(lo, hi) { return lo + Math.random() * (hi - lo); }

// ─────────────────── PARTICLES ───────────────────
function spawnBurst(px, py, color, count, speed) {
  for (let i = 0; i < count; i++) {
    const ang = Math.random() * Math.PI * 2;
    const spd = rnd(speed * 0.3, speed);
    particles.push({
      x: px, y: py,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd,
      life: 1,
      color,
      size: rnd(1.5, 4),
    });
  }
}
function tickParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * dt * 60;
    p.y += p.vy * dt * 60;
    p.vx *= 0.97; p.vy *= 0.97;
    p.life -= dt * 1.8;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

// ─────────────────── SCREEN SHAKE ───────────────────
function addShake(mag, dur) { shake.mag = mag; shake.t = dur; }
function tickShake(dt) {
  if (shake.t > 0) {
    shake.x = (Math.random() - 0.5) * shake.mag * 2;
    shake.y = (Math.random() - 0.5) * shake.mag * 2;
    shake.t -= dt;
  } else {
    shake.x = shake.y = 0;
  }
}

// ─────────────────── UI LAYOUT ───────────────────
function btnR() { return clamp(Math.min(W, H) * 0.052, 18, 32); }

function playerUI(pIdx) {
  const r    = btnR();
  const gap  = r * 2.6;
  const midX = W / 2;
  const uiH  = Math.min(H * 0.16, 130);

  // P1 = bottom, P2 = top
  const rowY = pIdx === 0 ? H - uiH * 0.5 : uiH * 0.5;

  // Buttons: [Reset] [A] [B] [C] [Shield] [Trap]
  const startX = midX - gap * 2.5;
  const btns = [
    { id: 'reset',  x: startX,            y: rowY },
    { id: 'a',      x: startX + gap,      y: rowY },
    { id: 'b',      x: startX + gap * 2,  y: rowY },
    { id: 'c',      x: startX + gap * 3,  y: rowY },
    { id: 'shield', x: startX + gap * 4,  y: rowY },
    { id: 'trap',   x: startX + gap * 5,  y: rowY },
  ];

  // Energy bar
  const barW = gap * 5.2;
  const barX = midX - barW / 2;
  const barY = pIdx === 0 ? rowY - r - 16 : rowY + r + 10;

  return { btns, barX, barY, barW, r };
}

// ─────────────────── INPUT HANDLING ───────────────────
function handlePointer(px, py) {
  if (phase === 'MENU')   { startMatch(); return; }
  if (phase === 'RESULT') { phase = 'MENU'; return; }
  if (phase !== 'ALLOCATE') return;

  const r = btnR();
  for (let pIdx = 0; pIdx < 2; pIdx++) {
    // Boundary check — only allow taps in own half
    if (pIdx === 0 && py < H * 0.55) continue;
    if (pIdx === 1 && py > H * 0.45) continue;

    const ui = playerUI(pIdx);
    for (const btn of ui.btns) {
      if (dist(px, py, btn.x, btn.y) > r * 1.3) continue;
      handleBtn(pIdx, btn.id);
      return;
    }
  }
}

function handleBtn(pIdx, id) {
  const p = P[pIdx];
  const spent = p.alloc.a + p.alloc.b + p.alloc.c
    + (p.shield !== null ? CFG.SHIELD_COST : 0)
    + (p.trap ? CFG.TRAP_COST : 0);
  const avail = p.energy - spent;

  if (id === 'reset') {
    p.alloc = { a: 0, b: 0, c: 0 };
    p.shield = null;
    p.trap = false;
    vibrate(15);
    return;
  }
  if (id === 'a' || id === 'b' || id === 'c') {
    if (p.alloc[id] > 0 && avail === 0) {
      // Decrement if tapped again when pool empty
      p.alloc[id]--;
    } else if (avail > 0) {
      p.alloc[id]++;
    }
    vibrate(10);
    return;
  }
  if (id === 'shield') {
    const cycle = [null, 'a', 'b', 'c'];
    let idx = cycle.indexOf(p.shield);
    // Can we afford to enable shield?
    const shieldCurrentlyOn = p.shield !== null;
    idx = (idx + 1) % cycle.length;
    const shieldNext = cycle[idx];
    if (shieldNext !== null && !shieldCurrentlyOn && avail < CFG.SHIELD_COST) return; // can't afford
    p.shield = shieldNext;
    vibrate(10);
    return;
  }
  if (id === 'trap') {
    if (p.trap) {
      p.trap = false;
    } else if (avail >= CFG.TRAP_COST) {
      p.trap = true;
    }
    vibrate(10);
    return;
  }
}

function vibrate(ms) {
  if (navigator.vibrate) navigator.vibrate(ms);
}

// Multi-touch
canvas.addEventListener('touchstart', e => {
  e.preventDefault();
  for (const t of e.changedTouches) handlePointer(t.clientX, t.clientY);
}, { passive: false });
canvas.addEventListener('mousedown', e => handlePointer(e.clientX, e.clientY));

// Keyboard shortcuts for desktop testing
window.addEventListener('keydown', e => {
  if (phase === 'MENU')   { startMatch(); return; }
  if (phase === 'RESULT') { phase = 'MENU'; return; }
  if (phase !== 'ALLOCATE') return;
  const map = {
    // P1 (bottom)
    'q': [0, 'a'], 'w': [0, 'b'], 'e': [0, 'c'],
    'a': [0, 'shield'], 's': [0, 'trap'], 'r': [0, 'reset'],
    // P2 (top)
    'i': [1, 'a'], 'o': [1, 'b'], 'p': [1, 'c'],
    'k': [1, 'shield'], 'l': [1, 'trap'], 't': [1, 'reset'],
  };
  const m = map[e.key.toLowerCase()];
  if (m) handleBtn(m[0], m[1]);
});

// ─────────────────── GAME FLOW ───────────────────
function startMatch() {
  P = [freshPlayer(), freshPlayer()];
  core.x = 0.5; core.y = 0.5; core.vx = 0; core.vy = 0;
  coreTrail.length = 0;
  particles.length = 0;
  roundNum = 0;
  winner = -1;
  scorer = -1;
  beginAllocate();
}

function beginAllocate() {
  phase = 'ALLOCATE';
  phaseTime = 0;
  roundNum++;
  for (const p of P) {
    p.alloc = { a: 0, b: 0, c: 0 };
    p.shield = null;
    p.trap = false;
  }
}

function beginReveal() {
  phase = 'REVEAL';
  phaseTime = 0;
  flashAlpha = 1;
  addShake(3, 0.15);
  vibrate(30);
}

function beginResolve() {
  phase = 'RESOLVE';
  phaseTime = 0;

  // --- Apply shields first ---
  for (let pi = 0; pi < 2; pi++) {
    const opp = 1 - pi;
    const sh = P[pi].shield;
    if (sh) {
      P[opp].alloc[sh] = 0; // nullify opponent's vector
    }
  }

  // --- Calculate net force ---
  let fx = 0, fy = 0;
  for (let pi = 0; pi < 2; pi++) {
    const dirs = VEC_DIR[pi];
    for (const v of ['a', 'b', 'c']) {
      const e = P[pi].alloc[v];
      if (e > 0) {
        fx += dirs[v].x * e * CFG.FORCE_SCALE;
        fy += dirs[v].y * e * CFG.FORCE_SCALE;
      }
    }
  }

  // --- Apply active traps from previous round ---
  for (let pi = 0; pi < 2; pi++) {
    const tr = P[pi].pendingTrap;
    if (tr) {
      const dx = tr.x - core.x;
      const dy = tr.y - core.y;
      const d = Math.hypot(dx, dy) || 0.01;
      fx += (dx / d) * CFG.TRAP_FORCE;
      fy += (dy / d) * CFG.TRAP_FORCE;
      P[pi].pendingTrap = null; // consumed
    }
  }

  // --- Queue new traps for next round ---
  for (let pi = 0; pi < 2; pi++) {
    if (P[pi].trap) {
      // Auto-place: midfield toward opponent's zone
      P[pi].pendingTrap = {
        x: 0.5 + rnd(-0.15, 0.15),
        y: pi === 0 ? 0.3 : 0.7,
      };
    }
  }

  // Apply impulse
  core.vx += fx;
  core.vy += fy;

  // Clamp velocity
  const speed = Math.hypot(core.vx, core.vy);
  if (speed > CFG.MAX_VELOCITY) {
    core.vx = (core.vx / speed) * CFG.MAX_VELOCITY;
    core.vy = (core.vy / speed) * CFG.MAX_VELOCITY;
  }

  // Particles at force application
  spawnBurst(gx(core.x), gy(core.y), CFG.C.CORE, 12, 2);
  addShake(2 + Math.min(speed * 15, 6), 0.2);
}

function beginRegen() {
  phase = 'REGEN';
  phaseTime = 0;
  // Regen energy
  for (const p of P) {
    p.energy = Math.min(CFG.MAX_ENERGY, p.energy + CFG.ENERGY_REGEN);
  }
}

function beginScoreAnim(who) {
  phase = 'SCORE_ANIM';
  phaseTime = 0;
  scorer = who;
  P[who].score++;
  addShake(8, 0.3);
  vibrate(100);
  const color = who === 0 ? CFG.C.P1 : CFG.C.P2;
  spawnBurst(gx(core.x), gy(core.y), color, 40, 4);
  spawnBurst(gx(core.x), gy(core.y), CFG.C.GOLD, 20, 3);
  flashAlpha = 0.8;
}

function resetCore() {
  core.x = 0.5; core.y = 0.5;
  core.vx = 0; core.vy = 0;
  coreTrail.length = 0;
  for (const p of P) {
    p.energy = CFG.MAX_ENERGY;
    p.pendingTrap = null;
  }
}

// ─────────────────── PHYSICS TICK ───────────────────
function physicsTick(dt) {
  // Move core
  core.x += core.vx * dt * 1.5;
  core.y += core.vy * dt * 1.5;

  // Wall bounce (left/right)
  const margin = 0.04;
  if (core.x < margin) { core.x = margin; core.vx = Math.abs(core.vx) * CFG.WALL_BOUNCE_COR; }
  if (core.x > 1 - margin) { core.x = 1 - margin; core.vx = -Math.abs(core.vx) * CFG.WALL_BOUNCE_COR; }

  // Top/bottom — don't bounce, let it enter scoring zones
  core.y = clamp(core.y, -0.05, 1.05);

  // Trail
  coreTrail.push({ x: core.x, y: core.y });
  if (coreTrail.length > 30) coreTrail.shift();
}

// ─────────────────── MAIN LOOP ───────────────────
function gameLoop(ts) {
  const dt = Math.min((ts - lastTime) / 1000, 0.05);
  lastTime = ts;
  phaseTime += dt;

  // ── Phase logic ──
  if (phase === 'ALLOCATE') {
    const remaining = CFG.ROUND_TIMER - phaseTime;
    if (remaining <= 1 && remaining + dt > 1) vibrate(20); // 1s warning
    if (remaining <= 0) beginReveal();
  }
  else if (phase === 'REVEAL') {
    if (phaseTime >= CFG.REVEAL_DUR) beginResolve();
  }
  else if (phase === 'RESOLVE') {
    physicsTick(dt);

    // Damping applied gradually
    const dampPerSec = Math.pow(CFG.CORE_DAMPING, 1 / CFG.RESOLVE_DUR);
    core.vx *= Math.pow(dampPerSec, dt);
    core.vy *= Math.pow(dampPerSec, dt);

    if (phaseTime >= CFG.RESOLVE_DUR) {
      // Apply final damping
      core.vx *= CFG.CORE_DAMPING;
      core.vy *= CFG.CORE_DAMPING;

      // Deduct energy spent
      for (const p of P) {
        const spent = p.alloc.a + p.alloc.b + p.alloc.c
          + (p.shield !== null ? CFG.SHIELD_COST : 0)
          + (p.trap ? CFG.TRAP_COST : 0);
        p.energy = Math.max(0, p.energy - spent);
      }

      // Check scoring
      if (core.y > 1 - CFG.SCORE_ZONE) {
        beginScoreAnim(0); // P1 scores (core in bottom zone)
      } else if (core.y < CFG.SCORE_ZONE) {
        beginScoreAnim(1); // P2 scores (core in top zone)
      } else {
        beginRegen();
      }
    }
  }
  else if (phase === 'REGEN') {
    if (phaseTime >= CFG.REGEN_DUR) beginAllocate();
  }
  else if (phase === 'SCORE_ANIM') {
    if (phaseTime >= CFG.SCORE_DUR) {
      if (P[scorer].score >= CFG.POINTS_TO_WIN) {
        winner = scorer;
        phase = 'RESULT';
        phaseTime = 0;
      } else {
        resetCore();
        beginRegen();
      }
    }
  }

  // Update effects
  tickShake(dt);
  tickParticles(dt);
  flashAlpha = Math.max(0, flashAlpha - dt * 4);

  // ── Render ──
  render(dt);

  requestAnimationFrame(gameLoop);
}

// ─────────────────── RENDERING ───────────────────
function render(dt) {
  ctx.save();
  ctx.translate(shake.x, shake.y);

  // Background
  ctx.fillStyle = CFG.C.BG;
  ctx.fillRect(-10, -10, W + 20, H + 20);
  drawGrid();

  if (phase === 'MENU') {
    drawMenu();
  } else if (phase === 'RESULT') {
    drawResults();
  } else {
    drawArena();
    drawTraps();
    drawVectorLines();
    drawCoreTrail();
    drawCore(dt);
    drawScoreZones();
    drawTimer();
    drawScore();
    drawPlayerUI(0);
    drawPlayerUI(1);
    drawFlash();
    drawParticles();
    drawPhaseLabel();
    if (phase === 'ALLOCATE' && roundNum === 1) drawHints();
  }

  ctx.restore();
}

// ── Grid ──
function drawGrid() {
  const step = 30;
  ctx.strokeStyle = CFG.C.GRID;
  ctx.lineWidth = 0.5;
  for (let x = 0; x < W; x += step) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }
  for (let y = 0; y < H; y += step) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }
  // Accent cross-hairs at center
  ctx.strokeStyle = CFG.C.GRID2;
  ctx.lineWidth = 1;
  const cx = W / 2, cy = AR.y + AR.h / 2;
  ctx.beginPath(); ctx.moveTo(cx, AR.y); ctx.lineTo(cx, AR.y + AR.h); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(AR.x, cy); ctx.lineTo(AR.x + AR.w, cy); ctx.stroke();
}

// ── Score Zones ──
function drawScoreZones() {
  const zoneH = AR.h * CFG.SCORE_ZONE;
  // P1 zone (bottom)
  const grad1 = ctx.createLinearGradient(0, AR.y + AR.h - zoneH, 0, AR.y + AR.h);
  grad1.addColorStop(0, 'rgba(0,240,255,0)');
  grad1.addColorStop(1, 'rgba(0,240,255,0.08)');
  ctx.fillStyle = grad1;
  ctx.fillRect(AR.x, AR.y + AR.h - zoneH, AR.w, zoneH);

  // P2 zone (top)
  const grad2 = ctx.createLinearGradient(0, AR.y + zoneH, 0, AR.y);
  grad2.addColorStop(0, 'rgba(255,0,170,0)');
  grad2.addColorStop(1, 'rgba(255,0,170,0.08)');
  ctx.fillStyle = grad2;
  ctx.fillRect(AR.x, AR.y, AR.w, zoneH);

  // Threshold lines
  ctx.setLineDash([6, 6]);
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(0,240,255,0.25)';
  ctx.beginPath(); ctx.moveTo(AR.x, AR.y + AR.h - zoneH); ctx.lineTo(AR.x + AR.w, AR.y + AR.h - zoneH); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,0,170,0.25)';
  ctx.beginPath(); ctx.moveTo(AR.x, AR.y + zoneH); ctx.lineTo(AR.x + AR.w, AR.y + zoneH); ctx.stroke();
  ctx.setLineDash([]);
}

// ── Arena border ──
function drawArena() {
  ctx.strokeStyle = CFG.C.DIMMER;
  ctx.lineWidth = 1;
  ctx.strokeRect(AR.x + 0.5, AR.y + 0.5, AR.w - 1, AR.h - 1);
}

// ── Vector Lines ──
function drawVectorLines() {
  const showForce = phase === 'REVEAL' || phase === 'RESOLVE';
  if (!showForce && phase !== 'ALLOCATE') return;

  for (let pi = 0; pi < 2; pi++) {
    const color = pi === 0 ? CFG.C.P1 : CFG.C.P2;
    const dirs = VEC_DIR[pi];
    const edgeY = pi === 0 ? AR.y + AR.h : AR.y;

    for (const v of ['a', 'b', 'c']) {
      // Edge X: spread vectors across width
      const vIdx = v === 'a' ? 0 : v === 'b' ? 1 : 2;
      const edgeX = AR.x + AR.w * (0.25 + vIdx * 0.25);
      const cx = gx(core.x), cy = gy(core.y);

      if (showForce) {
        const energy = P[pi].alloc[v];
        if (energy <= 0) {
          // Dim line for 0 allocation
          ctx.save();
          ctx.globalAlpha = 0.08;
          ctx.strokeStyle = color;
          ctx.lineWidth = 0.5;
          ctx.beginPath(); ctx.moveTo(edgeX, edgeY); ctx.lineTo(cx, cy); ctx.stroke();
          ctx.restore();
          continue;
        }
        const intensity = energy / CFG.MAX_ENERGY;
        ctx.save();
        ctx.shadowColor = color;
        ctx.shadowBlur = 8 + intensity * 15;
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.4 + intensity * 0.6;
        ctx.lineWidth = 1 + energy * 0.6;
        ctx.beginPath(); ctx.moveTo(edgeX, edgeY); ctx.lineTo(cx, cy); ctx.stroke();
        // Energy label on line
        const lx = lerp(edgeX, cx, 0.25);
        const ly = lerp(edgeY, cy, 0.25);
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
        ctx.fillStyle = color;
        ctx.font = `bold ${11}px Orbitron, monospace`;
        ctx.textAlign = 'center';
        ctx.fillText(energy, lx, ly - 6);
        ctx.restore();
      } else {
        // Faint guide lines during allocate
        ctx.save();
        ctx.globalAlpha = 0.04;
        ctx.strokeStyle = color;
        ctx.lineWidth = 0.5;
        ctx.setLineDash([4, 8]);
        ctx.beginPath(); ctx.moveTo(edgeX, edgeY); ctx.lineTo(cx, cy); ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }
    }
  }
}

// ── Traps ──
function drawTraps() {
  for (let pi = 0; pi < 2; pi++) {
    const tr = P[pi].pendingTrap;
    if (!tr) continue;
    const col = pi === 0 ? CFG.C.P1 : CFG.C.P2;
    const px = gx(tr.x), py = gy(tr.y);
    const pulse = 0.6 + 0.4 * Math.sin(performance.now() * 0.005);
    ctx.save();
    ctx.globalAlpha = 0.3 * pulse;
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.5;
    for (let r = 8; r < 30; r += 8) {
      ctx.beginPath();
      ctx.arc(px, py, r * pulse, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Label
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = col;
    ctx.font = '9px Orbitron, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('TRAP', px, py + 4);
    ctx.restore();
  }
}

// ── Core Trail ──
function drawCoreTrail() {
  for (let i = 0; i < coreTrail.length; i++) {
    const t = i / coreTrail.length;
    ctx.fillStyle = `rgba(255,255,255,${t * 0.15})`;
    ctx.beginPath();
    ctx.arc(gx(coreTrail[i].x), gy(coreTrail[i].y), 2 + t * 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ── Core ──
function drawCore(dt) {
  const cx = gx(core.x), cy = gy(core.y);
  const baseR = Math.min(W, H) * 0.035;
  const pulse = 1 + 0.06 * Math.sin(performance.now() * 0.003);
  const r = baseR * pulse;
  const rotation = performance.now() * 0.0004;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rotation);

  // Glow
  ctx.shadowColor = CFG.C.CORE;
  ctx.shadowBlur = 25;

  // Hexagon
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 6;
    const hx = r * Math.cos(a);
    const hy = r * Math.sin(a);
    if (i === 0) ctx.moveTo(hx, hy); else ctx.lineTo(hx, hy);
  }
  ctx.closePath();

  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  ctx.fill();
  ctx.strokeStyle = CFG.C.CORE;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Inner hexagon
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i;
    const hx = r * 0.5 * Math.cos(a);
    const hy = r * 0.5 * Math.sin(a);
    if (i === 0) ctx.moveTo(hx, hy); else ctx.lineTo(hx, hy);
  }
  ctx.closePath();
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.restore();
}

// ── Timer Ring ──
function drawTimer() {
  if (phase !== 'ALLOCATE') return;
  const cx = gx(core.x), cy = gy(core.y);
  const r = Math.min(W, H) * 0.06;
  const remaining = Math.max(0, CFG.ROUND_TIMER - phaseTime);
  const frac = remaining / CFG.ROUND_TIMER;

  // Ring
  const startAngle = -Math.PI / 2;
  const endAngle = startAngle + frac * Math.PI * 2;
  let ringColor = CFG.C.GREEN;
  if (remaining < 1) ringColor = CFG.C.RED;
  else if (remaining < 2) ringColor = CFG.C.GOLD;

  ctx.save();
  ctx.shadowColor = ringColor;
  ctx.shadowBlur = 10;
  ctx.strokeStyle = ringColor;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, r, startAngle, endAngle);
  ctx.stroke();

  // Time text
  ctx.shadowBlur = 0;
  ctx.fillStyle = ringColor;
  ctx.font = `bold ${14}px Orbitron, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(remaining.toFixed(1), cx, cy);
  ctx.restore();
}

// ── Score Display ──
function drawScore() {
  const y = AR.y + 18;
  ctx.save();
  ctx.font = `bold ${14}px Orbitron, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  // P1 score
  ctx.fillStyle = CFG.C.P1;
  ctx.fillText(P[0].score, W / 2 - 30, y);
  // Dash
  ctx.fillStyle = CFG.C.DIM;
  ctx.fillText('—', W / 2, y);
  // P2 score
  ctx.fillStyle = CFG.C.P2;
  ctx.fillText(P[1].score, W / 2 + 30, y);

  // Round
  ctx.fillStyle = CFG.C.DIMMER;
  ctx.font = `${9}px Orbitron, monospace`;
  ctx.fillText(`ROUND ${roundNum}`, W / 2, y + 20);
  ctx.restore();
}

// ── Player UI ──
function drawPlayerUI(pIdx) {
  const p  = P[pIdx];
  const ui = playerUI(pIdx);
  const r  = ui.r;
  const color = pIdx === 0 ? CFG.C.P1 : CFG.C.P2;
  const spent = p.alloc.a + p.alloc.b + p.alloc.c
    + (p.shield !== null ? CFG.SHIELD_COST : 0)
    + (p.trap ? CFG.TRAP_COST : 0);
  const avail = p.energy - spent;

  const isAllocate = phase === 'ALLOCATE';
  const showValues = isAllocate || phase === 'REVEAL' || phase === 'RESOLVE';

  ctx.save();

  // ── Buttons ──
  for (const btn of ui.btns) {
    let label = '', value = '', active = false, accent = color;

    switch (btn.id) {
      case 'a': case 'b': case 'c':
        label = btn.id.toUpperCase();
        value = showValues ? String(p.alloc[btn.id]) : '?';
        active = p.alloc[btn.id] > 0;
        break;
      case 'shield':
        label = 'SHD';
        value = p.shield ? p.shield.toUpperCase() : '—';
        active = p.shield !== null;
        accent = CFG.C.GOLD;
        break;
      case 'trap':
        label = 'TRP';
        value = p.trap ? 'ON' : '—';
        active = p.trap;
        accent = CFG.C.GREEN;
        break;
      case 'reset':
        label = 'CLR';
        value = '×';
        accent = CFG.C.RED;
        break;
    }

    // Circle
    ctx.beginPath();
    ctx.arc(btn.x, btn.y, r, 0, Math.PI * 2);
    if (active) {
      ctx.fillStyle = hexAlpha(accent, 0.15);
      ctx.fill();
      ctx.shadowColor = accent;
      ctx.shadowBlur = 10;
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.03)';
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    ctx.strokeStyle = active ? accent : CFG.C.DIM;
    ctx.lineWidth = active ? 2 : 1;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Value text (large)
    ctx.fillStyle = active ? accent : CFG.C.DIM;
    ctx.font = `bold ${r * 0.75}px Orbitron, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(value, btn.x, btn.y);

    // Label (small, below)
    ctx.fillStyle = CFG.C.DIMMER;
    ctx.font = `${Math.max(8, r * 0.35)}px Orbitron, monospace`;
    ctx.fillText(label, btn.x, btn.y + r + 10);
  }

  // ── Energy Bar ──
  const segW = (ui.barW - 4) / CFG.MAX_ENERGY;
  const segH = 6;
  for (let i = 0; i < CFG.MAX_ENERGY; i++) {
    const sx = ui.barX + 2 + i * segW;
    const isFilled = i < p.energy;
    const isAvail  = i < (p.energy - spent);
    ctx.fillStyle = isAvail ? color : isFilled ? hexAlpha(color, 0.25) : CFG.C.DIMMER;
    ctx.fillRect(sx, ui.barY, segW - 2, segH);
  }
  // Energy text
  ctx.fillStyle = avail > 0 ? color : CFG.C.RED;
  ctx.font = `${9}px Orbitron, monospace`;
  ctx.textAlign = 'left';
  ctx.fillText(`${avail}/${p.energy}`, ui.barX + ui.barW + 6, ui.barY + segH - 1);

  // Player label
  ctx.fillStyle = hexAlpha(color, 0.3);
  ctx.font = `bold ${10}px Orbitron, monospace`;
  ctx.textAlign = 'right';
  ctx.fillText(`P${pIdx + 1}`, ui.barX - 6, ui.barY + segH - 1);

  ctx.restore();
}

// ── Phase Label ──
function drawPhaseLabel() {
  if (phase === 'ALLOCATE') return; // timer ring is enough
  let label = '';
  if (phase === 'REVEAL')     label = 'R E V E A L';
  if (phase === 'RESOLVE')    label = 'R E S O L V E';
  if (phase === 'REGEN')      label = 'R E G E N';
  if (phase === 'SCORE_ANIM') label = 'S C O R E !';
  if (!label) return;

  const col = phase === 'SCORE_ANIM' ? CFG.C.GOLD : CFG.C.DIM;
  ctx.save();
  ctx.globalAlpha = phase === 'SCORE_ANIM' ? 0.9 : 0.4;
  ctx.fillStyle = col;
  ctx.font = `bold ${12}px Orbitron, monospace`;
  ctx.textAlign = 'center';
  ctx.fillText(label, W / 2, AR.y + AR.h - 14);
  ctx.restore();
}

// ── Flash ──
function drawFlash() {
  if (flashAlpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = flashAlpha * 0.3;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

// ── Particles ──
function drawParticles() {
  for (const p of particles) {
    ctx.save();
    ctx.globalAlpha = p.life;
    ctx.fillStyle = p.color;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 5;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// ── First-Round Hints ──
function drawHints() {
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = CFG.C.P1;
  ctx.font = `${10}px Orbitron, monospace`;
  ctx.textAlign = 'center';
  ctx.fillText('P1: Tap A/B/C to allocate energy · SHD to shield · TRP to trap · CLR to reset', W / 2, H - 10);
  ctx.fillStyle = CFG.C.P2;
  ctx.fillText('P2: Tap A/B/C to allocate energy · SHD to shield · TRP to trap · CLR to reset', W / 2, 10 + 8);
  ctx.restore();
}

// ─────────────────── MENU SCREEN ───────────────────
function drawMenu() {
  const cx = W / 2, cy = H / 2;

  // Decorative hexagons
  const t = performance.now() * 0.001;
  for (let i = 0; i < 3; i++) {
    const r = 60 + i * 40;
    const rot = t * (0.1 + i * 0.05) * (i % 2 ? 1 : -1);
    ctx.save();
    ctx.translate(cx, cy - 30);
    ctx.rotate(rot);
    ctx.strokeStyle = hexAlpha(i === 0 ? CFG.C.P1 : i === 1 ? CFG.C.P2 : CFG.C.DIM, 0.1 + i * 0.02);
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let j = 0; j < 6; j++) {
      const a = (Math.PI / 3) * j - Math.PI / 6;
      const hx = r * Math.cos(a), hy = r * Math.sin(a);
      j === 0 ? ctx.moveTo(hx, hy) : ctx.lineTo(hx, hy);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }

  // Title
  ctx.save();
  ctx.shadowColor = CFG.C.CORE;
  ctx.shadowBlur = 30;
  ctx.fillStyle = CFG.C.CORE;
  ctx.font = `900 ${Math.min(W * 0.14, 64)}px Orbitron, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('TETHER', cx, cy - 30);
  ctx.restore();

  // Subtitle
  ctx.fillStyle = CFG.C.DIM;
  ctx.font = `${Math.min(W * 0.028, 12)}px Orbitron, monospace`;
  ctx.textAlign = 'center';
  ctx.fillText('KINETIC RESOURCE BIDDING', cx, cy + 15);

  // Play prompt (pulsing)
  const pulse = 0.4 + 0.6 * Math.abs(Math.sin(t * 2));
  ctx.save();
  ctx.globalAlpha = pulse;
  ctx.fillStyle = CFG.C.P1;
  ctx.font = `bold ${14}px Orbitron, monospace`;
  ctx.fillText('TAP TO PLAY', cx, cy + 70);
  ctx.restore();

  // Version
  ctx.fillStyle = CFG.C.DIMMER;
  ctx.font = `${8}px Orbitron, monospace`;
  ctx.fillText('PROTOTYPE v0.1', cx, H - 20);

  // Controls hint
  ctx.fillStyle = CFG.C.DIMMER;
  ctx.font = `${9}px Orbitron, monospace`;
  ctx.fillText('P1: Q W E  ·  P2: I O P  ·  Shields: A / K  ·  Traps: S / L', cx, H - 40);
}

// ─────────────────── RESULTS SCREEN ───────────────────
function drawResults() {
  const cx = W / 2, cy = H / 2;
  const col = winner === 0 ? CFG.C.P1 : CFG.C.P2;
  const t = performance.now() * 0.001;

  // Background wash
  ctx.save();
  ctx.globalAlpha = 0.06;
  ctx.fillStyle = col;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();

  // Winner text
  ctx.save();
  ctx.shadowColor = col;
  ctx.shadowBlur = 30;
  ctx.fillStyle = col;
  ctx.font = `900 ${Math.min(W * 0.1, 48)}px Orbitron, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`PLAYER ${winner + 1}`, cx, cy - 40);
  ctx.fillText('WINS', cx, cy + 10);
  ctx.restore();

  // Final score
  ctx.fillStyle = CFG.C.DIM;
  ctx.font = `bold ${20}px Orbitron, monospace`;
  ctx.textAlign = 'center';
  ctx.fillText(`${P[0].score} — ${P[1].score}`, cx, cy + 55);

  // Play again
  const pulse = 0.4 + 0.6 * Math.abs(Math.sin(t * 2));
  ctx.save();
  ctx.globalAlpha = pulse;
  ctx.fillStyle = CFG.C.GOLD;
  ctx.font = `bold ${13}px Orbitron, monospace`;
  ctx.fillText('TAP TO PLAY AGAIN', cx, cy + 100);
  ctx.restore();
}

// ─────────────────── COLOR UTILITY ───────────────────
function hexAlpha(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ─────────────────── INIT ───────────────────
resize();
window.addEventListener('resize', resize);
lastTime = performance.now();
requestAnimationFrame(gameLoop);

})();
