const { generateText } = require("./provider");

async function generateClaimSummary(claim) {
  const system = "You summarize denied or underpaid insurance claims for internal workflow use.";
  const prompt = `Summarize this claim in 3-4 sentences:\n${JSON.stringify(claim, null, 2)}`;
  return generateText({ system, prompt });
}

module.exports = { generateClaimSummary };
