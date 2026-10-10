import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import analyzeRouter from './routes/analyze.js';
import { rateLimit } from './middleware/rateLimit.js';

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
// Step 97: a message is at most 2000 characters, so anything near 10 kB is not legitimate. Bigger bodies get HTTP 413.
app.use(express.json({ limit: '10kb' }));

// Request logger: prints method, path and status once the response finishes.
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms`);
  });
  next();
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: '0.1.0' });
});

// Step 97: per-IP rate limit on the analysis endpoint only (the popup polls /api/health, which stays unthrottled).
// 60 requests per minute per IP by default; override with RATE_LIMIT_MAX and RATE_LIMIT_WINDOW_MS.
app.use('/api/analyze', rateLimit(), analyzeRouter);

// 404 handler: always JSON, never an HTML page.
app.use((req, res) => {
  res.status(404).json({ error: 'Not found', path: req.originalUrl });
});

// Error handler: malformed JSON bodies and unexpected errors return JSON, not a stack trace.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  console.error(`Error: ${err.message}`);
  res.status(status).json({ error: status === 500 ? 'Internal server error' : err.message });
});

// Express 5 passes listen errors (for example EADDRINUSE) to this callback, so check for them.
app.listen(PORT, (err) => {
  if (err) {
    console.error(`Failed to start on port ${PORT}: ${err.message}`);
    process.exit(1);
  }
  console.log(`ScamGuard server listening on ${PORT} (http://localhost:${PORT})`);
});
