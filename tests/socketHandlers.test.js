const http = require('http');
const Client = require('socket.io-client');
const { Server } = require('socket.io');
const socketHandlers = require('../src/handlers/socketHandlers'); // CORRIGIDO
const rooms = require('../src/rooms');

let ioServer, httpServer, serverSocket;
let clientSocket;

beforeAll((done) => {
    httpServer = http.createServer();
    ioServer = new Server(httpServer);
    ioServer.on('connection', (socket) => {
        serverSocket = socket;
        socketHandlers(ioServer, socket);
    });

    httpServer.listen(() => {
        const port = httpServer.address().port;
        clientSocket = new Client(`http://localhost:${port}`);
        clientSocket.on('connect', done);
    });
});

afterAll(() => {
    ioServer.close();
    httpServer.close();
    clientSocket.close();
});

test('createRoom emits roomCreated with valid roomId', (done) => {
    clientSocket.emit('createRoom', { roomName: 'Sala 1', sequence: ['1', '2', '3'] });
    clientSocket.on('roomCreated', ({ roomId }) => {
        expect(typeof roomId).toBe('string');
        expect(roomId.length).toBe(6);
        expect(rooms[roomId]).toBeDefined();
        done();
    });
});

test('joinRoom allows user to join and receive roomData', (done) => {
    clientSocket.emit('createRoom', { roomName: 'Sala 2', sequence: ['1', '2'] });

    clientSocket.once('roomCreated', ({ roomId }) => {
        // Primeiro registramos o listener
        clientSocket.once('roomData', (data) => {
            expect(data.roomName).toBe('Sala 2');
            expect(data.users).toEqual([{ name: 'Diego', hasVoted: false }]);
            done();
        });

        // Depois emitimos joinRoom
        clientSocket.emit('joinRoom', { roomId, userName: 'Diego' });
    });
});

test('checkRoomExists returns true for existing room', (done) => {
    clientSocket.emit('createRoom', { roomName: 'Sala X', sequence: ['0'] });
    clientSocket.once('roomCreated', ({ roomId }) => {
        clientSocket.emit('checkRoomExists', roomId, (res) => {
            expect(res.exists).toBe(true);
            done();
        });
    });
});
