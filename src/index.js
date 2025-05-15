const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const PORT = process.env.PORT || 4000;
const VIDA_SALA = process.env.VIDASALA || 300;

const app = express();
app.use(cors());

const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

const rooms = {};

function generateRoomId() {
    return Math.random().toString(36).substr(2, 6).toUpperCase();
}

function getDateNow(){

    const now = new Date(Date.now());

    const formatNumber = (n) => n.toString().padStart(2, '0');
    const day = formatNumber(now.getDate());
    const month = formatNumber(now.getMonth() + 1); // meses começam do 0
    const year = now.getFullYear();
    const hours = formatNumber(now.getHours());
    const minutes = formatNumber(now.getMinutes());
    const seconds = formatNumber(now.getSeconds());

    return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
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

function calculateAverage(room) {
    const votes = Object.values(room.votes)
        .map(v => parseFloat(v))
        .filter(v => !isNaN(v));

    if (votes.length === 0) return '?';
    const sum = votes.reduce((acc, val) => acc + val, 0);
    return (sum / votes.length).toFixed(2);
}

io.on('connection', (socket) => {
    console.log(`Usuário conectado: ${socket.id}`);

    socket.on('createRoom', ({ roomName, sequence }) => {
        const roomId = generateRoomId();
        rooms[roomId] = {
            name: roomName,
            sequence,
            users: {},
            votes: {},
            revealed: false,
            average: '?',
            createdAt: Date.now() // Adicionado: registro da data de criação
        };
        socket.join(roomId);
        socket.emit('roomCreated', { roomId });
        console.log(`Sala criada por: ${roomName} Id da sala: ${roomId} - ${getDateNow()}`);
    });

    socket.on('getAllRooms', (callback) => {
        const roomList = Object.entries(rooms).map(([roomId, room]) => ({
            roomId,
            roomName: room.name
        }));
        callback(roomList);
    });

    socket.on('checkRoomExists', (roomId, callback) => {
        callback({ exists: !!rooms[roomId] });
    });

    socket.on('joinRoom', ({ roomId, userName }, callback) => {
        const room = rooms[roomId];
        if (room) {
            // Evita duplicidade de usuário
            const existingId = Object.keys(room.users).find(id => room.users[id] === userName);
            if (existingId) delete room.users[existingId];

            room.users[socket.id] = userName;
            socket.join(roomId);
            io.to(roomId).emit('updateUsers', { users: formatUsers(room) });
            callback && callback();
        }
    });

    socket.on('getRoomData', (roomId) => {
        const room = rooms[roomId];
        if (room) {
            socket.emit('roomData', {
                roomName: room.name,
                cardOptions: room.sequence,
                users: formatUsers(room),
                votes: formatVotes(room),
                votingOpen: !room.revealed
            });
        }
    });

    socket.on('vote', ({ roomId, vote }) => {
        const room = rooms[roomId];
        if (room && room.users[socket.id]) {
            room.votes[socket.id] = vote;
            const totalUsers = Object.keys(room.users).length;
            const totalVotes = Object.keys(room.votes).length;
            if (totalUsers > 0 && totalUsers === totalVotes) {
                io.to(roomId).emit('allVoted');
            }
            io.to(roomId).emit('updateUsers', { users: formatUsers(room) });
        }
    });

    socket.on('revealVotes', (roomId) => {
        const room = rooms[roomId];
        if (room) {
            room.revealed = true;
            room.average = calculateAverage(room);
            io.to(roomId).emit('votesRevealed', {
                votes: formatVotes(room),
                average: room.average
            });
        }
    });

    socket.on('resetVotes', (roomId) => {
        const room = rooms[roomId];
        if (room) {
            room.votes = {};
            room.revealed = false;
            room.average = '?';
            io.to(roomId).emit('votesReset');
            io.to(roomId).emit('updateUsers', { users: formatUsers(room) });
        }
    });

    socket.on('setSequence', ({ roomId, sequence }) => {
        const room = rooms[roomId];
        if (room) {
            room.sequence = sequence;
            io.to(roomId).emit('setSequence', { sequence });
        }
    });

    socket.on('removeUser', ({ roomId, userName }) => {
        const room = rooms[roomId];
        if (room) {
            const targetId = Object.keys(room.users).find(id => room.users[id] === userName);
            if (targetId) {
                delete room.users[targetId];
                delete room.votes[targetId];
                io.to(targetId).emit('removed');
                io.to(roomId).emit('updateUsers', { users: formatUsers(room) });
            }
        }
    });

    socket.on('disconnect', () => {
        for (const roomId in rooms) {
            const room = rooms[roomId];
            if (room.users[socket.id]) {
                delete room.users[socket.id];
                delete room.votes[socket.id];
                io.to(roomId).emit('updateUsers', { users: formatUsers(room) });

                // Se todos os usuários saíram, exclui a sala
                if (Object.keys(room.users).length === 0) {
                    delete rooms[roomId];
                    console.log(`Sala ${roomId} removida (vazia).`);
                }
                break;
            }
        }
    });
});

// ⏲️ Intervalo para remover salas com mais de 3 horas
setInterval(() => {
    const now = Date.now();
    const threeHours = VIDA_SALA * 60 * 60 * 1000;
    for (const roomId in rooms) {
        const room = rooms[roomId];
        if (now - room.createdAt > threeHours) {
            io.to(roomId).emit('removed'); // avisa quem estiver na sala
            delete rooms[roomId];
            console.log(`Sala ${roomId} removida automaticamente (tempo expirado).`);
        }
    }
}, 5 * 60 * 1000); // verifica a cada 5 minutos

app.get('/api/rooms', (req, res) => {
    const roomList = Object.entries(rooms).map(([roomId, room]) => ({
        id: roomId,
        name: room.name,
        totalUsers: Object.keys(room.users).length,
        revealed: room.revealed,
        createdAt: room.createdAt
    }));
    res.json(roomList);
});

server.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
    console.log(`vBeta 0.9.0`);
});