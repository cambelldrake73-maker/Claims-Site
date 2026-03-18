let usage = {
  day: new Date().toDateString(),
  count: 0
};

const DAILY_LIMIT = 20;
const COOLDOWN_MS = 5000;

let lastCallAt = 0;

function resetIfNewDay() {
  const today = new Date().toDateString();
  if (usage.day !== today) {
    usage = { day: today, count: 0 };
  }
}

function enforceDailyLimit() {
  resetIfNewDay();
  if (usage.count >= DAILY_LIMIT) {
    throw new Error("Daily Claude limit reached");
  }
  usage.count += 1;
}

function enforceCooldown() {
  const now = Date.now();
  if (now - lastCallAt < COOLDOWN_MS) {
    throw new Error("Claude cooldown active");
  }
  lastCallAt = now;
}

function checkUsage() {
  enforceCooldown();
  enforceDailyLimit();
}

module.exports = { checkUsage };
