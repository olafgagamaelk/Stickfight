const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*"
    }
});

app.use(express.static("public"));

const players = {};

io.on("connection", (socket) => {

    console.log("Player connected:", socket.id);

    players[socket.id] = {
        id: socket.id,
        x: 400,
        y: 300,
        angle: 0
    };

    socket.emit("currentPlayers", players);

    socket.broadcast.emit("playerJoined", players[socket.id]);

    socket.on("playerUpdate", (data) => {

        if (!players[socket.id]) return;

        players[socket.id] = {
            ...players[socket.id],
            ...data,
            id: socket.id
        };

        socket.broadcast.emit("playerUpdate", players[socket.id]);
    });

    socket.on("disconnect", () => {

        console.log("Player disconnected:", socket.id);

        delete players[socket.id];

        io.emit("playerLeft", socket.id);
    });

});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
