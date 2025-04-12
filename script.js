// Create a simple in-memory cache directly in this file
const cacheService = {
    cache: new Map(),
    expirationTime: 5 * 60 * 1000, // 5 minutes
    // debug: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1',
    debug: false,
    stats: { hits: 0, misses: 0, sets: 0 },

    get(key) {
        const item = this.cache.get(key);
        
        if (item && Date.now() < item.expiration) {
            this.stats.hits++;
            if (this.debug) console.log(`✅ Cache HIT: ${key}`);
            return item.value;
        }
        
        this.stats.misses++;
        if (this.debug) console.log(`❌ Cache MISS: ${key}`);
        
        if (item) this.cache.delete(key);
        
        return null;
    },

    set(key, value) {
        const expiration = Date.now() + this.expirationTime;
        this.cache.set(key, { value, expiration });
        this.stats.sets++;
        
        if (this.debug) console.log(`📝 Cache SET: ${key}`);
    }
};

// Debugging helper
function logError(message, error) {
    console.error(`${message}:`, error);
    if (errorMessage) {
        errorMessage.textContent = `Error: ${message} - ${error.message || 'Unknown error'}`;
        errorMessage.style.display = 'block';
    }
}

// Check authentication - but don't redirect if we're on the login page
if (!localStorage.getItem('user') && 
    !window.location.pathname.includes('login.html') && 
    !window.location.pathname.includes('register.html') && 
    !window.location.pathname.includes('index.html')) {
    window.location.href = '/login.html';
}

const API_CONFIG = {
    baseUrl: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
        ? 'http://localhost:3000'
        : window.location.origin
};

// Get DOM elements safely with null checks
const summary = document.getElementById('stock-summary');
const errorMessage = document.getElementById('error-message');
const spinner = document.getElementById('loading-spinner');
const graphContainer = document.getElementById('graph-container');
const popularStocksSelect = document.getElementById('popular-stocks');
const fetchDataButton = document.getElementById('fetch-data');
const stockSymbolInput = document.getElementById('stock-symbol');

// Only add event listeners if elements exist
if (popularStocksSelect) {
    popularStocksSelect.addEventListener('change', (event) => {
        if (stockSymbolInput) {
            stockSymbolInput.value = event.target.value;
        }
    });
}

// Update the click handler to be more robust
if (fetchDataButton) {
    fetchDataButton.addEventListener('click', fetchStockData);
}

// Main function to fetch stock data
async function fetchStockData() {
    try {
        if (!stockSymbolInput) {
            throw new Error('Stock symbol input not found');
        }

        const symbol = stockSymbolInput.value.trim().toUpperCase();

        // Clear previous state
        if (errorMessage) errorMessage.style.display = 'none';
        if (spinner) spinner.style.display = 'block';
        if (summary) summary.style.display = 'none';
        if (graphContainer) graphContainer.innerHTML = '';
        
        if (!symbol) {
            if (errorMessage) {
                errorMessage.textContent = 'Please enter a stock symbol.';
                errorMessage.style.display = 'block';
            }
            if (spinner) spinner.style.display = 'none';
            return;
        }

        console.log(`Fetching data for ${symbol}...`);

        // Check cache first
        const cacheKey = `stock_${symbol}`;
        let data = cacheService.get(cacheKey);
        
        if (!data) {
            // Cache miss, fetch from API
            console.log(`Making API request to ${API_CONFIG.baseUrl}/api/stock/${symbol}`);
            const response = await fetch(`${API_CONFIG.baseUrl}/api/stock/${symbol}`);
            
            // Log response for debugging
            console.log('API Response status:', response.status);
            
            data = await response.json();
            console.log('API data received:', data ? 'yes' : 'no');
            
            // Cache the response if valid
            if (data && data.c && Array.isArray(data.c) && data.c.length > 0) {
                cacheService.set(cacheKey, data);
            }
        }

        // Validate the data
        if (!data || !Array.isArray(data.c) || data.c.length === 0) {
            throw new Error('No data available for this symbol');
        }

        // Clean up the data
        const cleanPrices = data.c.filter(p => p !== null && !isNaN(p));
        if (cleanPrices.length === 0) {
            throw new Error('No valid price data available');
        }

        const dates = Array.isArray(data.t)
            ? data.t.slice(0, cleanPrices.length).map(t => new Date(t * 1000).toLocaleDateString())
            : [];

        console.log(`Processing ${cleanPrices.length} data points...`);

        // Generate predictions and render
        const predictedPrices = await generatePredictions(cleanPrices);
        renderGraph(dates, cleanPrices, predictedPrices);
        
        // Update summary
        const technicalIndicators = addTechnicalIndicators(cleanPrices);
        await updateSummary(symbol, data, predictedPrices, technicalIndicators);

        // Show the results
        if (summary) summary.style.display = 'block';
        if (graphContainer) graphContainer.classList.add('visible');
        
        console.log('Stock data processing complete');
    } catch (error) {
        logError('Error fetching stock data', error);
    } finally {
        if (spinner) spinner.style.display = 'none';
    }
}

