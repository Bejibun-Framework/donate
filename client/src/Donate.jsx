import {
    AlertCircle,
    ArrowLeft,
    ArrowRight,
    Check,
    ChevronDown,
    Copy,
    Loader2,
    LogOut,
    Plus,
    Wallet,
    X
} from "lucide-react";
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState
} from "react";

const NETWORKS = [
    {
        id: "ethereum",
        name: "Ethereum",
        ticker: "ETH",
        accent: "#8CA3F0",
        address: "0x7a3F9c2E4b8D1a6F5c0E9B3D2A1C8F4E6D7B9A0C",
        chainType: "evm",
        evmChainId: "0x1",
        coins: [
            {symbol: "ETH", name: "Ethereum", native: true},
            {symbol: "USDC", name: "USD Coin"},
            {symbol: "USDT", name: "Tether USD"},
            {symbol: "DAI", name: "Dai Stablecoin"}
        ]
    },
    {
        id: "bnb",
        name: "BNB Chain",
        ticker: "BNB",
        accent: "#F0C24D",
        address: "0x9E1a4C6f2B8D3a0E7c5F9B2D4A8C1E6F3D0B7A9C",
        chainType: "evm",
        evmChainId: "0x38",
        coins: [
            {symbol: "BNB", name: "BNB", native: true},
            {symbol: "USDT", name: "Tether USD"},
            {symbol: "BUSD", name: "Binance USD"}
        ]
    },
    {
        id: "polygon",
        name: "Polygon",
        ticker: "MATIC",
        accent: "#B18CF0",
        address: "0x4B2c8E1a9D3F6c7B0E5A2D8C1F9B4E6A3D7C0F8B",
        chainType: "evm",
        evmChainId: "0x89",
        coins: [
            {symbol: "MATIC", name: "Polygon", native: true},
            {symbol: "USDC", name: "USD Coin"},
            {symbol: "USDT", name: "Tether USD"}
        ]
    },
    {
        id: "solana",
        name: "Solana",
        ticker: "SOL",
        accent: "#5FE3B8",
        address: "7xKXtg2CW3ojwWJHkK3nq7Y8j4Z6vN2mP9qR1sT4uV5w",
        chainType: "svm",
        coins: [
            {symbol: "SOL", name: "Solana", native: true},
            {symbol: "USDC", name: "USD Coin"}
        ]
    }
];

const AMOUNTS = [5, 10, 25, 50, 100, 250];

function useOutsideClose(open, setOpen) {
    const ref = useRef(null);

    useEffect(() => {
        if (!open) return;

        function onDown(e) {
            if (ref.current && !ref.current.contains(e.target)) setOpen(false);
        }

        function onKey(e) {
            if (e.key === "Escape") setOpen(false);
        }

        document.addEventListener("mousedown", onDown);
        document.addEventListener("keydown", onKey);

        return () => {
            document.removeEventListener("mousedown", onDown);
            document.removeEventListener("keydown", onKey);
        };
    }, [open, setOpen]);

    return ref;
}

function coinInitials(symbol) {
    return symbol.slice(0, 2).toUpperCase();
}

function shorten(value, lead = 5, tail = 5) {
    if (!value) return "";

    return value.length > lead + tail ? `${value.slice(0, lead)}...${value.slice(-tail)}` : value;
}

