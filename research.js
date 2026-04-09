import { setupWallet, logBalance, getX402Fetch, parsePayMethod, parseCvAmount, positionalArgs, postJobDirect, printApiResult } from "./lib.js";

const allArgs = process.argv.slice(2);
const args = positionalArgs(allArgs);
const DESCRIPTION = args[0];
if (!DESCRIPTION) {
  console.error('Usage: node research "<topic>" [--pay=x402|usdc|eth|clawd|cv] [--cv-amount=<n>]');
  process.exit(1);
}

const payMethod = parsePayMethod(allArgs);
const cvAmount = parseCvAmount(allArgs);

const { account, publicClient, walletClient } = setupWallet();
await logBalance(publicClient, account.address);
console.log("\nSubmitting research request...");
console.log(`Topic: ${DESCRIPTION}\n`);

if (payMethod === "x402") {
  const fetchWithPayment = getX402Fetch(walletClient, publicClient, account);
  const response = await fetchWithPayment("https://leftclaw.services/api/research", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ description: DESCRIPTION }),
  });
  if (!response.ok) throw new Error(`Failed ${response.status}: ${await response.text()}`);
  const result = await response.json();
  console.log(result.jobUrl || result.chatUrl || "No URL returned");
  if (result.jobId) console.log(`Job ID: ${result.jobId}`);
  if (result.message) console.log(result.message);
} else {
  await postJobDirect(walletClient, publicClient, account, payMethod, "research", DESCRIPTION, { cvAmount });
}
