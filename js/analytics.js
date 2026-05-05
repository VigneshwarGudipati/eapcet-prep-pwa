function getTestHistory() {
  return readJson(TEST_HISTORY_KEY, []);
}

function getGamificationState() {
  return readJson(GAMIFICATION_KEY, {
    xp: 0,
    streak: 0,
    lastActiveDate: "",
    badges: []
  });
}

function calculateSpeedScore(averageTimePerQuestion) {
  const safeAverage = Number.isFinite(averageTimePerQuestion) ? averageTimePerQuestion : 180;

  if (safeAverage <= 45) {
    return 100;
  }

  if (safeAverage >= 180) {
    return 25;
  }

  return clamp(Math.round(100 - ((safeAverage - 45) / 135) * 75), 0, 100);
}

function calculateConsistencyScore(history) {
  const recentTests = history.slice(-3);

  if (recentTests.length < 2) {
    return 70;
  }

  const scores = recentTests.map((test) => test.accuracy);
  const average = scores.reduce((sum, score) => sum + score, 0) / scores.length;
  const variance = scores.reduce((sum, score) => sum + Math.pow(score - average, 2), 0) / scores.length;
  const standardDeviation = Math.sqrt(variance);

  return clamp(Math.round(100 - standardDeviation * 2), 0, 100);
}

function getIntelligenceLabel(score) {
  if (score >= 85) {
    return "Topper";
  }

  if (score >= 70) {
    return "Advanced";
  }

  if (score >= 45) {
    return "Intermediate";
  }

  return "Beginner";
}

function calculateIntelligenceScore(result, history) {
  const accuracyScore = clamp(Math.round(result.accuracy || 0), 0, 100);
  const speedScore = calculateSpeedScore(result.averageTimePerQuestion);
  const consistencyScore = calculateConsistencyScore(history);
  const score = clamp(Math.round(
    accuracyScore * 0.5 + speedScore * 0.3 + consistencyScore * 0.2
  ), 0, 100);

  return {
    score,
    label: getIntelligenceLabel(score),
    accuracyScore,
    speedScore,
    consistencyScore
  };
}

function getLevelFromXp(xp) {
  if (xp >= 1000) {
    return { level: 4, name: "Topper", nextLevelXp: 1000 };
  }

  if (xp >= 600) {
    return { level: 3, name: "Performer", nextLevelXp: 1000 };
  }

  if (xp >= 250) {
    return { level: 2, name: "Learner", nextLevelXp: 600 };
  }

  return { level: 1, name: "Beginner", nextLevelXp: 250 };
}

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

function getYesterdayKey() {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return yesterday.toISOString().slice(0, 10);
}

function updateDailyStreak(state) {
  const today = getTodayKey();

  if (state.lastActiveDate === today) {
    return state.streak;
  }

  state.streak = state.lastActiveDate === getYesterdayKey() ? state.streak + 1 : 1;
  state.lastActiveDate = today;

  return state.streak;
}

function updateGamification(result) {
  const state = getGamificationState();
  const badges = new Set(state.badges);

  state.xp += result.correct * 10 + 50;
  updateDailyStreak(state);

  badges.add("First Test Completed");

  if (result.bestCorrectStreak >= 5) {
    badges.add("5 Correct in a Row");
  }

  if (result.accuracy > 80) {
    badges.add("High Accuracy");
  }

  state.badges = Array.from(badges);
  writeJson(GAMIFICATION_KEY, state);

  return state;
}

function saveTestResult(result) {
  const history = getTestHistory();
  const previewHistory = history.concat(result);
  const intelligence = calculateIntelligenceScore(result, previewHistory);
  const enrichedResult = {
    ...result,
    intelligence
  };
  const updatedHistory = history.concat(enrichedResult);

  writeJson(MOCK_RESULT_KEY, enrichedResult);
  writeJson(TEST_HISTORY_KEY, updatedHistory);
  updateGamification(enrichedResult);
  removeStoredValue(TEST_SESSION_KEY);

  return enrichedResult;
}

