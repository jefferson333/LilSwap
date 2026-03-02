import React, { createContext, useContext, useState, useCallback } from 'react';

const ApiMetaContext = createContext({ apiVersion: null, isApiUp: true });

let _setApiVersion = null;
let _setIsApiUp = null;

/**
 * Called by the axios interceptor on every successful response.
 * Kept outside React so it's callable without a hook.
 */
export const notifyApiVersion = (version) => {
    if (_setApiVersion) _setApiVersion(version);
};

export const notifyApiStatus = (isUp) => {
    if (_setIsApiUp) _setIsApiUp(isUp);
};

export const ApiMetaProvider = ({ children }) => {
    const [apiVersion, setApiVersion] = useState(null);
    const [isApiUp, setIsApiUp] = useState(true);

    // Expose the setter so the interceptor can call it
    _setApiVersion = useCallback((v) => {
        setApiVersion(prev => (prev === v ? prev : v));
    }, []);

    _setIsApiUp = useCallback((status) => {
        setIsApiUp(prev => (prev === status ? prev : status));
    }, []);

    return (
        <ApiMetaContext.Provider value={{ apiVersion, isApiUp }}>
            {children}
        </ApiMetaContext.Provider>
    );
};

export const useApiMeta = () => useContext(ApiMetaContext);
