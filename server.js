import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import apiRoutes from './routes/api.js';
import { connectDB, seedDB } from './db.js';
import { createServer } from 'http';
import { Server as IOServer } from 'socket.io';

const app = express();
const PORT = process.env.PORT || 4000;

// ✅ Allow frontend devices (update origin if needed)
app.use(cors({
  origin: "*", // or "http://192.168.1.57:3000" for your frontend
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.use('/api', apiRoutes);

app.get('/', (req, res) => {
  res.send({ status: '24 Car Rental backend', version: '0.1.0' });
});

async function start() {
  try {
    await connectDB();
    await seedDB();

    // Create HTTP server and attach socket.io
    const httpServer = createServer(app);
    const io = new IOServer(httpServer, {
      cors: { origin: '*' }
    });

    // Attach io to app so route handlers can emit events
    app.locals.io = io;

    io.on('connection', (socket) => {
      console.log('Socket connected:', socket.id);

      socket.on('joinDashboard', () => {
        socket.join('dashboard');
        console.log('Socket joined dashboard:', socket.id);
      });

      socket.on('leaveDashboard', () => {
        socket.leave('dashboard');
      });

      socket.on('disconnect', (reason) => {
        console.log('Socket disconnected:', socket.id, reason);
      });
    });

    // ✅ Important: listen on all interfaces
    httpServer.listen(PORT, "0.0.0.0", () => {
      console.log(`✅ 24 Car Rental backend listening on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
