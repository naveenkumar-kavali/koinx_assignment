const express = require('express');
const apiRoutes = require('./routes/api');

const app = express();


app.use(express.json());


app.use('/', apiRoutes);


app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message
  });
});

module.exports = app;
