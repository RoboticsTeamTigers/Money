/**
 * Simple caching service with expiration and debugging
 */
class CacheService {
    constructor(expirationMinutes = 5, enableDebug = true) {
        this.cache = new Map();
        // Convert minutes to milliseconds
        this.expirationTime = expirationMinutes * 60 * 1000;
        this.debug = enableDebug;
        this.stats = {
            hits: 0,
            misses: 0,
            sets: 0
        };
    }

    /**
     * Get an item from cache
     * @param {string} key - The cache key
     * @returns {any|null} - The cached item or null if not found/expired
     */
    get(key) {
        const item = this.cache.get(key);
        
        // Check if the item exists and is still valid
        if (item && Date.now() < item.expiration) {
            this.stats.hits++;
            if (this.debug) {
                console.log(`✅ Cache HIT: ${key}`);
                console.log(`   Cache stats: ${JSON.stringify(this.stats)}`);
            }
            return item.value;
        }
        
        // Item doesn't exist or has expired
        this.stats.misses++;
        if (this.debug) {
            console.log(`❌ Cache MISS: ${key}`);
            console.log(`   Cache stats: ${JSON.stringify(this.stats)}`);
        }
        
        // Clean up expired item if it exists
        if (item) {
            this.cache.delete(key);
        }
        
        return null;
    }

    /**
     * Set an item in the cache
     * @param {string} key - The cache key
     * @param {any} value - The value to cache
     */
    set(key, value) {
        const expiration = Date.now() + this.expirationTime;
        this.cache.set(key, { value, expiration });
        this.stats.sets++;
        
        if (this.debug) {
            console.log(`📝 Cache SET: ${key}`);
            console.log(`   Expires: ${new Date(expiration).toLocaleTimeString()}`);
            console.log(`   Cache stats: ${JSON.stringify(this.stats)}`);
        }
    }

    /**
     * Clear the entire cache
     */
    clear() {
        this.cache.clear();
        if (this.debug) {
            console.log('🧹 Cache cleared');
        }
    }

    /**
     * Get current cache statistics
     */
    getStats() {
        return {
            ...this.stats,
            size: this.cache.size,
            hitRate: this.stats.hits / (this.stats.hits + this.stats.misses) || 0
        };
    }
}

// Create a singleton instance
const cacheService = new CacheService(
    5, // 5 minutes cache expiration
    window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' // Enable debug only in development
);

export default cacheService;
