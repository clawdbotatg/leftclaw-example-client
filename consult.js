import { setupWallet, logBalance, getX402Fetch, parsePayMethod, parseCvAmount, positionalArgs, postJobDirect, printApiResult } from "./lib.js";

const allArgs = process.argv.slice(2);
const args = positionalArgs(allArgs);
const TOPIC = args[0];
if (!TOPIC) {
  console.error('Usage: node consult "<topic or question>" [--deep] [--pay=x402|usdc|eth|clawd|cv] [--cv-amount=<n>]');
  console.error('  --deep  Use the Deep Consultation tier (more messages, higher cost)');
  process.exit(1);
}

const isDeep = allArgs.includes("--deep");
const serviceSlug = isDeep ? "consult-deep" : "consult";
const payMethod = parsePayMethod(allArgs);
const cvAmount = parseCvAmount(allArgs);

const { account, publicClient, walletClient } = setupWallet();
await logBalance(publicClient, account.address);
console.log(`\nSubmitting ${isDeep ? "deep " : ""}consultation request...`);
console.log(`Topic: ${TOPIC}\n`);

if (payMethod === "x402") {
  const fetchWithPayment = getX402Fetch(walletClient, publicClient, account);
  const endpoint = `https://leftclaw.services/api/${serviceSlug}`;
  const response = await fetchWithPayment(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ description: TOPIC }),
  });
  if (!response.ok) throw new Error(`Failed ${response.status}: ${await response.text()}`);
  const result = await response.json();
  console.log("Consultation started!");
  printApiResult(result);
} else {
  await postJobDirect(walletClient, publicClient, account, payMethod, serviceSlug, TOPIC, { cvAmount });
}
