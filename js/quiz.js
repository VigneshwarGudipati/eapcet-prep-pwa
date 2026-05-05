function initPracticePage() {
  const elements = {
    practiceMode: document.getElementById("practice-mode"),
    practiceSubject: document.getElementById("practice-subject"),
    practiceChapter: document.getElementById("practice-chapter"),
    practiceDifficulty: document.getElementById("practice-difficulty"),
    practiceFrequency: document.getElementById("practice-frequency"),
    applyFiltersButton: document.getElementById("apply-practice-filters"),
    filterNote: document.getElementById("practice-filter-note"),
    practiceLayout: document.getElementById("practice-layout"),
    completionScreen: document.getElementById("practice-completion"),
    practiceCard: document.getElementById("practice-card"),
    questionCount: document.getElementById("question-count"),
    questionTopic: document.getElementById("question-topic"),
    questionDifficulty: document.getElementById("question-difficulty"),
    questionStatus: document.getElementById("question-status"),
    questionText: document.getElementById("question-text"),
    optionsList: document.getElementById("options-list"),
    confidencePanel: document.getElementById("confidence-panel"),
    sureButton: document.getElementById("sure-button"),
    notSureButton: document.getElementById("not-sure-button"),
    feedback: document.getElementById("feedback"),
    feedbackTitle: document.getElementById("feedback-title"),
    feedbackExplanation: document.getElementById("feedback-explanation"),
    showAnswerButton: document.getElementById("show-answer-button"),
    skipButton: document.getElementById("skip-button"),
    reviewButton: document.getElementById("review-button"),
    palette: document.getElementById("practice-palette"),
    nextButton: document.getElementById("next-button"),
    completionTotal: document.getElementById("completion-total"),
    completionAnswered: document.getElementById("completion-answered"),
    completionSkipped: document.getElementById("completion-skipped"),
    completionReview: document.getElementById("completion-review"),
    restartButton: document.getElementById("restart-practice"),
    goHomeButton: document.getElementById("go-home"),
    goDashboardButton: document.getElementById("go-dashboard")
  };

  let selectedQuestions = QUESTIONS.slice();
  let currentQuestionIndex = 0;
  let hasRevealedAnswer = false;
  let practiceState = createPracticeState(selectedQuestions);

  window.practiceState = practiceState;

  function createPracticeState(questions) {
    return questions.map((question, index) => ({
      questionIndex: index,
      questionId: question.id,
      selectedAnswer: null,
      skipped: false,
      markedForReview: false,
      confidence: null
    }));
  }

  function populatePracticeFilters() {
    addOptions(elements.practiceSubject, getUniqueValues(QUESTIONS, "subject"));
    addOptions(elements.practiceChapter, getUniqueValues(QUESTIONS, "chapter"));
  }

  function addOptions(select, values) {
    values.forEach((value) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      select.appendChild(option);
    });
  }

  function getPracticeFilters() {
    return {
      mode: elements.practiceMode.value,
      subject: elements.practiceSubject.value,
      chapter: elements.practiceChapter.value,
      difficulty: elements.practiceDifficulty.value,
      frequency: elements.practiceFrequency.value
    };
  }

  function loadPracticeSession() {
    const session = readJson(PRACTICE_STATE_KEY, null);

    if (!session || !Array.isArray(session.questionIds)) {
      return;
    }

    const restoredQuestions = session.questionIds
      .map((id) => QUESTIONS.find((question) => question.id === id))
      .filter(Boolean);

    if (restoredQuestions.length === 0) {
      return;
    }

    selectedQuestions = restoredQuestions;
    practiceState = normalizePracticeState(session.practiceState, selectedQuestions);
    currentQuestionIndex = clamp(session.currentQuestionIndex || 0, 0, selectedQuestions.length - 1);
    window.practiceState = practiceState;
  }

  function normalizePracticeState(savedState, questions) {
    const freshState = createPracticeState(questions);

    if (!Array.isArray(savedState)) {
      return freshState;
    }

    return freshState.map((state, index) => ({
      ...state,
      ...(savedState[index] || {}),
      questionIndex: index,
      questionId: questions[index].id
    }));
  }

  function savePracticeSession() {
    writeJson(PRACTICE_STATE_KEY, {
      questionIds: selectedQuestions.map((question) => question.id),
      practiceState,
      currentQuestionIndex
    });
  }

  function applyPracticeFilters() {
    selectedQuestions = filterPracticeQuestions(QUESTIONS, getPracticeFilters());
    currentQuestionIndex = 0;
    hasRevealedAnswer = false;
    practiceState = createPracticeState(selectedQuestions);
    window.practiceState = practiceState;
    elements.filterNote.textContent = `${selectedQuestions.length} question${selectedQuestions.length === 1 ? "" : "s"} loaded.`;
    elements.completionScreen.hidden = true;
    elements.practiceLayout.hidden = false;
    savePracticeSession();
    renderQuestion();
  }

  function renderQuestion() {
    const currentQuestion = selectedQuestions[currentQuestionIndex];
    const currentState = getCurrentPracticeState();

    hasRevealedAnswer = false;
    elements.questionCount.textContent = `Question ${currentQuestionIndex + 1} of ${selectedQuestions.length}`;
    elements.questionTopic.textContent = getQuestionMeta(currentQuestion);
    elements.questionDifficulty.textContent = `${currentQuestion.difficulty} - ${currentQuestion.frequency} Frequency`;
    elements.questionText.textContent = currentQuestion.question;
    elements.optionsList.innerHTML = "";
    elements.feedback.hidden = true;
    elements.feedback.className = "feedback";
    elements.confidencePanel.hidden = !currentState.selectedAnswer;
    elements.showAnswerButton.disabled = !currentState.selectedAnswer;
    elements.nextButton.disabled = !currentState.selectedAnswer;
    elements.practiceCard.classList.toggle("marked-review", currentState.markedForReview);
    elements.reviewButton.classList.toggle("active-review", currentState.markedForReview);
    elements.reviewButton.textContent = currentState.markedForReview ? "Marked for Review" : "Mark for Review";
    updatePracticeStatus();

    currentQuestion.options.forEach((option) => {
      const button = document.createElement("button");
      button.className = "option-button";
      button.type = "button";
      button.textContent = option;
      button.classList.toggle("selected", currentState.selectedAnswer === option);
      button.addEventListener("click", () => selectPracticeAnswer(option));
      elements.optionsList.appendChild(button);
    });

    renderConfidenceButtons();
    renderPracticePalette();
    savePracticeSession();
  }

  function getCurrentPracticeState() {
    return practiceState[currentQuestionIndex];
  }

  function selectPracticeAnswer(option) {
    const currentState = getCurrentPracticeState();
    currentState.selectedAnswer = option;
    currentState.skipped = false;
    elements.showAnswerButton.disabled = false;
    elements.nextButton.disabled = false;
    elements.confidencePanel.hidden = false;

    renderOptionStates();
    if (hasRevealedAnswer) {
      updatePracticeFeedback();
    }
    updatePracticeStatus();
    renderPracticePalette();
    savePracticeSession();
  }

  function renderOptionStates() {
    const currentQuestion = selectedQuestions[currentQuestionIndex];
    const currentState = getCurrentPracticeState();

    elements.optionsList.querySelectorAll(".option-button").forEach((button) => {
      const isSelected = button.textContent === currentState.selectedAnswer;
      const isCorrectAnswer = button.textContent === currentQuestion.answer;
      button.disabled = false;
      button.classList.toggle("selected", isSelected);
      button.classList.toggle("correct", hasRevealedAnswer && isCorrectAnswer);
      button.classList.toggle("incorrect", hasRevealedAnswer && isSelected && !isCorrectAnswer);
    });
  }

  function revealPracticeAnswer() {
    const currentState = getCurrentPracticeState();

    if (!currentState.selectedAnswer) {
      return;
    }

    const currentQuestion = selectedQuestions[currentQuestionIndex];
    const isCorrect = currentState.selectedAnswer === currentQuestion.answer;
    hasRevealedAnswer = true;

    renderOptionStates();
    updatePracticeFeedback();
    elements.showAnswerButton.disabled = true;
    elements.nextButton.disabled = false;
  }

  function updatePracticeFeedback() {
    const currentQuestion = selectedQuestions[currentQuestionIndex];
    const currentState = getCurrentPracticeState();
    const isCorrect = currentState.selectedAnswer === currentQuestion.answer;

    elements.feedback.hidden = false;
    elements.feedback.className = `feedback ${isCorrect ? "is-correct" : "is-incorrect"}`;
    elements.feedbackTitle.textContent = isCorrect
      ? "Correct answer"
      : `Correct answer: ${currentQuestion.answer}`;
    elements.feedbackExplanation.textContent = currentQuestion.explanation;
  }

  function setConfidence(confidence) {
    const currentState = getCurrentPracticeState();

    if (!currentState.selectedAnswer) {
      return;
    }

    currentState.confidence = confidence;
    renderConfidenceButtons();
    updatePracticeStatus();
    renderPracticePalette();
    savePracticeSession();
  }

  function renderConfidenceButtons() {
    const currentState = getCurrentPracticeState();
    elements.sureButton.classList.toggle("active", currentState.confidence === "sure");
    elements.notSureButton.classList.toggle("active", currentState.confidence === "not_sure");
  }

  function skipPracticeQuestion() {
    const currentState = getCurrentPracticeState();
    currentState.selectedAnswer = null;
    currentState.confidence = null;
    currentState.skipped = true;
    savePracticeSession();

    if (currentQuestionIndex >= selectedQuestions.length - 1 || isPracticeComplete()) {
      showPracticeComplete();
      return;
    }

    showNextPracticeQuestion();
  }

  function toggleReview() {
    const currentState = getCurrentPracticeState();
    currentState.markedForReview = !currentState.markedForReview;

    elements.practiceCard.classList.toggle("marked-review", currentState.markedForReview);
    elements.reviewButton.classList.toggle("active-review", currentState.markedForReview);
    elements.reviewButton.textContent = currentState.markedForReview ? "Marked for Review" : "Mark for Review";
    updatePracticeStatus();
    renderPracticePalette();
    savePracticeSession();
  }

  function showNextPracticeQuestion() {
    if (currentQuestionIndex >= selectedQuestions.length - 1 || isPracticeComplete()) {
      showPracticeComplete();
      return;
    }

    currentQuestionIndex += 1;
    renderQuestion();
  }

  function isPracticeComplete() {
    return practiceState.every((state) => state.selectedAnswer || state.skipped);
  }

  function showPracticeComplete() {
    const summary = practiceState.reduce((totals, state) => {
      totals.answered += state.selectedAnswer ? 1 : 0;
      totals.skipped += state.skipped ? 1 : 0;
      totals.markedForReview += state.markedForReview ? 1 : 0;
      return totals;
    }, { answered: 0, skipped: 0, markedForReview: 0 });

    elements.completionTotal.textContent = selectedQuestions.length;
    elements.completionAnswered.textContent = summary.answered;
    elements.completionSkipped.textContent = summary.skipped;
    elements.completionReview.textContent = summary.markedForReview;
    elements.practiceLayout.hidden = true;
    elements.completionScreen.hidden = false;
  }

  function restartPractice() {
    currentQuestionIndex = 0;
    hasRevealedAnswer = false;
    practiceState = createPracticeState(selectedQuestions);
    window.practiceState = practiceState;
    elements.completionScreen.hidden = true;
    elements.practiceLayout.hidden = false;
    savePracticeSession();
    renderQuestion();
  }

  function updatePracticeStatus() {
    const currentState = getCurrentPracticeState();

    if (currentState.markedForReview) {
      elements.questionStatus.textContent = "Marked for review";
      return;
    }

    if (currentState.selectedAnswer) {
      elements.questionStatus.textContent = currentState.confidence
        ? `Answered - ${currentState.confidence === "sure" ? "Sure" : "Not sure"}`
        : "Answered";
      return;
    }

    elements.questionStatus.textContent = currentState.skipped ? "Skipped" : "Not answered";
  }

  function renderPracticePalette() {
    elements.palette.innerHTML = "";

    practiceState.forEach((state, index) => {
      const button = document.createElement("button");
      button.className = "palette-button";
      button.type = "button";
      button.textContent = index + 1;
      button.setAttribute("aria-label", `Go to practice question ${index + 1}`);
      button.classList.toggle("current", index === currentQuestionIndex);
      button.classList.toggle("attempted", Boolean(state.selectedAnswer));
      button.classList.toggle("skipped", state.skipped);
      button.classList.toggle("review", state.markedForReview);
      button.addEventListener("click", () => {
        currentQuestionIndex = index;
        renderQuestion();
      });
      elements.palette.appendChild(button);
    });
  }

  populatePracticeFilters();
  loadPracticeSession();
  elements.filterNote.textContent = `${selectedQuestions.length} question${selectedQuestions.length === 1 ? "" : "s"} loaded.`;
  elements.applyFiltersButton.addEventListener("click", applyPracticeFilters);
  elements.showAnswerButton.addEventListener("click", revealPracticeAnswer);
  elements.skipButton.addEventListener("click", skipPracticeQuestion);
  elements.reviewButton.addEventListener("click", toggleReview);
  elements.sureButton.addEventListener("click", () => setConfidence("sure"));
  elements.notSureButton.addEventListener("click", () => setConfidence("not_sure"));
  elements.nextButton.addEventListener("click", showNextPracticeQuestion);
  elements.restartButton.addEventListener("click", restartPractice);
  elements.goHomeButton.addEventListener("click", () => { window.location.href = "index.html"; });
  elements.goDashboardButton.addEventListener("click", () => { window.location.href = "dashboard.html"; });
  renderQuestion();
}

