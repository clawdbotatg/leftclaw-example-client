import "dotenv/config";
import { createWalletClient, createPublicClient, http } from "viem";
import { base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { wrapFetchWithPaymentFromConfig } from "@x402/fetch";
import { ExactEvmScheme, toClientEvmSigner } from "@x402/evm";

const URL_OR_ADDRESS = process.argv[2];
if (!URL_OR_ADDRESS) {
  console.error('Usage: node audit "<github-url-or-contract-address>"');
  console.error('  e.g. node audit "https://github.com/org/repo/blob/main/contracts/MyContract.sol"');
  console.error('  e.g. node audit "0x1234...abcd on Base — ERC20 token"');
  process.exit(1);
}

const CONTEXT = process.argv[3] || "";

if (!process.env.PRIVATE_KEY) {
  throw new Error("PRIVATE_KEY not set in .env");
}
const PRIVATE_KEY = process.env.PRIVATE_KEY;

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

  console.log("Submitting audit request...");
  console.log(`Target: ${URL_OR_ADDRESS}`);
  if (CONTEXT) console.log(`Context: ${CONTEXT}`);
  console.log();

  const body = { description: URL_OR_ADDRESS };
  if (CONTEXT) body.context = CONTEXT;

  const response = await fetchWithPayment("https://leftclaw.services/api/audit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Failed ${response.status}: ${err}`);
  }

  const result = await response.json();
  console.log("Audit job created!");
  if (result.jobId) console.log(`  Job ID:  ${result.jobId}`);
  if (result.jobUrl) console.log(`  Job URL: ${result.jobUrl}`);
  if (result.message) console.log(`  Message: ${result.message}`);
  console.log("\nVisit the Job URL to track progress and see the audit report.");
}

main().catch(console.error);
