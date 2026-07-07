import {Connection, PublicKey} from "@solana/web3.js";
import {
    AlertCircle,
    ArrowRight,
    ChevronDown,
    Loader2,
    LogOut,
    Plus,
    Download,
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
import QRCode from "qrcode";
import html2pdf from "html2pdf.js";
import {
    connectPhantom,
    connectSolanaMetaMask,
    connectSolanaWalletConnect,
    toSolanaSigner
} from "./lib/solanaSigner.js";
import {connectEvmWallet as connectEvmWalletLib} from "./lib/wallet.js";
import {createPaymentFetch, readSettlement} from "./lib/x402Client.js";
import {createPublicClient, getAddress, http} from "viem";
import {arbitrum, base, polygon, worldchain} from "viem/chains";

const RESOURCE_URL = import.meta.env.VITE_RESOURCE_SERVER_URL || "http://localhost:8787";
const SOLANA_RPC_URL = import.meta.env.VITE_SOLANA_RPC || "https://api.mainnet-beta.solana.com";

function humanizeError(err) {
    const message = err?.message ?? String(err);

    if (/user rejected|user denied/i.test(message)) return "Signature request was cancelled in your wallet.";
    if (/insufficient/i.test(message)) return "Wallet doesn't have enough USDC.";

    return message;
}

// Converts a human-readable decimal amount (e.g. "0.001") into the token's
// smallest-unit integer string (e.g. "1000" for 6 decimals). Done with
// string arithmetic rather than floating-point math so precision isn't lost
// for either very small or very large amounts. Any digits beyond the
// token's `decimals` are truncated rather than rounded.
function toBaseUnits(amount, decimals) {
    const str = String(amount).trim();

    if (!str || isNaN(Number(str))) return "0";

    const negative = str.startsWith("-");
    const unsigned = negative ? str.slice(1) : str;

    let [whole, fraction = ""] = unsigned.split(".");
    whole = whole.replace(/^0+(?=\d)/, "") || "0";

    if (fraction.length > decimals) {
        fraction = fraction.slice(0, decimals);
    } else {
        fraction = fraction.padEnd(decimals, "0");
    }

    let combined = (whole + fraction).replace(/^0+(?=\d)/, "");
    if (combined === "") combined = "0";

    return (negative && combined !== "0" ? "-" : "") + combined;
}

const NETWORKS = [
    {
        id: `eip155:${base.id}`,
        name: base.name,
        nativeCurrency: base.nativeCurrency,
        accent: "#8CA3F0",
        chainType: "evm",
        trustWalletId: "base", // Trust Wallet assets repo blockchain slug
        coinGeckoPlatform: "base", // CoinGecko asset platform id
        viemChain: base, // used to build a read-only public client for custom-token lookups; also supplies the block explorer URL
        coins: [
            {
                contract: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2",
                symbol: "USDT",
                decimals: 6,
                name: "Tether USD",
                stablecoin: true
            },
            {
                contract: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
                symbol: "USDC",
                decimals: 6,
                name: "USD Coin",
                stablecoin: true
            },
            {
                contract: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb",
                symbol: "DAI",
                decimals: 18,
                name: "Dai Stablecoin",
                stablecoin: true
            },
            {
                contract: "0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34",
                symbol: "USDe",
                decimals: 18,
                name: "USDe",
                stablecoin: true
            },
            {
                contract: "0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42",
                symbol: "EURC",
                decimals: 6,
                name: "Euro Coin",
                stablecoin: true
            }
        ]
    },
    {
        id: `eip155:${polygon.id}`,
        name: polygon.name,
        nativeCurrency: polygon.nativeCurrency,
        accent: "#B08CF0",
        chainType: "evm",
        trustWalletId: "polygon", // Trust Wallet assets repo blockchain slug
        coinGeckoPlatform: "polygon-pos", // CoinGecko asset platform id
        viemChain: polygon,
        coins: [
            {
                contract: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
                symbol: "USDC",
                decimals: 6,
                name: "USD Coin",
                stablecoin: true
            },
            {
                contract: "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063",
                symbol: "DAI",
                decimals: 18,
                name: "Dai Stablecoin",
                stablecoin: true
            },
            {
                contract: "0x9C9e5fD8bbc25984B178FdCE6117Defa39d2db39",
                symbol: "BUSD",
                decimals: 18,
                name: "Binance-Peg BUSD Token",
                stablecoin: true
            }
        ]
    },
    {
        id: `eip155:${arbitrum.id}`,
        name: "Arbitrum",
        nativeCurrency: arbitrum.nativeCurrency,
        accent: "#8CC5F0",
        chainType: "evm",
        trustWalletId: "arbitrum", // Trust Wallet assets repo blockchain slug
        coinGeckoPlatform: "arbitrum-one", // CoinGecko asset platform id
        viemChain: arbitrum,
        coins: [
            {
                contract: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
                symbol: "USD₮0",
                decimals: 6,
                name: "USD₮0",
                stablecoin: true
            },
            {
                contract: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
                symbol: "USDC",
                decimals: 6,
                name: "USD Coin",
                stablecoin: true
            },
            {
                contract: "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1",
                symbol: "DAI",
                decimals: 18,
                name: "Dai Stablecoin",
                stablecoin: true
            },
            {
                contract: "0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34",
                symbol: "USDe",
                decimals: 18,
                name: "USDe",
                stablecoin: true
            },
            {
                contract: "0x4D15a3A2286D883AF0AA1B3f21367843FAc63E07",
                symbol: "TUSD",
                decimals: 18,
                name: "TrueUSD",
                stablecoin: true
            },
            {
                contract: "0x93C9932E4afa59201F0B5E63f7d816516F1669fE",
                symbol: "FDUSD",
                decimals: 18,
                name: "First Digital USD",
                stablecoin: true
            }
        ]
    },
    {
        id: `eip155:${worldchain.id}`,
        name: "World",
        nativeCurrency: worldchain.nativeCurrency,
        accent: "#8CF0D2",
        chainType: "evm",
        trustWalletId: "worldchain", // Trust Wallet assets repo blockchain slug
        coinGeckoPlatform: "world-chain", // CoinGecko asset platform id
        viemChain: worldchain,
        coins: [
            {
                contract: "0x79A02482A880bCE3F13e09Da970dC34db4CD24d1",
                symbol: "USDC",
                decimals: 6,
                name: "USD Coin",
                stablecoin: true
            }
        ]
    },
    {
        id: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
        name: "Solana",
        nativeCurrency: {
            name: "Solana",
            symbol: "SOL",
            decimals: 9
        },
        accent: "#5FE3B8",
        chainType: "svm",
        trustWalletId: "solana", // Trust Wallet assets repo blockchain slug
        coinGeckoPlatform: "solana", // CoinGecko asset platform id
        explorerTxUrl: (tx) => `https://solscan.io/tx/${tx}`,
        coins: [
            {
                contract: "CQhbNnCGKfDaKXt8uE61i5DrBYJV7NPsCDD9vQgypump",
                symbol: "BJBN",
                decimals: 6,
                name: "Bejibun",
                stablecoin: false
            },
            {
                contract: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
                symbol: "USDT",
                decimals: 6,
                name: "USDT",
                stablecoin: true
            },
            {
                contract: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
                symbol: "USDC",
                decimals: 6,
                name: "USD Coin",
                stablecoin: true
            },
            {
                contract: "EjmyN6qEC1Tf1JxiG1ae7UTJhUxSwk1TCWNWqxWV4J6o",
                symbol: "DAI",
                decimals: 8,
                name: "Dai Stablecoin",
                stablecoin: true
            },
            {
                contract: "USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB",
                symbol: "USD1",
                decimals: 6,
                name: "World Liberty Financial USD",
                stablecoin: true
            },
            {
                contract: "9zNQRsGLjNKwCUU5Gq5LR8beUCPzQMVMqKAi3SSZh54u",
                symbol: "FDUSD",
                decimals: 6,
                name: "First Digital USD",
                stablecoin: true
            },
            {
                contract: "33fsBLA8djQm82RpHmE3SuVrPGtZBWNYExsEUeKX1HXX",
                symbol: "BUSD",
                decimals: 8,
                name: "Binance USD",
                stablecoin: true
            },
            {
                contract: "HzwqbKZw8HxMN6bF2yFZNrht3c2iXXzpKcFu7uBEDKtr",
                symbol: "EURC",
                decimals: 6,
                name: "EURC",
                stablecoin: true
            }
        ]
    }
];

const STABLECOIN_SYMBOLS = new Set(["USDC", "USDT", "DAI", "USDP", "TUSD", "USDD", "FDUSD", "PYUSD", "USDE"]);

function isStablecoinSymbol(symbol) {
    return STABLECOIN_SYMBOLS.has(String(symbol || "").toUpperCase());
}

const AMOUNTS = [5, 10, 25, 50, 100, 250];

const SOL_LABELS = {
    phantom: "Phantom",
    metamask: "MetaMask",
    walletconnect: "WalletConnect"
};

// ---------------------------------------------------------------------------
// Token logo resolution
//
//   SOLANA (primary: on-chain) — most SPL tokens register metadata with the
//   Metaplex Token Metadata program. That on-chain account holds a `uri`
//   pointing to an off-chain JSON file (IPFS/Arweave/HTTP) with an `image`
//   field. This is authoritative straight from the chain and has no indexer
//   lag — it works the moment a token's mint authority registers metadata.
//
//   Trust Wallet's curated asset repo (fallback for Solana, primary for
//   EVM) — keyed by chain + checksummed contract address. It's community
//   maintained and PR-gated, so it never serves a generic placeholder in
//   place of a missing logo like some aggregators do — you get the real
//   logo or a clean 404, nothing in between. Its tradeoff is coverage lag
//   for brand-new tokens.
//
//   CoinGecko's per-contract endpoint (final fallback) — broader (if still
//   not universal) coverage, and also returns real submitted images rather
//   than placeholders.
// ---------------------------------------------------------------------------

const METADATA_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
let solanaConnection = null;

function getSolanaConnection() {
    if (!solanaConnection) solanaConnection = new Connection(SOLANA_RPC_URL, "confirmed");

    return solanaConnection;
}

function getMetadataPda(mint) {
    return PublicKey.findProgramAddressSync(
        [Buffer.from("metadata"), METADATA_PROGRAM_ID.toBuffer(), mint.toBuffer()],
        METADATA_PROGRAM_ID
    )[0];
}

// Manually decodes the `name`, `symbol`, and `uri` fields out of a Metaplex
// Metadata account. Layout (relevant prefix): 1 byte key + 32 byte
// update_authority + 32 byte mint, then borsh-encoded strings for name,
// symbol, uri (each a 4-byte LE length prefix followed by the UTF-8 bytes).
function readMetadataFields(data) {
    let offset = 1 + 32 + 32;

    function readString() {
        const len = data.readUInt32LE(offset);
        offset += 4;
        const str = data.slice(offset, offset + len).toString("utf8").replace(/\0/g, "").trim();
        offset += len;

        return str;
    }

    const name = readString();
    const symbol = readString();
    const uri = readString();

    return {
        name: name || null,
        symbol: symbol || null,
        uri: uri || null
    };
}

async function fetchSolanaOnChainLogo(contract) {
    try {
        const mint = new PublicKey(contract);
        const pda = getMetadataPda(mint);
        const accountInfo = await getSolanaConnection().getAccountInfo(pda);

        if (!accountInfo) return null;

        const {uri} = readMetadataFields(accountInfo.data);
        if (!uri) return null;

        const res = await fetch(uri);
        if (!res.ok) return null;

        const json = await res.json();

        return json?.image ?? null;
    } catch {
        return null;
    }
}

// EVM addresses need EIP-55 checksumming to match Trust Wallet's repo paths
// exactly; Solana (base58) addresses are used as-is and must not be altered.
function checkSummedForRepo(contract, network) {
    if (network.chainType !== "evm") return contract;

    try {
        return getAddress(contract);
    } catch {
        return contract;
    }
}

function trustWalletLogoUrl(contract, network) {
    const address = checkSummedForRepo(contract, network);

    return `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/${network.trustWalletId}/assets/${address}/logo.png`;
}

async function fetchCoinGeckoLogo(contract, network) {
    try {
        const address = network.chainType === "evm" ? contract.toLowerCase() : contract;
        const res = await fetch(`https://api.coingecko.com/api/v3/coins/${network.coinGeckoPlatform}/contract/${address}`);

        if (!res.ok) return null;

        const data = await res.json();

        return data?.image?.small || data?.image?.thumb || data?.image?.large || null;
    } catch {
        return null;
    }
}

// Cached final result per (network, contract) so repeated renders never
// re-run the lookup chain. `null` means "checked everywhere, nothing found".
const logoCache = new Map(); // "trustWalletId:contract(lowercased)" -> string url | null

async function resolveLogo(coin, network) {
    const key = `${network.trustWalletId}:${coin.contract.toLowerCase()}`;
    if (logoCache.has(key)) return logoCache.get(key);

    let url = null;

    if (network.chainType === "svm") {
        url = await fetchSolanaOnChainLogo(coin.contract);
    }

    if (!url) {
        url = await fetchCoinGeckoLogo(coin.contract, network);
    }

    logoCache.set(key, url);

    return url;
}

// ---------------------------------------------------------------------------
// Custom token metadata resolution — given only a contract/mint address,
// fetch the token's name, symbol, and decimals straight from the chain so
// the "Add custom token" form only needs one field.
// ---------------------------------------------------------------------------

const ERC20_READ_ABI = [
    {name: "name", type: "function", stateMutability: "view", inputs: [], outputs: [{type: "string"}]},
    {name: "symbol", type: "function", stateMutability: "view", inputs: [], outputs: [{type: "string"}]},
    {name: "decimals", type: "function", stateMutability: "view", inputs: [], outputs: [{type: "uint8"}]}
];

const evmPublicClients = new Map(); // chain id -> viem public client, reused across lookups

function getEvmPublicClient(network) {
    const key = network.viemChain.id;

    if (!evmPublicClients.has(key)) {
        evmPublicClients.set(key, createPublicClient({chain: network.viemChain, transport: http()}));
    }

    return evmPublicClients.get(key);
}

async function fetchEvmTokenMetadata(rawAddress, network) {
    let address;

    try {
        address = getAddress(rawAddress.trim());
    } catch {
        throw new Error("Enter a valid contract address.");
    }

    const client = getEvmPublicClient(network);

    let name, symbol, decimals;

    try {
        [name, symbol, decimals] = await Promise.all([
            client.readContract({address, abi: ERC20_READ_ABI, functionName: "name"}),
            client.readContract({address, abi: ERC20_READ_ABI, functionName: "symbol"}),
            client.readContract({address, abi: ERC20_READ_ABI, functionName: "decimals"})
        ]);
    } catch {
        throw new Error("Couldn't read token details from that contract.");
    }

    return {contract: address, name, symbol, decimals};
}

async function fetchSvmTokenMetadata(rawAddress) {
    let mint;

    try {
        mint = new PublicKey(rawAddress.trim());
    } catch {
        throw new Error("Enter a valid token mint address.");
    }

    const connection = getSolanaConnection();

    let parsed;

    try {
        const accountInfo = await connection.getParsedAccountInfo(mint);
        parsed = accountInfo?.value?.data?.parsed;
    } catch {
        throw new Error("Couldn't read that mint from the Solana network.");
    }

    if (!parsed || parsed.type !== "mint") {
        throw new Error("That address isn't a token mint.");
    }

    const decimals = parsed.info.decimals;

    let name = null;
    let symbol = null;

    try {
        const pda = getMetadataPda(mint);
        const metaAccount = await connection.getAccountInfo(pda);

        if (metaAccount) {
            const fields = readMetadataFields(metaAccount.data);
            name = fields.name;
            symbol = fields.symbol;
        }
    } catch {
        // Metadata is optional — fall back to placeholders below.
    }

    return {
        contract: mint.toBase58(),
        name: name || "Unknown token",
        symbol: symbol || "TOKEN",
        decimals
    };
}

function fetchCustomTokenMetadata(address, network) {
    return network.chainType === "evm"
        ? fetchEvmTokenMetadata(address, network)
        : fetchSvmTokenMetadata(address);
}

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

// EVM networks carry a viem chain object, whose `blockExplorers.default.url`
// is the canonical explorer base URL — no need to hardcode it separately.
// Solana has no viem chain, so it falls back to its own explorerTxUrl field.
function getExplorerTxUrl(network, tx) {
    const base = network.viemChain?.blockExplorers?.default?.url;
    if (base) return `${base}/tx/${tx}`;

    return network.explorerTxUrl ? network.explorerTxUrl(tx) : null;
}

// Renders a token's real logo in tiers:
//   1. Trust Wallet's direct repo image — fast, just an <img src>, cleanly
//      404s if missing (no external fetch call needed to try it).
//   2. On-chain Solana metadata (SVM only) or CoinGecko's contract API
//      (secondary source for both chains) — resolved once and cached.
//   3. Two-letter initials avatar if nothing above worked.
function CoinAvatar({coin, network, accent, size = 22}) {
    const cacheKey = `${network.trustWalletId}:${coin.contract.toLowerCase()}`;

    // "direct" -> trying the Trust Wallet repo image path
    // "resolved" -> direct failed; using whatever resolveLogo() finds
    // "none" -> nothing worked, show initials
    const [stage, setStage] = useState("direct");
    const [resolvedUrl, setResolvedUrl] = useState(() => logoCache.get(cacheKey));

    useEffect(() => {
        setStage("direct");
        setResolvedUrl(logoCache.get(cacheKey));
    }, [cacheKey]);

    useEffect(() => {
        if (stage !== "resolved") return;
        if (logoCache.has(cacheKey)) return;

        let cancelled = false;

        resolveLogo(coin, network).then((url) => {
            if (!cancelled) setResolvedUrl(url);
        });

        return () => {
            cancelled = true;
        };
    }, [stage, cacheKey, coin, network]);

    if (stage === "direct") {
        return (
            <span className="ndp-coin-avatar ndp-coin-avatar-img">
                <img
                    src={trustWalletLogoUrl(coin.contract, network)}
                    alt={coin.symbol}
                    width={size}
                    height={size}
                    loading="lazy"
                    onError={() => setStage("resolved")}
                />
            </span>
        );
    }

    if (stage === "resolved" && resolvedUrl) {
        return (
            <span className="ndp-coin-avatar ndp-coin-avatar-img">
                <img
                    src={resolvedUrl}
                    alt={coin.symbol}
                    width={size}
                    height={size}
                    loading="lazy"
                    onError={() => setResolvedUrl(null)}
                />
            </span>
        );
    }

    return (
        <span className="ndp-coin-avatar" style={{borderColor: accent, color: accent}}>
            {coinInitials(coin.symbol)}
        </span>
    );
}

function trustWalletChainLogoUrl(network) {
    return `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/${network.trustWalletId}/info/logo.png`;
}

// Renders a network's chain logo (Trust Wallet's curated repo), falling
// back to the network's accent-colored dot if the image 404s.
function NetworkIcon({network, size = 20}) {
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        setFailed(false);
    }, [network.trustWalletId]);

    if (failed) {
        return <span className="ndp-dot" style={{background: network.accent}}/>;
    }

    return (
        <img
            className="ndp-network-icon"
            src={trustWalletChainLogoUrl(network)}
            alt={network.name}
            width={size}
            height={size}
            loading="lazy"
            onError={() => setFailed(true)}
        />
    );
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
                className="ndp-control ndp-select-btn"
                onClick={() => setOpen((o) => !o)}
                aria-haspopup="listbox"
                aria-expanded={open}
            >
                <span className="ndp-select-left">
                    <span className="ndp-menu-icon" aria-hidden="true">
                        <NetworkIcon network={current}/>
                    </span>
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
                                <span className="ndp-menu-icon" aria-hidden="true">
                                    <NetworkIcon network={n}/>
                                </span>
                                <span className="ndp-select-text">{n.name}</span>
                                <span className="ndp-menu-sub">{n.nativeCurrency.symbol}</span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