function initMockTestPage() {
  const elements = {
    config: document.getElementById("test-config"),
    layout: document.getElementById("test-layout"),
    timerBox: document.getElementById("timer-box"),
    timer: document.getElementById("timer"),
    customQuestionCount: document.getElementById("custom-question-count"),
    startButton: document.getElementById("start-test"),
    configError: document.getElementById("test-config-error"),
    questionCount: document.getElementById("test-question-count"),
    questionTopic: document.getElementById("test-question-topic"),
    questionDifficulty: document.getElementById("test-question-difficulty"),
    questionText: document.getElementById("test-question-text"),
    optionsList: document.getElementById("test-options-list"),
    confidencePanel: document.getElementById("test-confidence-panel"),
    sureButton: document.getElementById("test-sure-button"),
    notSureButton: document.getElementById("test-not-sure-button"),
    palette: document.getElementById("question-palette"),
    previousButton: document.getElementById("previous-question"),
    reviewButton: document.getElementById("mark-test-review"),
    nextButton: document.getElementById("next-question"),
    submitButton: document.getElementById("submit-test")
  };

  let currentQuestionIndex = 0;
  let testQuestions = [];
  let answers = [];
  let reviewFlags = [];
  let durationSeconds = MOCK_TEST_DURATION_SECONDS;
  let startedAt = Date.now();
  let remainingSeconds = durationSeconds;
  let timerId = null;
  let isSubmitted = false;

  function getSelectedTestType() {
    const checked = document.querySelector("input[name='test-type']:checked");
    return checked ? checked.value : "full";
  }

  function configureCustomInput() {
    elements.customQuestionCount.disabled = getSelectedTestType() !== "custom";
  }

  function getConfiguredQuestionCount() {
    if (getSelectedTestType() === "full") {
      return 180;
    }

    return Number(elements.customQuestionCount.value);
  }

  function validateQuestionCount(count) {
    if (!Number.isInteger(count) || count < 10 || count > 180) {
      elements.configError.textContent = "Enter a valid custom test size between 10 and 180 questions.";
      return false;
    }

    elements.configError.textContent = "";
    return true;
  }

  function startConfiguredTest() {
    const questionCount = getConfiguredQuestionCount();

    if (!validateQuestionCount(questionCount)) {
      return;
    }

    testQuestions = selectQuestionsByBlueprint(QUESTIONS, questionCount);
    answers = Array(testQuestions.length).fill(null).map(() => ({ answer: null, confidence: null }));
    reviewFlags = Array(testQuestions.length).fill(false);
    currentQuestionIndex = 0;
    durationSeconds = Math.max(10 * 60, Math.round(MOCK_TEST_DURATION_SECONDS * (questionCount / 180)));
    startedAt = Date.now();
    remainingSeconds = durationSeconds;
    isSubmitted = false;

    showTest();
    saveTestSession();
    startTimer();
    renderMockQuestion();
  }

  function loadTestSession() {
    const session = readJson(TEST_SESSION_KEY, null);

    if (!session || !Array.isArray(session.questionIds)) {
      return false;
    }

    testQuestions = session.questionIds
      .map((id) => {
        const baseId = id.split("-variant-")[0];
        const found = QUESTIONS.find((question) => question.id === id || question.id === baseId);
        return found ? { ...found, id } : null;
      })
      .filter(Boolean);

    if (testQuestions.length === 0) {
      removeStoredValue(TEST_SESSION_KEY);
      return false;
    }

    answers = normalizeAnswerState(session.answers, testQuestions.length);
    reviewFlags = normalizeReviewFlags(session.reviewFlags, testQuestions.length);
    currentQuestionIndex = clamp(session.currentQuestionIndex || 0, 0, testQuestions.length - 1);
    durationSeconds = session.durationSeconds || MOCK_TEST_DURATION_SECONDS;
    startedAt = session.startedAt || Date.now();
    remainingSeconds = Math.max(0, durationSeconds - Math.floor((Date.now() - startedAt) / 1000));

    if (remainingSeconds <= 0) {
      submitMockTest(false);
      return true;
    }

    showTest();
    startTimer();
    renderMockQuestion();
    return true;
  }

  function saveTestSession() {
    if (isSubmitted || testQuestions.length === 0) {
      return;
    }

    writeJson(TEST_SESSION_KEY, {
      questionIds: testQuestions.map((question) => question.id),
      answers,
      reviewFlags,
      currentQuestionIndex,
      durationSeconds,
      startedAt
    });
  }

  function normalizeAnswerState(savedAnswers, length) {
    return Array.from({ length }, (item, index) => {
      const savedAnswer = Array.isArray(savedAnswers) ? savedAnswers[index] : null;

      if (!savedAnswer) {
        return { answer: null, confidence: null };
      }

      if (typeof savedAnswer === "string") {
        return { answer: savedAnswer, confidence: null };
      }

      return {
        answer: savedAnswer.answer || null,
        confidence: savedAnswer.confidence || null
      };
    });
  }

  function normalizeReviewFlags(savedFlags, length) {
    return Array.from({ length }, (item, index) => Boolean(Array.isArray(savedFlags) && savedFlags[index]));
  }

  function showTest() {
    elements.config.hidden = true;
    elements.layout.hidden = false;
    elements.timerBox.hidden = false;
    window.addEventListener("beforeunload", warnBeforeLeaving);
  }

  function startTimer() {
    window.clearInterval(timerId);
    elements.timer.textContent = formatTime(remainingSeconds);
    elements.timerBox.classList.toggle("timer-warning", remainingSeconds <= 300);
    timerId = window.setInterval(updateTimer, 1000);
  }

  function renderMockQuestion() {
    const currentQuestion = testQuestions[currentQuestionIndex];
    const currentAnswer = answers[currentQuestionIndex] || { answer: null, confidence: null };

    elements.questionCount.textContent = `Question ${currentQuestionIndex + 1} of ${testQuestions.length}`;
    elements.questionTopic.textContent = getQuestionMeta(currentQuestion);
    elements.questionDifficulty.textContent = `${currentQuestion.difficulty} - ${currentQuestion.frequency} Frequency`;
    elements.questionText.textContent = currentQuestion.question;
    elements.optionsList.innerHTML = "";
    elements.confidencePanel.hidden = !currentAnswer.answer;
    elements.previousButton.disabled = currentQuestionIndex === 0;
    elements.nextButton.disabled = currentQuestionIndex === testQuestions.length - 1;
    elements.reviewButton.classList.toggle("active-review", reviewFlags[currentQuestionIndex]);
    elements.reviewButton.textContent = reviewFlags[currentQuestionIndex] ? "Marked Review" : "Mark Review";

    currentQuestion.options.forEach((option) => {
      const button = document.createElement("button");
      button.className = "option-button";
      button.type = "button";
      button.textContent = option;
      button.classList.toggle("selected", currentAnswer.answer === option);
      button.addEventListener("click", () => saveMockAnswer(option));
      elements.optionsList.appendChild(button);
    });

    renderTestConfidenceButtons();
    renderPalette();
    saveTestSession();
  }

  function saveMockAnswer(option) {
    answers[currentQuestionIndex] = {
      ...(answers[currentQuestionIndex] || {}),
      answer: option
    };

    elements.confidencePanel.hidden = false;
    elements.optionsList.querySelectorAll(".option-button").forEach((button) => {
      button.classList.toggle("selected", button.textContent === option);
    });

    renderPalette();
    saveTestSession();
  }

  function setTestConfidence(confidence) {
    const currentAnswer = answers[currentQuestionIndex];

    if (!currentAnswer || !currentAnswer.answer) {
      return;
    }

    currentAnswer.confidence = confidence;
    renderTestConfidenceButtons();
    saveTestSession();
  }

  function renderTestConfidenceButtons() {
    const currentAnswer = answers[currentQuestionIndex] || {};
    elements.sureButton.classList.toggle("active", currentAnswer.confidence === "sure");
    elements.notSureButton.classList.toggle("active", currentAnswer.confidence === "not_sure");
  }

  function toggleTestReview() {
    reviewFlags[currentQuestionIndex] = !reviewFlags[currentQuestionIndex];
    elements.reviewButton.classList.toggle("active-review", reviewFlags[currentQuestionIndex]);
    elements.reviewButton.textContent = reviewFlags[currentQuestionIndex] ? "Marked Review" : "Mark Review";
    renderPalette();
    saveTestSession();
  }

  function renderPalette() {
    elements.palette.innerHTML = "";

    testQuestions.forEach((question, index) => {
      const answer = answers[index];
      const button = document.createElement("button");
      button.className = "palette-button";
      button.type = "button";
      button.textContent = index + 1;
      button.setAttribute("aria-label", `Go to question ${index + 1}`);
      button.classList.toggle("current", index === currentQuestionIndex);
      button.classList.toggle("attempted", Boolean(answer && answer.answer));
      button.classList.toggle("skipped", !(answer && answer.answer));
      button.classList.toggle("review", reviewFlags[index]);
      button.addEventListener("click", () => {
        currentQuestionIndex = index;
        renderMockQuestion();
      });
      elements.palette.appendChild(button);
    });
  }

  function updateTimer() {
    remainingSeconds = Math.max(0, durationSeconds - Math.floor((Date.now() - startedAt) / 1000));
    elements.timer.textContent = formatTime(remainingSeconds);
    elements.timerBox.classList.toggle("timer-warning", remainingSeconds <= 300);

    if (remainingSeconds <= 0) {
      submitMockTest(false);
    }
  }

  function submitMockTest(shouldConfirm) {
    if (isSubmitted) {
      return;
    }

    if (shouldConfirm && !window.confirm("Submit your mock test now?")) {
      return;
    }

    isSubmitted = true;
    window.clearInterval(timerId);
    window.removeEventListener("beforeunload", warnBeforeLeaving);

    const timeTakenSeconds = clamp(durationSeconds - remainingSeconds, 0, durationSeconds);
    const result = calculateMockResult(testQuestions, answers, timeTakenSeconds);
    saveTestResult(result);
    window.location.href = "result.html";
  }

  function warnBeforeLeaving(event) {
    event.preventDefault();
    event.returnValue = "";
  }

  document.querySelectorAll("input[name='test-type']").forEach((input) => {
    input.addEventListener("change", configureCustomInput);
  });
  elements.startButton.addEventListener("click", startConfiguredTest);
  elements.previousButton.addEventListener("click", () => {
    if (currentQuestionIndex <= 0) {
      return;
    }

    currentQuestionIndex -= 1;
    renderMockQuestion();
  });
  elements.nextButton.addEventListener("click", () => {
    if (currentQuestionIndex >= testQuestions.length - 1) {
      return;
    }

    currentQuestionIndex += 1;
    renderMockQuestion();
  });
  elements.reviewButton.addEventListener("click", toggleTestReview);
  elements.sureButton.addEventListener("click", () => setTestConfidence("sure"));
  elements.notSureButton.addEventListener("click", () => setTestConfidence("not_sure"));
  elements.submitButton.addEventListener("click", () => submitMockTest(true));
  configureCustomInput();
  loadTestSession();
}

function initResultPage() {
  const result = readJson(MOCK_RESULT_KEY, null);

  if (!result) {
    document.getElementById("result-card").innerHTML = `
      <p class="empty-state">No mock test result found. Take a mock test to see your summary.</p>
      <a class="primary-button" href="mocktest.html">Start Mock Test</a>
    `;
    return;
  }

  document.getElementById("result-total").textContent = result.total;
  document.getElementById("result-attempted").textContent = result.attempted;
  document.getElementById("result-correct").textContent = result.correct;
  document.getElementById("result-wrong").textContent = result.wrong;
  document.getElementById("result-score").textContent = result.score;
  document.getElementById("result-accuracy").textContent = `${result.accuracy.toFixed(1)}%`;
  document.getElementById("result-time").textContent = formatTime(result.timeTaken || result.timeTakenSeconds || 0);

  if (typeof renderResultAnalytics === "function") {
    renderResultAnalytics(result);
  }
}

if (document.getElementById("options-list")) {
  initPracticePage();
}

if (document.getElementById("test-options-list")) {
  initMockTestPage();
}

if (document.getElementById("result-card")) {
  initResultPage();
}
