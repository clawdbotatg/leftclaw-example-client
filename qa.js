import { setupWallet, logBalance, getX402Fetch, parsePayMethod, parseCvAmount, positionalArgs, postJobDirect, printApiResult } from "./lib.js";

const allArgs = process.argv.slice(2);
const args = positionalArgs(allArgs);
const URL_OR_DESC = args[0];
if (!URL_OR_DESC) {
  console.error('Usage: node qa "<url or description>" [context] [--pay=x402|usdc|eth|clawd|cv] [--cv-amount=<n>]');
  console.error('  e.g. node qa "https://my-dapp.vercel.app" "Focus on mobile UX and accessibility"');
  process.exit(1);
}

const CONTEXT = args[1] || "";
const payMethod = parsePayMethod(allArgs);
const cvAmount = parseCvAmount(allArgs);

const { account, publicClient, walletClient } = setupWallet();
await logBalance(publicClient, account.address);
console.log("\nSubmitting frontend QA audit request...");
console.log(`Target: ${URL_OR_DESC}`);
if (CONTEXT) console.log(`Context: ${CONTEXT}`);
console.log();

if (payMethod === "x402") {
  const fetchWithPayment = getX402Fetch(walletClient, publicClient, account);
  const body = { description: URL_OR_DESC };
  if (CONTEXT) body.context = CONTEXT;
  const response = await fetchWithPayment("https://leftclaw.services/api/qa", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Failed ${response.status}: ${await response.text()}`);
  const result = await response.json();
  console.log("QA audit job created!");
  printApiResult(result);
} else {
  const description = CONTEXT ? `${URL_OR_DESC}\n\nContext: ${CONTEXT}` : URL_OR_DESC;
  await postJobDirect(walletClient, publicClient, account, payMethod, "qa", description, { cvAmount });
}
