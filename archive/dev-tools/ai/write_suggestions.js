const fs = require('fs');
const path = require('path');
const { suggestTasks } = require('./task_suggester');
const { collectContext } = require('./context_collector');

async function run() {
  const projectGoal =
    "Build a claims recovery platform with robust ingestion, normalization, review queue workflows, persistent storage, and internal claims intelligence without runtime dependence on external AI.";

  const currentState = collectContext();

  const suggestionsPath = path.resolve(__dirname, '../../AI_SUGGESTIONS.md');

  try {
    const tasks = await suggestTasks(projectGoal, currentState);

    const content = ['# AI Suggestions', '', ...tasks].join('\n') + '\n';
    fs.writeFileSync(suggestionsPath, content, 'utf8');

    console.log(`Wrote ${tasks.length} suggestions to AI_SUGGESTIONS.md`);
  } catch (err) {
    console.error('Error writing suggestions:', err.message);
  }
}

run();
