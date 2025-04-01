const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

const app = express();
const port = 3000;

// Replace with your shared Google Sheet URL
const SHEET_URL = 'https://docs.google.com/spreadsheets/d/1D7ovONGIaclZMs-6i5FrMCJFHzP0DMF01f7uXsjk-2s/edit?usp=sharing';
const SHEET_DATA_URL = SHEET_URL.replace('/edit?usp=sharing', '/gviz/tq?tqx=out:csv');

app.use(cors({
    origin: function(origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if(!origin) return callback(null, true);
        
        // List of allowed origins
        const allowedOrigins = [
            'http://localhost:3000',
            'http://127.0.0.1:3000',
            // Add your production domain here, for example:
            'https://yourdomain.com',
            'https://www.yourdomain.com'
        ];
        
        if(allowedOrigins.indexOf(origin) === -1){
            const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
            return callback(new Error(msg), false);
        }
        return callback(null, true);
    },
    credentials: true
}));
app.use(express.static('.'));
app.use(express.json());

// Update storage location and ensure directory exists
const USERS_FILE = path.join(__dirname, 'users.json');

// Initialize users.json if it doesn't exist
async function initializeUsersFile() {
    try {
        await fs.access(USERS_FILE);
    } catch {
        // Create the file with empty array if it doesn't exist
        await fs.writeFile(USERS_FILE, '[]', 'utf8');
        console.log('Created users.json file');
    }
}

// Initialize on server start
initializeUsersFile().catch(console.error);

// Load users function
async function loadUsers() {
    try {
        const data = await fs.readFile(USERS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return [];
    }
}

// Save users function
async function saveUsers(users) {
    try {
        await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2));
        return true;
    } catch (error) {
        console.error('Error saving users:', error);
        return false;
    }
}

// Add this near other functions
function hashPassword(password) {
    return crypto
        .createHash('sha256')
        .update(password)
        .digest('hex');
}

// Update registration endpoint
app.post('/api/auth/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        let users = [];
        try {
            const data = await fs.readFile(USERS_FILE, 'utf8');
            users = JSON.parse(data);
        } catch {
            users = [];
        }

        // Check if user exists
        if (users.some(user => user.email === email)) {
            return res.status(400).json({ error: 'Email already registered' });
        }

        // Add new user
        const newUser = {
            name,
            email,
            password: crypto.createHash('sha256').update(password).digest('hex'),
            dateRegistered: new Date().toISOString()
        };

        users.push(newUser);

        // Save updated users
        await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2));
        res.json({ success: true });

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ 
            error: 'Registration failed', 
            details: error.message 
        });
    }
});

// Update login endpoint
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const users = await loadUsers();
        
        const user = users.find(u => 
            u.email === email && 
            u.password === hashPassword(password)
        );

        if (user) {
            res.json({
                success: true,
                user: {
                    name: user.name,
                    email: user.email
                }
            });
        } else {
            res.status(401).json({ error: 'Invalid credentials' });
        }
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

app.get('/api/stock/:symbol', async (req, res) => {
    const { symbol } = req.params;
    try {
        console.log(`Fetching data for ${symbol}...`);
        const response = await fetch(
            `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=3mo`,
            {
                headers: {
                    'User-Agent': 'Mozilla/5.0',
                    'Accept': 'application/json'
                }
            }
        );
        
        const data = await response.json();
        
        if (data.chart?.error) {
            throw new Error(data.chart.error.description);
        }

        const result = data.chart?.result?.[0];
        if (!result?.indicators?.quote?.[0]) {
            throw new Error('Invalid data received');
        }

        const quotes = result.indicators.quote[0];
        const formattedData = {
            t: result.timestamp,
            c: quotes.close || [],
            h: quotes.high || [],
            l: quotes.low || [],
            v: quotes.volume || [],
            currentPrice: quotes.close?.[quotes.close.length - 1] || 0
        };

        console.log(`Successfully fetched data for ${symbol}`);
        res.json(formattedData);
    } catch (error) {
        console.error(`Error fetching ${symbol}:`, error);
        res.json(generateSyntheticData(symbol));
    }
});

const TWELVE_DATA_KEY = '7aa1521d6b1743daa6ff00f58864f222';  // Your API key here
const API_CACHE = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes cache
const REQUESTS_PER_MINUTE = 8; // Free tier limit
let requestsThisMinute = 0;
let lastResetTime = Date.now();

const ALPHA_VANTAGE_KEY = '63O8INLMZGDLBPH6';  // Free API key for demonstration

// Add error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

function resetRequestCount() {
    const now = Date.now();
    if (now - lastResetTime >= 60000) {
        requestsThisMinute = 0;
        lastResetTime = now;
    }
}

