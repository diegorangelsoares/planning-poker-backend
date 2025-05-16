
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const PORT = process.env.PORT || 4000;
const VIDA_SALA = process.env.VIDASALA || 3;

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] }
});

const rooms = {};

function generateRoomId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function calculateAverage(votes) {
    const numeric = Object.values(votes)
        .map(v => parseFloat(v))
        .filter(n => !isNaN(n));
    if (numeric.length === 0) return '?';
    const sum = numeric.reduce((a, b) => a + b, 0);
    return (sum / numeric.length).toFixed(2);
}

function formatUsers(room) {
    return Object.entries(room.users).map(([id, name]) => ({
        name,
        hasVoted: room.votes.hasOwnProperty(id)
    }));
}

function formatVotes(room) {
    return Object.entries(room.votes).map(([id, vote]) => ({
        user: room.users[id],
        vote
    }));
}

io.on('connection', (socket) => {
    console.log('Usuário conectado:', socket.id);

    socket.on('createRoom', ({ roomName, sequence }) => {
        const roomId = generateRoomId();
        rooms[roomId] = {
            name: roomName,
            sequence,
            users: {},
            votes: {},
            revealed: false,
            average: '?',
            createdAt: Date.now(),
            stories: [],
            activeStoryId: null
        };
        socket.join(roomId);
        socket.emit('roomCreated', { roomId });
    });

    socket.on('getAllRooms', (callback) => {
        const data = Object.entries(rooms).map(([id, r]) => ({
            roomId: id,
            roomName: r.name,
            users: r.users,
            sequence: r.sequence,
            revealed: r.revealed,
            average: r.average,
            stories: r.stories,
            activeStoryId: r.activeStoryId
        }));
        callback(data);
    });

    socket.on('checkRoomExists', (roomId, cb) => cb({ exists: !!rooms[roomId] }));

    socket.on('joinRoom', ({ roomId, userName }, cb) => {
        const room = rooms[roomId];
        if (!room) return;
        const existingId = Object.keys(room.users).find(id => room.users[id] === userName);
        if (existingId) delete room.users[existingId];

        room.users[socket.id] = userName;
        socket.join(roomId);
        io.to(roomId).emit('updateUsers', { users: formatUsers(room) });
        if (cb) cb();
    });

    socket.on('getRoomData', (roomId) => {
        const room = rooms[roomId];
        if (!room) return;
        socket.emit('roomData', {
            roomName: room.name,
            cardOptions: room.sequence,
            users: formatUsers(room),
            votes: formatVotes(room),
            votingOpen: !room.revealed,
            stories: room.stories,
            activeStoryId: room.activeStoryId
        });
    });

    socket.on('createStory', ({ roomId, storyName }) => {
        const room = rooms[roomId];
        if (!room) return;
        const storyId = Math.random().toString(36).substring(2, 9);
        const newStory = { id: storyId, name: storyName, revealed: false, average: '?', createdAt: Date.now() };
        room.stories.push(newStory);
        io.to(roomId).emit('roomData', {
            roomName: room.name,
            cardOptions: room.sequence,
            users: formatUsers(room),
            votes: formatVotes(room),
            votingOpen: !room.revealed,
            stories: room.stories,
            activeStoryId: room.activeStoryId
        });
    });

    socket.on('setActiveStory', ({ roomId, storyId }) => {
        const room = rooms[roomId];
        if (!room) return;
        room.activeStoryId = storyId;
        room.votes = {};
        room.revealed = false;
        room.average = '?';
        io.to(roomId).emit('roomData', {
            roomName: room.name,
            cardOptions: room.sequence,
            users: formatUsers(room),
            votes: [],
            votingOpen: true,
            stories: room.stories,
            activeStoryId: storyId
        });
    });

    socket.on('vote', ({ roomId, vote }) => {
        const room = rooms[roomId];
        if (!room || !room.users[socket.id]) return;
        room.votes[socket.id] = vote;

        if (Object.keys(room.votes).length === Object.keys(room.users).length) {
            io.to(roomId).emit('allVoted');
        }
        io.to(roomId).emit('updateUsers', { users: formatUsers(room) });
    });

    socket.on('revealVotes', (roomId) => {
        const room = rooms[roomId];
        if (!room) return;
        room.revealed = true;
        room.average = calculateAverage(room.votes);
        const activeStory = room.stories.find(s => s.id === room.activeStoryId);
        if (activeStory) {
            activeStory.revealed = true;
            activeStory.average = room.average;
        }
        io.to(roomId).emit('votesRevealed', {
            votes: formatVotes(room),
            average: room.average
        });
    });

    socket.on('resetVotes', (roomId) => {
        const room = rooms[roomId];
        if (!room) return;
        room.votes = {};
        room.revealed = false;
        room.average = '?';
        io.to(roomId).emit('votesReset');
        io.to(roomId).emit('updateUsers', { users: formatUsers(room) });
    });

    socket.on('removeUser', ({ roomId, userName }) => {
        const room = rooms[roomId];
        if (!room) return;
        const socketId = Object.keys(room.users).find(id => room.users[id] === userName);
        if (socketId) {
            delete room.users[socketId];
            delete room.votes[socketId];
            io.to(socketId).emit('removed');
            io.to(roomId).emit('updateUsers', { users: formatUsers(room) });
        }
    });

    socket.on('disconnect', () => {
        for (const roomId in rooms) {
            const room = rooms[roomId];
            if (room.users[socket.id]) {
                delete room.users[socket.id];
                delete room.votes[socket.id];
                io.to(roomId).emit('updateUsers', { users: formatUsers(room) });
                if (Object.keys(room.users).length === 0) {
                    delete rooms[roomId];
                }
                break;
            }
        }
    });
});

setInterval(() => {
    const now = Date.now();
    const maxAge = VIDA_SALA * 60 * 60 * 1000;
    for (const roomId in rooms) {
        if (now - rooms[roomId].createdAt > maxAge) {
            io.to(roomId).emit('removed');
            delete rooms[roomId];
        }
    }
}, 5 * 60 * 1000);

server.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
    console.log(`v 0.11.0`);
});
