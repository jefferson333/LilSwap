import { CheckCircle2, Copy, ExternalLink, Hash, Info, Search, Wallet } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { useToast } from '../contexts/toast-context';
import { useWeb3 } from '../contexts/web3-context';
import { useDonationVerification } from '../contexts/donation-verification-context';
import {
    DONATION_CHAINS,
    DonationTokenKey,
    getDonationAssetConfig,
    getDonationChainConfig,
    getDonationMarket,
} from '../constants/donations';
import { verifyDonationByHash, verifyDonationByWallet } from '../services/api';
import { mapErrorToUserFriendly } from '../utils/error-mapping';
import { normalizeDecimalInput } from '../utils/normalize-decimal-input';
import { getTokenLogo } from '../utils/get-token-logo';
import { Modal } from './modal';
import { Button } from './ui/button';
import { DatePicker } from './ui/date-picker';

interface VerifyDonationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onVerified?: () => void | Promise<void>;
    initialHash?: string | null;
    initialChainId?: number | null;
    onOpenDonate?: () => void;
}

type Step = 'hash' | 'wallet';

type VerifyStatus = {
    kind: 'idle' | 'loading' | 'success' | 'pending' | 'error' | 'already_donator';
    message: string;
    txHash?: string | null;
    chainId?: number | null;
};

const truncate = (value: string) => `${value.slice(0, 10)}...${value.slice(-8)}`;

const getErrorMessage = (error: any) => {
    const raw = error?.response?.data?.message || error?.shortMessage || error?.message || 'Request failed.';
    return mapErrorToUserFriendly(raw) || raw;
};

const TX_HASH_REGEX = /^0x([A-Fa-f0-9]{64})$/;

const TOKEN_SORT_WEIGHT: Record<string, number> = { usdc: 0, usdt: 1, native: 2 };

