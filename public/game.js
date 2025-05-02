// Setup
const socket = io();
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
function resize() {
  canvas.width = innerWidth;
  canvas.height = innerHeight;
}
window.addEventListener("resize", resize);
resize();

// Shared map (populated by server)
let obstacles = [],
  oobZone;
let mapReady = false;
socket.on("mapData", (data) => {
  obstacles = data.obstacles;
  oobZone = data.oobZone;
  mapReady = true;
});

// Player + config
const spawn = { x: 100, y: 100 },
  player = { ...spawn, size: 20 };
const getPlayerColor = () => playerConfig.color;
const getHookColor = () => playerConfig.hook;
const getParticleColor = () => playerConfig.particle;
const getPlayerName = () => playerConfig.name;
let messageDuration = 300;
// Physics
const velocity = { x: 0, y: 0 },
  acc = 0.2,
  maxSp = 8,
  bounce = 1.5;
// Hook
let hook = { active: false, x: 0, y: 0 };
const maxHook = 300,
  pull = 0.5;
// Input
const keys = {};
window.addEventListener("keydown", (e) => {
  keys[e.key] = true;
  if (e.code === "Space") toggleHook();
});
window.addEventListener("keyup", (e) => (keys[e.key] = false));
function toggleHook() {
  if (hook.active) hook.active = false;
  else {
    const px = player.x + 10,
      py = player.y + 10;
    let bd2 = maxHook * maxHook,
      bp;
    for (const o of obstacles) {
      const cx = Math.max(o.x, Math.min(px, o.x + o.width)),
        cy = Math.max(o.y, Math.min(py, o.y + o.height)),
        dx = cx - px,
        dy = cy - py,
        d2 = dx * dx + dy * dy;
      if (d2 < bd2) {
        bd2 = d2;
        bp = { x: cx, y: cy };
      }
    }
    if (bp) hook = { active: true, x: bp.x, y: bp.y };
  }
}

// Particles
let parts = [];
function spawnParticles(cx, cy, n = 30) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * 2 * Math.PI,
      s = 1 + Math.random() * 4;
    parts.push({
      x: cx,
      y: cy,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      life: 60 + 30 * Math.random(),
    });
  }
}
function updateAndDrawParticles() {
  const c = getParticleColor();
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.x += p.vx;
    p.y += p.vy;
    p.life--;
    if (p.life <= 0) {
      parts.splice(i, 1);
      continue;
    }
    ctx.globalAlpha = p.life / 90;
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, 2 * Math.PI);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// Networking
const others = {};
socket.on("currentPlayers", (pl) => {
  for (const id in pl) if (id !== socket.id) others[id] = { ...pl[id] };
});
socket.on("newPlayer", (p) => {
  if (p.id !== socket.id) others[p.id] = { x: p.x, y: p.y, name: p.name };
});
socket.on("playerMoved", (p) => {
  if (p.id !== socket.id && others[p.id])
    others[p.id] = { x: p.x, y: p.y, name: p.name };
});
socket.on("playerDisconnected", (id) => delete others[id]);

