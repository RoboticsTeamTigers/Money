// Add at the top of the file
// Check authentication
if (!localStorage.getItem('user')) {
    window.location.href = '/login.html';
}

const summary = document.getElementById('stock-summary');
const errorMessage = document.getElementById('error-message');
const spinner = document.getElementById('loading-spinner');
const graphContainer = document.getElementById('graph-container');

document.getElementById('popular-stocks').addEventListener('change', (event) => {
    document.getElementById('stock-symbol').value = event.target.value;
});

// Update the click handler to remove redundant declarations
document.getElementById('fetch-data').addEventListener('click', async () => {
    const symbol = document.getElementById('stock-symbol').value.trim().toUpperCase();

    // Clear previous state
    errorMessage.style.display = 'none';
    spinner.style.display = 'block';
    summary.style.display = 'none';
    graphContainer.innerHTML = '';
    
    if (!symbol) {
        errorMessage.textContent = 'Please enter a stock symbol.';
        errorMessage.style.display = 'block';
        spinner.style.display = 'none';
        return;
    }

    try {
        const response = await fetch(`http://localhost:3000/api/stock/${symbol}`);
        const data = await response.json();

        // Validate the data
        if (!data || !Array.isArray(data.c) || data.c.length === 0) {
            throw new Error('No data available for this symbol');
        }

        // Clean up the data
        const cleanPrices = data.c.filter(p => p !== null && !isNaN(p));
        if (cleanPrices.length === 0) {
            throw new Error('No valid price data available');
        }

        const dates = data.t
            .slice(0, cleanPrices.length)
            .map(t => new Date(t * 1000).toLocaleDateString());

        // Generate predictions and render
        const predictedPrices = await generatePredictions(cleanPrices);
        renderGraph(dates, cleanPrices, predictedPrices);
        
        // Update summary
        const technicalIndicators = addTechnicalIndicators(cleanPrices);
        await updateSummary(symbol, data, predictedPrices, technicalIndicators);

        // Show the results
        summary.style.display = 'block';
        graphContainer.classList.add('visible');
        
    } catch (error) {
        console.error('Error:', error);
        errorMessage.textContent = error.message;
        errorMessage.style.display = 'block';
    } finally {
        spinner.style.display = 'none';
    }
});

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

    // Create separate arrays for historical and predicted data
    const historicalData = validPrices.map((price, i) => ({
        x: validDates[i],
        y: price
    }));

    // Create predicted data array
    const predictedData = new Array(validPrices.length - 1).fill(null);
    const futurePredictions = predictedPrices.slice(validPrices.length - 1);
    predictedData.push(...futurePredictions);

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
                            return `${context.dataset.label}: $${context.parsed.y.toFixed(2)}`;
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

// Add sentiment analysis
async function analyzeSentiment(symbol) {
    const sentiment = {
        score: Math.random() * 2 - 1, // Simulated sentiment score
        signals: ['Volume Trend', 'Price Momentum', 'Market Trend']
    };
    return sentiment;
}

// Enhanced prediction display
async function updateSummary(symbol, data, predictions, technicalIndicators) {
    if (!summary) {
        console.error('Summary element not found');
        return;
    }

    const sentiment = await analyzeSentiment(symbol);
    const marketStatus = getMarketStatus();
    
    summary.innerHTML = `
        <div class="prediction-card">
            <h2>${symbol}</h2>
            <p>Current Price: $${data.currentPrice.toFixed(2)}</p>
            <p>Market Status: <span class="indicator ${marketStatus.trend}">${marketStatus.status}</span></p>
            <p>AI Prediction: <span class="indicator ${sentiment.score > 0 ? 'bullish' : 'bearish'}">
                ${sentiment.score > 0 ? '⬆️ Bullish' : '⬇️ Bearish'}
            </span></p>
            <div class="technical-indicators">
                ${renderTechnicalIndicators(technicalIndicators)}
            </div>
            <div class="volume-analysis">
                ${renderVolumeAnalysis(data.v)}
            </div>
        </div>
    `;
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
