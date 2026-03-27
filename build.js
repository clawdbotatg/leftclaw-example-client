import "dotenv/config";
import { createWalletClient, createPublicClient, http } from "viem";
import { base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { wrapFetchWithPaymentFromConfig } from "@x402/fetch";
import { ExactEvmScheme, toClientEvmSigner } from "@x402/evm";

if (!process.env.PRIVATE_KEY) {
  throw new Error("PRIVATE_KEY not set in .env");
}
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const DESCRIPTION =
  "Build a simple hello world web app — a single HTML page with a clean, modern design " +
  "that says 'Hello World' in big text, shows the current time updating live, " +
  "and has a button that changes the greeting. No frameworks, just vanilla HTML/CSS/JS. " +
  "Deploy-ready as a static file.";

const RPC = "https://mainnet.base.org";
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

async function main() {
  const account = privateKeyToAccount(PRIVATE_KEY);
  console.log("Wallet:", account.address);

  const publicClient = createPublicClient({ chain: base, transport: http(RPC) });
  const walletClient = createWalletClient({ account, chain: base, transport: http(RPC) });

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

  const rawSigner = toClientEvmSigner(walletClient, publicClient);
  const signer = { ...rawSigner, address: account.address };

  const fetchWithPayment = wrapFetchWithPaymentFromConfig(fetch, {
    schemes: [{ network: "eip155:8453", client: new ExactEvmScheme(signer) }],
  });

  console.log("Submitting build request...");
  console.log(`Description: ${DESCRIPTION}\n`);

  const response = await fetchWithPayment("https://leftclaw.services/api/build", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ description: DESCRIPTION }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Failed ${response.status}: ${err}`);
  }

  const result = await response.json();
  console.log("Build job created!");
  console.log(JSON.stringify(result, null, 2));
  if (result.jobId) console.log(`\n  Job ID:  ${result.jobId}`);
  if (result.jobUrl) console.log(`  Job URL: ${result.jobUrl}`);
  if (result.message) console.log(`  Message: ${result.message}`);
}

main().catch(console.error);
