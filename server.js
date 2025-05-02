const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
app.use(express.static(path.join(__dirname, "public")));

const srv = http.createServer(app);
const io = new Server(srv);

// Shared map bounds
const worldW = 2000;
const worldH = 2000;
const oobZone = { x: -100, y: -100, width: worldW + 200, height: worldH + 200 };

function rectsOverlap(x1, y1, w1, h1, x2, y2, w2, h2) {
  return !(x1 + w1 < x2 || x1 > x2 + w2 || y1 + h1 < y2 || y1 > y2 + h2);
}

// Server‐side obstacle generation
const obstacles = [];
for (let i = 0; i < 75; i++) {
  let o;
  do {
    const w = 20 + Math.random() * 80;
    const h = 20 + Math.random() * 80;
    const x = oobZone.x + Math.random() * (oobZone.width - w);
    const y = oobZone.y + Math.random() * (oobZone.height - h);
    o = { x, y, width: w, height: h };
  } while (
    obstacles.some((o2) =>
      rectsOverlap(o.x, o.y, o.width, o.height, o2.x, o2.y, o2.width, o2.height)
    )
  );
  obstacles.push(o);
}

// Track connected players
let players = {};

io.on("connection", (socket) => {
  console.log("🟢 Player connected:", socket.id);

  // Initialize with defaults
  players[socket.id] = { x: 100, y: 100, name: "Player", color: "#0000ff" };

  // Send shared map + existing players
  socket.emit("mapData", { obstacles, oobZone });
  socket.emit("currentPlayers", players);

  // Notify others
  socket.broadcast.emit("newPlayer", { id: socket.id, ...players[socket.id] });

  // Handle movement + name + color
  socket.on("playerMovement", (data) => {
    if (!players[socket.id]) return;
    players[socket.id].x = data.x;
    players[socket.id].y = data.y;
    players[socket.id].name = data.name;
    players[socket.id].color = data.color;
    socket.broadcast.emit("playerMoved", {
      id: socket.id,
      x: data.x,
      y: data.y,
      name: data.name,
      color: data.color,
    });
  });

  // Disconnect cleanup
  socket.on("disconnect", () => {
    console.log("🔴 Player disconnected:", socket.id);
    delete players[socket.id];
    io.emit("playerDisconnected", socket.id);
  });
});

const PORT = process.env.PORT || 3000;
srv.listen(PORT, () =>
  console.log(`🚀 Server running at http://localhost:${PORT}`)
);
