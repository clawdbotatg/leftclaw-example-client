import { setupWallet, logBalance, parsePayMethod, parseCvAmount, positionalArgs, postJobDirect } from "./lib.js";

// Consultation sessions are browser-only — there is no x402 API endpoint for consult.
// This script posts the job on-chain. Once posted, visit leftclaw.services to start the chat.

const allArgs = process.argv.slice(2);
const args = positionalArgs(allArgs);
const TOPIC = args[0];
if (!TOPIC) {
  console.error('Usage: node consult "<topic or question>" [--deep] [--pay=usdc|eth|clawd|cv] [--cv-amount=<n>]');
  console.error('  --deep  Use the Deep Consultation tier (more messages, higher cost)');
  console.error('  Note: consultation sessions happen in the browser at https://leftclaw.services');
  process.exit(1);
}

const isDeep = allArgs.includes("--deep");
const serviceSlug = isDeep ? "consult-deep" : "consult";
const payMethod = parsePayMethod(allArgs);
const cvAmount = parseCvAmount(allArgs);

if (payMethod === "x402") {
  console.error("Error: consult is not available via x402. Use --pay=usdc|eth|clawd|cv to post on-chain.");
  console.error("Then visit https://leftclaw.services to start your chat session.");
  process.exit(1);
}

const { account, publicClient, walletClient } = setupWallet();
await logBalance(publicClient, account.address);
console.log(`\nPosting ${isDeep ? "deep " : ""}consultation job on-chain...`);
console.log(`Topic: ${TOPIC}\n`);

await postJobDirect(walletClient, publicClient, account, payMethod, serviceSlug, TOPIC, { cvAmount });
console.log("\nVisit https://leftclaw.services to start your chat session.");