async function generatePredictions(prices) {
    if (prices.length < 30) return prices;

    const model = await createAdvancedModel(prices);
    const predictions = [...prices];
    let currentWindow = prices.slice(-30);

    // Generate next 5 days predictions
    for (let i = 0; i < 5; i++) {
        const features = extractFeatures(currentWindow);
        const inputTensor = tf.tensor2d([features]);
        const prediction = model.predict(inputTensor);
        const predictedPrice = prediction.dataSync()[0];
        
        predictions.push(predictedPrice);
        currentWindow = [...currentWindow.slice(1), predictedPrice];
        
        inputTensor.dispose();
        prediction.dispose();
    }

    model.dispose();
    return predictions;
}

async function createAdvancedModel(prices) {
    const windowSize = 20;
    const features = [];
    const labels = [];

    // Enhanced feature engineering with fixed number of features
    for (let i = windowSize; i < prices.length; i++) {
        const window = prices.slice(i - windowSize, i);
        const feature = [
            calculateSMA(window),          // Moving average
            calculateRSI(window, 14)[0],   // RSI
            calculateVolatility(window),   // Volatility
            calculateMomentum(window),     // Momentum
            calculateTrend(window),        // Trend
            calculateStdDev(window)        // Standard deviation
        ];
        features.push(feature);
        labels.push(prices[i]);
    }

    const model = tf.sequential();
    
    // Update input shape to match our 6 features
    model.add(tf.layers.dense({ units: 128, activation: 'relu', inputShape: [6] }));
    model.add(tf.layers.dropout({ rate: 0.3 }));
    model.add(tf.layers.dense({ units: 64, activation: 'relu' }));
    model.add(tf.layers.dense({ units: 32, activation: 'relu' }));
    model.add(tf.layers.dense({ units: 1, activation: 'linear' }));

    // Use RMSprop optimizer for better convergence
    model.compile({
        optimizer: tf.train.rmsprop(0.001),
        loss: 'meanSquaredError'
    });

    const xs = tf.tensor2d(features);
    const ys = tf.tensor1d(labels);

    await model.fit(xs, ys, {
        epochs: 50,  // Reduced from 150 to 50 for faster loading
        batchSize: 32,
        shuffle: true,
        validationSplit: 0.1,
        verbose: 0
    });

    xs.dispose();
    ys.dispose();
    return model;
}

function extractFeatures(prices) {
    // Match the feature count with model input shape
    return [
        calculateSMA(prices),
        calculateRSI(prices, 14)[0],
        calculateVolatility(prices),
        calculateMomentum(prices),
        calculateTrend(prices),
        calculateStdDev(prices)
    ];
}

// Add new helper functions
function calculateSMA(prices) {
    const sum = prices.reduce((a, b) => a + b, 0);
    return sum / prices.length;
}

