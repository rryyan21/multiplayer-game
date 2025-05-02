// public/game.js

// —— SETUP ——
const socket = io();
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// make canvas fill screen
function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener("resize", resize);
resize();

// player state
const player = { x: 100, y: 100, size: 20 };

// velocity & acceleration
const velocity = { x: 0, y: 0 };
const acceleration = 0.03; // px/frame² (tweak for feel)
const maxSpeed = 12; // px/frame

// input tracking
const keys = {};
window.addEventListener("keydown", (e) => (keys[e.key] = true));
window.addEventListener("keyup", (e) => (keys[e.key] = false));

// other players
const otherPlayers = {};

// static obstacles (random in a 2× viewport area)
const obstacles = [];
for (let i = 0; i < 50; i++) {
  obstacles.push({
    x: Math.random() * canvas.width * 2 - canvas.width,
    y: Math.random() * canvas.height * 2 - canvas.height,
    width: 20 + Math.random() * 100,
    height: 20 + Math.random() * 100,
  });
}

// AABB collision check
function rectsOverlap(x1, y1, w1, h1, x2, y2, w2, h2) {
  return !(x1 + w1 < x2 || x1 > x2 + w2 || y1 + h1 < y2 || y1 > y2 + h2);
}

// simple particle system for explosion
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
      life: 60 + Math.random() * 30, // frames
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

// —— SOCKET EVENTS ——
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

// —— GAME LOOP ——
function gameLoop() {
  // 1) build input direction vector
  let ix = 0,
    iy = 0;
  if (keys["ArrowUp"]) iy -= 1;
  if (keys["ArrowDown"]) iy += 1;
  if (keys["ArrowLeft"]) ix -= 1;
  if (keys["ArrowRight"]) ix += 1;

  // 2) accelerate in that direction
  if (ix !== 0 || iy !== 0) {
    const invLen = 1 / Math.hypot(ix, iy);
    ix *= invLen;
    iy *= invLen;
    velocity.x += ix * acceleration;
    velocity.y += iy * acceleration;
  }

  // 3) clamp to maxSpeed
  const speed = Math.hypot(velocity.x, velocity.y);
  if (speed > maxSpeed) {
    const scale = maxSpeed / speed;
    velocity.x *= scale;
    velocity.y *= scale;
  }

  // 4) propose new position
  const newX = player.x + velocity.x;
  const newY = player.y + velocity.y;

  // 5) collision test
  const hit = obstacles.some((obs) =>
    rectsOverlap(
      newX,
      newY,
      player.size,
      player.size,
      obs.x,
      obs.y,
      obs.width,
      obs.height
    )
  );

  if (hit) {
    // on collision: explode & reset velocity
    spawnParticles(player.x + player.size / 2, player.y + player.size / 2);
    velocity.x = 0;
    velocity.y = 0;
  } else {
    // commit move
    player.x = newX;
    player.y = newY;
  }

  // 6) send position to server
  socket.emit("playerMovement", { x: player.x, y: player.y });

  // 7) center camera
  const camX = player.x - canvas.width / 2 + player.size / 2;
  const camY = player.y - canvas.height / 2 + player.size / 2;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.translate(-camX, -camY);

  // 8) draw obstacles
  ctx.fillStyle = "gray";
  for (const obs of obstacles) {
    ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
  }

  // 9) draw players
  ctx.fillStyle = "blue";
  ctx.fillRect(player.x, player.y, player.size, player.size);
  ctx.fillStyle = "red";
  for (let id in otherPlayers) {
    const p = otherPlayers[id];
    ctx.fillRect(p.x, p.y, player.size, player.size);
  }

  // 10) update & draw particles
  updateAndDrawParticles();

  requestAnimationFrame(gameLoop);
}

gameLoop();
