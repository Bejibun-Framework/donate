import {createWalletClient, custom} from "viem";
// import {base} from "viem/chains";
import {baseSepolia} from "viem/chains";

/** Returns window.ethereum or throws a friendly error if no wallet is injected. */
function getInjectedProvider() {
    if (typeof window === "undefined" || !window.ethereum) {
        throw new Error("No EVM wallet found. Install MetaMask (or another injected wallet) and reload.");
    }

    return window.ethereum;
}

/**
 * Connects to the user's injected EVM wallet and switches to Base.
 * Returns a viem WalletClient plus the connected address.
 */
export async function connectEvmWallet() {
    const provider = getInjectedProvider();

    const walletClient = createWalletClient({
        chain: baseSepolia,
        transport: custom(provider)
    });

    const [address] = await walletClient.requestAddresses();

    try {
        await walletClient.switchChain({id: baseSepolia.id});
    } catch (err) {
        const code = err?.code ?? err?.cause?.code;
        if (code === 4902) {
            await provider.request({
                method: "wallet_addEthereumChain",
                params: [
                    {
                        chainId: baseSepolia.id,
                        chainName: baseSepolia.name,
                        nativeCurrency: baseSepolia.nativeCurrency,
                        rpcUrls: baseSepolia.rpcUrls,
                        blockExplorerUrls: baseSepolia.blockExplorers
                    }
                ],
            });
        } else {
            throw err;
        }
    }

    return {walletClient, address};
}