function calculateMomentum(prices) {
    return prices[prices.length - 1] / prices[0] - 1;
}

function calculateStdDev(prices) {
    const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
    const squaredDiffs = prices.map(price => Math.pow(price - mean, 2));
    return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / prices.length);
}

function calculateTechnicalIndicators(prices) {
    const sma = calculateMA(prices, 5);
    const rsi = calculateRSI(prices, 14)[0];
    const bb = calculateBollingerBands(prices, 20);
    const momentum = prices[prices.length - 1] / prices[0] - 1;
    
    return [
        sma[sma.length - 1] / prices[prices.length - 1] - 1,
        rsi / 100,
        (prices[prices.length - 1] - bb.lower) / (bb.upper - bb.lower),
        momentum
    ];
}

// Add technical indicators for better predictions
function addTechnicalIndicators(prices) {
    const rsi = calculateRSI(prices, 14);
    const macd = calculateMACD(prices);
    const bb = calculateBollingerBands(prices, 20);
    
    return {
        rsi: rsi[rsi.length - 1],
        macd: macd[macd.length - 1],
        bb: bb[bb.length - 1]
    };
}

function calculateMA(prices, period) {
    const ma = [];
    for (let i = period - 1; i < prices.length; i++) {
        const sum = prices.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
        ma.push(sum / period);
    }
    return ma;
}

function calculateTrend(prices) {
    const n = prices.length;
    const x = Array.from({length: n}, (_, i) => i);
    const y = prices;
    
    // Simple linear regression
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((a, b, i) => a + b * y[i], 0);
    const sumXX = x.reduce((a, b) => a + b * b, 0);
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    return slope / prices[0]; // Normalized trend
}

function renderGraph(dates, prices, predictedPrices) {
    const graphContainer = document.getElementById('graph-container');
    graphContainer.innerHTML = '<canvas id="graph"></canvas>';
    const ctx = document.getElementById('graph').getContext('2d');

    // Filter out any null values from the data
    const validPrices = prices.filter(p => p !== null);
    const validDates = dates.slice(0, validPrices.length);

    // Calculate buy/sell signals
    const signals = calculateTradingSignals(validPrices);
    
    // Create separate arrays for historical and predicted data
    const historicalData = validPrices.map((price, i) => ({
        x: validDates[i],
        y: price
    }));

    // Create predicted data array
    const predictedData = new Array(validPrices.length - 1).fill(null);
    const futurePredictions = predictedPrices.slice(validPrices.length - 1);
    predictedData.push(...futurePredictions);
    
    // Create buy signals dataset
    const buySignals = signals.buySignals.map(index => ({
        x: validDates[index],
        y: validPrices[index]
    }));
    
    // Create sell signals dataset
    const sellSignals = signals.sellSignals.map(index => ({
        x: validDates[index],
        y: validPrices[index]
    }));

    new Chart(ctx, {
        type: 'line',
        data: {
            labels: dates,
            datasets: [
                {
                    label: 'Historical Prices',
                    data: validPrices,
                    borderColor: '#007bff',
                    backgroundColor: 'rgba(0, 123, 255, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.1,
                    pointRadius: 2,
                    pointHoverRadius: 5,
                },
                {
                    label: 'Predicted Prices',
                    data: predictedData,
                    borderColor: '#ff5733',
                    backgroundColor: 'rgba(255, 87, 51, 0.1)',
                    borderWidth: 2,
                    borderDash: [5, 5],
                    fill: true,
                    tension: 0.1,
                    pointRadius: 2,
                    pointHoverRadius: 5,
                },
                {
                    label: 'Buy Signals',
                    data: buySignals,
                    borderColor: 'rgba(0, 0, 0, 0)',
                    backgroundColor: 'rgba(0, 0, 0, 0)',
                    pointBackgroundColor: '#00ff00',
                    pointBorderColor: '#008800',
                    pointRadius: 6,
                    pointHoverRadius: 8,
                    pointStyle: 'triangle',
                    showLine: false
                },
                {
                    label: 'Sell Signals',
                    data: sellSignals,
                    borderColor: 'rgba(0, 0, 0, 0)',
                    backgroundColor: 'rgba(0, 0, 0, 0)',
                    pointBackgroundColor: '#ff0000',
                    pointBorderColor: '#880000',
                    pointRadius: 6,
                    pointHoverRadius: 8,
                    pointStyle: 'triangle',
                    pointRotation: 180,
                    showLine: false
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                intersect: false,
                mode: 'index'
            },
            scales: {
                x: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: { color: '#e0e0e0' }
                },
                y: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: { 
                        color: '#e0e0e0',
                        callback: (value) => `$${value.toFixed(2)}`
                    }
                }
            },
            plugins: {
                legend: {
                    labels: {
                        color: '#e0e0e0',
                        font: { size: 12 }
                    }
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.parsed.y !== null) {
                                label += new Intl.NumberFormat('en-US', {
                                    style: 'currency',
                                    currency: 'USD'
                                }).format(context.parsed.y);
                                

                                // Add trend analysis for buy/sell points
                                if (context.dataset.label === 'Buy Signals') {
                                    label += ' - Strong buy signal';
                                } else if (context.dataset.label === 'Sell Signals') {
                                    label += ' - Strong sell signal';
                                }
                            }
                            return label;
                        }
                    }
                },
                annotation: {
                    annotations: {
                        line1: {
                            type: 'line',
                            yMin: predictedPrices[predictedPrices.length - 1],
                            yMax: predictedPrices[predictedPrices.length - 1],
                            borderColor: 'rgb(255, 99, 132)',
                            borderWidth: 2,
                            label: {
                                backgroundColor: 'rgba(255, 99, 132, 0.8)',
                                content: 'Projected End Price',
                                enabled: true
                            }
                        }
                    }
                }
            },
            animation: {
                duration: 2000,
                easing: 'easeInOutQuart'
            },
            elements: {
                line: {
                    borderJoinStyle: 'round'
                }
            }
        }
    });
}

