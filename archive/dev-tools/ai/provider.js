const axios = require('axios');
const { checkUsage } = require('./usage_limiter');

const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;

async function generateText({ system = "", prompt }) {
  try {
    checkUsage();

    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: "claude-sonnet-4-6",
        max_tokens: 300,
        system,
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
    throw err;
  }
}

module.exports = {
  generateText
};
