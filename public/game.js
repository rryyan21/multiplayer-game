// public/game.js

// —— SETUP ——
const socket = io();
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// make canvas full-screen
function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener("resize", resize);
resize();

// initial spawn point
const spawn = { x: 100, y: 100 };

// OOB zone
const worldW = canvas.width * 2;
const worldH = canvas.height * 2;
const oobZone = { x: -100, y: -100, width: worldW + 200, height: worldH + 200 };

// obstacles along boundaries
const obstacles = [];
const obsCount = 75;

function rectsOverlap(x1, y1, w1, h1, x2, y2, w2, h2) {
  return !(x1 + w1 < x2 || x1 > x2 + w2 || y1 + h1 < y2 || y1 > y2 + h2);
}

for (let i = 0; i < obsCount; i++) {
  let width, height, x, y, newObs;
  do {
    width = 20 + Math.random() * 80;
    height = 20 + Math.random() * 80;
    x = oobZone.x + Math.random() * (oobZone.width - width);
    y = oobZone.y + Math.random() * (oobZone.height - height);
    newObs = { x, y, width, height };
  } while (
    obstacles.some((obs) =>
      rectsOverlap(
        newObs.x,
        newObs.y,
        newObs.width,
        newObs.height,
        obs.x,
        obs.y,
        obs.width,
        obs.height
      )
    )
  );
  obstacles.push(newObs);
}

// player
const player = { x: spawn.x, y: spawn.y, size: 20 };
// momentum
const velocity = { x: 0, y: 0 };
const acceleration = 0.2;
const maxSpeed = 8;
const bounceFactor = 1.5;
// hook
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
    const px = player.x + player.size / 2,
      py = player.y + player.size / 2;
    let bestDist2 = maxHookRange * maxHookRange,
      bestPt = null;
    obstacles.forEach((obs) => {
      const cx = Math.max(obs.x, Math.min(px, obs.x + obs.width));
      const cy = Math.max(obs.y, Math.min(py, obs.y + obs.height));
      const dx = cx - px,
        dy = cy - py,
        d2 = dx * dx + dy * dy;
      if (d2 < bestDist2) {
        bestDist2 = d2;
        bestPt = { x: cx, y: cy };
      }
    });
    if (bestPt) {
      hook.active = true;
      hook.x = bestPt.x;
      hook.y = bestPt.y;
    }
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
    ctx.fillStyle = `hsl(${Math.random() * 60 + 30}, 100%, 50%)`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// networking
const otherPlayers = {};
socket.on("currentPlayers", (players) => {
  Object.keys(players).forEach((id) => {
    if (id !== socket.id) otherPlayers[id] = players[id];
  });
});
socket.on("newPlayer", (p) => {
  if (p.id !== socket.id) otherPlayers[p.id] = { x: p.x, y: p.y };
});
socket.on("playerMoved", (p) => {
  if (p.id !== socket.id) otherPlayers[p.id] = { x: p.x, y: p.y };
});
socket.on("playerDisconnected", (id) => delete otherPlayers[id]);

// game loop definition
function gameLoop() {
  // input vector
  let ix = 0,
    iy = 0;
  if (keys.ArrowUp) iy--;
  if (keys.ArrowDown) iy++;
  if (keys.ArrowLeft) ix--;
  if (keys.ArrowRight) ix++;

  // accelerate
  if (ix || iy) {
    const inv = 1 / Math.hypot(ix, iy);
    ix *= inv;
    iy *= inv;
    velocity.x += ix * acceleration;
    velocity.y += iy * acceleration;
  }

  // clamp speed
  const sp = Math.hypot(velocity.x, velocity.y);
  if (sp > maxSpeed) {
    const f = maxSpeed / sp;
    velocity.x *= f;
    velocity.y *= f;
  }

  // grappling pull
  if (hook.active) {
    const px = player.x + player.size / 2,
      py = player.y + player.size / 2;
    const dx = hook.x - px,
      dy = hook.y - py;
    const d = Math.hypot(dx, dy);
    if (d < 10) hook.active = false;
    else {
      velocity.x += (dx / d) * pullStrength;
      velocity.y += (dy / d) * pullStrength;
    }
  }

  // propose move & bounce
  const newX = player.x + velocity.x;
  const newY = player.y + velocity.y;
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

  // boundary bounce
  let boundHit = false;
  if (player.x < oobZone.x) {
    player.x = oobZone.x;
    velocity.x = -velocity.x * bounceFactor;
    boundHit = true;
  } else if (player.x + player.size > oobZone.x + oobZone.width) {
    player.x = oobZone.x + oobZone.width - player.size;
    velocity.x = -velocity.x * bounceFactor;
    boundHit = true;
  }
  if (player.y < oobZone.y) {
    player.y = oobZone.y;
    velocity.y = -velocity.y * bounceFactor;
    boundHit = true;
  } else if (player.y + player.size > oobZone.y + oobZone.height) {
    player.y = oobZone.y + oobZone.height - player.size;
    velocity.y = -velocity.y * bounceFactor;
    boundHit = true;
  }
  if (boundHit) {
    spawnParticles(player.x + player.size / 2, player.y + player.size / 2, 50);
    hook.active = false;
  }

  // emit update
  socket.emit("playerMovement", { x: player.x, y: player.y });

  // camera & drawing (background, grid, obstacles, boundary, hook, players, particles)
  const camX = player.x - canvas.width / 2 + player.size / 2;
  const camY = player.y - canvas.height / 2 + player.size / 2;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const bgGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  bgGrad.addColorStop(0, "#0d0d1a");
  bgGrad.addColorStop(1, "#1a1a33");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

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
  obstacles.forEach((o) => {
    ctx.fillRect(o.x, o.y, o.width, o.height);
    ctx.strokeRect(o.x, o.y, o.width, o.height);
  });
  ctx.setLineDash([10, 5]);
  ctx.strokeStyle = "red";
  ctx.lineWidth = 3;
  ctx.strokeRect(oobZone.x, oobZone.y, oobZone.width, oobZone.height);
  ctx.setLineDash([]);
  if (hook.active) {
    const grad = ctx.createLinearGradient(player.x, player.y, hook.x, hook.y);
    grad.addColorStop(0, "#fff");
    grad.addColorStop(1, "#888");
    ctx.strokeStyle = grad;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(player.x + player.size / 2, player.y + player.size / 2);
    ctx.lineTo(hook.x, hook.y);
    ctx.stroke();
  }
  drawPlayer(player, "blue");
  Object.values(otherPlayers).forEach((p) => drawPlayer(p, "red"));
  updateAndDrawParticles();

  requestAnimationFrame(gameLoop);
}

// expose startGame instead of auto-run
window.startGame = function () {
  resize();
  gameLoop();
};

function drawPlayer(p, color) {
  ctx.save();
  ctx.shadowColor = color;
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
  grad.addColorStop(1, color);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(p.x + 10, p.y + 10, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
