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

// === AUTH MIDDLEWARE ===
const authenticate = async (req: any, res: any, next: any) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  const token = authHeader.split(' ')[1];
  try {
    jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// === BACKGROUND CONSUMER ===
function startConsumer() {
  (async () => {
    let lastId = '0';
    logger.info('Report consumer started. Listening to attendance.events...');

    while (true) {
      try {
        const result = await redis.xread('BLOCK', '5000', 'STREAMS', 'attendance.events', lastId);
        if (!result) continue;

        for (const [, messages] of result) {
          for (const [id, fields] of messages) {
            const event: any = {};
            for (let i = 0; i < fields.length; i += 2) {
              event[fields[i]] = fields[i + 1];
            }

            const date = event.time.split(' ')[0];
            const time = event.time.split(' ')[1];
            let status = 'present';

            if (event.action === 'checkin' && event.late === '1') status = 'late';
            if (event.action === 'checkout' && event.early === '1') status = 'early_leave';

            const conn = await pool.getConnection();
            try {
              await conn.beginTransaction();

              if (event.action === 'checkin') {
                await conn.execute(
                  `INSERT INTO daily_summary (employee_id, date, checkin_time, status) 
                   VALUES (?, ?, ?, ?) 
                   ON DUPLICATE KEY UPDATE 
                   checkin_time = VALUES(checkin_time), status = VALUES(status)`,
                  [event.employeeId, date, time, status]
                );
              }

              if (event.action === 'checkout') {
                const [rows] = await conn.execute(
                  'SELECT checkin_time FROM daily_summary WHERE employee_id = ? AND date = ?',
                  [event.employeeId, date]
                );
                const row = (rows as any[])[0];

                if (!row || !row.checkin_time) {
                  status = 'absent';
                }

                await conn.execute(
                  `INSERT INTO daily_summary (employee_id, date, checkout_time, status) 
                   VALUES (?, ?, ?, ?) 
                   ON DUPLICATE KEY UPDATE 
                   checkout_time = VALUES(checkout_time), status = VALUES(status)`,
                  [event.employeeId, date, time, status]
                );
              }

              await conn.commit();
              logger.info(`Updated summary for employee ${event.employeeId} on ${date}: ${status}`);
            } catch (err) {
              await conn.rollback();
              logger.error('DB Error:', err);
            } finally {
              conn.release();
            }

            lastId = id;
            await redis.xdel('attendance.events', id);
          }
        }
      } catch (err) {
        logger.error('Redis Error:', err);
        await new Promise(r => setTimeout(r, 1000));
      }
    }
  })().catch(err => {
    logger.error('Consumer crashed:', err);
    process.exit(1);
  });
}

// === API ENDPOINTS ===
app.get('/report/daily', authenticate, async (req, res) => {
  const { date } = req.query;
  if (!date || typeof date !== 'string') return res.status(400).json({ error: 'date required' });

  const [rows] = await pool.execute(
    'SELECT * FROM daily_summary WHERE date = ? ORDER BY employee_id',
    [date]
  );
  res.json(rows);
});

app.get('/report/export', authenticate, async (req, res) => {
  const { date } = req.query;
  if (!date || typeof date !== 'string') return res.status(400).json({ error: 'date required' });

  const [rows] = await pool.execute(
    'SELECT * FROM daily_summary WHERE date = ? ORDER BY employee_id',
    [date]
  );

  const headers = 'employee_id,date,checkin_time,checkout_time,status\n';
  const csv = headers + (rows as any[])
    .map(r => `${r.employee_id},${r.date},${r.checkin_time || ''},${r.checkout_time || ''},${r.status}`)
    .join('\n');

  res.header('Content-Type', 'text/csv');
  res.attachment(`report-${date}.csv`);
  res.send(csv);
});

// === SWAGGER + HEALTH ===
const swaggerPath = path.join(__dirname, '../swagger.json');
let swaggerDoc: any = {};
try { swaggerDoc = JSON.parse(fs.readFileSync(swaggerPath, 'utf-8')); } catch (err) {}
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDoc));

app.get('/health', async (req, res) => {
  try {
    await pool.execute('SELECT 1');
    const ping = await redis.ping();
    res.json({ status: 'healthy', redis: ping === 'PONG' });
  } catch (err) {
    res.status(500).json({ status: 'unhealthy' });
  }
});

// === START SERVER + CONSUMER ===
const PORT = 4003;
app.listen(PORT, () => {
  logger.info(`Report API running on :${PORT}`);
});
startConsumer();