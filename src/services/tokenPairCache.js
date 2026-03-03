/**
 * Token Pair Cache Service
 *
 * Manages caching of token pair swappability status to avoid repeated validation calls
 * to ParaSwap API. Cache is stored in localStorage with a 1-hour TTL.
 *
 * Validation is done lazily: only when user selects a pair, then cache for future use.
 */

import logger from '../utils/logger.js';

const CACHE_KEY_PREFIX = 'lilswap_token_pair_cache_';
const CACHE_TTL_MS = 3600000; // 1 hour

/**
 * Generate cache key from token pair and chain ID
 * @param {string} fromAddress - From token address (normalized)
 * @param {string} toAddress - To token address (normalized)
 * @param {number} chainId - Chain ID
 * @returns {string} Cache key
 */
function getCacheKey(fromAddress, toAddress, chainId) {
    return `${CACHE_KEY_PREFIX}${chainId}:${fromAddress.toLowerCase()}:${toAddress.toLowerCase()}`;
}

/**
 * Get cached pair status without validation
 * Reads from cache only, does not make API calls
 *
 * @param {string} fromAddress - From token address
 * @param {string} toAddress - To token address
 * @param {number} chainId - Chain ID
 * @returns {Object|null} { swappable: boolean, timestamp: number } or null if not cached
 */
export function getPairStatus(fromAddress, toAddress, chainId) {
    if (!fromAddress || !toAddress) return null;

    try {
        const key = getCacheKey(fromAddress, toAddress, chainId);
        const cached = localStorage.getItem(key);

        if (!cached) return null;

        const entry = JSON.parse(cached);
        const now = Date.now();

        // Expiry check
        if (now - entry.timestamp > CACHE_TTL_MS) {
            localStorage.removeItem(key);
            logger.debug('[tokenPairCache] Cache expired for:', { fromAddress, toAddress, chainId });
            return null;
        }

        logger.debug('[tokenPairCache] Cache hit:', {
            fromAddress,
            toAddress,
            chainId,
            swappable: entry.swappable,
            ageMs: now - entry.timestamp
        });

        return entry;
    } catch (error) {
        logger.warn('[tokenPairCache] Error reading cache:', error);
        return null;
    }
}

/**
 * Set pair swappability status in cache
 *
 * @param {string} fromAddress - From token address
 * @param {string} toAddress - To token address
 * @param {number} chainId - Chain ID
 * @param {boolean} swappable - Whether the pair is swappable
 * @returns {Object} Cached entry
 */
function setPairStatus(fromAddress, toAddress, chainId, swappable) {
    try {
        const key = getCacheKey(fromAddress, toAddress, chainId);
        const entry = {
            swappable,
            timestamp: Date.now()
        };

        localStorage.setItem(key, JSON.stringify(entry));
        logger.debug('[tokenPairCache] Cached pair status:', {
            fromAddress,
            toAddress,
            chainId,
            swappable
        });

        return entry;
    } catch (error) {
        logger.warn('[tokenPairCache] Error writing cache:', error);
        return null;
    }
}

/**
 * Check if a token pair is swappable by validating with ParaSwap API
 * Uses cached result if available and not expired
 *
 * @param {Object} fromToken - From token { address, decimals, symbol }
 * @param {Object} toToken - To token { address, decimals, symbol }
 * @param {number} chainId - Chain ID
 * @param {Function} quoteFunction - Function to call for validation (e.g., getDebtQuote)
 * @param {Object} validationParams - Additional params for the quote function
 * @returns {Promise<boolean>} true if swappable, false otherwise
 */
export async function checkPairSwappable(fromToken, toToken, chainId, quoteFunction, validationParams = {}) {
    if (!fromToken?.address || !toToken?.address) {
        logger.warn('[tokenPairCache] Missing token addresses');
        return false;
    }

    // Check cache first
    const cached = getPairStatus(fromToken.address, toToken.address, chainId);
    if (cached !== null) {
        return cached.swappable;
    }

    // Not in cache, need to validate
    logger.debug('[tokenPairCache] Validating token pair:', {
        fromToken: fromToken.symbol,
        toToken: toToken.symbol,
        chainId
    });

    try {
        // Use minimal amount (1 wei) for validation
        const minimalAmount = '1';

        await quoteFunction({
            fromToken: {
                address: fromToken.address,
                decimals: fromToken.decimals,
                symbol: fromToken.symbol
            },
            toToken: {
                address: toToken.address,
                decimals: toToken.decimals,
                symbol: toToken.symbol
            },
            destAmount: minimalAmount,
            ...validationParams
        });

        // If we get here, there's a route available
        setPairStatus(fromToken.address, toToken.address, chainId, true);
        logger.info('[tokenPairCache] Pair is swappable:', {
            fromToken: fromToken.symbol,
            toToken: toToken.symbol
        });

        return true;
    } catch (error) {
        // Quote failed: not swappable
        setPairStatus(fromToken.address, toToken.address, chainId, false);
        logger.info('[tokenPairCache] Pair is not swappable:', {
            fromToken: fromToken.symbol,
            toToken: toToken.symbol,
            reason: error.message
        });

        return false;
    }
}

/**
 * Clear all cached token pair data
 * Useful for testing or manual cache reset
 */
export function clearAllCache() {
    try {
        const keys = Object.keys(localStorage);
        const cacheKeys = keys.filter(k => k.startsWith(CACHE_KEY_PREFIX));

        cacheKeys.forEach(key => {
            localStorage.removeItem(key);
        });

        logger.debug('[tokenPairCache] Cleared', cacheKeys.length, 'entries');
    } catch (error) {
        logger.warn('[tokenPairCache] Error clearing cache:', error);
    }
}

/**
 * Get cache statistics for debugging
 * @returns {Object} Cache stats
 */
export function getCacheStats() {
    try {
        const keys = Object.keys(localStorage);
        const cacheKeys = keys.filter(k => k.startsWith(CACHE_KEY_PREFIX));
        const now = Date.now();

        let validEntries = 0;
        let expiredEntries = 0;

        cacheKeys.forEach(key => {
            try {
                const entry = JSON.parse(localStorage.getItem(key));
                if (now - entry.timestamp <= CACHE_TTL_MS) {
                    validEntries++;
                } else {
                    expiredEntries++;
                }
            } catch {
                expiredEntries++;
            }
        });

        return {
            totalEntries: cacheKeys.length,
            validEntries,
            expiredEntries,
            ttlMs: CACHE_TTL_MS,
            ttlHours: CACHE_TTL_MS / 3600000
        };
    } catch (error) {
        logger.warn('[tokenPairCache] Error getting stats:', error);
        return null;
    }
}