// Add new function to calculate trading signals
function calculateTradingSignals(prices) {
    const buySignals = [];
    const sellSignals = [];
    
    // Minimum length requirement for signal calculation
    if (prices.length < 30) {
        return { buySignals, sellSignals };
    }
    
    // Calculate indicators for signal generation
    const rsiValues = calculateRSIArray(prices, 14);
    const ema20 = calculateEMA(prices, 20);
    const ema50 = calculateEMA(prices, 50);
    const macd = calculateMACDArray(prices);
    const bollingerBands = prices.map((price, i) => {
        return i >= 20 ? calculateBollingerBands(prices.slice(i-20, i+1)) : null;
    });
    
    // Generate signals based on combined indicators (starting from where we have all indicators)
    for (let i = 50; i < prices.length; i++) {
        // Buy signal conditions:
        // 1. RSI < 30 (oversold)
        // 2. Price crosses above lower Bollinger Band
        // 3. EMA20 > EMA50 (uptrend confirmation)
        // 4. MACD line crosses above signal line
        const rsiOversold = rsiValues[i] < 30;
        const priceAboveLowerBB = bollingerBands[i] && prices[i] > bollingerBands[i].lower;
        const previousPriceBelowLowerBB = bollingerBands[i-1] && prices[i-1] < bollingerBands[i-1].lower;
        const crossingLowerBB = priceAboveLowerBB && previousPriceBelowLowerBB;
        const emaUptrend = ema20[i] > ema50[i] && ema20[i-1] <= ema50[i-1];
        const macdCrossover = macd.line[i] > macd.signal[i] && macd.line[i-1] <= macd.signal[i-1];
        
        // Sell signal conditions:
        // 1. RSI > 70 (overbought)
        // 2. Price crosses below upper Bollinger Band
        // 3. EMA20 < EMA50 (downtrend confirmation)
        // 4. MACD line crosses below signal line
        const rsiOverbought = rsiValues[i] > 70;
        const priceBelowUpperBB = bollingerBands[i] && prices[i] < bollingerBands[i].upper;
        const previousPriceAboveUpperBB = bollingerBands[i-1] && prices[i-1] > bollingerBands[i-1].upper;
        const crossingUpperBB = priceBelowUpperBB && previousPriceAboveUpperBB;
        const emaDowntrend = ema20[i] < ema50[i] && ema20[i-1] >= ema50[i-1];
        const macdCrossUnder = macd.line[i] < macd.signal[i] && macd.line[i-1] >= macd.signal[i-1];
        
        // Combine signals for stronger indication
        if ((rsiOversold && crossingLowerBB) || (emaUptrend && macdCrossover)) {
            buySignals.push(i);
        }
        
        if ((rsiOverbought && crossingUpperBB) || (emaDowntrend && macdCrossUnder)) {
            sellSignals.push(i);
        }
    }
    
    // Only keep the most significant signals (to avoid cluttering the graph)
    return {
        buySignals: limitSignals(buySignals, 5),
        sellSignals: limitSignals(sellSignals, 5)
    };
}