function buildTopicStats(history) {
  const topicStats = {};

  history.forEach((test) => {
    Object.keys(test.topics || test.topicPerformance || {}).forEach((topic) => {
      const current = (test.topics || test.topicPerformance)[topic];

      if (!topicStats[topic]) {
        topicStats[topic] = {
          subject: current.subject,
          chapter: current.chapter || "",
          attempted: 0,
          correct: 0,
          wrong: 0
        };
      }

      topicStats[topic].attempted += current.attempted;
      topicStats[topic].correct += current.correct;
      topicStats[topic].wrong += current.wrong || Math.max(0, current.attempted - current.correct);
    });
  });

  return topicStats;
}

function getWeakTopics(topicStats) {
  return Object.keys(topicStats)
    .map((topic) => {
      const stats = topicStats[topic];
      const accuracy = stats.attempted > 0 ? (stats.correct / stats.attempted) * 100 : 0;

      return { topic, ...stats, accuracy };
    })
    .filter((topic) => topic.attempted >= 2 && topic.accuracy < 50)
    .sort((a, b) => a.accuracy - b.accuracy || b.wrong - a.wrong)
    .slice(0, 3);
}

function getStrongTopics(topicStats) {
  return Object.keys(topicStats)
    .map((topic) => {
      const stats = topicStats[topic];
      const accuracy = stats.attempted > 0 ? (stats.correct / stats.attempted) * 100 : 0;

      return { topic, ...stats, accuracy };
    })
    .filter((topic) => topic.attempted >= 2 && topic.accuracy >= 70)
    .sort((a, b) => b.accuracy - a.accuracy || b.correct - a.correct)
    .slice(0, 3);
}

function getRecommendations(weakTopics) {
  if (weakTopics.length === 0) {
    return ["Take another mock test to sharpen your trend data.", "Use chapter-wise practice to strengthen recall."];
  }

  return weakTopics.map((topic) => `Practice more: ${topic.topic}`);
}

function getAverageScore(history) {
  if (history.length === 0) {
    return 0;
  }

  return history.reduce((sum, test) => sum + (test.score || 0), 0) / history.length;
}

function renderBarChart(container, values, options) {
  if (!container) {
    return;
  }

  container.innerHTML = "";

  if (values.length === 0) {
    container.innerHTML = "<p class=\"empty-state\">No test history yet.</p>";
    return;
  }

  const maxValue = Math.max(...values.map((item) => item.value), 1);

  values.forEach((item) => {
    const bar = document.createElement("div");
    bar.className = "chart-bar";
    bar.style.height = `${Math.max(8, (item.value / maxValue) * 100)}%`;
    bar.title = `${item.label}: ${item.value}${options.suffix}`;
    bar.innerHTML = `<span>${item.value}${options.suffix}</span>`;
    container.appendChild(bar);
  });
}

function renderTopicList(container, topics, emptyText) {
  if (!container) {
    return;
  }

  if (topics.length === 0) {
    container.innerHTML = `<p class="empty-state">${emptyText}</p>`;
    return;
  }

  container.innerHTML = topics.map((topic) => `
    <li>
      <strong>${topic.topic}</strong>
      <span>${topic.subject}${topic.chapter ? ` - ${topic.chapter}` : ""} - ${topic.accuracy.toFixed(1)}% accuracy</span>
    </li>
  `).join("");
}

function renderRecommendations(container, recommendations) {
  if (!container) {
    return;
  }

  container.innerHTML = recommendations.map((recommendation) => `
    <li>${recommendation}</li>
  `).join("");
}

function animateNumber(element, target, suffix) {
  if (!element) {
    return;
  }

  const duration = 700;
  const startTime = performance.now();

  function tick(now) {
    const progress = Math.min((now - startTime) / duration, 1);
    const value = Math.round(target * progress);
    element.textContent = `${value}${suffix}`;

    if (progress < 1) {
      requestAnimationFrame(tick);
    }
  }

  requestAnimationFrame(tick);
}

