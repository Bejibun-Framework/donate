# Bejibun Donations — x402 Payment Server

A minimal [Hono](https://hono.dev) worker (deployed on Cloudflare Workers) that accepts crypto donations gated by
the [x402 payment protocol](https://www.x402.org), across multiple EVM chains and Solana. On a successful payment it
posts a formatted notification to a Telegram group/channel.

---

## How it works

1. A client sends `POST /donate` with the donation details (price, network, donor address, optional message).
2. The server uses `@bejibun/x402` to attach x402 payment requirements to the route. If the request doesn't already
   carry a valid `PAYMENT` header, x402 returns a `402 Payment Required` response describing what's owed.
3. Once the client resolves payment and retries the request with a valid payment proof, the middleware settles the
   payment against `FACILITATOR_URL` and calls the route handler, which responds with a `paid_at` timestamp.
4. If settlement succeeds (`PAYMENT-RESPONSE` header present and `success: true`), the server builds block-explorer
   links for the address/transaction and sends a rich HTML message to Telegram via the Bot API.

Supported networks:

| Chain       | Type | Explorer source                  |
| ----------- | ---- | -------------------------------- |
| Base        | EVM  | viem chain config                |
| Polygon     | EVM  | viem chain config                |
| Arbitrum    | EVM  | viem chain config                |
| World Chain | EVM  | viem chain config                |
| Solana      | SVM  | hardcoded explorer map (Solscan) |

---

## Requirements

- [Bun](https://bun.sh) or Node.js
- A Cloudflare Workers account (for deployment) with [Wrangler](https://developers.cloudflare.com/workers/wrangler)
  installed
- A Telegram bot token and target chat/group ID (optional — only needed for notifications)
- CDP API credentials if your facilitator requires authenticated settlement

---

## Environment variables

Configure these in `wrangler.toml` under `[vars]` for non-secret values, and via
`wrangler secret put <NAME>` for secrets. See `server/.dev.vars.example` for local dev.

| Variable                | Required         | Description                                                         |
| ----------------------- | ---------------- | ------------------------------------------------------------------- |
| `PAY_TO_ADDRESS`        | No (has default) | EVM address that receives donations                                 |
| `SOLANA_PAY_TO_ADDRESS` | No (has default) | Solana address that receives donations                              |
| `FACILITATOR_URL`       | Yes              | x402 facilitator endpoint used to verify/settle payments            |
| `CDP_API_KEY_ID`        | No               | Coinbase Developer Platform API key ID, if the facilitator needs it |
| `CDP_API_KEY_SECRET`    | No               | Coinbase Developer Platform API secret                              |
| `TELEGRAM_BOT_TOKEN`    | No               | Bot token used to send donation notifications                       |
| `TELEGRAM_GROUP_ID`     | No               | Chat/group ID the bot posts notifications to                        |

---

## Running locally

```bash
# install dependencies
bun install

# start the worker locally
bun run dev
# or, with wrangler directly
wrangler dev
```

## Deploying

```bash
wrangler deploy
```

---

## API

### `GET /`

Health check.

```json
{
  "data": null,
  "message": "Success",
  "status": 200
}
```

### `POST /donate`

Initiates (or settles) an x402-gated donation.

**Request body**

```json
{
  "price": {
    "asset": "0x...",
    "amount": "1000000",
    "extra": {
      "name": "USDC",
      "version": "2"
    }
  },
  "symbol": "USDC",
  "decimals": 6,
  "network": {
    "id": "eip155:8453",
    "name": "Base"
  },
  "address": "0xDonorAddress...",
  "message": "Optional message of support"
}
```

- `network.id` must be one of the supported x402 network identifiers:
    - EVM chains: `eip155:<chainId>` (e.g. `eip155:8453` for Base, `eip155:137` for Polygon,
      `eip155:42161` for Arbitrum, `eip155:480` for World Chain)
    - Solana: `solana:<genesisHash>` (e.g. `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` for mainnet)
- `price` and `network` are required; missing either returns `400`.
- Malformed JSON returns `400`.

**Responses**

| Status                 | Meaning                                                                                                                                                                                         |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `402 Payment Required` | No valid payment attached yet — response body describes payment requirements per the x402 spec (scheme, network, amount, `payTo`).                                                              |
| `200 OK`               | Payment verified/settled. Body: `{ "paid_at": "<ISO timestamp>" }`. A `PAYMENT-RESPONSE` header is also included, base64-encoded JSON with settlement details (`success`, `transaction`, etc.). |
| `400 Bad Request`      | Missing `price`/`network`, or invalid JSON body.                                                                                                                                                |

On a successful settlement, the server automatically sends a formatted donation notification to the configured Telegram
group — no separate client action needed.

---

## Client integration

The server does not ship a bundled frontend in this repo excerpt; any client that speaks the x402 protocol can integrate
against `/donate`. The typical flow is:

1. **Initial request** — `POST /donate` with the JSON body described above (no payment attached yet).
2. **Handle `402`** — read the payment requirements from the response and use an x402-aware wallet/client library (
   e.g. `x402-fetch`, `x402-axios`, or a wallet SDK that understands x402) to construct a payment for the
   requested `network`, `asset`, and `amount`.
3. **Retry with proof** — resend `POST /donate` with the `PAYMENT` header attached, using the same request body.
4. **Read the result** — on `200`, the response contains `paid_at`; the `PAYMENT-RESPONSE`
   header (base64 JSON) contains settlement info such as the transaction hash, which the client can use to link to the
   appropriate block explorer.

Because `getExplorerLinks` on the server keys off `network.id`, any client should send the exact same network identifier
strings the server recognizes (see the table above) to ensure Telegram notifications render correct explorer links.

> Note: if you have the actual client source (e.g. a React/Next app calling this endpoint),
> share it and this section can be replaced with concrete setup/run instructions, package
> scripts, and environment variables for the client itself.

---

## Notes

- CORS is wide open (`origin: "*"`) — tighten this before production if the API should only be callable from a known
  frontend origin.
- Telegram notification failures are caught and logged but do not affect the HTTP response returned to the client — a
  donor still gets a `200` even if the Telegram call fails.
- `formatTokenAmount` assumes the raw amount is an integer string in the token's smallest unit and formats it
  using `decimals` from the request payload.