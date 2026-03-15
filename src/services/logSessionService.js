import { ethers } from 'ethers';

/**
 * LogSessionService
 * Manages the signing of logs using the dynamic session established by the main API client.
 * This avoids multiple syncs and ensures consistency.
 */
class LogSessionService {
    constructor() {
        this.secret = import.meta.env.VITE_API_SECRET || '';
    }

    /**
     * Updates the secret if needed. Usually static in this simple model.
     */
    setSession(sessionId, signatureKey, expiry) {
        // No longer using dynamic session keys, but keeping signature for compatibility if needed elsewhere
        if (signatureKey) this.secret = signatureKey;
    }

    /**
     * Signs a log payload using HMAC-SHA256
     * @param {Object} body 
     * @returns {Object|null} { signature, timestamp, sessionId } or null if no session
     */
    async signPayload(body) {
        const secret = this.secret || import.meta.env.VITE_API_SECRET;
        if (!secret) {
            return null;
        }

        const timestamp = Date.now().toString();
        const bodyString = JSON.stringify(body);

        try {
            // Compute HMAC using ethers
            const signature = ethers.computeHmac(
                'sha256',
                ethers.hexlify(ethers.toUtf8Bytes(secret)),
                ethers.toUtf8Bytes(timestamp + bodyString)
            );

            return {
                signature,
                timestamp
            };
        } catch (err) {
            console.error('[LogSession] Signing error:', err);
            return null;
        }
    }

    reset() {
        // No-op in static mode
    }
}

export const logSessionService = new LogSessionService();
