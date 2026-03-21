const STORAGE_KEY = 'lilswap-token-selection-memory';
const SELECTION_TTL = 30 * 60 * 1000; // 30 minutes

interface SelectionEntry {
    address: string;
    timestamp: number;
}

interface SelectionMemory {
    [chainId: number]: {
        [modalType: string]: SelectionEntry;
    }
}

export const saveTokenSelection = (chainId: number, modalType: string, address: string) => {
    if (!chainId || !modalType || !address) return;

    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const data: SelectionMemory = raw ? JSON.parse(raw) : {};
        
        if (!data[chainId]) {
            data[chainId] = {};
        }
        
        data[chainId][modalType] = {
            address: address.toLowerCase(),
            timestamp: Date.now()
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
        console.warn('[SelectionMemory] Failed to save selection', e);
    }
};

export const getSavedTokenSelection = (chainId: number, modalType: string): string | null => {
    if (!chainId || !modalType) return null;

    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        
        const data: SelectionMemory = JSON.parse(raw);
        const entry = data[chainId]?.[modalType];
        
        if (!entry) return null;

        // Check for expiration
        if (Date.now() - entry.timestamp > SELECTION_TTL) {
            return null;
        }

        return entry.address;
    } catch (e) {
        console.warn('[SelectionMemory] Failed to get selection', e);
        return null;
    }
};
