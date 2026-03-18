const axios = require('axios');
const { checkUsage } = require('./usage_limiter');
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;

async function generateDevText({ system = "", prompt }) {
  checkUsage(); 
  const response = await axios.post(
    'https://api.anthropic.com/v1/messages',
    {
      model: "claude-haiku-4-5",
      max_tokens: 500,
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
}

module.exports = {
  generateDevText
};

