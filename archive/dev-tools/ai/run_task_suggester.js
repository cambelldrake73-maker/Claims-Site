const { suggestTasks } = require('./task_suggester');

async function run() {
  const projectGoal = "Build a claims recovery platform with dashboard, review queue, and automated denial handling";

  const currentState = `
- Basic dashboard UI exists
- Claims API endpoints exist
- Claim summary and explanation are rule-based
- No real data persistence yet
- No review queue backend logic
`;

  try {
    const tasks = await suggestTasks(projectGoal, currentState);

    console.log("=== AI TASKS ===");
    tasks.forEach(t => console.log(t));
  } catch (err) {
    console.error("Error generating tasks:", err.message);
  }
}

run();
