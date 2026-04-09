import { setupWallet, logBalance, getX402Fetch, parsePayMethod, parseCvAmount, positionalArgs, postJobDirect, printApiResult } from "./lib.js";

const allArgs = process.argv.slice(2);
const args = positionalArgs(allArgs);
const CONDITION = args[0];
if (!CONDITION) {
  console.error('Usage: node judge "<condition or oracle task>" [--pay=x402|usdc|eth|clawd|cv] [--cv-amount=<n>]');
  console.error('  e.g. node judge "Watch 0x123...456 on Base — trigger if ETH balance drops below 1 ETH"');
  console.error('  e.g. node judge "Judge this prediction market: will ETH be above $3k on 2026-06-01?"');
  process.exit(1);
}

const payMethod = parsePayMethod(allArgs);
const cvAmount = parseCvAmount(allArgs);

const { account, publicClient, walletClient } = setupWallet();
await logBalance(publicClient, account.address);
console.log("\nSubmitting judge/oracle request...");
console.log(`Condition: ${CONDITION}\n`);

if (payMethod === "x402") {
  const fetchWithPayment = getX402Fetch(walletClient, publicClient, account);
  const response = await fetchWithPayment("https://leftclaw.services/api/judge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ description: CONDITION }),
  });
  if (!response.ok) throw new Error(`Failed ${response.status}: ${await response.text()}`);
  const result = await response.json();
  console.log("Judge/oracle job created!");
  printApiResult(result);
} else {
  await postJobDirect(walletClient, publicClient, account, payMethod, "judge", CONDITION, { cvAmount });
}
