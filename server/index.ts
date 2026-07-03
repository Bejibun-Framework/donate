import type {Network} from "@x402/core";
import {facilitator} from "@coinbase/x402";
import {HTTPFacilitatorClient} from "@x402/core/server";
import {ExactEvmScheme} from "@x402/evm/exact/server";
import {paymentMiddleware, x402ResourceServer} from "@x402/express";
import {ExactSvmScheme} from "@x402/svm/exact/server";
import cors from "cors";
import express from "express";
import os from "os";
import "dotenv/config";

const PORT: number = Number(process.env.PORT) || 4021;
const EVM_PAY_TO: string = process.env.PAY_TO_ADDRESS || "0xdABe8750061410D35cE52EB2a418c8cB004788B3";
const SVM_PAY_TO: string = process.env.SOLANA_PAY_TO_ADDRESS || "GAnoyvy9p3QFyxikWDh9hA3fmSk2uiPLNWyQ579cckMn";
const FACILITATOR_URL: string = process.env.FACILITATOR_URL || "https://x402.org/facilitator";
const CLIENT_ORIGIN: string = process.env.CLIENT_ORIGIN || "http://localhost:5173";

const EVM_NETWORK: Network = "eip155:8453";
const SOLANA_NETWORK: Network = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";

if (!EVM_PAY_TO) {
    console.warn(`⚠️PAY_TO_ADDRESS is not set. Copy server/.env.example to server/.env and add your Base wallet address.${os.EOL}`);
}
if (!SVM_PAY_TO) {
    console.warn(`⚠️SOLANA_PAY_TO_ADDRESS is not set. Add your Solana wallet address to server/.env for SVM support.${os.EOL}`);
}

const facilitatorClient: HTTPFacilitatorClient = (process.env.CDP_API_KEY_ID && process.env.CDP_API_KEY_SECRET)
    ? new HTTPFacilitatorClient(facilitator)
    : new HTTPFacilitatorClient({url: FACILITATOR_URL});

const app = express();

app.use(express.json());

app.use(
    cors({
        origin: CLIENT_ORIGIN,
        exposedHeaders: [
            "PAYMENT-REQUIRED",
            "PAYMENT-RESPONSE",
            "X-PAYMENT-RESPONSE",
            "WWW-Authenticate",
            "EXTENSION-RESPONSES"
        ],
        allowedHeaders: [
            "Content-Type",
            "PAYMENT-SIGNATURE",
            "X-PAYMENT",
            "Access-Control-Expose-Headers"
        ]
    })
);

const resourceServer: x402ResourceServer = new x402ResourceServer(facilitatorClient)
    .register(EVM_NETWORK, new ExactEvmScheme())
    .register(SOLANA_NETWORK, new ExactSvmScheme());

app.get("/api/health", (_req, res) => {
    res.json({
        status: "ok",
        evmNetwork: EVM_NETWORK,
        solanaNetwork: SOLANA_NETWORK,
        payTo: EVM_PAY_TO ?? null
    });
});

app.use(
    paymentMiddleware(
        {
            "POST /api/quote": {
                accepts: [
                    {
                        scheme: "exact",
                        price: "$0.001",
                        network: EVM_NETWORK,
                        payTo: EVM_PAY_TO
                    },
                    {
                        scheme: "exact",
                        price: "$0.001",
                        network: SOLANA_NETWORK,
                        payTo: SVM_PAY_TO
                    }
                ],
                description: "A single random market quote",
                mimeType: "application/json"
            }
        },
        resourceServer
    )
);

const QUOTES = [
    "Buy low, sell high — easier said than done.",
    "The trend is your friend, until it ends.",
    "Time in the market beats timing the market.",
    "Markets can stay irrational longer than you can stay solvent.",
    "The four most dangerous words: this time it's different.",
];

app.post("/api/quote", (_req, res) => {
    const quote: string = QUOTES[Math.floor(Math.random() * QUOTES.length)];

    res.json({quote, paidAt: new Date().toISOString()});
});

app.listen(PORT, () => {
    console.log(`💸 x402 resource server listening on http://localhost:${PORT}`);
    console.log(`   Free:   GET /api/health`);
    console.log(`   exact:  GET /api/quote     ($0.001 EVM or Solana USDC)`);
});