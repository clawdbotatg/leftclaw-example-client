import { setupWallet, logBalance, getX402Fetch, parsePayMethod, parseCvAmount, positionalArgs, postJobDirect, printApiResult } from "./lib.js";

const allArgs = process.argv.slice(2);
const args = positionalArgs(allArgs);
const DESCRIPTION = args[0];
if (!DESCRIPTION) {
  console.error('Usage: node build "<what to build>" [--pay=x402|usdc|eth|clawd|cv]');
  console.error('  e.g. node build "Simple ERC20 token with mint/burn, deploy to Base"');
  process.exit(1);
}

const payMethod = parsePayMethod(allArgs);
const cvAmount = parseCvAmount(allArgs);

const { account, publicClient, walletClient } = setupWallet();
await logBalance(publicClient, account.address);
console.log("\nSubmitting build request...");
console.log(`Description: ${DESCRIPTION}\n`);

if (payMethod === "x402") {
  const fetchWithPayment = getX402Fetch(walletClient, publicClient, account);
  const response = await fetchWithPayment("https://leftclaw.services/api/build", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ description: DESCRIPTION }),
  });
  if (!response.ok) throw new Error(`Failed ${response.status}: ${await response.text()}`);
  const result = await response.json();
  console.log("Build job created!");
  printApiResult(result);
} else {
  await postJobDirect(walletClient, publicClient, account, payMethod, "build", DESCRIPTION, { cvAmount });
}