function renderResultAnalytics(result) {
  const intelligence = result.intelligence || calculateIntelligenceScore(result, getTestHistory());
  const gamification = getGamificationState();
  const level = getLevelFromXp(gamification.xp);
  const confidenceStats = result.confidenceStats || { overconfidence: 0, goodIntuition: 0 };

  setText("result-intelligence", intelligence.score);
  setText("result-intelligence-label", intelligence.label);
  applyIntelligenceTone(document.querySelector(".intelligence-stat"), intelligence.score);
  setText("result-speed-score", intelligence.speedScore);
  setText("result-consistency", intelligence.consistencyScore);
  setText("result-xp", gamification.xp);
  setText("result-level", `Level ${level.level}: ${level.name}`);
  setText("result-streak", `${gamification.streak} day`);
  setText("result-overconfidence", confidenceStats.overconfidence);
  setText("result-good-intuition", confidenceStats.goodIntuition);

  animateNumber(document.getElementById("result-intelligence"), intelligence.score, "");
}

function setText(id, value) {
  const element = document.getElementById(id);

  if (element) {
    element.textContent = value;
  }
}

function applyIntelligenceTone(element, score) {
  if (!element) {
    return;
  }

  element.classList.remove("score-low", "score-medium", "score-high");

  if (score >= 75) {
    element.classList.add("score-high");
    return;
  }

  if (score >= 50) {
    element.classList.add("score-medium");
    return;
  }

  element.classList.add("score-low");
}

function renderDashboard() {
  const history = getTestHistory();
  const latest = history[history.length - 1];
  const gamification = getGamificationState();
  const level = getLevelFromXp(gamification.xp);
  const topicStats = buildTopicStats(history);
  const weakTopics = getWeakTopics(topicStats);
  const strongTopics = getStrongTopics(topicStats);
  const recommendations = getRecommendations(weakTopics);
  const scoreHistory = history.slice(-6).map((test, index) => ({
    label: `Test ${index + 1}`,
    value: test.score
  }));
  const accuracyHistory = history.slice(-6).map((test, index) => ({
    label: `Test ${index + 1}`,
    value: Math.round(test.accuracy)
  }));
  const confidenceTotals = history.reduce((totals, test) => {
    const confidenceStats = test.confidenceStats || { overconfidence: 0, goodIntuition: 0 };
    totals.overconfidence += confidenceStats.overconfidence;
    totals.goodIntuition += confidenceStats.goodIntuition;
    return totals;
  }, { overconfidence: 0, goodIntuition: 0 });
  const latestIntelligence = latest
    ? latest.intelligence || calculateIntelligenceScore(latest, history)
    : null;

  setText("dash-latest-score", latest ? latest.score : 0);
  setText("dash-accuracy", latest ? `${latest.accuracy.toFixed(1)}%` : "0%");
  setText("dash-intelligence", latestIntelligence ? latestIntelligence.score : 0);
  setText("dash-intelligence-label", latestIntelligence ? latestIntelligence.label : "Beginner");
  applyIntelligenceTone(document.querySelector(".summary-card.intelligence-stat"), latestIntelligence ? latestIntelligence.score : 0);
  setText("dash-tests", history.length);
  setText("dash-average", getAverageScore(history).toFixed(1));
  setText("dash-xp", gamification.xp);
  setText("dash-level", `Level ${level.level}: ${level.name}`);
  setText("dash-streak", `${gamification.streak} day`);
  setText("dash-badges", gamification.badges.length);
  setText("dash-overconfidence", confidenceTotals.overconfidence);
  setText("dash-good-intuition", confidenceTotals.goodIntuition);

  renderBarChart(document.getElementById("score-chart"), scoreHistory, { suffix: "" });
  renderBarChart(document.getElementById("accuracy-chart"), accuracyHistory, { suffix: "%" });
  renderTopicList(document.getElementById("weak-topics"), weakTopics, "No weak topics with at least 2 attempts below 50% yet.");
  renderTopicList(document.getElementById("strong-topics"), strongTopics, "Take more tests to discover reliable strengths.");
  renderRecommendations(document.getElementById("recommendations"), recommendations);

  const badgeList = document.getElementById("badge-list");
  badgeList.innerHTML = gamification.badges.length
    ? gamification.badges.map((badge) => `<li>${badge}</li>`).join("")
    : "<li>No badges earned yet.</li>";
}

if (document.getElementById("dashboard-page")) {
  renderDashboard();
}
