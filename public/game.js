// public/game.js

//acceleration
//maxspeed
//bouncefactor - how bouncy
//maxHookRange
//pullStrength

// —— SETUP ——
const socket = io();
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// make canvas fill the screen
function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener("resize", resize);
resize();

// player state
const player = { x: 100, y: 100, size: 20 };

// momentum parameters
const velocity = { x: 0, y: 0 };
const acceleration = 0.05; // px/frame²
const maxSpeed = 8; // px/frame
const bounceFactor = 2; // multiplies your speed on bounce

// grappling‐hook state
let hook = { active: false, x: 0, y: 0 };
const maxHookRange = 300;
const pullStrength = 0.75;

// input tracking
const keys = {};
window.addEventListener("keydown", (e) => {
  keys[e.key] = true;

  // instead of checking for "g", check for the Space key
  if (e.code === "Space") {
    if (hook.active) {
      hook.active = false;
    } else {
      // find closest point on any obstacle
      const px = player.x + player.size / 2;
      const py = player.y + player.size / 2;
      let bestDist2 = maxHookRange * maxHookRange;
      let bestPt = null;
      for (const obs of obstacles) {
        const cx = Math.max(obs.x, Math.min(px, obs.x + obs.width));
        const cy = Math.max(obs.y, Math.min(py, obs.y + obs.height));
        const dx = cx - px,
          dy = cy - py,
          d2 = dx * dx + dy * dy;
        if (d2 < bestDist2) {
          bestDist2 = d2;
          bestPt = { x: cx, y: cy };
        }
      }
      if (bestPt) {
        hook.active = true;
        hook.x = bestPt.x;
        hook.y = bestPt.y;
      }
    }
  }
});
window.addEventListener("keyup", (e) => (keys[e.key] = false));

// other players
const otherPlayers = {};

// obstacles (randomly placed in 2×viewport)
const obstacles = [];
for (let i = 0; i < 50; i++) {
  obstacles.push({
    x: Math.random() * canvas.width * 2 - canvas.width,
    y: Math.random() * canvas.height * 2 - canvas.height,
    width: 20 + Math.random() * 80,
    height: 20 + Math.random() * 80,
  });
}

// AABB collision test
function rectsOverlap(x1, y1, w1, h1, x2, y2, w2, h2) {
  return !(x1 + w1 < x2 || x1 > x2 + w2 || y1 + h1 < y2 || y1 > y2 + h2);
}

// particle explosion
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
    ctx.fillStyle = "orange";
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// —— SOCKET.IO EVENTS ——
socket.on("currentPlayers", (players) => {
  for (let id in players) {
    if (id !== socket.id) otherPlayers[id] = players[id];
  }
});
socket.on("newPlayer", (p) => {
  otherPlayers[p.id] = { x: p.x, y: p.y };
});
socket.on("playerMoved", (p) => {
  if (otherPlayers[p.id]) {
    otherPlayers[p.id].x = p.x;
    otherPlayers[p.id].y = p.y;
  }
});
socket.on("playerDisconnected", (id) => {
  delete otherPlayers[id];
});

// —— MAIN GAME LOOP ——
function gameLoop() {
  // — 1) Input direction —
  let ix = 0,
    iy = 0;
  if (keys["ArrowUp"]) iy--;
  if (keys["ArrowDown"]) iy++;
  if (keys["ArrowLeft"]) ix--;
  if (keys["ArrowRight"]) ix++;

  // — 2) Accelerate in that direction —
  if (ix || iy) {
    const inv = 1 / Math.hypot(ix, iy);
    ix *= inv;
    iy *= inv;
    velocity.x += ix * acceleration;
    velocity.y += iy * acceleration;
  }

  // — 3) Clamp to maxSpeed —
  const speed = Math.hypot(velocity.x, velocity.y);
  if (speed > maxSpeed) {
    const f = maxSpeed / speed;
    velocity.x *= f;
    velocity.y *= f;
  }

  // — 4) Grappling pull —
  if (hook.active) {
    const px = player.x + player.size / 2;
    const py = player.y + player.size / 2;
    const dx = hook.x - px,
      dy = hook.y - py;
    const dist = Math.hypot(dx, dy);
    if (dist < 10) {
      hook.active = false;
    } else {
      velocity.x += (dx / dist) * pullStrength;
      velocity.y += (dy / dist) * pullStrength;
    }
  }

  // — 5) Propose new positions —
  const newX = player.x + velocity.x;
  const newY = player.y + velocity.y;

  // — 6) Per-axis collision & bounce —
  let hitX = obstacles.some((o) =>
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
  let hitY = obstacles.some((o) =>
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

  if (hitX) {
    // bounce horizontally
    velocity.x = -velocity.x * bounceFactor;
  } else {
    player.x = newX;
  }

  if (hitY) {
    // bounce vertically
    velocity.y = -velocity.y * bounceFactor;
  } else {
    player.y = newY;
  }

  // spawn particles & detach hook if any bounce happened
  if (hitX || hitY) {
    spawnParticles(player.x + player.size / 2, player.y + player.size / 2);
    hook.active = false;
  }

  // — 7) Notify server of your position —
  socket.emit("playerMovement", { x: player.x, y: player.y });

  // — 8) Camera centering —
  const camX = player.x - canvas.width / 2 + player.size / 2;
  const camY = player.y - canvas.height / 2 + player.size / 2;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.translate(-camX, -camY);

  // — 9) Draw obstacles —
  ctx.fillStyle = "gray";
  for (const o of obstacles) {
    ctx.fillRect(o.x, o.y, o.width, o.height);
  }

  // — 10) Draw hook rope —
  if (hook.active) {
    ctx.strokeStyle = "#aaa";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(player.x + player.size / 2, player.y + player.size / 2);
    ctx.lineTo(hook.x, hook.y);
    ctx.stroke();
  }

  // — 11) Draw players —
  ctx.fillStyle = "blue";
  ctx.fillRect(player.x, player.y, player.size, player.size);
  ctx.fillStyle = "red";
  for (let id in otherPlayers) {
    const p = otherPlayers[id];
    ctx.fillRect(p.x, p.y, player.size, player.size);
  }

  // — 12) Draw particles —
  updateAndDrawParticles();

  requestAnimationFrame(gameLoop);
}

gameLoop();
