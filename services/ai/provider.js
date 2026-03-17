const { sendClaudeMessage } = require("./anthropic_client");

async function generateText({ system = "", prompt }) {
  return sendClaudeMessage({ system, prompt });
}

module.exports = { generateText };
