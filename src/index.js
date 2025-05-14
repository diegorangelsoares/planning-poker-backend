const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

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

io.on('connection', (socket) => {
    console.log(`Usuário conectado: ${socket.id}`);

    socket.on('createRoom', ({ roomName, sequence }) => {
        const roomId = generateRoomId();
        rooms[roomId] = {
            name: roomName,
            sequence,
            users: {},       // socket.id -> userName
            votes: {},       // socket.id -> vote
            revealed: false,
            average: '?'
        };
        socket.join(roomId);
        socket.emit('roomCreated', { roomId });
        console.log(`Sala criada: ${roomName} (${roomId}) com sequência: ${sequence}`);
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

    socket.on('joinRoom', ({ roomId, userName }, callback) => {
        const room = rooms[roomId];
        if (room) {
            const existingId = Object.keys(room.users).find(
                id => room.users[id] === userName
            );

            if (existingId) {
                room.users[socket.id] = userName;
                if (room.votes[existingId]) {
                    room.votes[socket.id] = room.votes[existingId];
                }
                delete room.users[existingId];
                delete room.votes[existingId];
            } else {
                room.users[socket.id] = userName;
            }

            socket.join(roomId);

            socket.emit('roomInfo', {
                roomName: room.name
            });

            socket.emit('setSequence', { sequence: room.sequence });

            io.to(roomId).emit('updateUsers', {
                users: formatUsers(room)
            });

            if (room.revealed) {
                socket.emit('votesRevealed', {
                    votes: formatVotes(room),
                    average: room.average
                });
            }

            if (callback) callback();
        }
    });

    socket.on('vote', ({ roomId, vote }) => {
        const room = rooms[roomId];
        if (room) {
            room.votes[socket.id] = vote;

            io.to(roomId).emit('updateUsers', {
                users: formatUsers(room)
            });

            if (Object.keys(room.votes).length === Object.keys(room.users).length) {
                io.to(roomId).emit('allVoted');
            }
        }
    });

    socket.on('revealVotes', (roomId) => {
        const room = rooms[roomId];
        if (room) {
            room.revealed = true;
            room.average = calculateAverage(Object.values(room.votes));
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

            io.to(roomId).emit('updateUsers', {
                users: formatUsers(room)
            });
        }
    });

    socket.on('checkRoomExists', (roomId, callback) => {
        callback({ exists: !!rooms[roomId] });
    });

    // ✅ Função corrigida para remover participante corretamente
    socket.on('removeUser', ({ roomId, userName }) => {
        const room = rooms[roomId];
        if (!room) {
            console.error(`Sala ${roomId} não foi encontrada.`);
            return;
        }

        const targetSocketId = Object.keys(room.users).find(
            id => room.users[id] === userName
        );

        if (targetSocketId) {
            const targetSocket = io.sockets.sockets.get(targetSocketId);

            if (targetSocket) {
                targetSocket.emit('removed');
                setTimeout(() => {
                    targetSocket.leave(roomId);
                }, 100);
            }

            delete room.users[targetSocketId];
            delete room.votes[targetSocketId];

            updateUsersInRoom(roomId);
        } else {
            console.warn(`Usuário ${userName} não encontrado na sala ${roomId}`);
        }
    });

    socket.on('disconnect', () => {
        console.log(`Usuário desconectado: ${socket.id}`);
        for (const roomId in rooms) {
            const room = rooms[roomId];
            if (room.users[socket.id]) {
                delete room.users[socket.id];
                delete room.votes[socket.id];

                io.to(roomId).emit('updateUsers', {
                    users: formatUsers(room)
                });

                break;
            }
        }
    });
});

// ====================== Funções auxiliares ======================

function generateRoomId() {
    return Math.random().toString(36).substring(2, 8);
}

function calculateAverage(votes) {
    const numericVotes = votes
        .map(v => parseFloat(v))
        .filter(v => !isNaN(v));
    if (numericVotes.length === 0) return '?';
    const sum = numericVotes.reduce((a, b) => a + b, 0);
    return (sum / numericVotes.length).toFixed(2);
}

function formatUsers(room) {
    return Object.entries(room.users).map(([id, name]) => ({
        id,
        name,
        hasVoted: room.votes[id] !== undefined
    }));
}

function formatVotes(room) {
    return Object.entries(room.votes).map(([id, vote]) => ({
        user: room.users[id],
        vote
    }));
}

// ✅ Nova função utilitária
function updateUsersInRoom(roomId) {
    const room = rooms[roomId];
    if (room) {
        io.to(roomId).emit('updateUsers', {
            users: formatUsers(room)
        });
    }
}

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
    console.log(`vBeta 0.8.0 - Reconnection Support`);
});
