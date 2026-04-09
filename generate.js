import { writeFileSync } from "fs";
import { execSync } from "child_process";
import { setupWallet, logBalance, getX402Fetch, parsePayMethod, parseCvAmount, positionalArgs, postJobDirect } from "./lib.js";

const allArgs = process.argv.slice(2);
const args = positionalArgs(allArgs);
const PROMPT = args[0];
if (!PROMPT) {
  console.error('Usage: node generate "<image description>" [--pay=x402|usdc|eth|clawd|cv] [--cv-amount=<n>]');
  console.error('Note: --pay=x402 (default) returns the image immediately. Other methods post a job on-chain.');
  process.exit(1);
}

const payMethod = parsePayMethod(allArgs);
const cvAmount = parseCvAmount(allArgs);
const { account, publicClient, walletClient } = setupWallet();
await logBalance(publicClient, account.address);
console.log("\nGenerating CLAWD PFP...");
console.log(`Prompt: ${PROMPT}\n`);

if (payMethod === "x402") {
  const fetchWithPayment = getX402Fetch(walletClient, publicClient, account);
  const response = await fetchWithPayment("https://leftclaw.services/api/pfp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: PROMPT }),
  });
  if (!response.ok) throw new Error(`Failed ${response.status}: ${await response.text()}`);
  const { image, message } = await response.json();
  console.log(message);
  const filename = `clawd-pfp-${Date.now()}.png`;
  writeFileSync(filename, Buffer.from(image.replace("data:image/png;base64,", ""), "base64"));
  console.log(`Saved → ${filename}`);
  execSync(`open "${filename}"`);
} else {
  await postJobDirect(walletClient, publicClient, account, payMethod, "pfp", PROMPT, { cvAmount });
}
