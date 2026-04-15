import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { verifyDonationByHash } from '../services/api';
import { useToast } from './toast-context';

export interface TrackedState {
    status: 'idle' | 'loading' | 'pending' | 'success' | 'error' | 'already_donator';
    message?: string;
    txHash: string;
    chainId: number;
    chainNote?: string;
}

interface TrackedDonation {
    txHash: string;
    chainId: number;
    walletAddress?: string;
    startedAt: number;
}

interface DonationVerificationContextType {
    trackDonation: (params: { txHash: string; chainId: number; walletAddress?: string }) => void;
    statuses: Record<string, TrackedState>;
}

const DonationVerificationContext = createContext<DonationVerificationContextType | undefined>(undefined);

export const useDonationVerification = () => {
    const context = useContext(DonationVerificationContext);
    if (!context) throw new Error('useDonationVerification must be used within a DonationVerificationProvider');
    return context;
};

// Frontend polls at a faster pace — it just asks the backend "is it done yet?"
const POLL_INTERVAL_MS = 5_000;
// Frontend gives up after 5 minutes; the backend keeps going for 10 min on its own.
const MAX_POLL_DURATION_MS = 5 * 60 * 1000;

export const DonationVerificationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const { addToast } = useToast();
    const [tracked, setTracked] = useState<TrackedDonation[]>([]);
    const [statuses, setStatuses] = useState<Record<string, TrackedState>>({});
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const trackDonation = useCallback(
        ({ txHash, chainId, walletAddress }: { txHash: string; chainId: number; walletAddress?: string }) => {
            const key = txHash.toLowerCase();
            setTracked((prev) => {
                if (prev.some((d) => d.txHash === key)) return prev;
                return [...prev, { txHash: key, chainId, walletAddress, startedAt: Date.now() }];
            });
            setStatuses((prev) => ({
                ...prev,
                [key]: { status: 'loading', txHash: key, chainId, message: 'Verifying...' }
            }));
        },
        []
    );

    useEffect(() => {
        if (tracked.length === 0) {
            if (timerRef.current) {
                clearInterval(timerRef.current);
                timerRef.current = null;
            }
            return;
        }

        const poll = async () => {
            const now = Date.now();
            const expired: string[] = [];
            const succeeded: string[] = [];

            for (const donation of tracked) {
                // Drop entries the frontend has been watching too long — the backend still runs
                if (now - donation.startedAt > MAX_POLL_DURATION_MS) {
                    expired.push(donation.txHash);
                    setStatuses(prev => ({
                        ...prev, [donation.txHash]: { ...prev[donation.txHash], status: 'error', message: 'Verification timed out locally. It may still be verified in the background.' }
                    }));
                    continue;
                }

                try {
                    const response = await verifyDonationByHash({
                        txHash: donation.txHash,
                        chainId: donation.chainId,
                        walletAddress: donation.walletAddress,
                    });

                    // Even if API returns 202, it resolves cleanly. We must check verified!
                    if (!response?.verified) {
                        throw { response: { data: response } };
                    }

                    succeeded.push(donation.txHash);
                    
                    if (response.alreadyDonator) {
                        setStatuses(prev => ({
                            ...prev, [donation.txHash]: { ...prev[donation.txHash], status: 'already_donator', message: response.message || 'Already a donator.' }
                        }));
                    } else {
                        setStatuses(prev => ({
                            ...prev, [donation.txHash]: { ...prev[donation.txHash], status: 'success', message: 'Donation verified successfully.', chainNote: response.chainNote }
                        }));
                        addToast({
                            title: 'Donation verified!',
                            message: 'Your 10% donor discount is now active.',
                            type: 'success',
                        });
                        // Notify any position refresh listeners to update the donator tag
                        window.dispatchEvent(new CustomEvent('lilswap:refresh-positions', {
                            detail: { txHash: donation.txHash, reason: 'donation_verified' }
                        }));
                    }
                    
                } catch (err: any) {
                    const payload = err?.response?.data;
                    const isPending = payload?.status === 'pending';

                    if (isPending) {
                        setStatuses(prev => ({
                            ...prev, [donation.txHash]: { ...prev[donation.txHash], status: 'pending', message: payload?.message || 'Verification is in progress...' }
                        }));
                        continue;
                    }

                    // Any hard error (404 not_found, 422 invalid) → stop watching
                    expired.push(donation.txHash);
                    setStatuses(prev => ({
                        ...prev, [donation.txHash]: { ...prev[donation.txHash], status: 'error', message: payload?.message || 'Verification failed.' }
                    }));
                }
            }

            if (succeeded.length > 0 || expired.length > 0) {
                const done = new Set([...succeeded, ...expired]);
                setTracked((prev) => prev.filter((d) => !done.has(d.txHash)));
            }
        };

        timerRef.current = setInterval(poll, POLL_INTERVAL_MS);
        // Run immediately on first mount / when tracked changes
        void poll();

        return () => {
            if (timerRef.current) {
                clearInterval(timerRef.current);
                timerRef.current = null;
            }
        };
    }, [tracked, addToast]);

    return (
        <DonationVerificationContext.Provider value={{ trackDonation, statuses }}>
            {children}
        </DonationVerificationContext.Provider>
    );
};