const NetworkSelector: React.FC<{
    selectedChainId: number;
    onChange: (chainId: number) => void;
}> = ({ selectedChainId, onChange }) => (
    <div className="flex flex-wrap gap-2">
        {DONATION_CHAINS.map((chain) => (
            <Button
                key={chain.chainId}
                type="button"
                onClick={() => onChange(chain.chainId)}
                variant={selectedChainId === chain.chainId ? 'default' : 'ghost'}
                className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-semibold transition ${selectedChainId === chain.chainId
                        ? 'border-transparent text-white shadow-[0_10px_30px_-18px_rgba(111,76,255,0.95)]'
                        : 'border-transparent bg-transparent text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800/70'
                    }`}
            >
                {getDonationMarket(chain.chainId)?.icon && (
                    <img
                        src={getDonationMarket(chain.chainId)?.icon}
                        alt={chain.label}
                        className="h-4 w-4 shrink-0 rounded-full"
                        onError={(e) => (e.currentTarget.style.display = 'none')}
                    />
                )}
                {chain.label}
            </Button>
        ))}
    </div>
);

export const VerifyDonationModal: React.FC<VerifyDonationModalProps> = ({ isOpen, onClose, onVerified, initialHash, initialChainId, onOpenDonate }) => {
    const { addToast } = useToast();
    const { statuses, trackDonation } = useDonationVerification();
    const { account } = useWeb3();

    const [step, setStep] = useState<Step>('hash');
    const [copiedContent, setCopiedContent] = useState<string | null>(null);
    const [status, setStatus] = useState<VerifyStatus>({ kind: 'idle', message: '' });

    // Hash step
    const [txHash, setTxHash] = useState('');
    const [hashChainId, setHashChainId] = useState<number>(8453);
    const txHashValid = TX_HASH_REGEX.test(txHash.trim());

    // Wallet step
    const [walletAddress, setWalletAddress] = useState('');
    const [selectedChainId, setSelectedChainId] = useState<number>(8453);
    const [selectedTokenKey, setSelectedTokenKey] = useState<DonationTokenKey>('usdc');
    const [approximateSentAt, setApproximateSentAt] = useState<Date | undefined>(undefined);

    // In auto mode, show the rolling UI as long as we were given an initial hash
    const isAutoMode = !!initialHash;

    const availableTokens = useMemo(() => {
        const chain = DONATION_CHAINS.find((c) => c.chainId === selectedChainId);
        return [...(chain?.assets || [])].sort((a, b) => (TOKEN_SORT_WEIGHT[a.tokenKey] ?? 99) - (TOKEN_SORT_WEIGHT[b.tokenKey] ?? 99));
    }, [selectedChainId]);

    useEffect(() => {
        if (isOpen && account) setWalletAddress(account);
    }, [isOpen, account]);

    useEffect(() => {
        if (!isOpen) {
            setStep('hash');
            setTxHash('');
            setStatus({ kind: 'idle', message: '' });
            setWalletAddress('');
        }
    }, [isOpen]);

    // Sync from global status!
    useEffect(() => {
        if (!isOpen || !txHash) return;
        const trackedStatus = statuses[txHash.toLowerCase()];
        if (!trackedStatus) return;

        // If the context status has changed, flush to local modal state
        setStatus({
            kind: trackedStatus.status as VerifyStatus['kind'], // 'loading', 'pending', 'success', 'error', 'already_donator'
            message: trackedStatus.message || '',
            txHash: trackedStatus.txHash,
            chainId: trackedStatus.chainId,
        });

        if (trackedStatus.status === 'success' || trackedStatus.status === 'already_donator') {
            if (onVerified) onVerified();
        }
    }, [statuses, txHash, isOpen, onVerified]);

    // When modal opens with initialHash, trigger auto-verify via Context
    useEffect(() => {
        if (isOpen && initialHash) {
            setTxHash(initialHash.trim());
            setHashChainId(initialChainId ?? 8453);
            trackDonation({ txHash: initialHash.trim(), chainId: initialChainId ?? 8453, walletAddress: account || undefined });
        }
    }, [isOpen, initialHash, initialChainId, account, trackDonation]);

    useEffect(() => {
        if (!availableTokens.find((t) => t.tokenKey === selectedTokenKey)) {
            setSelectedTokenKey(availableTokens[0]?.tokenKey ?? 'usdc');
        }
    }, [availableTokens, selectedTokenKey]);

    const handleCopy = (text: string) => {
        navigator.clipboard.writeText(text);
        setCopiedContent(text);
        addToast({ title: 'Copied!', message: 'Copied to clipboard.', type: 'success' });
        setTimeout(() => setCopiedContent(null), 2000);
    };

    const handleSuccessfulVerification = async () => {
        addToast({ title: 'Donation verified', message: 'Your 10% donor discount is active.', type: 'success' });
        if (onVerified) await onVerified();
    };

    const handleVerifyByHash = async () => {
        if (!txHashValid) return;
        trackDonation({ txHash: txHash.trim(), chainId: hashChainId });
    };

    const handleVerifyByWallet = async () => {
        if (!walletAddress || !approximateSentAt) return;
        const approximateSentAtIso = approximateSentAt.toISOString();
        const assetConfig = getDonationAssetConfig(selectedChainId, selectedTokenKey);
        if (!assetConfig) return;

        setStatus({ kind: 'loading', message: 'Searching for your donation...' });
        try {
            const response = await verifyDonationByWallet({
                walletAddress: walletAddress.trim(),
                chainId: selectedChainId,
                tokenKey: selectedTokenKey,
                approximateSentAt: approximateSentAtIso,
            });

            if (!response.verified) {
                throw { response: { data: response } };
            }

            const baseMsg = `Donation Verified! Your 10% discount is active!`;
            const fullMsg = response.chainNote ? `${baseMsg}\n${response.chainNote}` : baseMsg;

            setStatus({
                kind: 'success',
                message: fullMsg,
                txHash: response.txHash,
                chainId: response.chainId,
            });
            await handleSuccessfulVerification();
        } catch (error: any) {
            const payload = error?.response?.data;
            const isPending = payload?.status === 'pending';
            setStatus({
                kind: isPending ? 'pending' : 'error',
                message: payload?.message || getErrorMessage(error),
                txHash: payload?.candidates?.[0]?.txHash || null,
                chainId: null,
            });
            addToast({
                title: isPending ? 'Multiple matches' : 'Verification failed',
                message: payload?.message || getErrorMessage(error),
                type: isPending ? 'info' : 'error',
            });
        }
    };

    const explorerHref = status.chainId && status.txHash
        ? `${getDonationMarket(status.chainId)?.explorer}/tx/${status.txHash}`
        : null;

    const isLoading = status.kind === 'loading';
    const isDone = status.kind === 'success' || status.kind === 'already_donator';

    const statusBoxColors: Record<string, string> = {
        success: 'border-green-200 bg-green-50 text-green-800 dark:border-green-900/60 dark:bg-green-950/30 dark:text-green-300',
        already_donator: 'border-green-200 bg-green-50 text-green-800 dark:border-green-900/60 dark:bg-green-950/30 dark:text-green-300',
        pending: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300',
        error: 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300',
        loading: 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300',
        idle: '',
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={(
                <div className="flex items-center gap-2">
                    <Search className="h-5 w-5 text-primary" />
                    <span>Verify your donation</span>
                </div>
            )}
            maxWidth="420px"
            headerBorder={false}
        >
            <div className="flex flex-col gap-4 p-4 pt-2">

                {/* Only show info text and tabs in manual mode */}
                {!isAutoMode && (
                    <>
                        <div className="flex items-start gap-2 text-xs text-slate-500 dark:text-slate-400">
                            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                            <p className="font-medium leading-relaxed">
                                {step === 'hash'
                                    ? 'Select the network and paste your transaction hash to verify your donation.'
                                    : "Don't have the hash? Provide your wallet details and we'll search for it."}
                            </p>
                        </div>

                        {/* Tab switcher */}
                        <div className="flex gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800/60">
                            <button
                                type="button"
                                onClick={() => { setStep('hash'); setStatus({ kind: 'idle', message: '' }); }}
                                className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition ${step === 'hash'
                                        ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
                                        : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                                    }`}
                            >
                                <Hash className="h-3.5 w-3.5" />
                                Tx Hash
                            </button>
                            <button
                                type="button"
                                onClick={() => { setStep('wallet'); setStatus({ kind: 'idle', message: '' }); }}
                                className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition ${step === 'wallet'
                                        ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
                                        : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                                    }`}
                            >
                                <Wallet className="h-3.5 w-3.5" />
                                Wallet Details
                            </button>
                        </div>
                    </>
                )}

                {/* ── Rolling / Final State ── */}
                {isAutoMode ? (
                    <div className="flex flex-col items-center gap-6 py-8 text-center">
                        <div className="relative">
                            <div className={`flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 transition-all duration-500 ${status.kind === 'loading' || status.kind === 'pending' ? 'animate-pulse scale-110' : ''
                                }`}>
                                {status.kind === 'loading' || status.kind === 'pending' ? (
                                    <Search className="h-10 w-10 text-primary animate-bounce" />
                                ) : status.kind === 'error' ? (
                                    <Info className="h-10 w-10 text-rose-500" />
                                ) : (
                                    <CheckCircle2 className="h-10 w-10 text-green-500" />
                                )}
                            </div>
                            {(status.kind === 'loading' || status.kind === 'pending') && (
                                <div className="absolute -inset-2 animate-ping rounded-full border-2 border-primary/20" />
                            )}
                        </div>

                        <div className="space-y-2">
                            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                                {status.kind === 'loading' || status.kind === 'pending'
                                    ? 'Verifying Donation...'
                                    : status.kind === 'error'
                                        ? 'Verification Result'
                                        : 'Success!'}
                            </h3>
                            <p className="max-w-70 text-sm text-slate-500 dark:text-slate-400">
                                {status.kind === 'loading' || status.kind === 'pending'
                                    ? 'Scanning the network for your transaction record. This usually takes a few seconds.'
                                    : status.message}
                            </p>
                        </div>

                        {status.txHash && (
                            <div className="flex flex-col items-center gap-1.5 rounded-xl bg-slate-50 px-4 py-3 dark:bg-slate-800/40">
                                <span className="text-[11px] font-black uppercase tracking-[0.18em] text-primary/80">Transaction Hash</span>
                                <div className="flex items-center gap-2">
                                    <span className="font-mono text-xs font-medium text-slate-600 dark:text-slate-300">{truncate(status.txHash)}</span>
                                    <button onClick={() => handleCopy(status.txHash!)} className="text-slate-400 hover:text-primary">
                                        <Copy className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                            </div>
                        )}

                        <div className="flex w-full flex-col gap-2 pt-2">
                            {explorerHref && status.kind !== 'loading' && (
                                <a
                                    href={explorerHref}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-white shadow-lg shadow-primary/25 transition hover:bg-primary-hover active:scale-95"
                                >
                                    View on Explorer
                                    <ExternalLink className="h-4 w-4" />
                                </a>
                            )}

                            {(status.kind === 'error' || status.kind === 'pending') && (
                                <Button
                                    variant="ghost"
                                    onClick={() => setStatus({ kind: 'idle', message: '' })}
                                    className="h-11 rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
                                >
                                    Try manual verification
                                </Button>
                            )}

                            {isDone && (
                                <Button
                                    onClick={onClose}
                                    className="h-11 rounded-xl bg-green-600 text-white hover:bg-green-700"
                                >
                                    Done
                                </Button>
                            )}
                        </div>
                    </div>
                ) : (
                    <>
                        {/* ── Hash ── */}
                        {step === 'hash' && (
                            <div className="flex flex-col gap-3">
                                <div className="flex flex-col gap-1.5">
                                    <div className="-mx-4 bg-slate-50 dark:bg-slate-900/40 px-4 py-1.5 border-t border-b border-slate-100 dark:border-slate-800">
                                        <label className="text-[11px] font-black uppercase tracking-[0.18em] text-primary/80 sm:text-xs">
                                            Network <span className="normal-case text-rose-400">*</span>
                                        </label>
                                    </div>
                                    <div className="px-0 pt-1.5">
                                        <NetworkSelector
                                            selectedChainId={hashChainId}
                                            onChange={(id) => { setHashChainId(id); setStatus({ kind: 'idle', message: '' }); }}
                                        />
                                    </div>
                                </div>

                                <div className="flex flex-col gap-1.5">
                                    <div className="-mx-4 bg-slate-50 dark:bg-slate-900/40 px-4 py-1.5 border-t border-b border-slate-100 dark:border-slate-800">
                                        <label className="text-[11px] font-black uppercase tracking-[0.18em] text-primary/80 sm:text-xs">
                                            Transaction Hash
                                        </label>
                                    </div>
                                    <div className="px-0 pt-1.5">
                                        <input
                                            type="text"
                                            value={txHash}
                                            onChange={(e) => { setTxHash(e.target.value); setStatus({ kind: 'idle', message: '' }); }}
                                            placeholder="0x..."
                                            spellCheck={false}
                                            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 font-mono text-xs text-slate-900 placeholder:text-slate-400 focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20 dark:border-slate-700 dark:bg-slate-800/60 dark:text-white dark:placeholder:text-slate-500"
                                        />
                                        {txHash && !txHashValid && (
                                            <p className="mt-1 text-xs text-rose-500">Please enter a valid transaction hash (0x + 64 hex characters).</p>
                                        )}
                                    </div>
                                </div>

                                <div className="flex-1 min-h-4" />

                                <Button
                                    type="button"
                                    onClick={handleVerifyByHash}
                                    disabled={!txHashValid || isLoading || isDone}
                                    className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {isLoading ? 'Verifying...' : isDone ? '✓ Verified' : 'Verify donation'}
                                </Button>

                            </div>
                        )}

                        {/* ── Wallet ── */}
                        {step === 'wallet' && (
                            <div className="flex flex-col gap-3">
                                <div className="flex flex-col gap-1.5">
                                    <div className="-mx-4 bg-slate-50 dark:bg-slate-900/40 px-4 py-1.5 border-t border-b border-slate-100 dark:border-slate-800">
                                        <label className="text-[11px] font-black uppercase tracking-[0.18em] text-primary/80 sm:text-xs">Network</label>
                                    </div>
                                    <div className="px-0 pt-1.5">
                                        <NetworkSelector selectedChainId={selectedChainId} onChange={(id) => { setSelectedChainId(id); setStatus({ kind: 'idle', message: '' }); }} />
                                    </div>
                                </div>

                                <div className="flex flex-col gap-1.5">
                                    <div className="-mx-4 bg-slate-50 dark:bg-slate-900/40 px-4 py-1.5 border-t border-b border-slate-100 dark:border-slate-800">
                                        <label className="text-[11px] font-black uppercase tracking-[0.18em] text-primary/80 sm:text-xs">Token</label>
                                    </div>
                                    <div className="flex flex-wrap gap-2 px-0 pt-1.5">
                                        {availableTokens.map((token) => (
                                            <Button
                                                key={token.tokenKey}
                                                type="button"
                                                onClick={() => { setSelectedTokenKey(token.tokenKey); setStatus({ kind: 'idle', message: '' }); }}
                                                variant={selectedTokenKey === token.tokenKey ? 'default' : 'ghost'}
                                                className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-semibold transition ${selectedTokenKey === token.tokenKey
                                                        ? 'border-transparent text-white shadow-[0_10px_30px_-18px_rgba(111,76,255,0.95)]'
                                                        : 'border-transparent bg-transparent text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800/70'
                                                    }`}
                                            >
                                                <img
                                                    src={getTokenLogo(token.symbol)}
                                                    alt={token.symbol}
                                                    className="h-4 w-4 shrink-0 rounded-full bg-white/90"
                                                />
                                                {token.symbol}
                                            </Button>
                                        ))}
                                    </div>
                                </div>

                                <div className="flex flex-col gap-1.5">
                                    <div className="-mx-4 bg-slate-50 dark:bg-slate-900/40 px-4 py-1.5 border-t border-b border-slate-100 dark:border-slate-800">
                                        <label className="text-[11px] font-black uppercase tracking-[0.18em] text-primary/80 sm:text-xs">Wallet Address</label>
                                    </div>
                                    <div className="px-0 pt-1.5">
                                        <input
                                            type="text"
                                            value={walletAddress}
                                            onChange={(e) => { setWalletAddress(e.target.value); setStatus({ kind: 'idle', message: '' }); }}
                                            placeholder="0x..."
                                            spellCheck={false}
                                            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 font-mono text-xs text-slate-900 placeholder:text-slate-400 focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20 dark:border-slate-700 dark:bg-slate-800/60 dark:text-white dark:placeholder:text-slate-500"
                                        />
                                    </div>
                                </div>

                                <div className="flex flex-col gap-1.5">
                                    <div className="-mx-4 bg-slate-50 dark:bg-slate-900/40 px-4 py-1.5 border-t border-b border-slate-100 dark:border-slate-800">
                                        <label className="text-[11px] font-black uppercase tracking-[0.18em] text-primary/80 sm:text-xs">Approx. Date</label>
                                    </div>
                                    <div className="px-0 pt-1.5">
                                        <DatePicker
                                            value={approximateSentAt}
                                            onChange={(date) => { setApproximateSentAt(date); setStatus({ kind: 'idle', message: '' }); }}
                                            toDate={new Date()}
                                            placeholder="Select date..."
                                        />
                                    </div>
                                </div>

                                <div className="flex-1 min-h-4" />

                                <Button
                                    type="button"
                                    onClick={handleVerifyByWallet}
                                    disabled={!walletAddress || !approximateSentAt || isLoading || isDone}
                                    className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {isLoading ? 'Searching...' : isDone ? '✓ Verified' : 'Find my donation'}
                                </Button>
                            </div>
                        )}

                        {/* Status Box */}
                        {status.kind !== 'idle' && status.message && (
                            <div className={`rounded-xl border px-4 py-3 text-sm ${statusBoxColors[status.kind] ?? ''}`}>
                                <div className="flex flex-col gap-1">
                                    <p className="whitespace-pre-line font-medium leading-snug">
                                        {status.message}
                                        {isDone && explorerHref && (
                                            <a
                                                href={explorerHref}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="ml-1.5 inline-flex items-center gap-1 text-xs font-semibold underline underline-offset-2 opacity-80 transition hover:opacity-100"
                                            >
                                                View on explorer
                                                <ExternalLink className="h-3 w-3" />
                                            </a>
                                        )}
                                    </p>

                                    {status.txHash && status.kind !== 'success' && status.kind !== 'already_donator' && (
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="font-mono text-xs">{truncate(status.txHash)}</span>
                                            <button
                                                type="button"
                                                onClick={() => handleCopy(status.txHash!)}
                                                className="rounded-lg p-1 transition hover:bg-black/5 dark:hover:bg-white/10"
                                                title="Copy transaction hash"
                                            >
                                                {copiedContent === status.txHash
                                                    ? <CheckCircle2 className="h-4 w-4 text-green-500" />
                                                    : <Copy className="h-4 w-4" />}
                                            </button>
                                            {!isDone && explorerHref && (
                                                <a
                                                    href={explorerHref}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="inline-flex items-center gap-1 text-xs font-semibold underline"
                                                >
                                                    View on explorer
                                                    <ExternalLink className="h-3.5 w-3.5" />
                                                </a>
                                            )}
                                        </div>
                                    )}

                                    {status.kind === 'pending' && step === 'hash' && (
                                        <button
                                            type="button"
                                            onClick={() => { setStep('wallet'); setStatus({ kind: 'idle', message: '' }); }}
                                            className="mt-1 text-xs font-semibold underline underline-offset-2 opacity-80 transition hover:opacity-100"
                                        >
                                            Try wallet search instead
                                        </button>
                                    )}

                                    {status.kind === 'error' && (
                                        <button
                                            type="button"
                                            onClick={step === 'hash' ? handleVerifyByHash : handleVerifyByWallet}
                                            className="mt-1 text-xs font-semibold underline underline-offset-2 opacity-80 transition hover:opacity-100"
                                        >
                                            Retry
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}
                    </>
                )}

                {/* Don't have a donation yet? link */}
                {!isDone && (
                    <div className="mt-2 text-center">
                        <p className="text-xs text-slate-400 dark:text-slate-500">
                            Haven't donated yet?{' '}
                            <button
                                type="button"
                                onClick={() => {
                                    onClose();
                                    if (onOpenDonate) onOpenDonate();
                                }}
                                className="font-semibold text-primary underline-offset-2 transition hover:underline"
                            >
                                Make a donation
                            </button>
                        </p>
                    </div>
                )}

            </div>
        </Modal>
    );
};

export default VerifyDonationModal;
