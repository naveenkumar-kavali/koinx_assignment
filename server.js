const mongoose = require('mongoose');
const app = require('./app');
const config = require('./config/config');

// Connect to MongoDB
mongoose.connect(config.mongodbUri)
  .then(() => {
    console.log('Successfully connected to MongoDB at:', config.mongodbUri);
    
    // Start Express Server
    const server = app.listen(config.port, () => {
      console.log(`Reconciliation Engine Server is running on port ${config.port}`);
    });

    // Graceful Shutdown
    const gracefulShutdown = () => {
      console.log('Shutting down server gracefully...');
      server.close(() => {
        console.log('HTTP server closed.');
        mongoose.connection.close(false)
          .then(() => {
            console.log('MongoDB connection closed.');
            process.exit(0);
          })
          .catch((err) => {
            console.error('Error closing MongoDB connection:', err);
            process.exit(1);
          });
      });
    };

  
    process.on('SIGINT', gracefulShutdown);
  })
  .catch((err) => {
    console.error('Failed to connect to MongoDB:', err);
    process.exit(1);
  });
