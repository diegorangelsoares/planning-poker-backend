const rooms = require('../rooms');
const {
    generateRoomId,
    getDateNow,
    formatUsers,
    formatVotes,
    calculateAverage
} = require('../utils');

function socketHandlers(io, socket) {
    socket.on('createRoom', ({ roomName, sequence }) => {
        const roomId = generateRoomId();
        rooms[roomId] = {
            name: roomName,
            sequence,
            users: {},
            votes: {},
            revealed: false,
            average: '?',
            historias: [],
            activeStoryId: null,
            createdAt: Date.now()
        };
        socket.join(roomId);
        socket.emit('roomCreated', { roomId });
        console.log(`Sala criada por: ${roomName} Id da sala: ${roomId} - ${getDateNow()}`);
    });

    socket.on('addStory', ({ roomId, storyName }) => {
        const room = rooms[roomId];
        if (room) {
            const storyId = Math.random().toString(36).substr(2, 6);
            const story = {
                id: storyId,
                name: storyName,
                createdAt: Date.now(),
                revealed: false,
                average: '?'
            };
            room.historias.push(story);
            room.activeStoryId = storyId;
            room.votes = {};
            room.revealed = false;
            room.average = '?';
            io.to(roomId).emit('storyAdded', {
                stories: room.historias,
                activeStoryId: room.activeStoryId
            });
        }
    });

    socket.on('deleteStory', ({ roomId, storyId }) => {
        const room = rooms[roomId];
        if (room) {
            room.historias = room.historias.filter(h => h.id !== storyId);
            if (room.activeStoryId === storyId) {
                room.activeStoryId = null;
                room.votes = {};
                room.revealed = false;
                room.average = '?';
                io.to(roomId).emit('votesReset');
            }
            io.to(roomId).emit('storyAdded', {
                stories: room.historias,
                activeStoryId: room.activeStoryId
            });
        }
    });

    socket.on('getAllRooms', (callback) => {
        const roomList = Object.entries(rooms).map(([roomId, room]) => ({
            roomId,
            roomName: room.name,
            users: room.users,
            sequence: room.sequence,
            revealed: room.revealed,
            average: room.average,
            historias: room.historias || []
        }));
        callback(roomList);
    });

    socket.on('getRoomData', (roomId) => {
        const room = rooms[roomId];
        if (room) {
            socket.emit('roomData', {
                roomName: room.name,
                cardOptions: room.sequence,
                users: formatUsers(room),
                votes: formatVotes(room),
                votingOpen: !room.revealed,
                stories: room.historias || [],
                activeStoryId: room.activeStoryId || null
            });
        }
    });

    socket.on('checkRoomExists', (roomId, callback) => {
        callback({ exists: !!rooms[roomId] });
    });

    socket.on('joinRoom', ({ roomId, userName }, callback) => {
        const room = rooms[roomId];
        if (room) {
            const existingId = Object.keys(room.users).find(id => room.users[id] === userName);
            if (existingId) delete room.users[existingId];
            room.users[socket.id] = userName;
            socket.join(roomId);
            io.to(roomId).emit('updateUsers', { users: formatUsers(room) });

            socket.emit('roomData', {
                roomName: room.name,
                cardOptions: room.sequence,
                users: formatUsers(room),
                votes: formatVotes(room),
                votingOpen: !room.revealed,
                stories: room.historias || [],
                activeStoryId: room.activeStoryId || null
            });

            callback && callback();
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

    socket.on('setActiveStory', ({ roomId, storyId }) => {
        const room = rooms[roomId];
        if (room) {
            const story = room.historias.find(h => h.id === storyId);
            if (story) {
                room.activeStoryId = storyId;
                room.votes = {};
                room.revealed = false;
                room.average = '?';
                io.to(roomId).emit('votesReset');
                io.to(roomId).emit('storyAdded', {
                    stories: room.historias,
                    activeStoryId: room.activeStoryId
                });
                io.to(roomId).emit('updateUsers', { users: formatUsers(room) });
            }
        }
    });

    socket.on('revealVotes', (roomId) => {
        const room = rooms[roomId];
        if (room) {
            room.revealed = true;
            room.average = calculateAverage(Object.values(room.votes));
            const activeStory = room.historias.find(h => h.id === room.activeStoryId);
            if (activeStory) {
                activeStory.revealed = true;
                activeStory.average = room.average;
            }
            io.to(roomId).emit('votesRevealed', {
                votes: formatVotes(room),
                average: room.average
            });
            io.to(roomId).emit('storyAdded', {
                stories: room.historias,
                activeStoryId: room.activeStoryId
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
                io.to(roomId).emit('updateUsers', { users: formatUsers(room) });
                break;
            }
        }
    });
}

module.exports = socketHandlers;