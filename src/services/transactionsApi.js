/**
 * Transactions API Service (Frontend)
 * Communicates with backend to register and track transactions
 */

import logger from '../utils/logger.js';
import { apiClient } from './api.js';

/**
 * Updates backend with txHash after user sends to blockchain
 * @param {number} transactionId - ID returned by buildDebtSwapTx
 * @param {string} txHash - Transaction hash
 * @returns {Promise<boolean>}
 */
export async function recordTransactionHash(transactionId, txHash) {
    try {
        logger.debug('[Transactions] Sending hash to backend', { transactionId, txHash });
        const response = await apiClient.post(`/transactions/${transactionId}/send-hash`, { txHash });

        logger.debug('[Transactions] Hash recorded:', { id: transactionId, hash: txHash?.slice(0, 8) });
        return true;
    } catch (error) {
        const data = error.response?.data;
        const status = error.response?.status;
        logger.warn('[Transactions] Error recording hash:', status, data || error.message);
        return false;
    }
}

/**
 * Confirms the transaction on backend after on-chain confirmation
 * @param {number} transactionId
 * @param {Object} confirmData
 * @param {number} confirmData.gasUsed
 * @param {number} confirmData.actualPaid - Actual debt amount paid (wei)
 * @returns {Promise<boolean>}
 */
export async function confirmTransactionOnChain(transactionId, confirmData) {
    try {
        const payload = {
            gasUsed: confirmData.gasUsed,
            actualPaid: confirmData.actualPaid,
            // optional fields
            srcActualAmount: confirmData.srcActualAmount || null,
            collectorAmount: confirmData.collectorAmount || null,
            priceImplicitUsd: confirmData.priceImplicitUsd || null,
            apyPercent: confirmData.apyPercent || null,
            gasPrice: confirmData.gasPrice || null,
            txFee: confirmData.txFee || null
        };

        await apiClient.post(`/transactions/${transactionId}/confirm`, payload);

        logger.debug('[Transactions] Confirmed:', { id: transactionId });
        return true;
    } catch (error) {
        logger.warn('[Transactions] Error confirming:', error.response?.status || error.message);
        return false;
    }
}

/**
 * Gets user transaction history
 * @param {string} walletAddress
 * @param {number} limit
 * @returns {Promise<Array>}
 */
export async function getUserTransactionHistory(walletAddress, limit = 50) {
    try {
        const response = await apiClient.get(`/transactions/user/${walletAddress}`, {
            params: { limit }
        });
        return response.data.transactions || [];
    } catch (error) {
        logger.warn('[Transactions] Error fetching history:', error.response?.status || error.message);
        return [];
    }
}


/**
 * Marks a transaction as rejected by user
 */
export async function rejectTransaction(transactionId, reason) {
    try {
        await apiClient.post(`/transactions/${transactionId}/reject`, { reason });
        return true;
    } catch (err) {
        logger.warn('[Transactions] reject failure', err.response?.status || err.message);
        return false;
    }
}

/**
 * Manually marks transaction as failed (debugging/fallback)
 */
export async function failTransaction(transactionId, reason) {
    try {
        await apiClient.post(`/transactions/${transactionId}/fail`, { reason });
        return true;
    } catch (err) {
        logger.warn('[Transactions] fail failure', err.response?.status || err.message);
        return false;
    }
}
