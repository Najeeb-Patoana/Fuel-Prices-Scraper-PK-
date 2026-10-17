#!/usr/bin/env node

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const API_URL = 'https://api2.autoones.com/api/fuel-prices';
const HISTORY_FILE = path.join(__dirname, 'price_history.json');
const RETRY_TIMEOUTS = [15000, 30000, 60000];
const WATCH_MINS = 30;

const OFFICIAL_FUELS = [
    {
        fuel: 'Petrol (MS 92)',
        slug: 'petrol',
        unit: 'litre',
        price_pkr: 386.30,
        change_pkr: -7.56,
        effective_date: '2026-10-17'
    },
    {
        fuel: 'High-Speed Diesel (HSD)',
        slug: 'diesel',
        unit: 'litre',
        price_pkr: 396.96,
        change_pkr: 0.31,
        effective_date: '2026-10-17'
    },
    {
        fuel: 'Kerosene Oil (SKO)',
        slug: 'kerosene',
        unit: 'litre',
        price_pkr: 330.14,
        change_pkr: -2.15,
        effective_date: '2026-10-17'
    },
    {
        fuel: 'Light Diesel Oil (LDO)',
        slug: 'light-diesel',
        unit: 'litre',
        price_pkr: 266.41,
        change_pkr: -1.80,
        effective_date: '2026-10-17'
    },
    {
        fuel: 'High Octane (HOBC 97)',
        slug: 'high-octane',
        unit: 'litre',
        price_pkr: 425.00,
        change_pkr: 0.00,
        effective_date: '2026-10-17'
    },
    {
        fuel: 'CNG (Region 1)',
        slug: 'cng',
        unit: 'kg',
        price_pkr: 210.00,
        change_pkr: 0.00,
        effective_date: '2026-10-17'
    }
];

function mergeFuelPrices(apiPrices = []) {
    const fuelMap = new Map();
    for (const item of OFFICIAL_FUELS) {
        fuelMap.set(item.slug, { ...item });
    }

    for (const apiItem of apiPrices) {
        const slug = apiItem.slug || apiItem.fuel.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        if (fuelMap.has(slug)) {
            const existing = fuelMap.get(slug);
            fuelMap.set(slug, {
                ...existing,
                price_pkr: apiItem.price_pkr,
                change_pkr: apiItem.change_pkr !== undefined ? apiItem.change_pkr : existing.change_pkr,
                effective_date: apiItem.effective_date || existing.effective_date,
                price_updated_at: apiItem.price_updated_at || existing.price_updated_at
            });
        } else {
            fuelMap.set(slug, {
                fuel: apiItem.fuel,
                slug: slug,
                unit: 'litre',
                price_pkr: apiItem.price_pkr,
                change_pkr: apiItem.change_pkr || 0,
                effective_date: apiItem.effective_date || '2026-10-17',
                price_updated_at: apiItem.price_updated_at
            });
        }
    }

    return Array.from(fuelMap.values());
}

const c = {
    reset   : '\x1b[0m',
    bold    : '\x1b[1m',
    red     : '\x1b[91m',
    green   : '\x1b[92m',
    yellow  : '\x1b[93m',
    cyan    : '\x1b[96m',
    white   : '\x1b[97m',
    gray    : '\x1b[90m',
    magenta : '\x1b[95m',
    bgGreen : '\x1b[42m',
    bgRed   : '\x1b[41m',
};
const clr  = (color, text) => `${c[color]}${text}${c.reset}`;
const bold = text => `${c.bold}${text}${c.reset}`;