function CoinDropdown({coins, value, onChange, onAddCustom, accent, network}) {
    const [open, setOpen] = useState(false);
    const [addingCustom, setAddingCustom] = useState(false);
    const [customAddress, setCustomAddress] = useState("");
    const [fetchingToken, setFetchingToken] = useState(false);
    const [formError, setFormError] = useState("");
    const ref = useOutsideClose(open, setOpen);
    const current = coins.find((c) => c.contract === value) || coins[0];

    // Reset the custom-token form whenever the network changes, since an
    // address typed for one chain isn't valid on another.
    useEffect(() => {
        setAddingCustom(false);
        setCustomAddress("");
        setFormError("");
        setFetchingToken(false);
    }, [network]);

    function closeAll() {
        setOpen(false);
        setAddingCustom(false);
        setCustomAddress("");
        setFormError("");
        setFetchingToken(false);
    }

    async function submitCustom(e) {
        e.preventDefault();
        setFormError("");

        const addr = customAddress.trim();

        if (!addr) {
            setFormError(network.chainType === "evm" ? "Enter a contract address." : "Enter a token mint address.");
            return;
        }

        const alreadyAdded = coins.some((c) => c.contract.toLowerCase() === addr.toLowerCase());
        if (alreadyAdded) {
            setFormError("This token is already in the list.");
            return;
        }

        setFetchingToken(true);

        try {
            const meta = await fetchCustomTokenMetadata(addr, network);

            onAddCustom({
                symbol: meta.symbol,
                name: meta.name,
                contract: meta.contract,
                decimals: meta.decimals,
                stablecoin: isStablecoinSymbol(meta.symbol),
                custom: true
            });

            closeAll();
        } catch (err) {
            setFormError(humanizeError(err));
        } finally {
            setFetchingToken(false);
        }
    }

    return (
        <div className="ndp-field" ref={ref}>
            <label className="ndp-label">Asset</label>
            <button
                type="button"
                className="ndp-control ndp-select-btn"
                onClick={() => setOpen((o) => !o)}
                aria-haspopup="listbox"
                aria-expanded={open}
            >
                <span className="ndp-select-left">
                    <CoinAvatar coin={current} network={network} accent={accent}/>
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
                                    key={c.contract}
                                    type="button"
                                    className={`ndp-menu-item ${c.contract === value ? "ndp-menu-item-active" : ""}`}
                                    role="option"
                                    aria-selected={c.contract === value}
                                    onClick={() => {
                                        onChange(c.contract);
                                        setOpen(false);
                                    }}
                                >
                                    <CoinAvatar coin={c} network={network} accent={accent}/>

                                    <span className="ndp-select-text">
                                        {c.symbol}
                                        <span className="ndp-select-muted"> · {c.name}</span>
                                    </span>
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
                                <button
                                    type="button"
                                    className="ndp-icon-btn"
                                    onClick={() => setAddingCustom(false)}
                                    aria-label="Cancel"
                                    disabled={fetchingToken}
                                >
                                    <X size={14}/>
                                </button>
                            </div>

                            <input
                                className="ndp-input ndp-input-mono"
                                placeholder={network.chainType === "evm" ? "Contract address (0x...)" : "Token mint address"}
                                value={customAddress}
                                onChange={(e) => setCustomAddress(e.target.value)}
                                disabled={fetchingToken}
                                autoFocus
                            />

                            {formError && <p className="ndp-form-error">{formError}</p>}

                            <button type="submit" className="ndp-btn-secondary" disabled={fetchingToken}>
                                {fetchingToken ? (
                                    <>
                                        <Loader2 size={14} className="ndp-spin"/>
                                        Fetching token…
                                    </>
                                ) : (
                                    "Add token"
                                )}
                            </button>
                        </form>
                    )}
                </div>
            )}
        </div>
    );
}

