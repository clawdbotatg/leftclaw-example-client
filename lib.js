import "dotenv/config";
import { createWalletClient, createPublicClient, http, encodePacked } from "viem";
import { base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { wrapFetchWithPaymentFromConfig } from "@x402/fetch";
import { ExactEvmScheme, toClientEvmSigner } from "@x402/evm";

// ─── Addresses ───────────────────────────────────────────────────────────────

export const CONTRACT    = "0xb2fb486a9569ad2c97d9c73936b46ef7fdaa413a";
export const CLAWD_TOKEN = "0x9f86dB9fc6f7c9408e8Fda3Ff8ce4e78ac7a6b07";
export const USDC_TOKEN  = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
export const WETH        = "0x4200000000000000000000000000000000000006";
export const QUOTER      = "0x3d4e44Eb1374240CE5F1B136aa68B6a27e59f8e7"; // UniV3 QuoterV2 on Base
export const RPC         = "https://mainnet.base.org";

// Service type IDs as seeded at deploy
export const SERVICE_IDS = {
  "consult":      1,
  "consult-deep": 2,
  "pfp":          3,
  "audit":        4,
  "qa":           5,
  "build":        6,
  "research":     7,
  "judge":        8,
  "humanqa":      9,
  "feature":      10,
};

const SLIPPAGE = 10n; // 10% slippage buffer for ETH/CLAWD quotes

// ─── ABIs ────────────────────────────────────────────────────────────────────

const CONTRACT_ABI = [
  {
    name: "getServiceType", type: "function", stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [{ name: "", type: "tuple", components: [
      { name: "id", type: "uint256" }, { name: "name", type: "string" },
      { name: "slug", type: "string" }, { name: "priceUsd", type: "uint256" },
      { name: "cvDivisor", type: "uint256" }, { name: "status", type: "string" },
    ]}],
  },
  {
    name: "postJobWithUsdc", type: "function", stateMutability: "nonpayable",
    inputs: [
      { name: "serviceTypeId", type: "uint256" },
      { name: "description", type: "string" },
      { name: "minClawdOut", type: "uint256" },
    ],
    outputs: [],
  },
  {
    name: "postJobWithETH", type: "function", stateMutability: "payable",
    inputs: [
      { name: "serviceTypeId", type: "uint256" },
      { name: "description", type: "string" },
      { name: "minClawdOut", type: "uint256" },
    ],
    outputs: [],
  },
  {
    name: "postJob", type: "function", stateMutability: "nonpayable",
    inputs: [
      { name: "serviceTypeId", type: "uint256" },
      { name: "clawdAmount", type: "uint256" },
      { name: "description", type: "string" },
    ],
    outputs: [],
  },
  {
    name: "postJobWithCV", type: "function", stateMutability: "nonpayable",
    inputs: [
      { name: "serviceTypeId", type: "uint256" },
      { name: "cvAmount", type: "uint256" },
      { name: "description", type: "string" },
    ],
    outputs: [],
  },
];

const ERC20_ABI = [
  {
    name: "approve", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "balanceOf", type: "function", stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
];

// Mark as view so viem uses eth_call (quoter doesn't actually modify state)
const QUOTER_ABI = [
  {
    name: "quoteExactInput", type: "function", stateMutability: "view",
    inputs: [{ name: "path", type: "bytes" }, { name: "amountIn", type: "uint256" }],
    outputs: [
      { name: "amountOut", type: "uint256" },
      { name: "sqrtPriceX96AfterList", type: "uint160[]" },
      { name: "initializedTicksCrossedList", type: "uint32[]" },
      { name: "gasEstimate", type: "uint256" },
    ],
  },
  {
    name: "quoteExactOutput", type: "function", stateMutability: "view",
    inputs: [{ name: "path", type: "bytes" }, { name: "amountOut", type: "uint256" }],
    outputs: [
      { name: "amountIn", type: "uint256" },
      { name: "sqrtPriceX96AfterList", type: "uint160[]" },
      { name: "initializedTicksCrossedList", type: "uint32[]" },
      { name: "gasEstimate", type: "uint256" },
    ],
  },
];

// USDC → WETH → CLAWD (0.05% + 1% pools)
const USDC_TO_CLAWD_PATH = encodePacked(
  ["address", "uint24", "address", "uint24", "address"],
  [USDC_TOKEN, 500, WETH, 10000, CLAWD_TOKEN],
);

// Reversed for quoteExactOutput: CLAWD → WETH (to find ETH needed to buy CLAWD)
const CLAWD_TO_WETH_PATH = encodePacked(
  ["address", "uint24", "address"],
  [CLAWD_TOKEN, 10000, WETH],
);

// ─── Wallet Setup ─────────────────────────────────────────────────────────────

export function setupWallet() {
  if (!process.env.PRIVATE_KEY) throw new Error("PRIVATE_KEY not set in .env");
  const account = privateKeyToAccount(process.env.PRIVATE_KEY);
  const publicClient = createPublicClient({ chain: base, transport: http(RPC) });
  const walletClient = createWalletClient({ account, chain: base, transport: http(RPC) });
  return { account, publicClient, walletClient };
}

export async function logBalance(publicClient, address) {
  const bal = await publicClient.readContract({
    address: USDC_TOKEN, abi: ERC20_ABI, functionName: "balanceOf", args: [address],
  });
  console.log(`Wallet: ${address}`);
  console.log(`USDC balance: $${(Number(bal) / 1_000_000).toFixed(2)}`);
}

// ─── x402 ─────────────────────────────────────────────────────────────────────

export function getX402Fetch(walletClient, publicClient, account) {
  const rawSigner = toClientEvmSigner(walletClient, publicClient);
  const signer = { ...rawSigner, address: account.address };
  return wrapFetchWithPaymentFromConfig(fetch, {
    schemes: [{ network: "eip155:8453", client: new ExactEvmScheme(signer) }],
  });
}

// ─── CLI Helpers ──────────────────────────────────────────────────────────────

// --pay=x402|usdc|eth|clawd|cv  (default: "x402")
export function parsePayMethod(argv) {
  const flag = argv.find(a => a.startsWith("--pay="));
  return flag ? flag.slice(6).toLowerCase() : "x402";
}

// --cv-amount=<n>
export function parseCvAmount(argv) {
  const flag = argv.find(a => a.startsWith("--cv-amount="));
  return flag ? BigInt(flag.slice(12)) : null;
}

// Strip -- flags, return positional args only
export function positionalArgs(argv) {
  return argv.filter(a => !a.startsWith("--"));
}

// ─── API Result Printing ──────────────────────────────────────────────────────

export function printApiResult(result) {
  if (result.jobId)   console.log(`  Job ID:   ${result.jobId}`);
  if (result.jobUrl)  console.log(`  Job URL:  ${result.jobUrl}`);
  if (result.chatUrl) console.log(`  Chat URL: ${result.chatUrl}`);
  if (result.message) console.log(`  Message:  ${result.message}`);
  if (result.jobId || result.jobUrl) {
    console.log("\nVisit the Job URL to track progress and see results.");
  }
}

// ─── Uniswap Quotes ───────────────────────────────────────────────────────────

async function quoteUsdcToClawd(publicClient, usdcAmount) {
  const [amountOut] = await publicClient.readContract({
    address: QUOTER, abi: QUOTER_ABI,
    functionName: "quoteExactInput",
    args: [USDC_TO_CLAWD_PATH, usdcAmount],
  });
  return amountOut;
}

async function quoteWethForClawd(publicClient, clawdAmount) {
  const [wethIn] = await publicClient.readContract({
    address: QUOTER, abi: QUOTER_ABI,
    functionName: "quoteExactOutput",
    args: [CLAWD_TO_WETH_PATH, clawdAmount],
  });
  return wethIn;
}

// ─── Direct Contract Payment ──────────────────────────────────────────────────

async function approveToken(walletClient, publicClient, token, spender, amount) {
  const hash = await walletClient.writeContract({
    address: token, abi: ERC20_ABI, functionName: "approve", args: [spender, amount],
  });
  await publicClient.waitForTransactionReceipt({ hash });
}

export async function postJobDirect(walletClient, publicClient, account, payMethod, serviceSlug, description, opts = {}) {
  const serviceId = SERVICE_IDS[serviceSlug];
  if (!serviceId) throw new Error(`Unknown service: ${serviceSlug}. Valid: ${Object.keys(SERVICE_IDS).join(", ")}`);

  const svc = await publicClient.readContract({
    address: CONTRACT, abi: CONTRACT_ABI,
    functionName: "getServiceType", args: [BigInt(serviceId)],
  });
  const priceUsd = svc.priceUsd;
  console.log(`\nService: ${svc.name}`);
  console.log(`Price:   $${(Number(priceUsd) / 1_000_000).toFixed(4)} USDC`);

  let hash;

  if (payMethod === "usdc") {
    console.log("\nApproving USDC...");
    await approveToken(walletClient, publicClient, USDC_TOKEN, CONTRACT, priceUsd);
    console.log("Posting job with USDC...");
    hash = await walletClient.writeContract({
      address: CONTRACT, abi: CONTRACT_ABI,
      functionName: "postJobWithUsdc",
      args: [BigInt(serviceId), description, 0n],
    });

  } else if (payMethod === "clawd") {
    const clawdQuote = await quoteUsdcToClawd(publicClient, priceUsd);
    const clawdAmount = clawdQuote * (100n + SLIPPAGE) / 100n;
    console.log(`\nCLAWD:   ${(Number(clawdAmount) / 1e18).toFixed(4)} (+${SLIPPAGE}% slippage)`);
    console.log("Approving CLAWD...");
    await approveToken(walletClient, publicClient, CLAWD_TOKEN, CONTRACT, clawdAmount);
    console.log("Posting job with CLAWD...");
    hash = await walletClient.writeContract({
      address: CONTRACT, abi: CONTRACT_ABI,
      functionName: "postJob",
      args: [BigInt(serviceId), clawdAmount, description],
    });

  } else if (payMethod === "eth") {
    const clawdQuote = await quoteUsdcToClawd(publicClient, priceUsd);
    const ethNeeded = await quoteWethForClawd(publicClient, clawdQuote);
    const ethValue = ethNeeded * (100n + SLIPPAGE) / 100n;
    const minClawdOut = clawdQuote * (100n - SLIPPAGE) / 100n;
    console.log(`\nETH:     ${(Number(ethValue) / 1e18).toFixed(6)} (+${SLIPPAGE}% slippage)`);
    console.log("Posting job with ETH...");
    hash = await walletClient.writeContract({
      address: CONTRACT, abi: CONTRACT_ABI,
      functionName: "postJobWithETH",
      args: [BigInt(serviceId), description, minClawdOut],
      value: ethValue,
    });

  } else if (payMethod === "cv") {
    const cvAmount = opts.cvAmount;
    if (!cvAmount) throw new Error("CV payment requires --cv-amount=<n>");
    console.log(`\nCV amount: ${cvAmount}`);
    console.log("Posting job with CV...");
    hash = await walletClient.writeContract({
      address: CONTRACT, abi: CONTRACT_ABI,
      functionName: "postJobWithCV",
      args: [BigInt(serviceId), cvAmount, description],
    });

  } else {
    throw new Error(`Unknown payment method: "${payMethod}". Use: x402 | usdc | eth | clawd | cv`);
  }

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log(`\nJob posted on-chain!`);
  console.log(`Tx:   https://basescan.org/tx/${receipt.transactionHash}`);
  console.log(`Jobs: https://leftclaw.services`);
  return receipt;
}