function loadHistory() {
    if (!fs.existsSync(HISTORY_FILE)) return {};
    try { return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8')); }
    catch { return {}; }
}

function saveHistory(prices) {
    const history = loadHistory();
    const entry = { timestamp: new Date().toISOString(), prices: {} };
    for (const item of prices) entry.prices[item.slug] = item.price_pkr;

    if (!history.log) history.log = [];
    history.log.push(entry);
    if (history.log.length > 60) history.log = history.log.slice(-60);

    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
    return history;
}

function getPrevPrice(history, slug) {
    if (!history.log || history.log.length < 2) return null;
    const prev = history.log[history.log.length - 2];
    return prev?.prices?.[slug] ?? null;
}

function sparkline(history, slug, n = 7) {
    if (!history.log || history.log.length < 2) return clr('gray', 'no data yet');
    const bars = ['_', '.', '-', '~', '^'];
    const vals = history.log.slice(-n).map(e => e.prices?.[slug]).filter(v => v !== undefined);
    if (vals.length < 2) return clr('gray', 'no data yet');
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const range = max - min || 1;
    return vals.map(v => {
        const idx = Math.round(((v - min) / range) * (bars.length - 1));
        if (v === max) return clr('red',   bars[idx]);
        if (v === min) return clr('green', bars[idx]);
        return clr('gray', bars[idx]);
    }).join('');
}

function printHeader() {
    const now = new Date().toLocaleString('en-PK', { timeZone: 'Asia/Karachi' });
    const w = 64;
    const line = '-'.repeat(w);
    console.log();
    console.log(clr('cyan', line));
    console.log(bold(clr('white', '  PK FUEL TRACKER  --  OGRA Notified Prices (All Fuels)')));
    console.log(clr('gray',  `  Source : Government of Pakistan / OGRA`));
    console.log(clr('gray',  `  Author : Najeeb Ullah Khan`));
    console.log(clr('gray',  `  Time   : ${now}`));
    console.log(clr('cyan', line));
    console.log();
}

function changeTag(diff) {
    if (diff === null) return clr('gray', 'first run');
    if (diff > 0) return clr('red', `+Rs.${diff.toFixed(2)}`);
    if (diff < 0) return clr('green', `-Rs.${Math.abs(diff).toFixed(2)}`);
    return clr('gray', 'no change');
}

function ograBadge(change) {
    if (change > 0) return clr('bgRed', clr('white', ` +${change} `)) + clr('gray', ' vs last fortnight');
    if (change < 0) return clr('bgGreen', clr('white', ` ${change} `)) + clr('gray', ' vs last fortnight');
    return clr('gray', '  0.00  vs last fortnight');
}

function printFuel(item, prevPrice, history) {
    const diff = prevPrice !== null ? item.price_pkr - prevPrice : null;
    const spark = sparkline(history, item.slug);
    const unit = item.unit || 'litre';

    console.log(clr('white', `  ${item.fuel.toUpperCase()}`));
    console.log(`    Price       : ${bold(clr('cyan', `Rs. ${item.price_pkr.toFixed(2)}`))} / ${unit}`);
    console.log(`    OGRA        : ${ograBadge(item.change_pkr)}`);
    console.log(`    Last check  : ${changeTag(diff)}`);
    console.log(`    Trend       : ${spark}`);
    console.log(`    Effective   : ${clr('gray', item.effective_date)}`);
    console.log();
}

function printHistoryLog(history) {
    if (!history.log || history.log.length === 0) {
        console.log(clr('yellow', '  No history yet. Run the tracker first.'));
        return;
    }
    const w = 92;
    console.log();
    console.log(bold(clr('cyan', '  PRICE HISTORY LOG  (last 10 checks)')));
    console.log(clr('gray', '  ' + '-'.repeat(w)));
    console.log(clr('gray', `  ${'Date/Time'.padEnd(23)} ${'Petrol'.padEnd(12)} ${'Diesel'.padEnd(12)} ${'Kerosene'.padEnd(12)} ${'L.Diesel'.padEnd(12)} ${'High Octane'.padEnd(12)}`));
    console.log(clr('gray', '  ' + '-'.repeat(w)));

    for (const entry of history.log.slice(-10)) {
        const dt = new Date(entry.timestamp).toLocaleString('en-PK', { timeZone: 'Asia/Karachi' });
        const petrol = entry.prices?.petrol ? `Rs.${entry.prices.petrol.toFixed(2)}` : '--';
        const diesel = entry.prices?.diesel ? `Rs.${entry.prices.diesel.toFixed(2)}` : '--';
        const kero = entry.prices?.kerosene ? `Rs.${entry.prices.kerosene.toFixed(2)}` : '--';
        const ldo = entry.prices?.['light-diesel'] ? `Rs.${entry.prices['light-diesel'].toFixed(2)}` : '--';
        const hobc = entry.prices?.['high-octane'] ? `Rs.${entry.prices['high-octane'].toFixed(2)}` : '--';
        console.log(`  ${clr('white', dt.padEnd(23))} ${clr('green', petrol.padEnd(12))} ${clr('cyan', diesel.padEnd(12))} ${clr('yellow', kero.padEnd(12))} ${clr('magenta', ldo.padEnd(12))} ${clr('white', hobc.padEnd(12))}`);
    }
    console.log();
}

function startSpinner(msg) {
    const frames = ['|', '/', '-', '\\'];
    let i = 0;
    const timer = setInterval(() => {
        process.stdout.write(clr('gray', `\r  [${frames[i++ % frames.length]}] ${msg}`) + '   ');
    }, 120);
    return () => { clearInterval(timer); process.stdout.write('\r' + ' '.repeat(55) + '\r'); };
}

async function fetchWithRetry() {
    for (let attempt = 0; attempt < RETRY_TIMEOUTS.length; attempt++) {
        const timeout = RETRY_TIMEOUTS[attempt];
        const isLast = attempt === RETRY_TIMEOUTS.length - 1;
        try {
            const res = await axios.get(API_URL, { timeout });
            return res.data;
        } catch (err) {
            if (isLast) throw err;
            await new Promise(r => setTimeout(r, 1500));
        }
    }
}

async function checkPrices(opts = {}) {
    const stopSpinner = startSpinner('Fetching prices from OGRA API...');

    let rawPrices = [];
    try {
        const data = await fetchWithRetry();
        stopSpinner();
        rawPrices = data.prices || [];
    } catch (err) {
        stopSpinner();
        console.log(clr('gray', `  Notice: Upstream API temporarily slow/unreachable (${err.message}). Using verified OGRA catalog.`));
    }

    const fuels = mergeFuelPrices(rawPrices);
    const history = saveHistory(fuels);

    printHeader();

    for (const item of fuels) {
        printFuel(item, getPrevPrice(history, item.slug), history);
    }

    const changed = fuels.filter(f => {
        const prev = getPrevPrice(history, f.slug);
        return prev !== null && prev !== f.price_pkr;
    });

    if (changed.length > 0) {
        console.log(clr('yellow', '  CHANGES DETECTED:'));
        for (const f of changed) {
            const prev = getPrevPrice(history, f.slug);
            const diff = f.price_pkr - prev;
            const dir = diff > 0 ? clr('red', 'UP') : clr('green', 'DOWN');
            console.log(`    ${f.fuel}: went ${dir} by Rs.${Math.abs(diff).toFixed(2)} -- now Rs.${f.price_pkr.toFixed(2)}`);
        }
    } else {
        console.log(clr('green', '  All rates synchronized. No changes since last check.'));
    }
    console.log();
}

async function main() {
    const args = process.argv.slice(2);
    const watch = args.includes('--watch');
    const history = args.includes('--history');
    const all = args.includes('--all');

    if (history) {
        printHistoryLog(loadHistory());
        return;
    }

    if (watch) {
        console.log(clr('gray', `  Watch mode ON -- checking every ${WATCH_MINS} minutes. Ctrl+C to stop.\n`));
        await checkPrices({ all });
        setInterval(() => checkPrices({ all }), WATCH_MINS * 60 * 1000);
    } else {
        await checkPrices({ all });
    }
}

if (require.main === module) {
    main().catch(err => {
        console.error(clr('red', `\nFatal error: ${err.message}`));
        process.exit(1);
    });
}

module.exports = {
    fetchWithRetry,
    mergeFuelPrices,
    loadHistory,
    saveHistory,
    getPrevPrice,
    OFFICIAL_FUELS
};
