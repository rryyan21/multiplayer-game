// public/game.js

// —— SETUP ——
const socket = io();
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// resize to full screen
function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener("resize", resize);
resize();

// spawn point
const spawn = { x: 100, y: 100 };

// out-of-bounds zone
const worldW = canvas.width * 2;
const worldH = canvas.height * 2;
const oobZone = { x: -100, y: -100, width: worldW + 200, height: worldH + 200 };

// generate obstacles
const obstacles = [];
const obsCount = 75;
function rectsOverlap(x1, y1, w1, h1, x2, y2, w2, h2) {
  return !(x1 + w1 < x2 || x1 > x2 + w2 || y1 + h1 < y2 || y1 > y2 + h2);
}
for (let i = 0; i < obsCount; i++) {
  let obs;
  do {
    const w = 20 + Math.random() * 80;
    const h = 20 + Math.random() * 80;
    const x = oobZone.x + Math.random() * (oobZone.width - w);
    const y = oobZone.y + Math.random() * (oobZone.height - h);
    obs = { x, y, width: w, height: h };
  } while (
    obstacles.some((o) =>
      rectsOverlap(
        obs.x,
        obs.y,
        obs.width,
        obs.height,
        o.x,
        o.y,
        o.width,
        o.height
      )
    )
  );
  obstacles.push(obs);
}

// player state
const player = { x: spawn.x, y: spawn.y, size: 20 };

// color getters from customize
const getPlayerColor = () => window.playerConfig?.color || "#0000ff";
const getHookColor = () => window.playerConfig?.hook || "#ffffff";
const getParticleColor = () => window.playerConfig?.particle || "#ffcc00";

// tutorial overlay duration (frames)
let messageDuration = 300;

// physics
const velocity = { x: 0, y: 0 };
const acceleration = 0.2;
const maxSpeed = 8;
const bounceFactor = 1.5;

// grappling hook
let hook = { active: false, x: 0, y: 0 };
const maxHookRange = 300;
const pullStrength = 0.5;

// input
const keys = {};
window.addEventListener("keydown", (e) => {
  keys[e.key] = true;
  if (e.code === "Space") toggleHook();
});
window.addEventListener("keyup", (e) => (keys[e.key] = false));

function toggleHook() {
  if (hook.active) hook.active = false;
  else {
    const px = player.x + player.size / 2;
    const py = player.y + player.size / 2;
    let bestDist2 = maxHookRange * maxHookRange;
    let bestPt;
    for (const o of obstacles) {
      const cx = Math.max(o.x, Math.min(px, o.x + o.width));
      const cy = Math.max(o.y, Math.min(py, o.y + o.height));
      const dx = cx - px,
        dy = cy - py;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestDist2) {
        bestDist2 = d2;
        bestPt = { x: cx, y: cy };
      }
    }
    if (bestPt) hook = { active: true, x: bestPt.x, y: bestPt.y };
  }
}

