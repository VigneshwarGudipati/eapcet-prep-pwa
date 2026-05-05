var MOCK_TEST_DURATION_SECONDS = 3 * 60 * 60;
var MOCK_RESULT_KEY = "eapcetMockResult";
var TEST_HISTORY_KEY = "eapcetTestHistory";
var GAMIFICATION_KEY = "eapcetGamification";
var PRACTICE_STATE_KEY = "eapcetPracticeState";
var TEST_SESSION_KEY = "eapcetTestSession";

var SUBJECT_RATIO = {
  Mathematics: 80,
  Physics: 40,
  Chemistry: 40
};

var DIFFICULTY_RATIO = {
  Easy: 0.3,
  Medium: 0.5,
  Hard: 0.2
};

function readJson(key, fallbackValue) {
  const storedValue = localStorage.getItem(key);

  if (!storedValue) {
    return fallbackValue;
  }

  try {
    return JSON.parse(storedValue);
  } catch (error) {
    return fallbackValue;
  }
}

function writeJson(key, value) {
  const serializedValue = JSON.stringify(value);

  if (localStorage.getItem(key) === serializedValue) {
    return;
  }

  localStorage.setItem(key, serializedValue);
}

function removeStoredValue(key) {
  localStorage.removeItem(key);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getQuestionMeta(question) {
  return `${question.subject} - ${question.chapter} - ${question.topic}`;
}

function formatTime(totalSeconds) {
  const safeSeconds = Math.max(0, totalSeconds);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60).toString().padStart(2, "0");
  const seconds = (safeSeconds % 60).toString().padStart(2, "0");

  return hours > 0 ? `${hours}:${minutes}:${seconds}` : `${minutes}:${seconds}`;
}

function shuffleItems(items) {
  const shuffled = items.slice();

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    const temp = shuffled[index];
    shuffled[index] = shuffled[randomIndex];
    shuffled[randomIndex] = temp;
  }

  return shuffled;
}

function getUniqueValues(questions, key) {
  return Array.from(new Set(questions.map((question) => question[key]))).sort();
}

function calculateSubjectCounts(totalCount) {
  const subjects = Object.keys(SUBJECT_RATIO);
  const ratioTotal = subjects.reduce((sum, subject) => sum + SUBJECT_RATIO[subject], 0);
  const counts = {};
  let allocated = 0;

  subjects.forEach((subject) => {
    counts[subject] = Math.floor((totalCount * SUBJECT_RATIO[subject]) / ratioTotal);
    allocated += counts[subject];
  });

  subjects
    .slice()
    .sort((a, b) => SUBJECT_RATIO[b] - SUBJECT_RATIO[a])
    .forEach((subject) => {
      if (allocated < totalCount) {
        counts[subject] += 1;
        allocated += 1;
      }
    });

  return counts;
}

function calculateDifficultyCounts(totalCount) {
  const difficulties = Object.keys(DIFFICULTY_RATIO);
  const counts = {};
  let allocated = 0;

  difficulties.forEach((difficulty) => {
    counts[difficulty] = Math.floor(totalCount * DIFFICULTY_RATIO[difficulty]);
    allocated += counts[difficulty];
  });

  difficulties
    .slice()
    .sort((a, b) => DIFFICULTY_RATIO[b] - DIFFICULTY_RATIO[a])
    .forEach((difficulty) => {
      if (allocated < totalCount) {
        counts[difficulty] += 1;
        allocated += 1;
      }
    });

  return counts;
}

function takeQuestionsFromPool(pool, count, usedIds) {
  const selected = [];
  const shuffled = shuffleItems(pool);

  shuffled.forEach((question) => {
    if (selected.length < count && !usedIds.has(question.id)) {
      selected.push(question);
      usedIds.add(question.id);
    }
  });

  // Demo data is intentionally small. Reuse questions as variants only when a configured test needs more.
  while (selected.length < count && shuffled.length > 0) {
    const source = shuffled[selected.length % shuffled.length];
    selected.push({
      ...source,
      id: `${source.id}-variant-${selected.length + 1}`
    });
  }

  return selected;
}