function NetworkDropdown({networks, value, onChange}) {
    const [open, setOpen] = useState(false);
    const ref = useOutsideClose(open, setOpen);
    const current = networks.find((n) => n.id === value);

    return (
        <div className="ndp-field" ref={ref}>
            <label className="ndp-label">Network</label>
            <button
                type="button"
                className="ndp-select-btn"
                onClick={() => setOpen((o) => !o)}
                aria-haspopup="listbox"
                aria-expanded={open}
            >
                <span className="ndp-select-left">
                    <span
                        className="ndp-dot"
                        style={{background: current.accent}}
                        aria-hidden="true"
                    />
                    <span className="ndp-select-text">{current.name}</span>
                </span>

                <ChevronDown size={16} className={`ndp-chev ${open ? "ndp-chev-up" : ""}`}/>
            </button>

            {open && (
                <ul className="ndp-menu" role="listbox">
                    {networks.map((n) => (
                        <li key={n.id}>
                            <button
                                type="button"
                                className={`ndp-menu-item ${n.id === value ? "ndp-menu-item-active" : ""}`}
                                role="option"
                                aria-selected={n.id === value}
                                onClick={() => {
                                    onChange(n.id);
                                    setOpen(false);
                                }}
                            >
                                <span className="ndp-dot" style={{background: n.accent}} aria-hidden="true"/>
                                <span className="ndp-select-text">{n.name}</span>
                                <span className="ndp-menu-sub">{n.ticker}</span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

function CoinDropdown({coins, value, onChange, onAddCustom, accent}) {
    const [open, setOpen] = useState(false);
    const [addingCustom, setAddingCustom] = useState(false);
    const [customSymbol, setCustomSymbol] = useState("");
    const [customAddress, setCustomAddress] = useState("");
    const [formError, setFormError] = useState("");
    const ref = useOutsideClose(open, setOpen);
    const current = coins.find((c) => c.symbol === value) || coins[0];

    function closeAll() {
        setOpen(false);
        setAddingCustom(false);
        setCustomSymbol("");
        setCustomAddress("");
        setFormError("");
    }

    function submitCustom(e) {
        e.preventDefault();

        const sym = customSymbol.trim().toUpperCase();
        const addr = customAddress.trim();

        if (!sym) {
            setFormError("Enter a token symbol.");
            return;
        }
        if (!/^0x[a-fA-F0-9]{6,40}$/.test(addr)) {
            setFormError("Enter a valid contract address.");
            return;
        }

        onAddCustom({symbol: sym, name: `${sym} · custom token`, address: addr, custom: true});

        closeAll();
    }

    return (
        <div className="ndp-field" ref={ref}>
            <label className="ndp-label">Asset</label>
            <button
                type="button"
                className="ndp-select-btn"
                onClick={() => setOpen((o) => !o)}
                aria-haspopup="listbox"
                aria-expanded={open}
            >
                <span className="ndp-select-left">
                    <span className="ndp-coin-avatar" style={{borderColor: accent, color: accent}}>
                        {coinInitials(current.symbol)}
                    </span>
                    <span className="ndp-select-text">
                        {current.symbol}
                        <span className="ndp-select-muted"> · {current.name}</span>
                    </span>
                </span>

                <ChevronDown size={16} className={`ndp-chev ${open ? "ndp-chev-up" : ""}`}/>
            </button>

            {open && (
                <div className="ndp-menu ndp-menu-wide" role="listbox">
                    {!addingCustom ? (
                        <>
                            {coins.map((c) => (
                                <button
                                    key={c.symbol}
                                    type="button"
                                    className={`ndp-menu-item ${c.symbol === value ? "ndp-menu-item-active" : ""}`}
                                    role="option"
                                    aria-selected={c.symbol === value}
                                    onClick={() => {
                                        onChange(c.symbol);
                                        setOpen(false);
                                    }}
                                >
                                    <span className="ndp-coin-avatar" style={{borderColor: accent, color: accent}}>
                                        {coinInitials(c.symbol)}
                                    </span>

                                    <span className="ndp-select-text">
                                        {c.symbol}
                                        <span className="ndp-select-muted"> · {c.name}</span>
                                    </span>

                                    {c.custom && <span className="ndp-menu-sub">custom</span>}
                                </button>
                            ))}

                            <button
                                type="button"
                                className="ndp-menu-item ndp-menu-add"
                                onClick={() => setAddingCustom(true)}
                            >
                                <Plus size={15}/>
                                Add custom token
                            </button>
                        </>
                    ) : (
                        <form className="ndp-custom-form" onSubmit={submitCustom}>
                            <div className="ndp-custom-form-head">
                                <span>Add custom token</span>
                                <button type="button" className="ndp-icon-btn" onClick={() => setAddingCustom(false)}
                                        aria-label="Cancel">
                                    <X size={14}/>
                                </button>
                            </div>

                            <input
                                className="ndp-input ndp-input-mono"
                                placeholder="Symbol, e.g. LINK"
                                value={customSymbol}
                                onChange={(e) => setCustomSymbol(e.target.value)}
                                maxLength={10}
                            />

                            <input
                                className="ndp-input ndp-input-mono"
                                placeholder="Contract address (0x...)"
                                value={customAddress}
                                onChange={(e) => setCustomAddress(e.target.value)}
                            />

                            {formError && <p className="ndp-form-error">{formError}</p>}

                            <button type="submit" className="ndp-btn-secondary">
                                Add token
                            </button>
                        </form>
                    )}
                </div>
            )}
        </div>
    );
}

function WalletConnect({chainType, evmChainId, address, connecting, error, onConnect, onDisconnect}) {
    const kindLabel = chainType === "evm" ? "EVM wallet" : "Solana wallet";

    return (
        <div className="ndp-field ndp-wallet-field">
            <label className="ndp-label">Wallet</label>

            {address ? (
                <div className="ndp-wallet-connected">
                    <span className="ndp-wallet-dot" aria-hidden="true"/>
                    <span className="ndp-wallet-addr">{shorten(address)}</span>
                    <button
                        type="button"
                        className="ndp-wallet-disconnect"
                        onClick={onDisconnect}
                        aria-label="Disconnect wallet"
                    >
                        <LogOut size={14}/>
                    </button>
                </div>
            ) : (
                <button
                    type="button"
                    className="ndp-connect-btn"
                    onClick={onConnect}
                    disabled={connecting}
                >
                    {connecting ? (
                        <>
                            <Loader2 size={16} className="ndp-spin"/>
                            Connecting…
                        </>
                    ) : (
                        <>
                            <Wallet size={16}/>
                            Connect {kindLabel}
                        </>
                    )}
                </button>
            )}

            {error && (
                <p className="ndp-wallet-error">
                    <AlertCircle size={13}/>
                    {error}
                </p>
            )}
        </div>
    );
}

export default function Donate() {
    const [networkId, setNetworkId] = useState(NETWORKS[0].id);
    const [customCoins, setCustomCoins] = useState({});
    const [coinSymbol, setCoinSymbol] = useState(NETWORKS[0].coins[0].symbol);
    const [amount, setAmount] = useState("25");
    const [activeChip, setActiveChip] = useState(25);
    const [message, setMessage] = useState("");
    const [revealed, setRevealed] = useState(false);
    const [copied, setCopied] = useState(false);
    const [wallet, setWallet] = useState({evm: null, svm: null});
    const [walletConnecting, setWalletConnecting] = useState(false);
    const [walletError, setWalletError] = useState({evm: "", svm: ""});

    const network = NETWORKS.find((n) => n.id === networkId);
    const coinList = useMemo(
        () => [...network.coins, ...(customCoins[networkId] || [])],
        [network, customCoins, networkId]
    );
    const coin = coinList.find((c) => c.symbol === coinSymbol) || coinList[0];

    function handleNetworkChange(id) {
        const n = NETWORKS.find((x) => x.id === id);
        setNetworkId(id);
        const list = [...n.coins, ...(customCoins[id] || [])];
        setCoinSymbol(list[0].symbol);

        if (n.chainType === "evm" && wallet.evm && window.ethereum) {
            window.ethereum
                .request({method: "wallet_switchEthereumChain", params: [{chainId: n.evmChainId}]})
                .catch(() => {
                });
        }
    }

    async function connectEvmWallet() {
        setWalletError((e) => ({...e, evm: ""}));

        if (typeof window === "undefined" || !window.ethereum) {
            setWalletError((e) => ({
                ...e,
                evm: "No EVM wallet found. Install MetaMask or another browser wallet.",
            }));
            return;
        }

        try {
            setWalletConnecting(true);

            const accounts = await window.ethereum.request({method: "eth_requestAccounts"});

            if (network.chainType === "evm") {
                await window.ethereum
                    .request({method: "wallet_switchEthereumChain", params: [{chainId: network.evmChainId}]})
                    .catch(() => {
                    });
            }

            setWallet((w) => ({...w, evm: accounts[0]}));
        } catch (err) {
            setWalletError((e) => ({
                ...e,
                evm: err?.code === 4001 ? "Connection request was rejected." : "Couldn't connect to the wallet.",
            }));
        } finally {
            setWalletConnecting(false);
        }
    }

    async function connectSvmWallet() {
        setWalletError((e) => ({...e, svm: ""}));

        if (typeof window === "undefined" || !window.solana || !window.solana.isPhantom) {
            setWalletError((e) => ({...e, svm: "No Solana wallet found. Install Phantom."}));
            return;
        }

        try {
            setWalletConnecting(true);

            const resp = await window.solana.connect();
            setWallet((w) => ({...w, svm: resp.publicKey.toString()}));
        } catch (err) {
            setWalletError((e) => ({
                ...e,
                svm: err?.code === 4001 ? "Connection request was rejected." : "Couldn't connect to the wallet.",
            }));
        } finally {
            setWalletConnecting(false);
        }
    }

    function disconnectWallet(type) {
        if (type === "svm" && typeof window !== "undefined" && window.solana?.disconnect) {
            window.solana.disconnect().catch(() => {
            });
        }

        setWallet((w) => ({...w, [type]: null}));
    }

    function handleAddCustomToken(token) {
        setCustomCoins((prev) => ({
            ...prev,
            [networkId]: [...(prev[networkId] || []), token],
        }));
        setCoinSymbol(token.symbol);
    }

    function handleChip(v) {
        setActiveChip(v);
        setAmount(String(v));
    }

    function handleManualAmount(v) {
        const clean = v.replace(/[^0-9.]/g, "");
        setAmount(clean);

        const n = Number(clean);
        setActiveChip(AMOUNTS.includes(n) ? n : null);
    }

    const numericAmount = Number(amount);
    const canDonate = numericAmount > 0 && Number.isFinite(numericAmount);

    const handleCopy = useCallback(() => {
        const text = coin.custom ? coin.address : network.address;
        if (navigator?.clipboard?.writeText) {
            navigator.clipboard.writeText(text).catch(() => {
            });
        }

        setCopied(true);

        setTimeout(() => setCopied(false), 1800);
    }, [coin, network]);

    return (
        <div className="ndp-root">
            <div className="ndp-bg-grid" aria-hidden="true"/>

            <div className="ndp-shell">
                {/* -------- Left: narrative + receipt -------- */}
                <div className="ndp-left">
                    <div className="ndp-eyebrow">On-chain support</div>
                    <h1 className="ndp-headline">
                        Fuel the <em>next commit.</em>
                    </h1>
                    <p className="ndp-sub">
                        Bejibun Labs builds open tools for the decentralized web.
                        Contributions move straight from your wallet to the project's — no processor,
                        no delay, no cut taken along the way.
                    </p>

                    <div className="ndp-receipt">
                        <div className="ndp-receipt-top">
                            <span className="ndp-receipt-title">Donation receipt</span>
                            <span className="ndp-receipt-id">#{network.ticker}-{coin.symbol}</span>
                        </div>
                        <div className="ndp-perf"/>
                        <div className="ndp-receipt-rows">
                            {wallet[network.chainType] && (
                                <div className="ndp-receipt-row">
                                    <span className="ndp-receipt-key">From</span>
                                    <span
                                        className="ndp-receipt-val">{shorten(wallet[network.chainType])}</span>
                                </div>
                            )}
                            <div className="ndp-receipt-row">
                                <span className="ndp-receipt-key">Network</span>
                                <span className="ndp-receipt-val">{network.name}</span>
                            </div>
                            <div className="ndp-receipt-row">
                                <span className="ndp-receipt-key">Asset</span>
                                <span className="ndp-receipt-val">{coin.symbol}</span>
                            </div>
                            <div className="ndp-receipt-row">
                                <span className="ndp-receipt-key">Amount</span>
                                <span className="ndp-receipt-val ndp-receipt-amount">
                                    {canDonate ? `$${numericAmount.toLocaleString()}` : "—"}
                                </span>
                            </div>

                            {message.trim() && (
                                <div className="ndp-receipt-row">
                                    <span className="ndp-receipt-key">Note</span>
                                    <span className="ndp-receipt-note">&ldquo;{message.trim()}&rdquo;</span>
                                </div>
                            )}
                        </div>
                        <div className="ndp-receipt-bottom">Settles directly on {network.name}</div>
                    </div>
                </div>

                {/* -------- Right: form card -------- */}
                <div className="ndp-card">
                    {!revealed ? (
                        <>
                            <h2 className="ndp-card-title">Make a donation</h2>
                            <p className="ndp-card-sub">Choose a network and asset, then set an amount.</p>

                            <div className="ndp-row-2">
                                <NetworkDropdown networks={NETWORKS} value={networkId} onChange={handleNetworkChange}/>
                                <CoinDropdown
                                    coins={coinList}
                                    value={coin.symbol}
                                    onChange={setCoinSymbol}
                                    onAddCustom={handleAddCustomToken}
                                    accent={network.accent}
                                />
                            </div>

                            <WalletConnect
                                chainType={network.chainType}
                                evmChainId={network.evmChainId}
                                address={wallet[network.chainType] || null}
                                connecting={walletConnecting}
                                error={walletError[network.chainType] || ""}
                                onConnect={network.chainType === "evm" ? connectEvmWallet : connectSvmWallet}
                                onDisconnect={() => disconnectWallet(network.chainType)}
                            />

                            <label className="ndp-label">Amount</label>
                            <div className="ndp-amount-grid">
                                {AMOUNTS.map((v) => (
                                    <button
                                        key={v}
                                        type="button"
                                        className={`ndp-chip ${activeChip === v ? "ndp-chip-active" : ""}`}
                                        onClick={() => handleChip(v)}
                                    >
                                        ${v}
                                    </button>
                                ))}
                            </div>

                            <div className="ndp-amount-input-wrap">
                                <span className="ndp-amount-currency">$</span>
                                <input
                                    className="ndp-amount-input"
                                    inputMode="decimal"
                                    placeholder="0.00"
                                    value={amount}
                                    onChange={(e) => handleManualAmount(e.target.value)}
                                    aria-label="Custom amount in dollars"
                                />
                                <span className="ndp-amount-suffix">USD equiv.</span>
                            </div>

                            <label className="ndp-label">Message (optional)</label>
                            <textarea
                                className="ndp-textarea"
                                placeholder="Say a few words to go with your donation..."
                                value={message}
                                maxLength={200}
                                onChange={(e) => setMessage(e.target.value)}
                            />
                            <p className="ndp-char-count">{message.length}/200</p>

                            <button
                                type="button"
                                className="ndp-submit"
                                disabled={!canDonate}
                                onClick={() => setRevealed(true)}
                            >
                                Donate {canDonate ? `$${numericAmount.toLocaleString()}` : ""} in {coin.symbol}
                                <ArrowRight size={17}/>
                            </button>
                        </>
                    ) : (
                        <>
                            <div className="ndp-reveal-head">
                                <button className="ndp-back-btn" onClick={() => setRevealed(false)}
                                        aria-label="Back to form">
                                    <ArrowLeft size={16}/>
                                </button>
                                <span className="ndp-reveal-summary">
                                    Sending <strong>${numericAmount.toLocaleString()}</strong> in{" "}
                                    <strong>{coin.symbol}</strong> on <strong>{network.name}</strong>
                                    {wallet[network.chainType] && (
                                        <> from <strong>{shorten(wallet[network.chainType])}</strong></>
                                    )}
                                </span>
                            </div>

                            <h2 className="ndp-card-title">Send to this address</h2>
                            <p className="ndp-card-sub">
                                Copy the address below and send from any {network.name} wallet.
                            </p>

                            <div className="ndp-address-box">
                                <span className="ndp-address-icon">
                                    <Wallet size={18}/>
                                </span>

                                <span className="ndp-address-text">
                                    {coin.custom ? coin.address : network.address}
                                </span>

                                <button
                                    className={`ndp-copy-btn ${copied ? "ndp-copied" : ""}`}
                                    onClick={handleCopy}
                                    aria-label="Copy address"
                                    type="button"
                                >
                                    {copied ? <Check size={16}/> : <Copy size={16}/>}
                                </button>
                            </div>

                            <p className="ndp-reveal-note">
                                Double-check the network before sending - assets sent on the wrong chain
                                can't be recovered. Once your transaction confirms, no further action is needed
                                {message.trim() ? " — your note has been saved with this donation." : "."}
                            </p>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}