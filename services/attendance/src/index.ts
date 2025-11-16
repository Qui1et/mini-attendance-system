import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import Redis from 'ioredis';
import mysql from 'mysql2/promise';
import pino from 'pino';
import swaggerUi from 'swagger-ui-express';
import * as fs from 'fs';
import * as path from 'path';

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

// === AUTHENTICATION MIDDLEWARE ===
const authenticate = async (req: any, res: any, next: any) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];
  const blacklisted = await redis.get(`blacklist:${token}`);
  if (blacklisted) {
    return res.status(401).json({ error: 'Token revoked' });
  }

  try {
    jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
};

// === CHECK-IN ===
app.post('/attendance/checkin', authenticate, async (req, res) => {
  const { employeeId } = req.body;
  if (!employeeId || typeof employeeId !== 'number') {
    return res.status(400).json({ error: 'employeeId (number) required' });
  }

  const now = new Date();
  const timeStr = now.toISOString().slice(0, 19).replace('T', ' ');
  const hour = now.getHours();

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [active] = await conn.execute(
      'SELECT id FROM attendance WHERE employee_id = ? AND checkout_time IS NULL',
      [employeeId]
    );
    if (Array.isArray(active) && active.length > 0) {
      return res.status(400).json({ error: 'Already checked in. Please check out first.' });
    }

    await conn.execute(
      'INSERT INTO attendance (employee_id, checkin_time) VALUES (?, ?)',
      [employeeId, timeStr]
    );

    const isLate = hour >= 9 ? '1' : '0';
    await redis.xadd('attendance.events', '*',
      'action', 'checkin',
      'employeeId', employeeId.toString(),
      'time', timeStr,
      'late', isLate
    );

    await conn.commit();
    res.json({ message: 'Check-in recorded', time: timeStr, late: isLate === '1' });
  } catch (err: any) {
    await conn.rollback();
    logger.error('Check-in error:', err);
    res.status(500).json({ error: err.message || 'Server error' });
  } finally {
    conn.release();
  }
});

// === CHECK-OUT ===
app.post('/attendance/checkout', authenticate, async (req, res) => {
  const { employeeId } = req.body;
  if (!employeeId || typeof employeeId !== 'number') {
    return res.status(400).json({ error: 'employeeId (number) required' });
  }

  const now = new Date();
  const timeStr = now.toISOString().slice(0, 19).replace('T', ' ');
  const hour = now.getHours();

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [active] = await conn.execute(
      'SELECT id, checkin_time FROM attendance WHERE employee_id = ? AND checkout_time IS NULL ORDER BY checkin_time DESC LIMIT 1',
      [employeeId]
    );

    if (!Array.isArray(active) || active.length === 0) {
      return res.status(400).json({ error: 'No active check-in found' });
    }

    const checkinTime = (active[0] as any).checkin_time;
    if (!checkinTime) {
      return res.status(400).json({ error: 'Invalid check-in record' });
    }

    await conn.execute(
      'UPDATE attendance SET checkout_time = ? WHERE id = ?',
      [timeStr, (active[0] as any).id]
    );

    const isEarly = hour < 17 ? '1' : '0';
    await redis.xadd('attendance.events', '*',
      'action', 'checkout',
      'employeeId', employeeId.toString(),
      'time', timeStr,
      'early', isEarly
    );

    await conn.commit();
    res.json({ message: 'Check-out recorded', time: timeStr, early: isEarly === '1' });
  } catch (err: any) {
    await conn.rollback();
    logger.error('Check-out error:', err);
    res.status(500).json({ error: err.message || 'Server error' });
  } finally {
    conn.release();
  }
});

// === DAILY REPORT (FILTER BY DATE) ===
app.get('/report/daily', authenticate, async (req, res) => {
  const { date } = req.query;
  if (!date || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'date parameter required (YYYY-MM-DD)' });
  }

  const [rows] = await pool.execute(
    `SELECT 
       employee_id, 
       date, 
       checkin_time, 
       checkout_time, 
       status 
     FROM daily_summary 
     WHERE date = ? 
     ORDER BY employee_id`,
    [date]
  );
  res.json(rows);
});

// === EXPORT CSV ===
app.get('/report/export', authenticate, async (req, res) => {
  const { date } = req.query;
  if (!date || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'date parameter required (YYYY-MM-DD)' });
  }

  const [rows] = await pool.execute(
    `SELECT 
       employee_id, 
       date, 
       checkin_time, 
       checkout_time, 
       status 
     FROM daily_summary 
     WHERE date = ? 
     ORDER BY employee_id`,
    [date]
  );

  const headers = 'employee_id,date,checkin_time,checkout_time,status\n';
  const csv = headers + (rows as any[])
    .map(r => `${r.employee_id},${r.date},${r.checkin_time || ''},${r.checkout_time || ''},${r.status}`)
    .join('\n');

  res.header('Content-Type', 'text/csv');
  res.attachment(`attendance-report-${date}.csv`);
  res.send(csv);
});

// === SWAGGER ===
const swaggerPath = path.join(__dirname, '../swagger.json');
const swaggerDoc = JSON.parse(fs.readFileSync(swaggerPath, 'utf-8'));
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDoc));

// === HEALTH CHECK ===
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

// === START SERVER ===
const PORT = 4002;
app.listen(PORT, () => {
  logger.info(`Attendance API running on :${PORT}`);
  logger.info(`Swagger: http://localhost:${PORT}/api-docs`);
  logger.info(`Health: http://localhost:${PORT}/health`);
});