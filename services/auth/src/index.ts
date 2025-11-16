import express from 'express';
import cors from 'cors';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import Redis from 'ioredis';
import mysql from 'mysql2/promise';
import pino from 'pino';

const app = express();
app.use(cors({ origin: 'http://localhost:3000' }));
app.use(express.json());
const logger = pino();

const redis = new Redis({ host: 'redis', port: 6379 });
const pool = mysql.createPool({
  host: 'mysql',
  database: 'techtest',
  user: 'root',
  password: ''
});

const JWT_SECRET = 'ini_kunci_rahasia_sangat_panjang_dan_acak_123456789_untuk_produksi';

app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  try {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.execute('SELECT * FROM employees WHERE email = ?', [email]);
      const user = (rows as any[])[0];
      if (!user) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const match = await bcrypt.compare(password, user.password);
      if (!match) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '1h' });
      res.json({ token });
    } finally {
      conn.release();
    }
  } catch (err) {
    logger.error('Login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/auth/logout', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(400).json({ error: 'No token' });

  try {
    const decoded: any = jwt.decode(token);
    if (decoded && decoded.exp) {
      await redis.set(`blacklist:${token}`, '1', 'EX', decoded.exp - Math.floor(Date.now() / 1000));
    }
    res.json({ message: 'Logged out' });
  } catch (err) {
    logger.error('Logout error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/health', async (req, res) => {
  try {
    await pool.execute('SELECT 1');
    const ping = await redis.ping();
    res.json({
      status: 'healthy',
      mysql: true,
      redis: ping === 'PONG',
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    logger.error('Health check failed:', err);
    res.status(500).json({ status: 'unhealthy' });
  }
});

const PORT = 4001;
app.listen(PORT, () => {
  logger.info(`Auth API running on :${PORT}`);
  logger.info(`Health: http://localhost:${PORT}/health`);
});