// Helper function to calculate RSI as an array for the whole price history
function calculateRSIArray(prices, period = 14) {
    if (prices.length < period + 1) {
        return Array(prices.length).fill(50); // Default neutral value
    }
    
    const rsiValues = Array(period).fill(50); // Pad with neutral values
    const gains = [];
    const losses = [];
    
    // Calculate initial gains and losses
    for (let i = 1; i < period + 1; i++) {
        const change = prices[i] - prices[i-1];
        gains.push(Math.max(0, change));
        losses.push(Math.max(0, -change));
    }
    
    // Calculate first RS and RSI values
    let avgGain = gains.reduce((sum, gain) => sum + gain, 0) / period;
    let avgLoss = losses.reduce((sum, loss) => sum + loss, 0) / period;
    
    // Calculate rsiValues for each price point
    for (let i = period; i < prices.length; i++) {
        const change = prices[i] - prices[i-1];
        const currentGain = Math.max(0, change);
        const currentLoss = Math.max(0, -change);
        
        // Use smoothed averages
        avgGain = ((avgGain * (period - 1)) + currentGain) / period;
        avgLoss = ((avgLoss * (period - 1)) + currentLoss) / period;
        
        const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        rsiValues.push(100 - (100 / (1 + rs)));
    }
    
    return rsiValues;
}

// Calculate MACD array for all prices
function calculateMACDArray(prices) {
    const ema12 = calculateEMA(prices, 12);
    const ema26 = calculateEMA(prices, 26);
    
    // Calculate MACD line (EMA12 - EMA26)
    const macdLine = ema12.map((value, i) => i < 26 ? 0 : value - ema26[i]);
    
    // Calculate signal line (9-day EMA of MACD line)
    const signalLine = calculateEMA(macdLine, 9);
    
    return {
        line: macdLine,
        signal: signalLine,
        histogram: macdLine.map((value, i) => value - signalLine[i])
    };
}

// Helper function to limit the number of signals to prevent chart clutter
function limitSignals(signals, maxSignals) {
    if (signals.length <= maxSignals) {
        return signals;
    }
    
    // Keep signals spread throughout the chart
    const step = Math.floor(signals.length / maxSignals);
    const result = [];
    
    for (let i = 0; i < maxSignals; i++) {
        result.push(signals[Math.min(signals.length - 1, i * step)]);
    }
    
    return result;
}