function selectQuestionsByBlueprint(questions, totalCount) {
  const subjectCounts = calculateSubjectCounts(totalCount);
  const finalSelection = [];
  const usedIds = new Set();

  Object.keys(subjectCounts).forEach((subject) => {
    const subjectPool = questions.filter((question) => question.subject === subject);
    const difficultyCounts = calculateDifficultyCounts(subjectCounts[subject]);

    Object.keys(difficultyCounts).forEach((difficulty) => {
      const exactPool = subjectPool.filter((question) => question.difficulty === difficulty);
      const fallbackPool = exactPool.length > 0 ? exactPool : subjectPool;
      finalSelection.push(...takeQuestionsFromPool(fallbackPool, difficultyCounts[difficulty], usedIds));
    });
  });

  if (finalSelection.length < totalCount) {
    finalSelection.push(...takeQuestionsFromPool(questions, totalCount - finalSelection.length, usedIds));
  }

  return shuffleItems(finalSelection).slice(0, totalCount);
}

function getWeakTopicNames() {
  if (typeof buildTopicStats !== "function" || typeof getWeakTopics !== "function") {
    return [];
  }

  return getWeakTopics(buildTopicStats(readJson(TEST_HISTORY_KEY, []))).map((topic) => topic.topic);
}

function filterPracticeQuestions(questions, filters) {
  let filtered = questions.filter((question) => {
    const matchesSubject = !filters.subject || question.subject === filters.subject;
    const matchesChapter = !filters.chapter || question.chapter === filters.chapter;
    const matchesDifficulty = !filters.difficulty || question.difficulty === filters.difficulty;
    const matchesFrequency = !filters.frequency || question.frequency === filters.frequency;

    return matchesSubject && matchesChapter && matchesDifficulty && matchesFrequency;
  });

  if (filters.mode === "weak") {
    const weakTopics = getWeakTopicNames();
    filtered = weakTopics.length > 0
      ? filtered.filter((question) => weakTopics.includes(question.topic))
      : filtered;
  }

  if (filters.mode === "important") {
    filtered = filtered.filter((question) => question.frequency === "High");
  }

  if (filters.mode === "chapter" && filters.chapter) {
    filtered = filtered.filter((question) => question.chapter === filters.chapter);
  }

  return shuffleItems(filtered.length > 0 ? filtered : questions);
}

function getAnswerAt(answers, index) {
  const answer = answers[index];
  return typeof answer === "string" ? answer : answer && answer.answer;
}

function getConfidenceAt(answers, index) {
  const answer = answers[index];
  return answer && typeof answer === "object" ? answer.confidence : null;
}

function calculateConfidenceStats(breakdown) {
  return breakdown.reduce((stats, item) => {
    if (!item.attempted) {
      return stats;
    }

    if (!item.isCorrect && item.confidence === "sure") {
      stats.overconfidence += 1;
    }

    if (item.isCorrect && item.confidence === "not_sure") {
      stats.goodIntuition += 1;
    }

    return stats;
  }, { overconfidence: 0, goodIntuition: 0 });
}

