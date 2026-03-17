const axios = require('axios');

const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;

async function callClaude(prompt) {
  try {
    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: "claude-3-sonnet-20240229",
        max_tokens: 300,
        messages: [
          {
            role: "user",
            content: prompt
          }
        ]
      },
      {
        headers: {
          "x-api-key": CLAUDE_API_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json"
        }
      }
    );

    return response.data.content[0].text;

  } catch (err) {
    console.error("Claude API error:", err.response?.data || err.message);
    return "Error generating response";
  }
}

module.exports = {
  callClaude
};
