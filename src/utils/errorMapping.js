/**
 * Error Mapping Utility
 *
 * Maps technical error codes and messages from ParaSwap, Aave, and other services
 * to user-friendly English messages.
 */

const ERROR_MAP = {
    // ParaSwap Errors
    'ESTIMATED_LOSS_GREATER_THAN_MAX_IMPACT': {
        en: 'Swap price impact is too high. You would lose too much value due to low liquidity.'
    },
    'NO_ROUTE': {
        en: 'No profitable route found for this pair. Try a different token or a smaller amount.'
    },
    'INSUFFICIENT_LIQUIDITY': {
        en: 'Insufficient liquidity for this trade. Try a smaller amount.'
    },
    // Generic Errors
    'QUOTE_FAILED': {
        en: 'Failed to fetch quote. Please try again later.'
    }
};

/**
 * Translates a technical error message into a user-friendly one.
 * @param {string} technicalMessage - The raw error message or code.
 * @param {string} locale - The language to translate to ('en' or 'pt').
 * @returns {string} The translated message.
 */
export const mapErrorToUserFriendly = (technicalMessage, locale = 'en') => {
    if (!technicalMessage) return null;

    // Check for direct matches in ERROR_MAP
    for (const [key, pair] of Object.entries(ERROR_MAP)) {
        if (technicalMessage.includes(key)) {
            return pair[locale] || pair.en;
        }
    }

    // Fallback logic for common phrases
    if (technicalMessage.toLowerCase().includes('user rejected')) {
        return 'Transaction cancelled by user.';
    }

    if (technicalMessage.toLowerCase().includes('insufficient funds')) {
        return 'Insufficient funds for gas.';
    }

    return technicalMessage; // Fallback to original if no mapping found
};