// particles
let particles = [];
function spawnParticles(cx, cy, count = 30) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 4 + 1;
    particles.push({
      x: cx,
      y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 60 + Math.random() * 30,
    });
  }
}
function updateAndDrawParticles() {
  const color = getParticleColor();
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.life--;
    if (p.life <= 0) {
      particles.splice(i, 1);
      continue;
    }
    ctx.globalAlpha = p.life / 90;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// networking
const otherPlayers = {};
socket.on("currentPlayers", (players) => {
  for (let id in players) if (id !== socket.id) otherPlayers[id] = players[id];
});
socket.on("newPlayer", (p) => {
  if (p.id !== socket.id) otherPlayers[p.id] = { x: p.x, y: p.y };
});
socket.on("playerMoved", (p) => {
  if (p.id !== socket.id) otherPlayers[p.id] = { x: p.x, y: p.y };
});
socket.on("playerDisconnected", (id) => delete otherPlayers[id]);

// main loop
function gameLoop() {
  // input & physics
  let ix = 0,
    iy = 0;
  if (keys["ArrowUp"]) iy--;
  if (keys["ArrowDown"]) iy++;
  if (keys["ArrowLeft"]) ix--;
  if (keys["ArrowRight"]) ix++;
  if (ix || iy) {
    const inv = 1 / Math.hypot(ix, iy);
    ix *= inv;
    iy *= inv;
    velocity.x += ix * acceleration;
    velocity.y += iy * acceleration;
  }
  let speed = Math.hypot(velocity.x, velocity.y);
  if (speed > maxSpeed) {
    const f = maxSpeed / speed;
    velocity.x *= f;
    velocity.y *= f;
  }
  if (hook.active) {
    const px = player.x + player.size / 2;
    const py = player.y + player.size / 2;
    const dx = hook.x - px,
      dy = hook.y - py;
    const d = Math.hypot(dx, dy);
    if (d < 10) hook.active = false;
    else {
      velocity.x += (dx / d) * pullStrength;
      velocity.y += (dy / d) * pullStrength;
    }
  }
  const newX = player.x + velocity.x,
    newY = player.y + velocity.y;
  const hitX = obstacles.some((o) =>
    rectsOverlap(
      newX,
      player.y,
      player.size,
      player.size,
      o.x,
      o.y,
      o.width,
      o.height
    )
  );
  const hitY = obstacles.some((o) =>
    rectsOverlap(
      player.x,
      newY,
      player.size,
      player.size,
      o.x,
      o.y,
      o.width,
      o.height
    )
  );
  if (hitX) velocity.x = -velocity.x * bounceFactor;
  else player.x = newX;
  if (hitY) velocity.y = -velocity.y * bounceFactor;
  else player.y = newY;
  if (hitX || hitY) {
    spawnParticles(player.x + player.size / 2, player.y + player.size / 2);
    hook.active = false;
  }
  // boundary
  let bounced = false;
  if (player.x < oobZone.x) {
    player.x = oobZone.x;
    velocity.x = -velocity.x * bounceFactor;
    bounced = true;
  } else if (player.x + player.size > oobZone.x + oobZone.width) {
    player.x = oobZone.x + oobZone.width - player.size;
    velocity.x = -velocity.x * bounceFactor;
    bounced = true;
  }
  if (player.y < oobZone.y) {
    player.y = oobZone.y;
    velocity.y = -velocity.y * bounceFactor;
    bounced = true;
  } else if (player.y + player.size > oobZone.y + oobZone.height) {
    player.y = oobZone.y + oobZone.height - player.size;
    velocity.y = -velocity.y * bounceFactor;
    bounced = true;
  }
  if (bounced) {
    spawnParticles(player.x + player.size / 2, player.y + player.size / 2, 50);
    hook.active = false;
  }
  socket.emit("playerMovement", { x: player.x, y: player.y });

  // rendering
  const camX = player.x - canvas.width / 2 + player.size / 2;
  const camY = player.y - canvas.height / 2 + player.size / 2;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const bg = ctx.createLinearGradient(0, 0, 0, canvas.height);
  bg.addColorStop(0, "#0d0d1a");
  bg.addColorStop(1, "#1a1a33");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // tutorial overlay
  if (messageDuration > 0) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#fff";
    ctx.font = "20px Orbitron, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Use Arrow Keys to Move", canvas.width / 2, 50);
    ctx.fillText("Press Space to Grapple", canvas.width / 2, 80);
    messageDuration--;
  }

  // world
  ctx.translate(-camX, -camY);
  ctx.strokeStyle = "rgba(255,255,255,0.05)";
  ctx.lineWidth = 1;
  for (let x = oobZone.x; x <= oobZone.x + oobZone.width; x += 100) {
    ctx.beginPath();
    ctx.moveTo(x, oobZone.y);
    ctx.lineTo(x, oobZone.y + oobZone.height);
    ctx.stroke();
  }
  for (let y = oobZone.y; y <= oobZone.y + oobZone.height; y += 100) {
    ctx.beginPath();
    ctx.moveTo(oobZone.x, y);
    ctx.lineTo(oobZone.x + oobZone.width, y);
    ctx.stroke();
  }
  ctx.fillStyle = "#555";
  ctx.strokeStyle = "#888";
  for (const o of obstacles) {
    ctx.fillRect(o.x, o.y, o.width, o.height);
    ctx.strokeRect(o.x, o.y, o.width, o.height);
  }
  ctx.setLineDash([10, 5]);
  ctx.strokeStyle = "red";
  ctx.lineWidth = 3;
  ctx.strokeRect(oobZone.x, oobZone.y, oobZone.width, oobZone.height);
  ctx.setLineDash([]);

  // hook rope
  if (hook.active) {
    ctx.strokeStyle = getHookColor();
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(player.x + player.size / 2, player.y + player.size / 2);
    ctx.lineTo(hook.x, hook.y);
    ctx.stroke();
  }

  // players
  drawPlayer(player, getPlayerColor());
  for (const p of Object.values(otherPlayers)) drawPlayer(p, getPlayerColor());

  // particles
  updateAndDrawParticles();

  requestAnimationFrame(gameLoop);
}

// startGame
window.startGame = () => {
  resize();
  gameLoop();
};

function drawPlayer(p, col) {
  ctx.save();
  ctx.shadowColor = col;
  ctx.shadowBlur = 20;
  const grad = ctx.createRadialGradient(
    p.x + 10,
    p.y + 10,
    5,
    p.x + 10,
    p.y + 10,
    15
  );
  grad.addColorStop(0, "#fff");
  grad.addColorStop(1, col);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(p.x + 10, p.y + 10, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
