const { server } = require('./server');

const PORT = process.env.PORT || 4000;

server.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
    console.log(`v 0.14.0`);
});