function generateRoomId() {
    return Math.random().toString(36).substr(2, 6).toUpperCase();
}

function getDateNow() {
    const now = new Date(Date.now());
    const format = (n) => n.toString().padStart(2, '0');
    return `${format(now.getDate())}/${format(now.getMonth() + 1)}/${now.getFullYear()} ${format(now.getHours())}:${format(now.getMinutes())}:${format(now.getSeconds())}`;
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

function calculateAverage(votes) {
    const nums = votes.map(v => parseFloat(v)).filter(v => !isNaN(v));
    if (nums.length === 0) return '?';
    return (nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(2);
}

module.exports = {
    generateRoomId,
    getDateNow,
    formatUsers,
    formatVotes,
    calculateAverage
};