import axios from 'axios';
import { ethers } from 'ethers';
import logger from '../utils/logger';
import { notifyApiVersion, notifyApiStatus } from '../context/ApiMetaContext.jsx';
import { logSessionService } from './logSessionService';

// Axios instance configured for the backend
export const apiClient = axios.create({
    baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3001/v1',
    headers: {
        'Content-Type': 'application/json',
    },
    timeout: 45000,
});

// Session state (In-memory only for security)
let currentSession = {
    sessionId: null,
    signatureKey: null,
    expiry: 0,
    isInitializing: false,
    initPromise: null
};

// Event labels
export const SESSION_EXPIRED_EVENT = 'lilswap:session_expired';

/**
 * Returns current session snapshots (read-only)
 */
export const getSessionData = () => ({ ...currentSession });

/**
 * Initializes a secure session with the backend using Turnstile
 * @param {string} turnstileToken - Token from CF Turnstile widget
 * @returns {Promise<Object>} Session data
 */
export const initializeSecureSession = async (turnstileToken = null) => {
    // If already initializing, return the existing promise
    if (currentSession.isInitializing) return currentSession.initPromise;

    currentSession.isInitializing = true;
    currentSession.initPromise = (async () => {
        try {
            // In dev mode without keys, we can skip token if backend allows
            const response = await apiClient.post('/auth/session', { 
                turnstileToken,
                // Dev hint for backend to allow bypass if configured
                isDev: import.meta.env.DEV 
            }, { 
                // Don't use the interceptor for the auth call to avoid recursion
                _skipAuthInterceptor: true 
            });

            currentSession = {
                sessionId: response.data.sessionId,
                signatureKey: response.data.signatureKey,
                expiry: response.data.expiry,
                isInitializing: false,
                initPromise: null
            };

            // Propagate session to logSessionService
            logSessionService.setSession(
                currentSession.sessionId, 
                currentSession.signatureKey, 
                currentSession.expiry
            );

            return currentSession;
        } catch (error) {
            currentSession.isInitializing = false;
            currentSession.initPromise = null;
            throw error;
        }
    })();

    return currentSession.initPromise;
};

// Add request interceptor for logging and security signing
apiClient.interceptors.request.use(
    async (config) => {
        // Skip auth for internal handshake or if explicitly requested
        if (config._skipAuthInterceptor || config.url === '/auth/session') {
            return config;
        }

        // Use dynamic session signing if available
        if (currentSession.sessionId && currentSession.signatureKey) {
            const timestamp = Date.now().toString();
            const hasBody = config.data && Object.keys(config.data).length > 0;
            const bodyString = hasBody ? JSON.stringify(config.data) : '';
            
            try {
                const signature = ethers.computeHmac(
                    'sha256',
                    ethers.hexlify(ethers.toUtf8Bytes(currentSession.signatureKey)),
                    ethers.toUtf8Bytes(timestamp + bodyString)
                );
                
                config.headers['X-Internal-Signature'] = signature;
                config.headers['X-Internal-Timestamp'] = timestamp;
                config.headers['X-Session-Id'] = currentSession.sessionId;
            } catch (err) {
                // Fail silently
            }
        }

        logger.api(config.method?.toUpperCase() || 'REQUEST', config.url, config.data);
        return config;
    },
    (error) => {
        logger.error('API Request Error', error);
        return Promise.reject(error);
    }
);

