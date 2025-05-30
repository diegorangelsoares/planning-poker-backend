const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const socketHandlers = require('./handlers/socketHandlers');

const VIDA_SALA = process.env.VIDASALA || 3000;
const rooms = require('./rooms');

const app = express();
app.use(cors());

const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

io.on('connection', (socket) => {
    console.log(`Usuário conectado: ${socket.id}`);
    socketHandlers(io, socket);
});

setInterval(() => {
    const now = Date.now();
    const maxAge = VIDA_SALA * 60 * 60 * 1000;
    for (const roomId in rooms) {
        const room = rooms[roomId];
        if (now - room.createdAt > maxAge) {
            //io.to(roomId).emit('removed');
            console.log(`Sala ${roomId} removida automaticamente.`);
        }
    }
}, 5 * 60 * 1000);

module.exports = { server };