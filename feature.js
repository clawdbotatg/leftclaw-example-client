import { setupWallet, logBalance, getX402Fetch, parsePayMethod, parseCvAmount, positionalArgs, postJobDirect, printApiResult } from "./lib.js";

const allArgs = process.argv.slice(2);
const args = positionalArgs(allArgs);
const DESCRIPTION = args[0];
if (!DESCRIPTION) {
  console.error('Usage: node feature "<description including repo URL>" [context] [--pay=x402|usdc|eth|clawd|cv] [--cv-amount=<n>]');
  console.error('  e.g. node feature "Add dark mode toggle to settings. Repo: https://github.com/org/my-dapp"');
  process.exit(1);
}

const CONTEXT = args[1] || "";
const payMethod = parsePayMethod(allArgs);
const cvAmount = parseCvAmount(allArgs);

const { account, publicClient, walletClient } = setupWallet();
await logBalance(publicClient, account.address);
console.log("\nSubmitting feature request...");
console.log(`Description: ${DESCRIPTION}`);
if (CONTEXT) console.log(`Context: ${CONTEXT}`);
console.log();

if (payMethod === "x402") {
  const fetchWithPayment = getX402Fetch(walletClient, publicClient, account);
  const body = { description: DESCRIPTION };
  if (CONTEXT) body.context = CONTEXT;
  const response = await fetchWithPayment("https://leftclaw.services/api/feature", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Failed ${response.status}: ${await response.text()}`);
  const result = await response.json();
  console.log("Feature job created!");
  printApiResult(result);
} else {
  const description = CONTEXT ? `${DESCRIPTION}\n\nContext: ${CONTEXT}` : DESCRIPTION;
  await postJobDirect(walletClient, publicClient, account, payMethod, "feature", description, { cvAmount });
}