// Add retry interceptor
apiClient.interceptors.response.use(
    (response) => {
        // Passively capture the API version from any successful response
        const v = response.headers?.['x-api-version'];
        if (v) notifyApiVersion(v);
        notifyApiStatus(true);
        return response;
    },
    async (error) => {
        const config = error.config;

        // Retry logic for rate limits and network errors
        if (!config || !config.retry) {
            config.retry = { count: 0, maxRetries: 2, delay: 1000 };
        }

        const shouldRetry =
            config.retry.count < config.retry.maxRetries &&
            (error.response?.status === 429 || // Too Many Requests
                error.response?.status === 503 || // Service Unavailable
                error.code === 'ECONNABORTED' ||  // Timeout
                error.message?.includes('rate limit'));

        if (shouldRetry) {
            config.retry.count++;
            const delay = config.retry.delay * Math.pow(2, config.retry.count - 1);

            logger.warn(`API Retry ${config.retry.count}/${config.retry.maxRetries} - Waiting ${delay}ms`, {
                url: config.url,
                status: error.response?.status,
                error: error.message
            });

            await new Promise(resolve => setTimeout(resolve, delay));
            return apiClient(config);
        }

        // Ignore canceled/aborted requests (expected when switching tokens)
        if (error.code === 'ERR_CANCELED' || error.name === 'CanceledError' || error.name === 'AbortError' || error.message === 'canceled') {
            return Promise.reject(error);
        }

        // Detect session expiry (401 Unauthorized with an existing session)
        if (error.response?.status === 401 && currentSession.sessionId && !config._skipAuthInterceptor) {
            
            // Clear current session
            currentSession = {
                sessionId: null,
                signatureKey: null,
                expiry: 0,
                isInitializing: false,
                initPromise: null
            };

            // Reset log service
            logSessionService.setSession(null, null, 0);

            // Broadcast event for UI to react (e.g., TurnstileGuard)
            window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
        }

        logger.error('API Request Failed', {
            url: config?.url,
            method: config?.method,
            status: error.response?.status
        });

        // If it's a network error or 5xx error, mark API as down
        if (!error.response || error.response.status >= 500 || error.code === 'ECONNABORTED') {
            notifyApiStatus(false);
        }

        return Promise.reject(error);
    }
);

/**
 * Get quote for Debt Swap
 * @param {Object} params - Quote parameters
 * @param {Object} params.fromToken - Source token (current debt): { address, decimals, symbol }
 * @param {Object} params.toToken - Destination token (new debt): { address, decimals, symbol }
 * @param {string} params.destAmount - Destination amount in string (wei)
 * @param {string} params.userAddress - Adapter address
 * @param {string} params.walletAddress - Actual user wallet address
 * @param {number} params.chainId - Chain ID
 * @returns {Promise<Object>} Quote data (priceRoute, srcAmount, version, augustus)
 */
export const getDebtQuote = async (params, signal = null) => {
    try {
        const response = await apiClient.post('/quote/debt', params, { signal });
        logger.debug('Debt quote received', { srcAmount: response.data.srcAmount });
        return response.data;
    } catch (error) {
        if (axios.isCancel(error)) {
            logger.debug('Debt quote request cancelled');
            throw error; // Let the caller handle or ignore
        }
        const data = error.response?.data;
        const errorMessage = data?.userMessage || data?.message || data?.error || error.message || 'Error fetching quote';
        logger.error('Failed to get debt quote', { error: errorMessage, details: data });
        throw new Error(errorMessage);
    }
};

/**
 * Build Debt Swap transaction via ParaSwap
 * @param {Object} params - Transaction parameters
 * @param {Object} params.priceRoute - ParaSwap route obtained from the quote
 * @param {string} params.srcAmount - Source amount in string (wei)
 * @param {string} params.destAmount - Destination amount in string (wei)
 * @param {Object} params.fromToken - Source token data (address, decimals, symbol)
 * @param {Object} params.toToken - Destination token data (address, decimals, symbol)
 * @param {string} params.userAddress - Adapter address
 * @param {string} params.walletAddress - Actual user wallet address
 * @param {number} params.slippageBps - Slippage in basis points (e.g., 100 = 1%)
 * @param {number} params.chainId - Chain ID
 * @returns {Promise<Object>} Transaction data (to, data, value, gasLimit)
 */