function WalletConnect({chainType, address, walletKind, connecting, error, onConnect, onDisconnect}) {
    const [open, setOpen] = useState(false);
    const ref = useOutsideClose(open, setOpen);
    const isEvm = chainType === "evm";
    const kindLabel = isEvm ? "EVM wallet" : "Solana wallet";

    return (
        <div className="ndp-field" ref={ref}>
            <label className="ndp-label">Wallet</label>

            {address ? (
                <div className="ndp-control ndp-wallet-connected">
                    <span className="ndp-wallet-dot" aria-hidden="true"/>
                    <span className="ndp-wallet-addr">
                        {shorten(address)}
                        {!isEvm && walletKind && (
                            <span className="ndp-select-muted"> · {SOL_LABELS[walletKind] ?? walletKind}</span>
                        )}
                    </span>
                    <button
                        type="button"
                        className="ndp-wallet-disconnect"
                        onClick={onDisconnect}
                        aria-label="Disconnect wallet"
                    >
                        <LogOut size={14}/>
                    </button>
                </div>
            ) : isEvm ? (
                <button
                    type="button"
                    className="ndp-control ndp-connect-btn"
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
            ) : (
                <div style={{position: "relative"}}>
                    <button
                        type="button"
                        className="ndp-control ndp-connect-btn"
                        onClick={() => setOpen((o) => !o)}
                        disabled={connecting}
                        aria-haspopup="listbox"
                        aria-expanded={open}
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
                                <ChevronDown size={14} className={`ndp-chev ${open ? "ndp-chev-up" : ""}`}/>
                            </>
                        )}
                    </button>

                    {open && (
                        <ul className="ndp-menu" role="listbox">
                            {["phantom", "metamask", "walletconnect"].map((kind) => (
                                <li key={kind}>
                                    <button
                                        type="button"
                                        className="ndp-menu-item"
                                        onClick={() => {
                                            onConnect(kind);
                                            setOpen(false);
                                        }}
                                    >
                                        <span className="ndp-select-text">{SOL_LABELS[kind]}</span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
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

export default function App() {
    const [networkId, setNetworkId] = useState(NETWORKS[0].id);
    const [customCoins, setCustomCoins] = useState({});
    const [coinContract, setCoinContract] = useState(NETWORKS[0].coins[0].contract);
    const [amount, setAmount] = useState("25");
    const [activeChip, setActiveChip] = useState(25);
    const [message, setMessage] = useState("");
    const [wallet, setWallet] = useState({evm: null, svm: null});
    const [walletConnecting, setWalletConnecting] = useState(false);
    const [walletError, setWalletError] = useState({evm: "", svm: ""});
    const [sending, setSending] = useState(false);
    const [sendError, setSendError] = useState("");
    const [sendResult, setSendResult] = useState(null);
    const [qrDataUrl, setQrDataUrl] = useState(null);
    const [generatingPdf, setGeneratingPdf] = useState(false);

    const network = NETWORKS.find((n) => n.id === networkId);
    const coinList = useMemo(
        () => [...network.coins, ...(customCoins[networkId] || [])],
        [network, customCoins, networkId]
    );
    const coin = coinList.find((c) => c.contract === coinContract) || coinList[0];

    // Once a donation settles, render a real, scannable QR code that
    // points straight at the transaction on the network's block explorer —
    // the same URL already used for the "view on explorer" link above.
    useEffect(() => {
        const tx = sendResult?.settlement?.transaction;
        const url = tx ? getExplorerTxUrl(network, tx) : null;

        if (!url) {
            setQrDataUrl(null);
            return;
        }

        let cancelled = false;

        QRCode.toDataURL(url, {
            margin: 1,
            width: 240,
            color: {dark: "#2B2A26", light: "#00000000"}
        })
            .then((dataUrl) => {
                if (!cancelled) setQrDataUrl(dataUrl);
            })
            .catch(() => {
                if (!cancelled) setQrDataUrl(null);
            });

        return () => {
            cancelled = true;
        };
    }, [sendResult, network]);

    function handleNetworkChange(id) {
        const n = NETWORKS.find((x) => x.id === id);
        setNetworkId(id);
        const list = [...n.coins, ...(customCoins[id] || [])];
        setCoinContract(list[0].contract);

        if (n.chainType === "evm" && wallet.evm && window.ethereum) {
            window.ethereum
                .request({
                    method: "wallet_switchEthereumChain",
                    params: [{chainId: `0x${n.viemChain.id.toString(16)}`}]
                })
                .catch(() => {
                });
        }
    }

    async function connectEvmWallet() {
        setWalletError((e) => ({...e, evm: ""}));
        setWalletConnecting(true);

        try {
            const {walletClient, address} = await connectEvmWalletLib();
            setWallet((w) => ({...w, evm: {walletClient, address}}));
        } catch (err) {
            setWalletError((e) => ({...e, evm: humanizeError(err)}));
        } finally {
            setWalletConnecting(false);
        }
    }

    async function connectSvmWallet(kind) {
        setWalletError((e) => ({...e, svm: ""}));
        setWalletConnecting(true);

        try {
            const connectors = {
                phantom: connectPhantom,
                metamask: connectSolanaMetaMask,
                walletconnect: connectSolanaWalletConnect,
            };
            const conn = await connectors[kind]();

            setWallet((w) => ({...w, svm: {...conn, kind}}));
        } catch (err) {
            setWalletError((e) => ({...e, svm: humanizeError(err)}));
        } finally {
            setWalletConnecting(false);
        }
    }

    async function disconnectWallet(type) {
        if (type === "svm") {
            try {
                await wallet.svm?.adapter?.disconnect?.();
            } catch {
                /* ignore */
            }
        }

        setWallet((w) => ({...w, [type]: null}));
    }

    function handleAddCustomToken(token) {
        setCustomCoins((prev) => ({
            ...prev,
            [networkId]: [...(prev[networkId] || []), token],
        }));
        setCoinContract(token.contract);
    }

    function handleChip(v) {
        setActiveChip(v);
        setAmount(String(v));
    }

    // Renders the receipt straight to a PDF and downloads it — no browser
    // print dialog at all, so there's no paper-size guessing and no
    // browser-injected header/footer (that strip is added by the print
    // pipeline itself; going around it is the only way to avoid it).
    //
    // html2pdf snapshots the DOM under whatever styles are active right
    // now (screen media, not print media), so the ticket look is applied
    // by toggling a plain class — .ndp-pdf-active — for the moment of
    // capture, rather than living behind an unusable @media print rule.
    async function handleDownloadPdf() {
        const el = document.getElementById("ndp-receipt-printable");
        if (!el || generatingPdf) return;

        setGeneratingPdf(true);
        el.classList.add("ndp-pdf-active");

        try {
            // Let the class-driven styles (and any images, like the QR
            // code) finish painting before html2canvas walks the DOM.
            await new Promise((resolve) => requestAnimationFrame(resolve));

            // Line the "tear here" notches up with the dashed divider
            // above the total — that row's top border is the actual
            // perforation line, and its offset shifts with content
            // (address wrapping, note length, etc.), so it's measured
            // fresh each export rather than assumed to sit at 50%.
            //
            // getBoundingClientRect (not offsetTop) keeps both
            // measurements in the same coordinate space, and the
            // border-width correction matters because CSS positions the
            // notches relative to the card's padding edge, not its
            // border edge.
            const totalRow = el.querySelector(".ndp-receipt-total-row");
            if (totalRow) {
                const elRect = el.getBoundingClientRect();
                const rowRect = totalRow.getBoundingClientRect();
                const elBorderTop = parseFloat(getComputedStyle(el).borderTopWidth) || 0;
                const notchTop = (rowRect.top - elRect.top) - elBorderTop;
                el.style.setProperty("--ndp-notch-top", `${notchTop}px`);
            }

            const rect = el.getBoundingClientRect();
            const width = Math.ceil(rect.width);
            const height = Math.ceil(rect.height);

            await html2pdf()
                .set({
                    margin: 0,
                    filename: `bejibun-donation-receipt-${Date.now()}.pdf`,
                    image: {type: "jpeg", quality: 0.98},
                    html2canvas: {
                        scale: 2,
                        backgroundColor: "#ffffff",
                        useCORS: true,
                        // Pin html2canvas's capture window to the receipt's
                        // exact size — otherwise it can measure a hair
                        // taller than the page we're about to give it,
                        // and that leftover sliver spills onto a second,
                        // almost-blank page.
                        width,
                        height,
                        windowWidth: width,
                        windowHeight: height
                    },
                    jsPDF: {unit: "px", format: [width, height], orientation: "portrait"},
                    // Belt-and-suspenders: even with matched dimensions,
                    // never let html2pdf auto-split this into more pages.
                    pagebreak: {mode: ["avoid-all"]}
                })
                .from(el)
                .save();
        } catch (err) {
            setSendError(humanizeError(err));
        } finally {
            el.classList.remove("ndp-pdf-active");
            el.style.removeProperty("--ndp-notch-top");
            setGeneratingPdf(false);
        }
    }

    function handleManualAmount(v) {
        const clean = v.replace(/[^0-9.]/g, "");
        setAmount(clean);

        const n = Number(clean);
        setActiveChip(AMOUNTS.includes(n) ? n : null);
    }

    const numericAmount = Number(amount);
    const canDonate = numericAmount > 0 && Number.isFinite(numericAmount);

    const isEvm = network.chainType === "evm";
    const walletConn = isEvm ? wallet.evm : wallet.svm;
    const walletAddress = isEvm ? walletConn?.address : walletConn?.pubkey;

    const handleDonate = useCallback(async () => {
        if (!walletConn || !canDonate) return;

        setSending(true);
        setSendError("");
        setSendResult(null);

        const svmSigner = !isEvm && walletConn
            ? toSolanaSigner(walletConn.provider, walletConn.pubkey)
            : undefined;

        const {fetchWithPayment, httpClient} = createPaymentFetch({
            walletClient: isEvm ? walletConn.walletClient : undefined,
            address: isEvm ? walletConn.address : undefined,
            svmSigner
        });

        try {
            const url = `${RESOURCE_URL}/donate`;
            const response = await fetchWithPayment(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    price: {
                        asset: coin.contract,
                        amount: toBaseUnits(amount, coin.decimals),
                        extra: {
                            name: coin.name,
                            version: "2"
                        }
                    },
                    symbol: coin.symbol,
                    decimals: coin.decimals,
                    network: {
                        id: network.id,
                        name: network.name
                    },
                    address: walletAddress,
                    message: message.trim() || undefined
                }),
            });

            if (!response.ok) {
                const text = await response.text().catch(() => "");

                throw new Error(text || `Request failed with status ${response.status}`);
            }

            const data = await response.json();
            const settlement = readSettlement(httpClient, response);

            setSendResult({data, settlement, timestamp: new Date()});
        } catch (err) {
            setSendError(humanizeError(err));
        } finally {
            setSending(false);
        }
    }, [walletConn, isEvm, canDonate, coin, amount, network, walletAddress, message]);

    return (
        <div className="ndp-root">
            <div className="ndp-bg-grid ndp-no-print" aria-hidden="true"/>

            <div className="ndp-shell">
                {/* -------- Left: narrative + receipt -------- */}
                <div className="ndp-left">
                    <div className="ndp-eyebrow ndp-no-print">On-chain support</div>
                    <h1 className="ndp-headline ndp-no-print">
                        Fuel the <em>next commit.</em>
                    </h1>
                    <p className="ndp-sub ndp-no-print">
                        Bejibun Labs builds open tools for the decentralized web.
                        Contributions move straight from your wallet to the project's — no processor,
                        no delay, no cut taken along the way.
                    </p>

                    <div className="ndp-receipt" id="ndp-receipt-printable">
                        <div className="ndp-receipt-brand ndp-print-only">
                            <div className="ndp-receipt-brand-name">Bejibun Labs</div>
                            <div className="ndp-receipt-brand-sub">Donation receipt</div>
                        </div>

                        <div className="ndp-receipt-top ndp-screen-only">
                            <span className="ndp-receipt-title">Donation receipt</span>
                            <span className="ndp-receipt-id">#{network.nativeCurrency.symbol}-{coin.symbol}</span>
                        </div>
                        <div className="ndp-perf ndp-screen-only"/>
                        <div className="ndp-receipt-rows">
                            {walletAddress && (
                                <div className="ndp-receipt-row">
                                    <span className="ndp-receipt-key">From</span>
                                    <span className="ndp-receipt-val ndp-receipt-mono-full">{walletAddress}</span>
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

                            {/* This row renders identically on screen and on the printed
                                ticket, so the stablecoin-vs-token amount format
                                (`$25` vs `0.5 SOL`) only lives in one place. Print styling
                                moves it visually to the bottom via CSS flex order. */}
                            <div className="ndp-receipt-row ndp-receipt-total-row">
                                <span className="ndp-receipt-key ndp-receipt-total-label">Amount</span>
                                <span className="ndp-receipt-val ndp-receipt-amount">
                                    {canDonate
                                        ? (coin.stablecoin
                                            ? `$${numericAmount.toLocaleString()}`
                                            : `${numericAmount.toLocaleString()} ${coin.symbol}`)
                                        : "—"}
                                </span>
                            </div>

                            {message.trim() && (
                                <div className="ndp-receipt-row">
                                    <span className="ndp-receipt-key">Note</span>
                                    <span className="ndp-receipt-note">&ldquo;{message.trim()}&rdquo;</span>
                                </div>
                            )}

                            {sendResult && (
                                <>
                                    <div className="ndp-receipt-row">
                                        <span className="ndp-receipt-key">Date</span>
                                        <span className="ndp-receipt-val">
                                            {(sendResult.timestamp ?? new Date()).toLocaleString()}
                                        </span>
                                    </div>

                                    {sendResult.settlement?.transaction && (
                                        <div className="ndp-receipt-row">
                                            <span className="ndp-receipt-key">Tx</span>
                                            <span className="ndp-receipt-val ndp-receipt-mono-full">
                                                {sendResult.settlement.transaction}
                                            </span>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>

                        {sendResult && qrDataUrl && (
                            <div className="ndp-receipt-qr ndp-print-only">
                                <img src={qrDataUrl} alt="QR code linking to this transaction on the block explorer"/>
                                <div className="ndp-receipt-qr-caption">Scan to view this transaction</div>
                            </div>
                        )}

                        <div className="ndp-receipt-bottom">Settles directly on {network.name}</div>
                    </div>
                </div>

                {/* -------- Right: form card -------- */}
                <div className="ndp-card ndp-no-print">
                    <h2 className="ndp-card-title">
                        {sendResult ? "Donation sent" : "Make a donation"}
                    </h2>
                    <p className="ndp-card-sub">
                        {sendResult
                            ? "Thank you — your donation has settled on-chain."
                            : "Choose a network and asset, then set an amount."}
                    </p>

                    <div>
                        <NetworkDropdown networks={NETWORKS} value={networkId} onChange={handleNetworkChange}/>

                        <CoinDropdown
                            coins={coinList}
                            value={coin.contract}
                            onChange={setCoinContract}
                            onAddCustom={handleAddCustomToken}
                            accent={network.accent}
                            network={network}
                            className="ndp-field"
                        />

                        <WalletConnect
                            chainType={network.chainType}
                            address={walletAddress || null}
                            walletKind={wallet.svm?.kind}
                            connecting={walletConnecting}
                            error={walletError[network.chainType] || ""}
                            onConnect={network.chainType === "evm" ? connectEvmWallet : connectSvmWallet}
                            onDisconnect={() => disconnectWallet(network.chainType)}
                            className="ndp-field"
                        />

                        {coin.stablecoin && (
                            <div className="ndp-field">
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
                            </div>
                        )}

                        <div className="ndp-field ndp-amount-input-wrap">
                            <span className="ndp-amount-currency">{coin.stablecoin ? "$" : ""}</span>
                            <input
                                className="ndp-amount-input"
                                inputMode="decimal"
                                placeholder="0.00"
                                value={amount}
                                onChange={(e) => handleManualAmount(e.target.value)}
                                aria-label={coin.stablecoin ? "Custom amount in dollars" : `Amount in ${coin.symbol}`}
                            />
                            <span className="ndp-amount-suffix">
                                {coin.symbol}
                            </span>
                        </div>

                        <div className="ndp-field">
                            <label className="ndp-label">Message (optional)</label>
                            <textarea
                                className="ndp-textarea"
                                placeholder="Say a few words to go with your donation..."
                                value={message}
                                maxLength={200}
                                onChange={(e) => setMessage(e.target.value)}
                            />
                            <p className="ndp-char-count">{message.length}/200</p>
                        </div>
                    </div>

                    {!sendResult && (
                        <button
                            type="button"
                            className="ndp-submit"
                            disabled={!canDonate || !walletAddress || sending}
                            onClick={handleDonate}
                        >
                            {sending ? (
                                <>
                                    <Loader2 size={16} className="ndp-spin"/>
                                    Processing…
                                </>
                            ) : (
                                <>
                                    {coin.stablecoin
                                        ? <>Donate {canDonate ? `$${numericAmount.toLocaleString()}` : ""} in {coin.symbol}</>
                                        : <>Donate {canDonate ? `${numericAmount.toLocaleString()} ${coin.symbol}` : coin.symbol}</>}
                                    <ArrowRight size={17}/>
                                </>
                            )}
                        </button>
                    )}

                    {!walletAddress && !sendResult && (
                        <p className="ndp-wallet-error">
                            <AlertCircle size={13}/>
                            Connect a {network.name} wallet to send this donation.
                        </p>
                    )}

                    {sendError && (
                        <p className="ndp-wallet-error">
                            <AlertCircle size={13}/>
                            {sendError}
                        </p>
                    )}

                    {sendResult && (
                        <>
                            <p className="ndp-reveal-note">
                                Settled on {network.name}
                                {sendResult.settlement?.transaction && (
                                    <>
                                        {" "}— tx{" "}
                                        {(() => {
                                            const txHash = sendResult.settlement.transaction;
                                            const url = getExplorerTxUrl(network, txHash);

                                            return url ? (
                                                <a
                                                    href={url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="ndp-tx-link"
                                                >
                                                    {shorten(txHash, 10, 10)}
                                                </a>
                                            ) : (
                                                shorten(txHash, 10, 10)
                                            );
                                        })()}
                                    </>
                                )}
                                {message.trim() ? " — your note was saved with this donation." : "."}
                            </p>

                            <div className="ndp-post-donate-actions" style={{display: "flex", gap: "10px"}}>
                                <button
                                    type="button"
                                    className="ndp-btn-secondary"
                                    onClick={handleDownloadPdf}
                                    disabled={generatingPdf}
                                >
                                    {generatingPdf ? (
                                        <>
                                            <Loader2 size={14} className="ndp-spin"/>
                                            Generating…
                                        </>
                                    ) : (
                                        <>
                                            <Download size={14}/>
                                            Download PDF
                                        </>
                                    )}
                                </button>

                                <button
                                    type="button"
                                    className="ndp-btn-secondary"
                                    onClick={() => {
                                        setSendResult(null);
                                        setSendError("");
                                    }}
                                >
                                    Make another donation
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}