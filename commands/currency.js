const { fetch } = require('undici');

// Simple cache
let rates = {};
let lastFetch = 0;

async function getRates(base) {
    const now = Date.now();
    if (rates[base] && (now - lastFetch < 3600000)) { // 1 hour cache
        return rates[base];
    }

    try {
        const res = await fetch(`https://open.er-api.com/v6/latest/${base}`);
        const data = await res.json();
        if (data.result === 'success') {
            rates[base] = data.rates;
            // Also cache reverse if base is USD (often used)
            if (base === 'USD') lastFetch = now; // Only update timestamp on main fetch? Keep simple.
            return data.rates;
        }
    } catch (e) { console.error('Currency API Error:', e); }
    return null;
}

// Binance Price Fetch
async function getBinancePrice(symbol) {
    try {
        const res = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`);
        const data = await res.json();
        if (data.price) return parseFloat(data.price);
    } catch (e) { }
    return null;
}

// Helper: Get value of 1 Unit in USD
async function getValueInUSD(code) {
    if (code === 'USD' || code === 'USDT') return 1;

    // 1. Check Fiat (using USD base)
    const usdRates = await getRates('USD');
    if (usdRates && usdRates[code]) {
        // 1 USD = X Code. So 1 Code = 1/X USD.
        return 1 / usdRates[code];
    }

    // 2. Check Crypto (against USDT)
    const price = await getBinancePrice(`${code}USDT`);
    if (price) return price;

    return null;
}

module.exports = {
    async handle(message) {
        const content = message.content.trim();

        // Regex: value (optional), from (3-5), to (3-5)
        const regex = /^(\d+(?:\.\d+)?)?\s*([a-zA-Z]{3,5})\s+(?:to|in)\s+([a-zA-Z]{3,5})$/i;

        const match = content.match(regex);
        if (!match) return false;

        let amount = match[1] ? parseFloat(match[1]) : 1;
        const from = match[2].toUpperCase();
        const to = match[3].toUpperCase();

        if (from === to) return false;

        // Try Universal Bridge (via USD)
        // Convert From -> USD
        const fromVal = await getValueInUSD(from);
        if (fromVal === null) return false;

        // Convert To -> USD
        const toVal = await getValueInUSD(to);
        if (toVal === null) return false;

        // Calculation: (Amount * FromValInUSD) / ToValInUSD
        const result = (amount * fromVal) / toVal;

        // Formatting
        // If result is huge or tiny, adjust digits
        let formatted;
        if (result < 1) {
            formatted = result.toLocaleString(undefined, { maximumFractionDigits: 8 });
        } else {
            formatted = result.toLocaleString(undefined, { maximumFractionDigits: 2 });
        }

        await message.channel.send(`${amount} ${from} = ${formatted} ${to}`);
        return true;
    }
};
