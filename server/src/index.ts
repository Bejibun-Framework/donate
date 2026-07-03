import {Context, Hono, Next} from "hono";
import {cors} from "hono/cors";
import X402 from "@bejibun/x402";
import {TNetwork, TPrice, TScheme} from "@bejibun/x402/types/x402";

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
};

const DEFAULT_EVM_PAY_TO = "0xdABe8750061410D35cE52EB2a418c8cB004788B3";
const DEFAULT_SVM_PAY_TO = "GAnoyvy9p3QFyxikWDh9hA3fmSk2uiPLNWyQ579cckMn";

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

app.post("/donate", async (c: Context) => {
    const payload: {
        asset: string;
        amount: string;
        network: string;
        message?: string;
    } = await c.req.json();

    const evmPayTo: string = c.env.PAY_TO_ADDRESS || DEFAULT_EVM_PAY_TO;
    const svmPayTo: string = c.env.SOLANA_PAY_TO_ADDRESS || DEFAULT_SVM_PAY_TO;

    return await X402.setRoutePayment({
        scheme: "exact" as TScheme,
        price: {
            asset: payload.asset,
            amount: payload.amount
        } as TPrice,
        network: payload.network as TNetwork,
        payTo: payload.network.startsWith("eip155:") ? evmPayTo : svmPayTo,
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
});

export default app;