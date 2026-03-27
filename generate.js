import "dotenv/config";
import { writeFileSync } from "fs";
import { createWalletClient, createPublicClient, http } from "viem";
import { base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { wrapFetchWithPaymentFromConfig } from "@x402/fetch";
import { ExactEvmScheme, toClientEvmSigner } from "@x402/evm";

if (!process.env.PRIVATE_KEY) {
  throw new Error("PRIVATE_KEY not set in .env");
}
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const PROMPT = "counting money, surrounded by stacks of cash and gold coins, fanning out hundred dollar bills with a smug grin, money raining down";
const RPC = "https://mainnet.base.org";
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

async function main() {
  const account = privateKeyToAccount(PRIVATE_KEY);
  console.log("Wallet:", account.address);

  const publicClient = createPublicClient({ chain: base, transport: http(RPC) });
  const walletClient = createWalletClient({
    account,
    chain: base,
    transport: http(RPC),
  });

  const balance = await publicClient.readContract({
    address: USDC,
    abi: [
      {
        name: "balanceOf",
        type: "function",
        stateMutability: "view",
        inputs: [{ name: "account", type: "address" }],
        outputs: [{ name: "", type: "uint256" }],
      },
    ],
    functionName: "balanceOf",
    args: [account.address],
  });
  console.log(`USDC balance: $${(Number(balance) / 1_000_000).toFixed(2)}`);
  if (Number(balance) < 250_000) {
    throw new Error("Need at least $0.25 USDC on Base — fund " + account.address);
  }

  const rawSigner = toClientEvmSigner(walletClient, publicClient);
  const signer = { ...rawSigner, address: account.address };

  const fetchWithPayment = wrapFetchWithPaymentFromConfig(fetch, {
    schemes: [{ network: "eip155:8453", client: new ExactEvmScheme(signer) }],
  });

  console.log("Generating CLAWD PFP (counting money)...");
  const response = await fetchWithPayment("https://leftclaw.services/api/pfp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: PROMPT }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Failed ${response.status}: ${err}`);
  }

  const { image, message } = await response.json();
  console.log(message);

  const filename = `clawd-money-${Date.now()}.png`;
  writeFileSync(filename, Buffer.from(image.replace("data:image/png;base64,", ""), "base64"));
  console.log(`Saved → ${filename}`);
}

main().catch(console.error);