// Update the updateSummary function to include signal information
async function updateSummary(symbol, data, predictions, technicalIndicators) {
    if (!summary) {
        console.error('Summary element not found');
        return;
    }

    const sentiment = await analyzeSentiment(symbol);
    const marketStatus = getMarketStatus();
    
    // Calculate signals for recommendation
    const recentPrices = data.c.slice(-50);
    const signals = calculateTradingSignals(recentPrices);
    const lastPrice = recentPrices[recentPrices.length - 1];
    
    // Generate recommendation based on signals
    let recommendation = 'Hold';
    let recommendationClass = 'neutral';
    
    if (signals.buySignals.includes(recentPrices.length - 1) || 
        signals.buySignals.includes(recentPrices.length - 2)) {
        recommendation = 'Buy';
        recommendationClass = 'bullish';
    } else if (signals.sellSignals.includes(recentPrices.length - 1) || 
               signals.sellSignals.includes(recentPrices.length - 2)) {
        recommendation = 'Sell';
        recommendationClass = 'bearish';
    }
    
    // Calculate projected price change
    const projectedPrice = predictions[predictions.length - 1];
    const priceChange = ((projectedPrice - lastPrice) / lastPrice) * 100;
    
    summary.innerHTML = `
        <div class="prediction-card">
            <h2>${symbol}</h2>
            <p>Current Price: $${lastPrice.toFixed(2)}</p>
            <p>Market Status: <span class="indicator ${marketStatus.trend}">${marketStatus.status}</span></p>
            <p>AI Recommendation: <span class="indicator ${recommendationClass}">${recommendation}</span></p>
            <p>Projected Price: $${projectedPrice.toFixed(2)} 
               <span class="indicator ${priceChange >= 0 ? 'bullish' : 'bearish'}">
                 ${priceChange >= 0 ? '▲' : '▼'} ${Math.abs(priceChange).toFixed(2)}%
               </span>
            </p>
            <div class="technical-indicators">
                ${renderTechnicalIndicators(technicalIndicators)}
            </div>
            <div class="volume-analysis">
                ${renderVolumeAnalysis(data.v)}
            </div>
        </div>
    `;
}

// Add sentiment analysis
async function analyzeSentiment(symbol) {
    const sentiment = {
        score: Math.random() * 2 - 1, // Simulated sentiment score
        signals: ['Volume Trend', 'Price Momentum', 'Market Trend']
    };
    return sentiment;
}

// Add color themes
const themes = {
    dark: {
        background: 'linear-gradient(135deg, #121212, #1e1e1e)',
        text: '#e0e0e0'
    },
    light: {
        background: 'linear-gradient(135deg, #f0f2f5, #ffffff)',
        text: '#333333'
    }
};

// Theme toggle
document.addEventListener('DOMContentLoaded', () => {
    const themeToggle = document.querySelector('.theme-toggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const currentTheme = document.body.classList.contains('dark') ? 'light' : 'dark';
            document.body.classList = currentTheme;
            applyTheme(themes[currentTheme]);
        });
    }
});

// Add theme application function
function applyTheme(theme) {
    document.documentElement.style.setProperty('--background', theme.background);
    document.documentElement.style.setProperty('--text-color', theme.text);
}

// Add missing RSI calculation
function calculateRSI(prices, period = 14) {
    if (prices.length < period) {
        return [50]; // Default value if not enough data
    }

    const changes = prices.slice(1).map((price, i) => price - prices[i]);
    const gains = changes.map(change => Math.max(change, 0));
    const losses = changes.map(change => Math.abs(Math.min(change, 0)));

    let avgGain = gains.slice(0, period).reduce((sum, gain) => sum + gain) / period;
    let avgLoss = losses.slice(0, period).reduce((sum, loss) => sum + loss) / period;

    gains.slice(period).forEach(gain => {
        avgGain = (avgGain * (period - 1) + gain) / period;
    });

    losses.slice(period).forEach(loss => {
        avgLoss = (avgLoss * (period - 1) + loss) / period;
    });

    const rs = avgGain / (avgLoss || 1); // Prevent division by zero
    return [100 - (100 / (1 + rs))];
}

