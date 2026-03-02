/**
 * Transactions API Service (Frontend)
 * Communicates with backend to register and track transactions
 */

import logger from '../utils/logger.js';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/v1';

/**
 * Updates backend with txHash after user sends to blockchain
 * @param {number} transactionId - ID returned by buildDebtSwapTx
 * @param {string} txHash - Transaction hash
 * @returns {Promise<boolean>}
 */
export async function recordTransactionHash(transactionId, txHash) {
    try {
        logger.debug('[Transactions] Sending hash to backend', { transactionId, txHash });
        const response = await fetch(`${API_URL}/transactions/${transactionId}/send-hash`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ txHash }),
        });

        if (!response.ok) {
            const text = await response.text().catch(() => '');
            logger.warn('[Transactions] Failed to record hash:', response.status, text);
            return false;
        }

        logger.debug('[Transactions] Hash recorded:', { id: transactionId, hash: txHash?.slice(0, 8) });
        return true;
    } catch (error) {
        logger.warn('[Transactions] Error recording hash:', error.message);
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

        const response = await fetch(`${API_URL}/transactions/${transactionId}/confirm`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            logger.warn('[Transactions] Failed to confirm:', response.status);
            return false;
        }

        logger.debug('[Transactions] Confirmed:', { id: transactionId });
        return true;
    } catch (error) {
        logger.warn('[Transactions] Error confirming:', error.message);
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
        const response = await fetch(
            `${API_URL}/transactions/user/${walletAddress}?limit=${limit}`,
            { headers: { 'Content-Type': 'application/json' } }
        );

        if (!response.ok) {
            logger.warn('[Transactions] Failed to fetch history:', response.status);
            return [];
        }

        const data = await response.json();
        return data.transactions || [];
    } catch (error) {
        logger.warn('[Transactions] Error fetching history:', error.message);
        return [];
    }
}


/**
 * Marks a transaction as rejected by user
 */
export async function rejectTransaction(transactionId, reason) {
    try {
        const url = `${API_URL}/transactions/${transactionId}/reject`;
        logger.debug('[Transactions API] calling reject', { url, reason });
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reason })
        });
        if (!res.ok) {
            const text = await res.text().catch(() => '');
            logger.warn('[Transactions API] reject request failed', { status: res.status, body: text });
        }
        return res.ok;
    } catch (err) {
        logger.warn('[Transactions] reject failure', err.message);
        return false;
    }
}

/**
 * Manually marks transaction as failed (debugging/fallback)
 */
export async function failTransaction(transactionId, reason) {
    try {
        const res = await fetch(`${API_URL}/transactions/${transactionId}/fail`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reason })
        });
        return res.ok;
    } catch (err) {
        logger.warn('[Transactions] fail failure', err.message);
        return false;
    }
}
