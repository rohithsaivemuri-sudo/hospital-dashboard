module.exports = function(io) {
  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    
    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });

    socket.on('join:dashboard', () => {
      socket.join('dashboard');
    });

    socket.on('join:emergency', () => {
      socket.join('emergency');
    });

    socket.on('join:beds', () => {
      socket.join('beds');
    });
  });
};
