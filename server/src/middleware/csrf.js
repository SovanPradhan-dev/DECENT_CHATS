export function sameOrigin(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  if (!origin) return next();
  try {
    const originUrl = new URL(origin);
    const forwardedHost = req.get('x-forwarded-host')?.split(',')[0].trim();
    const allowed = [req.get('host'), forwardedHost, process.env.CLIENT_ORIGIN && new URL(process.env.CLIENT_ORIGIN).host].filter(Boolean);
    const sameHost = allowed.some(host => host.toLowerCase() === originUrl.host.toLowerCase());
    const sameScheme = originUrl.protocol === `${req.protocol}:` || (process.env.CLIENT_ORIGIN && origin === new URL(process.env.CLIENT_ORIGIN).origin);
    if (!sameHost || !sameScheme) return res.status(403).json({ error: 'Cross-origin request rejected.' });
  } catch {
    return res.status(403).json({ error: 'Invalid request origin.' });
  }
  next();
}
