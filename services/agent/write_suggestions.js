const fs = require('fs');
const path = require('path');
const { suggestTasks } = require('./task_suggester');

async function run() {
  const projectGoal = "Build a claims recovery platform with dashboard, review queue, denial handling, and internal claims intelligence.";

  const currentState = `
- Runtime app no longer uses external AI
- Claim summary is rule-based
- Claim explanation is rule-based
- Dev-only Claude lives in services/agent
- Basic dashboard, claim detail page, and review queue exist
- Claims API endpoints exist
- No real database persistence yet
- No robust review queue backend logic yet
`;

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