// Game Loop
function gameLoop() {
  if (!mapReady) {
    requestAnimationFrame(gameLoop);
    return;
  }
  let ix = 0,
    iy = 0;
  if (keys.ArrowUp) iy--;
  if (keys.ArrowDown) iy++;
  if (keys.ArrowLeft) ix--;
  if (keys.ArrowRight) ix++;
  if (ix || iy) {
    const inv = 1 / Math.hypot(ix, iy);
    ix *= inv;
    iy *= inv;
    velocity.x += ix * acc;
    velocity.y += iy * acc;
  }
  let sp = Math.hypot(velocity.x, velocity.y);
  if (sp > maxSp) {
    const f = maxSp / sp;
    velocity.x *= f;
    velocity.y *= f;
  }
  if (hook.active) {
    const px = player.x + 10,
      py = player.y + 10,
      dx = hook.x - px,
      dy = hook.y - py,
      d = Math.hypot(dx, dy);
    if (d < 10) hook.active = false;
    else {
      velocity.x += (dx / d) * pull;
      velocity.y += (dy / d) * pull;
    }
  }
  const nx = player.x + velocity.x,
    ny = player.y + velocity.y;
  const hX = obstacles.some((o) =>
      rectsOverlap(
        nx,
        player.y,
        player.size,
        player.size,
        o.x,
        o.y,
        o.width,
        o.height
      )
    ),
    hY = obstacles.some((o) =>
      rectsOverlap(
        player.x,
        ny,
        player.size,
        player.size,
        o.x,
        o.y,
        o.width,
        o.height
      )
    );
  if (hX) velocity.x = -velocity.x * bounce;
  else player.x = nx;
  if (hY) velocity.y = -velocity.y * bounce;
  else player.y = ny;
  if (hX || hY) {
    spawnParticles(player.x + 10, player.y + 10);
    hook.active = false;
  }
  let bd = false;
  if (player.x < oobZone.x) {
    player.x = oobZone.x;
    velocity.x = -velocity.x * bounce;
    bd = true;
  } else if (player.x + player.size > oobZone.x + oobZone.width) {
    player.x = oobZone.x + oobZone.width - player.size;
    velocity.x = -velocity.x * bounce;
    bd = true;
  }
  if (player.y < oobZone.y) {
    player.y = oobZone.y;
    velocity.y = -velocity.y * bounce;
    bd = true;
  } else if (player.y + player.size > oobZone.y + oobZone.height) {
    player.y = oobZone.y + oobZone.height - player.size;
    velocity.y = -velocity.y * bounce;
    bd = true;
  }
  if (bd) {
    spawnParticles(player.x + 10, player.y + 10, 50);
    hook.active = false;
  }
  socket.emit("playerMovement", {
    x: player.x,
    y: player.y,
    name: getPlayerName(),
  });
  const cX = player.x - canvas.width / 2 + 10,
    cY = player.y - canvas.height / 2 + 10;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const bg = ctx.createLinearGradient(0, 0, 0, canvas.height);
  bg.addColorStop(0, "#0d0d1a");
  bg.addColorStop(1, "#1a1a33");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (messageDuration > 0) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#fff";
    ctx.font = "20px Orbitron, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Use Arrow Keys to Move", canvas.width / 2, 50);
    ctx.fillText("Press Space to Grapple", canvas.width / 2, 80);
    messageDuration--;
  }
  ctx.translate(-cX, -cY);
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
  if (hook.active) {
    ctx.strokeStyle = getHookColor();
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(player.x + 10, player.y + 10);
    ctx.lineTo(hook.x, hook.y);
    ctx.stroke();
  }
  drawPlayer(player, getPlayerColor(), getPlayerName());
  for (const id in others) {
    const p = others[id];
    drawPlayer(p, getPlayerColor(), p.name);
  }
  updateAndDrawParticles();
  requestAnimationFrame(gameLoop);
}
window.startGame = () => {
  resize();
  if (mapReady) gameLoop();
  else socket.once("mapData", () => gameLoop());
};
function drawPlayer(p, col, name) {
  ctx.save();
  ctx.shadowColor = col;
  ctx.shadowBlur = 20;
  const g = ctx.createRadialGradient(
    p.x + 10,
    p.y + 10,
    5,
    p.x + 10,
    p.y + 10,
    15
  );
  g.addColorStop(0, "#fff");
  g.addColorStop(1, col);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(p.x + 10, p.y + 10, 10, 0, 2 * Math.PI);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = "#fff";
  ctx.font = "16px Orbitron, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(name, p.x + 10, p.y - 8);
}
function rectsOverlap(x1, y1, w1, h1, x2, y2, w2, h2) {
  return !(x1 + w1 < x2 || x1 > x2 + w2 || y1 + h1 < y2 || y1 > y2 + h2);
}
