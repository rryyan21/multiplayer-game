// server.js
const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const srv = http.createServer(app);
const io = new Server(srv);

// Serve index.html (and any other assets) from project root
app.use(express.static(path.join(__dirname, "./")));

let players = {};

io.on("connection", (socket) => {
  console.log("🟢 Player connected:", socket.id);

  // Give the newcomer a start position
  players[socket.id] = { x: 100, y: 100 };

  // 1) Send existing players to the newcomer
  socket.emit("currentPlayers", players);

  // 2) Tell everyone else about the newcomer
  socket.broadcast.emit("newPlayer", { id: socket.id, x: 100, y: 100 });

  // 3) Handle movement updates
  socket.on("playerMovement", (data) => {
    if (players[socket.id]) {
      players[socket.id].x = data.x;
      players[socket.id].y = data.y;
      socket.broadcast.emit("playerMoved", {
        id: socket.id,
        x: data.x,
        y: data.y,
      });
    }
  });

  // 4) Handle disconnect
  socket.on("disconnect", () => {
    console.log("🔴 Player disconnected:", socket.id);
    delete players[socket.id];
    io.emit("playerDisconnected", socket.id);
  });
});

const PORT = process.env.PORT || 3000;
srv.listen(PORT, () =>
  console.log(`🚀 Server listening on http://localhost:${PORT}`)
);
