const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

// Inicializa o app Express
const app = express();

// Permite acesso CORS de qualquer origem
app.use(cors());

// Cria o servidor HTTP
const server = http.createServer(app);

// Cria o servidor WebSocket (Socket.IO)
const io = new Server(server, {
    cors: {
        origin: '*', // Aceita conexão de qualquer domínio
        methods: ['GET', 'POST']
    }
});

// Estrutura para armazenar as salas e seus dados
const rooms = {};

// Lida com conexões Socket.IO
io.on('connection', (socket) => {
    console.log(`Usuário conectado: ${socket.id}`);

    // Criar uma nova sala
    socket.on('createRoom', (roomName) => {
        const roomId = generateRoomId();
        rooms[roomId] = {
            name: roomName,
            users: {},
            votes: {},
            votingStarted: false,
            revealed: false
        };
        socket.join(roomId);
        socket.emit('roomCreated', { roomId });
        console.log(`Sala criada: ${roomName} (${roomId})`);
    });

    // Entrar em uma sala existente
    socket.on('joinRoom', ({ roomId, userName }) => {
        const room = rooms[roomId];
        if (room) {
            room.users[socket.id] = userName;
            socket.join(roomId);

            // Atualiza todos da sala sobre os usuários
            io.to(roomId).emit('updateUsers', {
                users: Object.values(room.users)
            });
        }
    });

    // Usuário seleciona uma carta
    socket.on('vote', ({ roomId, vote }) => {
        const room = rooms[roomId];
        if (room) {
            room.votes[socket.id] = vote;

            // Verifica se todos os usuários já votaram
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

    // Quando alguém desconecta
    socket.on('disconnect', () => {
        console.log(`Usuário desconectado: ${socket.id}`);
        for (const roomId in rooms) {
            const room = rooms[roomId];

            if (room.users[socket.id]) {
                delete room.users[socket.id];
                delete room.votes[socket.id];

                // Atualiza a lista de usuários para a sala
                io.to(roomId).emit('updateUsers', {
                    users: Object.values(room.users)
                });

                break;
            }
        }
    });
});

// Função para gerar IDs únicos para as salas
function generateRoomId() {
    return Math.random().toString(36).substring(2, 8);
}

// Função para calcular a média dos votos
function calculateAverage(votes) {
    if (!votes.length) return 0;
    const sum = votes.reduce((a, b) => a + b, 0);
    return (sum / votes.length).toFixed(2);
}

// Inicia o servidor
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
