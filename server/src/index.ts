import type {Chain} from "viem";
import {Context, Hono, Next} from "hono";
import {cors} from "hono/cors";
import {TNetwork, TScheme} from "@bejibun/x402/types";
import {arbitrum, base, polygon, worldchain} from "viem/chains";

(globalThis as any).Bun = {
    stringWidth: (value: string) => value.length,
};

const {default: X402} = await import("@bejibun/x402");

/**
 * Env bindings, configured in wrangler.toml ([vars]) or via `wrangler secret put`.
 * See server/.dev.vars.example for local development.
 */
export type Bindings = {
    PAY_TO_ADDRESS: string;
    SOLANA_PAY_TO_ADDRESS: string;
    FACILITATOR_URL: string;
    CDP_API_KEY_ID?: string;
    CDP_API_KEY_SECRET?: string;
    TELEGRAM_BOT_TOKEN?: string;
    TELEGRAM_GROUP_ID?: string;
};

const DEFAULT_EVM_PAY_TO = "0xdABe8750061410D35cE52EB2a418c8cB004788B3";
const DEFAULT_SVM_PAY_TO = "GAnoyvy9p3QFyxikWDh9hA3fmSk2uiPLNWyQ579cckMn";

// Every EVM network the frontend can send, keyed by the same `eip155:<id>`
// string used in `network.id`. The viem chain object is the single source
// of truth for the block explorer's base URL — no separate hardcoded map
// to keep in sync with the frontend.
const EVM_CHAINS: Record<string, Chain> = {
    [`eip155:${base.id}`]: base,
    [`eip155:${polygon.id}`]: polygon,
    [`eip155:${arbitrum.id}`]: arbitrum,
    [`eip155:${worldchain.id}`]: worldchain
};

// Solana has no viem chain, so its explorer is tracked separately. Keyed
// by the same `solana:<genesis-hash>` id the frontend uses.
const SOLANA_EXPLORER_BASE: Record<string, string> = {
    "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp": "https://solscan.io"
};

function isSolanaNetwork(networkId: string) {
    return networkId.startsWith("solana:");
}

// Builds address/tx explorer links for whichever network the donation
// came in on. Falls back to the raw value (no link) if the network id
// isn't recognized, rather than guessing at a URL or crashing.
function getExplorerLinks(networkId: string) {
    if (isSolanaNetwork(networkId)) {
        const base = SOLANA_EXPLORER_BASE[networkId];

        return {
            addressUrl: (a: string) => (base ? `${base}/account/${a}` : a),
            txUrl: (t: string) => (base ? `${base}/tx/${t}` : t)
        };
    }

    const chain = EVM_CHAINS[networkId];
    const explorerBase = chain?.blockExplorers?.default?.url;

    return {
        addressUrl: (a: string) => (explorerBase ? `${explorerBase}/address/${a}` : a),
        txUrl: (t: string) => (explorerBase ? `${explorerBase}/tx/${t}` : t)
    };
}

const formatTokenAmount = (rawAmount, decimals = 6) => {
    const raw = BigInt(rawAmount);
    const divisor = BigInt(10 ** decimals);
    const whole = raw / divisor;
    const fraction = raw % divisor;
    const fractionStr = fraction.toString().padStart(decimals, "0").replace(/0+$/, "");

    return fractionStr ? `${whole}.${fractionStr}` : whole.toString();
};

const app = new Hono<{
    Bindings: Bindings
}>();

app.use("*", async (c: Context, next: Next) => {
    const corsMiddleware = cors({
        origin: "*",
        exposeHeaders: ["*"],
        allowHeaders: ["*"]
    });

    return corsMiddleware(c, next);
});

app.get("/", async (c: Context) => {
    return c.json({
        data: null,
        message: "Success",
        status: 200
    }, 200);
});

app.post("/donate", async (c: Context) => {
    let payload: {
        price: {
            asset: string;
            amount: string;
            extra: {
                name: string;
                version: string;
            };
        };
        symbol: string;
        decimals: number;
        network: {
            id: TNetwork,
            name: string
        };
        address: string;
        message?: string;
    };

    try {
        payload = await c.req.json();

        if (!payload.price) {
            return c.json({
                data: null,
                message: "The price field is required.",
                status: 400
            }, 400);
        }

        if (!payload.network) {
            return c.json({
                data: null,
                message: "The network field is required.",
                status: 400
            }, 400);
        }
    } catch {
        return c.json({
            data: null,
            message: "Request body must be valid JSON.",
            status: 400
        }, 400);
    }

    const evmPayTo: string = c.env.PAY_TO_ADDRESS || DEFAULT_EVM_PAY_TO;
    const svmPayTo: string = c.env.SOLANA_PAY_TO_ADDRESS || DEFAULT_SVM_PAY_TO;

    const response = await X402.setRoutePayment({
        scheme: "exact" as TScheme,
        price: payload.price,
        network: payload.network.id,
        payTo: payload.network.id.startsWith("eip155:") ? evmPayTo : svmPayTo,
        description: "Donate to Bejibun labs",
        mimeType: "application/json"
    }).setRequest({
        url: c.req.url,
        headers: c.req.raw.headers,
        method: c.req.method
    }).middleware(async () => {
        return c.json({
            paid_at: new Date().toISOString()
        });
    });

    const paymentResponseHeader = response.headers.get("PAYMENT-RESPONSE");
    if (paymentResponseHeader) {
        try {
            const settlement = JSON.parse(atob(paymentResponseHeader));

            if (settlement.success) {
                const BOT_TOKEN = c.env.TELEGRAM_BOT_TOKEN;
                const GROUP_ID = c.env.TELEGRAM_GROUP_ID;

                const now: Date = new Date();
                const formattedTime: string = `${now.toISOString().slice(0, 19).replace("T", " ")} UTC`;
                const txHash = settlement.transaction;

                const {addressUrl, txUrl} = getExplorerLinks(payload.network.id);

                const message: string = `
✨ <b>A New Donation Has Arrived!</b>
━━━━━━━━━━━━━━━━━━━━

💰 <b>Amount</b>
<code>${formatTokenAmount((payload.price as any).amount, payload.decimals)} ${payload.symbol}</code>

🌐 <b>Network</b>
${payload.network.name}

👤 <b>Wallet</b>
<a href="${addressUrl(payload.address)}">${payload.address}</a>

📝 <b>Message of Support</b>
${payload.message ? `<i>"${payload.message}"</i>` : "-"}

🧾 <b>Transaction</b>
<a href="${txUrl(txHash)}">${txHash}</a>

🕒 <b>Time</b>
${formattedTime}

━━━━━━━━━━━━━━━━━━━━
💫 Every contribution fuels the journey — powering new features, better docs, and steady care for this project.
Grateful beyond words. 🌱
`;

                await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        chat_id: GROUP_ID,
                        text: message,
                        parse_mode: "HTML",
                        disable_web_page_preview: true
                    })
                });
            }
        } catch (e) {
            console.error("Failed to parse PAYMENT-RESPONSE header:", e);
        }
    }

    return response;
});

export default app;