export const buildDebtSwapTx = async (params) => {
    try {
        const response = await apiClient.post('/build/debt/paraswap', params);
        logger.debug('Debt swap transaction built', { to: response.data.to });
        return response.data;
    } catch (error) {
        const data = error.response?.data;
        const errorMessage = data?.userMessage || data?.message || data?.error || error.message || 'Error building transaction';
        logger.error('Failed to build debt swap transaction', { error: errorMessage, details: data });
        throw new Error(errorMessage);
    }
};

/**
 * Fetch aggregated user positions (supplies and borrows) from Aave
 * @param {string} walletAddress - User wallet address
 * @param {number} chainId - Chain ID
 * @returns {Promise<Object>} Aggregated position data
 */
export const getUserPosition = async (walletAddress, chainId) => {
    try {
        const response = await apiClient.post('/position', {
            walletAddress,
            chainId
        });

        // The backend now wraps even single-chain queries with the chainId key for consistency
        const positionData = response.data[chainId] || response.data;

        logger.debug('User position fetched', {
            supplies: positionData.supplies?.length || 0,
            borrows: positionData.borrows?.length || 0
        });
        return positionData;
    } catch (error) {
        const errorMessage = error.response?.data?.error || error.message || 'Error fetching position';
        logger.error('Failed to fetch user position', { error: errorMessage });
        throw new Error(errorMessage);
    }
};

/**
 * Get quote for Collateral Swap (ExactIn)
 * @param {Object} params - Quote parameters
 * @param {Object} params.fromToken - Source token (current collateral): { address, decimals, symbol }
 * @param {Object} params.toToken - Destination token (new collateral): { address, decimals, symbol }
 * @param {string} params.srcAmount - Source amount in string (wei)
 * @param {string} params.userAddress - Adapter address
 * @param {string} params.walletAddress - Actual user wallet address
 * @param {number} params.chainId - Chain ID
 * @returns {Promise<Object>} Quote data (priceRoute, destAmount, version, augustus)
 */
export const getCollateralQuote = async (params, signal = null) => {
    try {
        const response = await apiClient.post('/quote/collateral', params, { signal });
        logger.debug('Collateral quote received', { destAmount: response.data.destAmount });
        return response.data;
    } catch (error) {
        if (axios.isCancel(error)) {
            logger.debug('Collateral quote request cancelled');
            throw error; // Let the caller handle or ignore
        }
        const data = error.response?.data;
        const errorMessage = data?.userMessage || data?.message || data?.error || error.message || 'Error fetching collateral quote';
        logger.error('Failed to get collateral quote', { error: errorMessage, details: data });
        throw new Error(errorMessage);
    }
};

/**
 * Build Collateral Swap transaction via ParaSwap
 * @param {Object} params - Transaction parameters
 * @param {Object} params.priceRoute - ParaSwap route obtained from the quote
 * @param {string} params.srcAmount - Source amount in string (wei)
 * @param {boolean} params.isMaxSwap - Whether it's a full balance swap (requires offset)
 * @param {Object} params.fromToken - Source token data (address, decimals, symbol)
 * @param {Object} params.toToken - Destination token data (address, decimals, symbol)
 * @param {string} params.userAddress - Adapter address
 * @param {string} params.walletAddress - User's wallet address
 * @param {number} params.slippageBps - Slippage in basis points (e.g., 50 = 0.5%)
 * @param {number} params.chainId - Chain ID
 * @returns {Promise<Object>} Transaction data
 */
export const buildCollateralSwapTx = async (params) => {
    try {
        const response = await apiClient.post('/build/collateral/paraswap', params);
        logger.debug('Collateral swap transaction built', { augustus: response.data.augustus });
        return response.data;
    } catch (error) {
        const data = error.response?.data;
        const errorMessage = data?.userMessage || data?.message || data?.error || error.message || 'Error building collateral transaction';
        logger.error('Failed to build collateral swap transaction', { error: errorMessage, details: data });
        throw new Error(errorMessage);
    }
};

export default {
    getDebtQuote,
    buildDebtSwapTx,
    getCollateralQuote,
    buildCollateralSwapTx,
    getUserPosition,
};
