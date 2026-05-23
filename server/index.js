import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import compression from 'compression';
import connectDB from './config/db.js';
import projectRoutes from './routes/projectRoutes.js';
import fileRoutes from './routes/fileRoutes.js';
import executeRoutes from './routes/executeRoutes.js';
import packageRoutes from './routes/packageRoutes.js';
import terminalRoutes from './routes/terminalRoutes.js';
import previewRoutes from './routes/previewRoutes.js';
import { errorHandler } from './middleware/errorHandler.js';

const app = express();
const PORT = process.env.PORT || 5000;

// middleware
app.use(compression()); // gzip compression for responses
app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json({ limit: '5mb' }));

// routes
app.use('/api/projects', projectRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/execute', executeRoutes);
app.use('/api/packages', packageRoutes);
app.use('/api/terminal', terminalRoutes);
app.use('/api/preview', previewRoutes);

// health check
app.get('/', (_req, res) => {
  res.json({ message: 'Sandbox API running' });
});

// error handler (must be last)
app.use(errorHandler);

// start
connectDB().then(() => {
  const server = app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use. Stop the existing server or set PORT to another value.`);
      process.exit(1);
    }

    console.error(err);
    process.exit(1);
  });
});
