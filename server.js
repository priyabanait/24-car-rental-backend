import express from 'express';
import cors from 'cors';
import apiRoutes from './routes/api.js';
import { connectDB, seedDB } from './db.js';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.use('/api', apiRoutes);

app.get('/', (req, res) => {
  res.send({ status: 'udriver backend', version: '0.1.0' });
});

async function start() {
  try {
    await connectDB();
    await seedDB();
    app.listen(PORT, () => {
      console.log(`udriver backend listening on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