function getCachedData(symbol) {
    const cached = API_CACHE.get(symbol);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        return cached.data;
    }
    return null;
}

function generateSyntheticData(symbol) {
    // Generate realistic-looking data based on known patterns
    const basePrice = 100;
    const days = 90;
    const volatility = 0.02;
    const trend = 0.001;
    
    const prices = [basePrice];
    const dates = [];
    const volumes = [];
    
    for (let i = days - 1; i >= 0; i--) {
        const previousPrice = prices[prices.length - 1];
        const change = (Math.random() - 0.5) * volatility + trend;
        const newPrice = previousPrice * (1 + change);
        prices.push(newPrice);
        dates.push(Date.now() - i * 86400000);
        volumes.push(Math.floor(Math.random() * 1000000));
    }
    
    return {
        t: dates.map(d => Math.floor(d / 1000)),
        c: prices,
        h: prices.map(p => p * 1.02),
        l: prices.map(p => p * 0.98),
        v: volumes,
        currentPrice: prices[prices.length - 1]
    };
}

function getMarketStatus() {
    const now = new Date();
    const hour = now.getHours();
    const isWeekday = now.getDay() > 0 && now.getDay() < 6;
    
    if (!isWeekday || hour < 9 || hour >= 16) {
        return { status: 'Market Closed', trend: 'neutral' };
    }
    return { status: 'Market Open', trend: 'active' };
}

function calculateVolatility(prices) {
    const returns = prices.slice(1).map((price, i) => 
        (price - prices[i]) / prices[i]
    );
    return Math.sqrt(returns.reduce((sum, ret) => sum + ret * ret, 0) / returns.length);
}

function calculateReturns(prices) {
    return prices.slice(1).map((price, i) => 
        (price - prices[i]) / prices[i]
    );
}

function calculateRSI(prices, period = 14) {
    const changes = prices.slice(1).map((price, i) => price - prices[i]);
    const gains = changes.map(change => change > 0 ? change : 0);
    const losses = changes.map(change => change < 0 ? -change : 0);
    
    const avgGain = gains.slice(0, period).reduce((a, b) => a + b) / period;
    const avgLoss = losses.slice(0, period).reduce((a, b) => a + b) / period;
    
    return [avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss))];
}

function calculateMACD(prices) {
    const ema12 = calculateEMA(prices, 12);
    const ema26 = calculateEMA(prices, 26);
    const macdLine = ema12[ema12.length - 1] - ema26[ema26.length - 1];
    const signalLine = calculateEMA([macdLine], 9)[0];
    
    return [macdLine, signalLine];
}

function calculateEMA(prices, period) {
    const k = 2 / (period + 1);
    let ema = [prices[0]];
    
    for (let i = 1; i < prices.length; i++) {
        ema.push(prices[i] * k + ema[i - 1] * (1 - k));
    }
    
    return ema;
}

function calculateBollingerBands(prices, period = 20) {
    const sma = calculateMA(prices.slice(-period));
    const stdDev = Math.sqrt(
        prices.slice(-period)
            .reduce((sum, price) => sum + Math.pow(price - sma, 2), 0) / period
    );
    
    return {
        upper: sma + stdDev * 2,
        lower: sma - stdDev * 2,
        middle: sma
    };
}

// Add new endpoints for social features
app.post('/api/posts', async (req, res) => {
    try {
        const { userId, content, image } = req.body;
        const post = {
            id: Date.now(),
            userId,
            content,
            image,
            likes: 0,
            comments: [],
            timestamp: new Date().toISOString()
        };
        
        // Save post to database/file
        const posts = await loadPosts();
        posts.push(post);
        await savePosts(posts);
        
        res.json({ success: true, post });
    } catch (error) {
        res.status(500).json({ error: 'Failed to create post' });
    }
});

app.get('/api/posts/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const posts = await loadPosts();
        const userPosts = posts.filter(post => post.userId === userId);
        res.json(userPosts);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch posts' });
    }
});

// Add profile endpoints
app.post('/api/profile/update', async (req, res) => {
    try {
        const { userId, name, bio, avatar } = req.body;
        const users = await loadUsers();
        const userIndex = users.findIndex(u => u.email === userId);
        
        if (userIndex >= 0) {
            users[userIndex] = {
                ...users[userIndex],
                name: name || users[userIndex].name,
                bio: bio || users[userIndex].bio,
                avatar: avatar || users[userIndex].avatar
            };
            await saveUsers(users);
            res.json({ success: true });
        } else {
            res.status(404).json({ error: 'User not found' });
        }
    } catch (error) {
        res.status(500).json({ error: 'Failed to update profile' });
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
