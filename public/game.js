// public/game.js

// —— SETUP ——
const socket = io();
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// make full‐screen
function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener("resize", resize);
resize();

// local player & input
const player = { x: 100, y: 100, size: 20 };
const keys = {};
window.addEventListener("keydown", (e) => (keys[e.key] = true));
window.addEventListener("keyup", (e) => (keys[e.key] = false));

// other players
const otherPlayers = {};

// —— STATIC OBSTACLES ——
// an array of { x, y, width, height }
const obstacles = [];

// generate random obstacles
for (let i = 0; i < 50; i++) {
  const randomX = Math.random() * canvas.width * 2 - canvas.width; // spread across a larger area
  const randomY = Math.random() * canvas.height * 2 - canvas.height;
  const randomWidth = Math.random() * 100 + 20; // width between 20 and 120
  const randomHeight = Math.random() * 100 + 20; // height between 20 and 120
  obstacles.push({
    x: randomX,
    y: randomY,
    width: randomWidth,
    height: randomHeight,
  });
}

// helper: axis‐aligned rectangle collision
function rectsOverlap(x1, y1, w1, h1, x2, y2, w2, h2) {
  return !(x1 + w1 < x2 || x1 > x2 + w2 || y1 + h1 < y2 || y1 > y2 + h2);
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
  const speed = 5;
  let newX = player.x;
  let newY = player.y;

  // 1) propose movement
  if (keys["ArrowUp"]) newY -= speed;
  if (keys["ArrowDown"]) newY += speed;
  if (keys["ArrowLeft"]) newX -= speed;
  if (keys["ArrowRight"]) newX += speed;

  // 2) collision check per axis
  // Horizontal
  let collideH = obstacles.some((obs) =>
    rectsOverlap(
      newX,
      player.y,
      player.size,
      player.size,
      obs.x,
      obs.y,
      obs.width,
      obs.height
    )
  );
  if (!collideH) player.x = newX;

  // Vertical
  let collideV = obstacles.some((obs) =>
    rectsOverlap(
      player.x,
      newY,
      player.size,
      player.size,
      obs.x,
      obs.y,
      obs.width,
      obs.height
    )
  );
  if (!collideV) player.y = newY;

  // 3) send to server
  socket.emit("playerMovement", { x: player.x, y: player.y });

  // 4) camera centering
  const camX = player.x - canvas.width / 2 + player.size / 2;
  const camY = player.y - canvas.height / 2 + player.size / 2;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.translate(-camX, -camY);

  // 5) draw obstacles
  ctx.fillStyle = "gray";
  for (const obs of obstacles) {
    ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
  }

  // 6) draw players
  // you
  ctx.fillStyle = "blue";
  ctx.fillRect(player.x, player.y, player.size, player.size);

  // others
  ctx.fillStyle = "red";
  for (let id in otherPlayers) {
    const p = otherPlayers[id];
    ctx.fillRect(p.x, p.y, player.size, player.size);
  }

  requestAnimationFrame(gameLoop);
}

gameLoop();