// Add missing volume analysis
function renderVolumeAnalysis(volumes) {
    if (!volumes || volumes.length === 0) return '';
    
    const avgVolume = volumes.reduce((sum, vol) => sum + vol, 0) / volumes.length;
    const latestVolume = volumes[volumes.length - 1];
    const volumeChange = ((latestVolume - avgVolume) / avgVolume) * 100;
    
    return `
        <div class="volume-indicator">
            <p>Volume Analysis:</p>
            <span class="indicator ${volumeChange > 0 ? 'bullish' : 'bearish'}">
                ${Math.abs(volumeChange).toFixed(2)}% ${volumeChange > 0 ? 'Above' : 'Below'} Average
            </span>
        </div>
    `;
}

// Add missing technical indicators render
function renderTechnicalIndicators(indicators) {
    // Add default values and error handling
    const defaultBB = { upper: 0, lower: 0, middle: 1 };
    const bb = indicators.bb || defaultBB;
    const rsi = indicators.rsi || 50;
    const macd = indicators.macd || 0;

    return `
        <div class="indicator-group">
            <span class="indicator ${rsi > 70 ? 'bearish' : rsi < 30 ? 'bullish' : 'neutral'}">
                RSI: ${rsi.toFixed(2)}
            </span>
            <span class="indicator ${macd > 0 ? 'bullish' : 'bearish'}">
                MACD: ${macd.toFixed(2)}
            </span>
            <span class="indicator">
                BB Width: ${((bb.upper - bb.lower) / bb.middle * 100).toFixed(2)}%
            </span>
        </div>
    `;
}

// Technical Indicators Section
function calculateVolatility(prices, period = 10) {
    if (prices.length < 2) return 0;
    
    const returns = prices.slice(1).map((price, i) => 
        (price - prices[i]) / prices[i]
    );
    
    const meanReturn = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
    
    const squaredDiffs = returns.map(ret => 
        Math.pow(ret - meanReturn, 2)
    );
    
    const variance = squaredDiffs.reduce((sum, diff) => sum + diff, 0) / returns.length;
    return Math.sqrt(variance);
}

function calculateBollingerBands(prices, period = 20) {
    if (!prices || prices.length < period) {
        return {
            upper: prices?.[prices.length - 1] || 0,
            lower: prices?.[prices.length - 1] || 0,
            middle: prices?.[prices.length - 1] || 1
        };
    }

    const sma = calculateMA(prices, period);
    const middle = sma[sma.length - 1];
    const stdDev = Math.sqrt(
        prices.slice(-period).reduce((sum, price) => 
            sum + Math.pow(price - middle, 2), 0
        ) / period
    );
    
    return {
        upper: middle + (2 * stdDev),
        lower: middle - (2 * stdDev),
        middle: middle
    };
}

function calculateMACD(prices) {
    const ema12 = calculateEMA(prices, 12);
    const ema26 = calculateEMA(prices, 26);
    const macdLine = ema12[ema12.length - 1] - ema26[ema26.length - 1];
    const signal = calculateEMA([...ema12.map((e, i) => e - ema26[i])], 9);
    return [macdLine, signal[signal.length - 1]];
}

function calculateEMA(prices, period) {
    const k = 2 / (period + 1);
    let ema = [prices[0]];
    for (let i = 1; i < prices.length; i++) {
        ema.push(prices[i] * k + ema[i - 1] * (1 - k));
    }
    return ema;
}

function calculateMA(prices, period) {
    const result = [];
    for (let i = period - 1; i < prices.length; i++) {
        const sum = prices.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
        result.push(sum / period);
    }
    return result;
}

function calculateReturns(prices) {
    if (prices.length < 2) return [0];
    
    // Calculate percentage returns
    return prices.slice(1).map((price, i) => {
        const previousPrice = prices[i];
        return (price - previousPrice) / previousPrice;
    });
}

function getMarketStatus() {
    const now = new Date();
    const hour = now.getHours();
    const isWeekday = now.getDay() > 0 && now.getDay() < 6;
    const isMarketOpen = isWeekday && hour >= 9 && hour < 16;
    
    return {
        status: isMarketOpen ? 'Market Open' : 'Market Closed',
        trend: isMarketOpen ? 'active' : 'neutral'
    };
}