function calculateMockResult(questions, answers, timeTakenSeconds) {
  let attempted = 0;
  let correct = 0;
  let correctStreak = 0;
  let bestCorrectStreak = 0;
  const topics = {};
  const breakdown = [];

  questions.forEach((question, index) => {
    const selectedAnswer = getAnswerAt(answers, index);
    const confidence = getConfidenceAt(answers, index);
    const isAttempted = Boolean(selectedAnswer);
    const isCorrect = selectedAnswer === question.answer;

    if (!topics[question.topic]) {
      topics[question.topic] = {
        subject: question.subject,
        chapter: question.chapter,
        attempted: 0,
        correct: 0,
        wrong: 0
      };
    }

    if (isCorrect) {
      correct += 1;
      correctStreak += 1;
      bestCorrectStreak = Math.max(bestCorrectStreak, correctStreak);
    } else {
      correctStreak = 0;
    }

    if (isAttempted) {
      attempted += 1;
      topics[question.topic].attempted += 1;

      if (isCorrect) {
        topics[question.topic].correct += 1;
      } else {
        topics[question.topic].wrong += 1;
      }
    }

    breakdown.push({
      questionId: question.id,
      question: question.question,
      subject: question.subject,
      chapter: question.chapter,
      topic: question.topic,
      selectedAnswer,
      correctAnswer: question.answer,
      confidence,
      attempted: isAttempted,
      isCorrect
    });
  });

  const total = questions.length;
  const wrong = attempted - correct;
  const accuracy = total > 0 ? (correct / total) * 100 : 0;
  const averageTimePerQuestion = total > 0 ? timeTakenSeconds / total : 0;
  const confidenceStats = calculateConfidenceStats(breakdown);

  return {
    id: `test-${Date.now()}`,
    completedAt: new Date().toISOString(),
    total,
    attempted,
    correct,
    wrong,
    score: correct,
    accuracy,
    timeTaken: timeTakenSeconds,
    timeTakenSeconds,
    averageTimePerQuestion,
    bestCorrectStreak,
    topics,
    topicPerformance: topics,
    confidenceStats,
    breakdown
  };
}

var deferredInstallPrompt = null;

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("sw.js")
      .then((registration) => {
        if (registration.waiting && navigator.serviceWorker.controller) {
          showUpdateBanner(registration.waiting);
        }

        registration.addEventListener("updatefound", () => {
          const newWorker = registration.installing;

          if (!newWorker) {
            return;
          }

          newWorker.addEventListener("statechange", () => {
            if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
              showUpdateBanner(newWorker);
            }
          });
        });
      })
      .catch((error) => {
        console.warn("Service worker registration failed:", error);
      });
  });

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (sessionStorage.getItem("eapcetReloadedForUpdate")) {
      return;
    }

    sessionStorage.setItem("eapcetReloadedForUpdate", "true");
    window.location.reload();
  });
}

function setupInstallPrompt() {
  const installButton = document.getElementById("install-app-button");

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;

    if (installButton) {
      installButton.hidden = false;
    }
  });

  if (!installButton) {
    return;
  }

  installButton.addEventListener("click", async () => {
    if (!deferredInstallPrompt) {
      return;
    }

    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    installButton.hidden = true;
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    installButton.hidden = true;
  });
}

function setupNetworkStatusIndicator() {
  if (document.getElementById("network-status-banner")) {
    return;
  }

  const banner = document.createElement("div");
  banner.id = "network-status-banner";
  banner.className = "app-banner app-banner-dark";
  banner.textContent = "You are offline";
  banner.setAttribute("role", "status");

  document.body.appendChild(banner);

  function updateStatus() {
    banner.style.display = navigator.onLine ? "none" : "flex";
  }

  window.addEventListener("online", updateStatus);
  window.addEventListener("offline", updateStatus);
  updateStatus();
}

function showUpdateBanner(waitingWorker) {
  if (document.getElementById("pwa-update-banner")) {
    return;
  }

  const banner = document.createElement("div");
  banner.id = "pwa-update-banner";
  banner.className = "app-banner app-banner-light app-update-banner";
  banner.innerHTML = `
    <span>New update available. Refresh to update.</span>
    <button class="primary-button app-banner-action" type="button">
      Refresh
    </button>
  `;

  banner.querySelector("button").addEventListener("click", () => {
    sessionStorage.removeItem("eapcetReloadedForUpdate");

    if (waitingWorker) {
      waitingWorker.postMessage({ type: "SKIP_WAITING" });
      return;
    }

    window.location.reload();
  });

  document.body.appendChild(banner);
}

function setupPwaUx() {
  setupInstallPrompt();
  setupNetworkStatusIndicator();
}

registerServiceWorker();

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", setupPwaUx);
} else {
  setupPwaUx();
}
