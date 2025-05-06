const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

// Inicializa o app Express
const app = express();
app.use(cors());

// Cria o servidor HTTP
const server = http.createServer(app);

// Cria o servidor WebSocket (Socket.IO)
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

// Estrutura para armazenar as salas e seus dados
const rooms = {};

// Lida com conexões Socket.IO
io.on('connection', (socket) => {
    console.log(`Usuário conectado: ${socket.id}`);

    // Criar uma nova sala com nome e sequência de cartas
    socket.on('createRoom', ({ roomName, sequence }) => {
        const roomId = generateRoomId();
        rooms[roomId] = {
            name: roomName,
            sequence, // salva a sequência definida pelo criador da sala
            users: {},
            votes: {},
            votingStarted: false,
            revealed: false
        };
        socket.join(roomId);
        socket.emit('roomCreated', { roomId });
        console.log(`Sala criada: ${roomName} (${roomId}) com sequência: ${sequence}`);
    });

    // Entrar em uma sala existente
    socket.on('joinRoom', ({ roomId, userName }) => {
        const room = rooms[roomId];
        if (room) {
            room.users[socket.id] = userName;
            socket.join(roomId);

            // Atualiza os usuários da sala
            io.to(roomId).emit('updateUsers', {
                users: Object.entries(room.users).map(([id, name]) => ({
                    id,
                    name,
                    hasVoted: room.votes[id] !== undefined
                }))
            });

            // Envia a sequência de cartas para o novo participante
            socket.emit('setSequence', { sequence: room.sequence });
        }
    });

    // Usuário seleciona uma carta
    socket.on('vote', ({ roomId, vote }) => {
        const room = rooms[roomId];
        if (room) {
            room.votes[socket.id] = vote;

            io.to(roomId).emit('updateUsers', {
                users: Object.entries(room.users).map(([id, name]) => ({
                    id,
                    name,
                    hasVoted: room.votes[id] !== undefined
                }))
            });

            if (Object.keys(room.votes).length === Object.keys(room.users).length) {
                io.to(roomId).emit('allVoted');
            }
        }
    });

    // Revelar os votos
    socket.on('revealVotes', (roomId) => {
        const room = rooms[roomId];
        if (room) {
            const votes = Object.entries(room.votes).map(([socketId, vote]) => ({
                user: room.users[socketId],
                vote
            }));

            const avg = calculateAverage(Object.values(room.votes));
            io.to(roomId).emit('votesRevealed', { votes, average: avg });
        }
    });

    // Resetar votos
    socket.on('resetVotes', (roomId) => {
        const room = rooms[roomId];
        if (room) {
            room.votes = {};
            io.to(roomId).emit('votesReset');

            io.to(roomId).emit('updateUsers', {
                users: Object.entries(room.users).map(([id, name]) => ({
                    id,
                    name,
                    hasVoted: false
                }))
            });
        }
    });

    // Verifica se a sala existe
    socket.on('checkRoomExists', (roomId, callback) => {
        callback({ exists: !!rooms[roomId] });
    });

    // Quando alguém desconecta
    socket.on('disconnect', () => {
        console.log(`Usuário desconectado: ${socket.id}`);
        for (const roomId in rooms) {
            const room = rooms[roomId];
            if (room.users[socket.id]) {
                delete room.users[socket.id];
                delete room.votes[socket.id];

                io.to(roomId).emit('updateUsers', {
                    users: Object.entries(room.users).map(([id, name]) => ({
                        id,
                        name,
                        hasVoted: room.votes[id] !== undefined
                    }))
                });

                break;
            }
        }
    });
});

// Gera ID único para a sala
function generateRoomId() {
    return Math.random().toString(36).substring(2, 8);
}

// Calcula a média dos votos numéricos
function calculateAverage(votes) {
    const numericVotes = votes
        .map(v => parseFloat(v))
        .filter(v => !isNaN(v));
    if (numericVotes.length === 0) return '?';
    const sum = numericVotes.reduce((a, b) => a + b, 0);
    return (sum / numericVotes.length).toFixed(2);
}

// Inicia o servidor
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
    console.log(`vBeta 0.7.0`);
});
