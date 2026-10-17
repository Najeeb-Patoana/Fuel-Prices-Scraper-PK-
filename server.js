const express = require('express');
const path = require('path');
const {
    fetchWithRetry,
    mergeFuelPrices,
    loadHistory,
    saveHistory,
    getPrevPrice,
    OFFICIAL_FUELS
} = require('./tracker');

const app = express();
const PORT = process.env.PORT || 3000;

app.disable('x-powered-by');

let cache = null;
let cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000;

const requestCounts = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000;
const MAX_REQUESTS_PER_MIN = 120;

const refreshLimits = new Map();
const REFRESH_COOLDOWN = 15 * 1000;

setInterval(() => {
    const now = Date.now();
    for (const [ip, rec] of requestCounts.entries()) {
        if (now - rec.start > RATE_LIMIT_WINDOW) requestCounts.delete(ip);
    }
    for (const [ip, time] of refreshLimits.entries()) {
        if (now - time > REFRESH_COOLDOWN) refreshLimits.delete(ip);
    }
}, 5 * 60 * 1000).unref();

app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-XSS-Protection', '1; mode=block');

    const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
    const now = Date.now();
    let record = requestCounts.get(ip);
    if (!record || now - record.start > RATE_LIMIT_WINDOW) {
        record = { start: now, count: 1 };
        requestCounts.set(ip, record);
    } else {
        record.count++;
    }

    if (record.count > MAX_REQUESTS_PER_MIN) {
        res.setHeader('Retry-After', '60');
        return res.status(429).send('Too Many Requests. Please slow down.');
    }

    next();
});

async function getPrices() {
    const now = Date.now();
    if (cache && now - cacheTime < CACHE_TTL) return cache;

    let rawPrices = [];
    let isFallback = false;
    let warning = null;

    try {
        const data = await fetchWithRetry();
        rawPrices = data.prices || [];
    } catch (err) {
        isFallback = true;
        warning = 'Upstream API temporarily unreachable. Showing verified OGRA rates from archive.';
    }

    const fuels = mergeFuelPrices(rawPrices);
    const history = saveHistory(fuels);

    const enriched = fuels.map(item => {
        const prev = getPrevPrice(history, item.slug);
        const diff = prev !== null ? +(item.price_pkr - prev).toFixed(2) : null;
        return { ...item, prev_pkr: prev, diff };
    });

    cache = { fuels: enriched, history, fetchedAt: new Date(), isFallback, warning };
    cacheTime = now;
    return cache;
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h' }));

app.get('/favicon.ico', (req, res) => res.sendFile(path.join(__dirname, 'public', 'favicon.svg')));

app.get('/robots.txt', (req, res) => {
    res.type('text/plain').send('User-agent: *\nDisallow: /refresh\nDisallow: /health\nAllow: /\n');
});

app.get('/', async (req, res) => {
    try {
        const data = await getPrices();
        res.render('index', {
            fuels: data.fuels,
            history: data.history,
            fetchedAt: data.fetchedAt,
            cacheTTL: CACHE_TTL / 1000,
            isFallback: data.isFallback,
            warning: data.warning,
            currentPath: '/'
        });
    } catch (err) {
        const fuels = mergeFuelPrices([]);
        const history = loadHistory();
        res.render('index', {
            fuels: fuels,
            history: history,
            fetchedAt: new Date(),
            cacheTTL: CACHE_TTL / 1000,
            isFallback: true,
            warning: 'Could not connect to live API. Showing local verified OGRA rates.',
            currentPath: '/'
        });
    }
});

app.get(['/terms', '/disclaimer', '/terms-and-conditions'], (req, res) => {
    res.render('terms', {
        currentPath: '/terms',
        pageTitle: 'Terms & Conditions — Pakistan Fuel Price Monitor'
    });
});

app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'ok',
        uptime: Math.floor(process.uptime()),
        timestamp: new Date().toISOString()
    });
});

app.get('/healthz', (req, res) => {
    res.status(200).json({
        status: 'ok',
        uptime: Math.floor(process.uptime()),
        timestamp: new Date().toISOString()
    });
});

app.get('/refresh', (req, res) => {
    const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
    const now = Date.now();
    const lastRefresh = refreshLimits.get(ip) || 0;

    if (now - lastRefresh < REFRESH_COOLDOWN) {
        return res.redirect('/');
    }

    refreshLimits.set(ip, now);
    cache = null;
    cacheTime = 0;
    res.redirect('/');
});

app.use((req, res) => {
    res.status(404);
    const safePath = (req.originalUrl || '').slice(0, 100);
    if (req.accepts('html')) {
        res.render('404', {
            path: safePath,
            currentPath: safePath,
            pageTitle: '404 - Page Not Found — Pakistan Fuel Price Monitor'
        });
        return;
    }
    if (req.accepts('json')) {
        res.json({ ok: false, error: 'Resource not found', status: 404, path: safePath });
        return;
    }
    res.type('txt').send('404 Not Found');
});

app.use((err, req, res, next) => {
    console.error('Server internal error:', err);
    res.status(500);
    const safePath = (req.originalUrl || '').slice(0, 100);
    if (req.accepts('html')) {
        res.render('404', {
            path: safePath,
            currentPath: safePath,
            pageTitle: '500 - Server Error — Pakistan Fuel Price Monitor',
            customCode: '500',
            customTitle: 'Internal Server Error',
            customMessage: 'An unexpected server error occurred while processing your request. Please try again shortly.'
        });
        return;
    }
    res.json({ ok: false, error: 'Internal Server Error', status: 500 });
});

const server = app.listen(PORT, () => {
    console.log(`\n  Fuel Tracker running at http://localhost:${PORT}\n`);
});

process.on('SIGTERM', () => server.close());
process.on('SIGINT', () => server.close());
