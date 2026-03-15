import React, { useEffect, useRef, useState } from 'react';
import { initializeSecureSession, getSessionData, SESSION_EXPIRED_EVENT } from '../services/api';
import logger from '../utils/logger';

const TurnstileGuard = ({ children }) => {
    const [isReady, setIsReady] = useState(false);
    const [error, setError] = useState(null);
    const widgetRef = useRef(null);
    const containerRef = useRef(null);

    const siteKey = import.meta.env.VITE_CLOUDFLARE_TURNSTILE_SITE_KEY || '1x00000000000000000000AA'; // Dummy for testing

    useEffect(() => {
        // Dev bypass if configured
        const shouldSkip = import.meta.env.DEV && (
            import.meta.env.VITE_SKIP_SECURITY_CHALLENGE === 'true' ||
            !import.meta.env.VITE_CLOUDFLARE_TURNSTILE_SITE_KEY
        );

        if (shouldSkip) {
            initializeSecureSession().then(() => setIsReady(true)).catch(() => {
                setIsReady(true); // Proceed anyway in dev
            });
            return;
        }

        const handleReset = () => {
            setIsReady(false);
            setError(null);
            if (widgetRef.current && window.turnstile) {
                window.turnstile.reset(widgetRef.current);
            }
        };

        const renderWidget = () => {
            if (!window.turnstile) {
                setTimeout(renderWidget, 500);
                return;
            }

            try {
                widgetRef.current = window.turnstile.render(containerRef.current, {
                    sitekey: siteKey,
                    callback: async (token) => {
                        try {
                            await initializeSecureSession(token);
                            setIsReady(true);
                        } catch (err) {
                            setError('Failed to establish secure session. Please refresh.');
                        }
                    },
                    'error-callback': () => {
                        setError('Security check failed. Check your connection or refresh the page.');
                    },
                    'expired-callback': () => {
                        handleReset();
                    },
                    theme: 'dark',
                    appearance: 'always',
                    size: 'normal'
                });
            } catch (err) {
                // Fail silently
            }
        };

        // Reactive: Global session expired event
        window.addEventListener(SESSION_EXPIRED_EVENT, handleReset);

        // Proactive: Tab visibility check
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                const session = getSessionData();
                // If we have a session but it's expired or about to (10s buffer)
                if (session.sessionId && Date.now() > (session.expiry - 10000)) {
                    handleReset();
                }
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);

        // Wait for script to be ready
        const initializeTurnstile = () => {
            if (window.turnstile) {
                window.turnstile.ready(renderWidget);
            } else {
                // Fallback for extreme cases where ready is callled before object exists
                const checkTurnstile = setInterval(() => {
                    if (window.turnstile) {
                        clearInterval(checkTurnstile);
                        window.turnstile.ready(renderWidget);
                    }
                }, 100);
                return () => clearInterval(checkTurnstile);
            }
        };

        const cleanup = initializeTurnstile();

        return () => {
            window.removeEventListener(SESSION_EXPIRED_EVENT, handleReset);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            if (widgetRef.current && window.turnstile) {
                window.turnstile.remove(widgetRef.current);
            }
        };
    }, []);

    if (error) {
        return (
            <div className="fixed inset-0 glass-effect bg-white/40 dark:bg-background-dark/80 flex items-center justify-center z-9999 backdrop-blur-md p-4 transition-all duration-500">
                <div className="bg-white/80 dark:bg-background-dark border border-red-500/30 dark:border-red-500/50 rounded-3xl p-8 max-w-sm text-center shadow-2xl transform transition-transform animate-in fade-in zoom-in duration-300">
                    <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-500/20">
                        <span className="text-red-500 text-2xl">⚠️</span>
                    </div>
                    <h2 className="text-xl font-bold text-red-600 dark:text-red-400 mb-3">Security Error</h2>
                    <p className="text-red-900/70 dark:text-red-200/50 mb-8 text-sm leading-relaxed">{error}</p>
                    <button
                        onClick={() => window.location.reload()}
                        className="w-full bg-red-500 hover:bg-red-600 text-white font-bold py-3.5 px-8 rounded-2xl transition-all active:scale-95 shadow-xl shadow-red-500/25"
                    >
                        Refresh Page
                    </button>
                </div>
            </div>
        );
    }

    return (
        <>
            <div ref={containerRef} className="hidden"></div>
            {isReady ? children : (
                <div className="fixed inset-0 bg-white/40 backdrop-blur-md dark:bg-background-dark dark:backdrop-blur-none flex flex-col items-center justify-center z-9998 transition-colors duration-300">
                    <div className="w-12 h-12 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin mb-4"></div>
                    <p className="text-indigo-900/60 dark:text-indigo-300/50 text-sm font-semibold tracking-wider uppercase animate-pulse">Securing Connection</p>
                </div>
            )}
        </>
    );
};

export default TurnstileGuard;
