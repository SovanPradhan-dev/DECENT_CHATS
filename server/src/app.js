import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import api from './routes/api.js';
import { sameOrigin } from './middleware/csrf.js';
import { rateLimit } from 'express-rate-limit';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.set('trust proxy', 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' }, contentSecurityPolicy: { directives: { ...helmet.contentSecurityPolicy.getDefaultDirectives(), 'img-src': ["'self'", 'data:', 'blob:'], 'connect-src': ["'self'", 'ws:', 'wss:'] } } }));
app.use(express.json({ limit: '32kb' }));
app.use(cookieParser());
app.use(sameOrigin);
app.use('/api', rateLimit({ windowMs: 60_000, limit: 180, standardHeaders: 'draft-7', legacyHeaders: false }));
app.use('/api', api);
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

const distPath = path.resolve(__dirname, '../../client/dist');
app.use(express.static(distPath));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(distPath, 'index.html'), (error) => { if (error) next(); });
});
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err.name === 'ZodError') return res.status(400).json({ error: err.issues[0]?.message || 'Invalid request.' });
  if (err.code === 11000) return res.status(409).json({ error: 'That username or email is already in use.' });
  if (err.name === 'MulterError') return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Files must be 10 MB or smaller.' : 'Upload failed.' });
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Something went wrong. Please try again.' : err.message });
});
export default app;
