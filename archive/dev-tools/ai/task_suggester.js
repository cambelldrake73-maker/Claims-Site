const { generateDevText } = require('./provider');

async function suggestTasks(projectGoal, currentState) {
  const system = "You are a software planning assistant. Generate practical development tasks for an in-progress claims recovery web app. Return only a plain bullet list, one task per line, starting each line with '- '. Keep tasks specific and implementation-focused.";

  const prompt =
    `Project goal:\n${projectGoal}\n\n` +
    `Current state:\n${currentState}\n\n` +
    `Generate 5 next development tasks.`;

  const text = await generateDevText({ system, prompt });

  return text
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.startsWith('- '));
}

module.exports = {
  suggestTasks
};
