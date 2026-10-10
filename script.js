// =============================
// BirdID Quiz — single, clean script.js
// =============================

// ---------- DOM ----------
const questionEl      = document.getElementById("question");
const choicesEl       = document.getElementById("choices");
const birdImage       = document.getElementById("question-img") || document.getElementById("quiz-image");
const nextButton      = document.querySelector(".next-button");
const quizSection     = document.getElementById("quiz-section") || document.getElementById("quiz-wrapper");
const resultsSummary  = document.getElementById("results-summary");
const finalScoreEl    = document.getElementById("final-score");
const finalMessageEl  = document.getElementById("final-message");
const viewAnswersBtn  = document.getElementById("view-answers");
const answerReviewEl  = document.getElementById("answer-review");
const reviewContentEl = document.getElementById("review-content");
const feedbackEl   = document.getElementById("feedback");

function withBrowserTimeout(operation) {
  let timeout;
  return Promise.race([
    Promise.resolve().then(operation),
    new Promise((_, reject) => {
      timeout = setTimeout(() => reject(new Error("Browser request timed out")), 4000);
    })
  ]).finally(() => clearTimeout(timeout));
}

const piReady = (async () => {
  try {
    if (!quizSection) return false; // Homepage manages its own Pi login initialization.
    if (!window.Pi || typeof window.Pi.init !== "function") return false;
    await withBrowserTimeout(() => window.Pi.init({ version: "2.0" }));
    return true;
  } catch (error) {
    console.warn("Pi SDK unavailable:", error);
    return false;
  }
})();

function showExternalFallback(url, sourceLink) {
  if (!sourceLink || !sourceLink.parentNode) return;
  let notice = sourceLink.parentNode.querySelector(".external-link-fallback");
  if (!notice) {
    notice = document.createElement("p");
    notice.className = "external-link-fallback";
    notice.setAttribute("role", "status");
    sourceLink.parentNode.appendChild(notice);
  }
  notice.textContent = "If the browser did not open, tap here: ";
  const retry = document.createElement("a");
  retry.href = url;
  retry.target = "_blank";
  retry.rel = "noopener noreferrer";
  retry.textContent = "Open More Information";
  // A direct user click avoids popup blocking after an asynchronous SDK failure.
  notice.appendChild(retry);
}

async function openExternalUrl(url, sourceLink) {
  if (!url) return;

  if (window.Pi && typeof window.Pi.openUrlInSystemBrowser === "function") {
    try {
      if (!await piReady) throw new Error("Pi SDK initialization failed");
      await withBrowserTimeout(() => window.Pi.openUrlInSystemBrowser(url));
      return;
    } catch (error) {
      console.warn("Could not open system browser:", error);
      window.open(url, "_blank", "noopener,noreferrer");
      showExternalFallback(url, sourceLink);
    }
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

function getReviewReturnKey() {
  return getCompletedQuizStateKey() + ":externalReturn";
}

function hasPendingReviewReturn() {
  try {
    const marker = JSON.parse(sessionStorage.getItem(getReviewReturnKey()));
    return marker && marker.page === window.location.href &&
      Date.now() - marker.savedAt >= 0 && Date.now() - marker.savedAt < 30 * 60 * 1000;
  } catch (_) { return false; }
}

document.addEventListener("click", (event) => {
  const link = event.target.closest && event.target.closest("a[href]");
  if (!link) return;
  const destination = new URL(link.href, window.location.href);
  if (destination.origin !== window.location.origin) return;
  if (!quizSection && /^\/quiz(?:\.html)?\/?$/.test(destination.pathname)) {
    destination.searchParams.set("start", "1");
    link.href = destination.href;
  }
  if (quizSection && /^\/(?:index(?:\.html)?)?$/.test(destination.pathname)) {
    try { sessionStorage.removeItem(getReviewReturnKey()); } catch (_) {}
  }
});

document.addEventListener("click", (event) => {
  const link = event.target.closest && event.target.closest("a[data-birdid-external]");
  if (!link || event.defaultPrevented || event.button !== 0 ||
      event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  if (reviewContentEl && reviewContentEl.contains(link)) {
    saveCompletedQuizState("review");
    try {
      sessionStorage.setItem(getReviewReturnKey(), JSON.stringify({
        page: window.location.href, savedAt: Date.now()
      }));
    } catch (_) {}
  }
  // Keep native anchor behavior when the SDK is absent.
  if (!window.Pi || typeof window.Pi.openUrlInSystemBrowser !== "function") return;
  event.preventDefault();
  openExternalUrl(link.href, link);
});

// Optional timer/progress (will safely no-op if absent)
const quizHeader   = document.getElementById("quiz-header");
const timerText    = document.getElementById("timer-text");
const progressFill = document.getElementById("progressFill");

// ---------- State ----------
let appConfig = { imagesBase: "/images", questionsFile: "questions.json" };
let questions = [];
let userAnswers = [];
let currentQuestionIndex = 0;
let score = 0;
let isTimedMode = false;
let timerInterval = null;
function getCompletedQuizStateKey() {
  return "birdid.completedQuiz:" + (appConfig.questionsFile || "questions.json");
}

function saveCompletedQuizState(view) {
  try {
    localStorage.setItem(getCompletedQuizStateKey(), JSON.stringify({
      userAnswers: userAnswers,
      score: score,
      view: view
    }));
  } catch (e) {
    console.warn("Could not save completed quiz state:", e);
  }
}

function restoreCompletedQuizState(forceReview = false) {
  try {
    const raw = localStorage.getItem(getCompletedQuizStateKey());
    if (!raw) return false;

    const state = JSON.parse(raw);
    if (!state || !Array.isArray(state.userAnswers) ||
        !["results", "review"].includes(state.view) ||
        state.userAnswers.length !== questions.length ||
        !state.userAnswers.every((entry, index) => entry &&
          entry.question === questions[index].question &&
          entry.correct === questions[index].answer &&
          entry.image === (resolveImageUrl(questions[index].image) || "") &&
          (entry.selected === "" || questions[index].choices.includes(entry.selected)) &&
          entry.isCorrect === (entry.selected === entry.correct)) ||
        state.score !== state.userAnswers.filter(entry => entry.isCorrect).length) return false;

    userAnswers = state.userAnswers;
    score = typeof state.score === "number" ? state.score : 0;
    currentQuestionIndex = questions.length;

    showResults(false);

    if (forceReview || state.view === "review") {
      const resultsSummaryEl = document.getElementById("results-summary");
      if (resultsSummaryEl) resultsSummaryEl.classList.add("hidden");
      if (answerReviewEl) answerReviewEl.classList.remove("hidden");
      renderAnswerReview();
      document.body.classList.add("results-mode");
    }

    try { sessionStorage.removeItem(getReviewReturnKey()); } catch (_) {}

    return true;
  } catch (e) {
    console.warn("Could not restore completed quiz state:", e);
    return false;
  }
}

function restartQuiz() {
  try {
    localStorage.removeItem(getCompletedQuizStateKey());
    localStorage.removeItem("birdid.returnToReview");
    sessionStorage.removeItem(getReviewReturnKey());
  } catch (e) {}

  window.location.href = "quiz.html?v=" + Date.now();
}

// ---------- Helpers ----------
function normalizeMaybeUrl(s) {
  if (!s) return "";
  const t = s.trim();
  if (/^https?:\/\//i.test(t)) return t;                 // already absolute
  if (/^www\./i.test(t))        return `https://${t}`;    // add scheme
  // domain.tld or domain.tld/path
  if (/^[a-z0-9.-]+\.[a-z]{2,}(\/\S*)?$/i.test(t)) return `https://${t}`;
  return "";                                              // not a URL
}

function normalizeMaybeUrl(s) {
  if (!s) return "";
  const t = s.trim();
  if (/^https?:\/\//i.test(t)) return t;                 // already absolute
  if (/^www\./i.test(t))        return `https://${t}`;    // add scheme
  // domain.tld or domain.tld/path
  if (/^[a-z0-9.-]+\.[a-z]{2,}(\/\S*)?$/i.test(t)) return `https://${t}`;
  return "";                                              // not a URL
}

function splitInfoFields(q) {
  const raw = (q.info || "").trim();
  const url = (q.info_url || "").trim() || normalizeMaybeUrl(raw);
  const text = q.info_text ?? (url ? "" : raw);
  return { infoText: text, infoUrl: url };
}



function sanitizeQuizData(data) {
  return (Array.isArray(data) ? data : []).filter(q =>
    q && q.question && Array.isArray(q.choices) &&
    q.choices.length >= 2 && q.answer && q.choices.includes(q.answer)
  );
}

async function loadJsonAt(path) {
  const url = `/${String(path).replace(/^\/+/, "")}?v=${Date.now()}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const ct = (res.headers.get("content-type") || "").toLowerCase();
  // accept json or allow plain text of json (some hosts)
  if (!ct.includes("application/json") && !ct.includes("text/json")) {
    const sample = (await res.text()).slice(0, 120);
    throw new Error(`Expected JSON from ${url}, got: ${sample}`);
  }
  return res.json();
}

// Try config.json if present; fall back to defaults silently
async function loadConfig() {
  try {
    const cfg = await loadJsonAt("config.json");
    if (cfg && typeof cfg === "object") {
      if (cfg.imagesBase) appConfig.imagesBase = cfg.imagesBase;
      if (cfg.questionsFile) appConfig.questionsFile = cfg.questionsFile;
    }
  } catch (_) {
    // no config.json is OK
  }
}

// Static-site friendly questions loader
async function loadQuestions(filename = "questions.json") {
  // First try a root JSON file (Cloudflare Pages)
  try { return await loadJsonAt(filename); } catch (_) {}
  // Optional fallback: if you still serve via Flask at /api/questions
  try { return await loadJsonAt(`api/questions?file=${encodeURIComponent(filename)}`); } catch (e) {
    throw e;
  }
}

// Image URL resolver:
// - Accepts absolute http(s) URLs and root paths
// - Strips legacy prefixes
// - If the remaining name contains a folder (e.g., "india/..."), it will be joined under imagesBase (default "/images")
// - If it’s a bare filename, it’s taken from imagesBase as well.
function resolveImageUrl(p) {
  if (!p) return null;
  if (/^https?:\/\//i.test(p)) return p;
  if (p.startsWith("/")) return p;

  let name = p
    .replace(/^backend\/static\/images\//, "")
    .replace(/^static\/images\//, "")
    .replace(/^images\//, "");

  const base = (appConfig.imagesBase || "/images").replace(/\/+$/, "");
  return `${base}/${name}`;
}

function showQuestionImage(q) {
  if (!birdImage) return;
  const url = resolveImageUrl(q?.image);
  if (url) {
    birdImage.src = url;
    birdImage.alt = q.title || "Bird image";
    birdImage.style.display = "block";
  } else {
    birdImage.removeAttribute("src");
    birdImage.style.display = "none";
  }
}

// ---------- Quiz flow ----------
function renderQuestion() {
  clearInterval(timerInterval);

  const q = questions[currentQuestionIndex];
  if (!q) return;

  // Build a shuffled copy of the choices for THIS render only.
  // q.choices and q.answer are never mutated, so correctness checking
  // (handleAnswer compares against q.answer) is unaffected.
  const shuffledChoices = (q.choices || []).slice();
  for (let i = shuffledChoices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffledChoices[i], shuffledChoices[j]] = [shuffledChoices[j], shuffledChoices[i]];
  }

  const { infoText, infoUrl } = splitInfoFields(q);
  q.info_text = infoText;
  q.info_url  = infoUrl;
  if (feedbackEl) {
  feedbackEl.innerHTML = "";
  feedbackEl.style.display = "none";
}
if (nextButton) nextButton.style.display = "none";


  questionEl.textContent = q.question || "Question";
  showQuestionImage(q);

  choicesEl.innerHTML = "";
  shuffledChoices.forEach(choice => {
    const btn = document.createElement("button");
    btn.className = "choice-btn";
    btn.textContent = choice;
    btn.onclick = () => handleAnswer(choice, q);
    choicesEl.appendChild(btn);
  });

 // hide next until answered
if (nextButton) nextButton.style.display = "none";

updateProgressBar();
if (isTimedMode) startTimer(30);

}

function handleAnswer(selected, q) {
  // Safety: if we got the old signature by mistake, try to reconstruct q
  if (!q || !q.answer) {
    // Try to recover from old call pattern handleAnswer(selected, correct, info)
    q = {
      question: questions[currentQuestionIndex]?.question || "",
      answer: arguments[1],
      info: arguments[2],
      image: questions[currentQuestionIndex]?.image || ""
    };
  }

  clearInterval(timerInterval);

  const isCorrect = selected === q.answer;
  if (isCorrect) score++;
  

  // Robust split (accepts bare domains, www., etc.)
  const { infoText, infoUrl } = splitInfoFields(q);

  // Immediate feedback
  let feedback = isCorrect
    ? `<p>✅ Correct!</p>`
    : `<p>❌ Incorrect. The correct answer was <strong>${q.answer}</strong>.</p>`;

  if (infoUrl)   feedback += `<p><a href="${infoUrl}" data-birdid-external target="_blank" rel="noopener noreferrer">🔗 More Information</a></p>`;
  if (infoText)  feedback += `<p>${infoText}</p>`;

  if (feedbackEl) {
    feedbackEl.innerHTML = feedback;
    feedbackEl.style.display = "block";
  }

  // Disable further clicks on choices
  document.querySelectorAll(".choice-btn").forEach(b => b.disabled = true);

  // Save for review with a resolved image URL
  const entry = {
    question: q.question,
    image: resolveImageUrl(q.image) || "",
    selected,
    correct: q.answer,
    isCorrect,
    infoText,
    infoUrl
  };
  userAnswers[currentQuestionIndex] = entry;

  // Reveal Next button
  if (nextButton) nextButton.style.display = "block";
}

function nextQuestion() {
  currentQuestionIndex++;
  if (currentQuestionIndex < questions.length) {
    renderQuestion();
  } else {
    clearInterval(timerInterval);
    showResults();
  }
}
window.nextQuestion = nextQuestion; // for inline onclick in HTML

function showResults(saveState = true) {
  if (quizSection)  quizSection.style.display = "none";
  if (quizHeader)   quizHeader.style.display  = "none";

  // Use local refs with *El* suffix
  const resultsSectionEl = document.getElementById("results-section");
  const resultsSummaryEl = document.getElementById("results-summary");

  if (resultsSectionEl) resultsSectionEl.style.display = "block";
  if (resultsSummaryEl) resultsSummaryEl.classList.remove("hidden");

  const total = questions.length;
  const percent = total ? Math.round((score / total) * 100) : 0;

  if (finalScoreEl)   finalScoreEl.textContent = `${score} / ${total} (${percent}%)`;
  if (finalMessageEl) {
    finalMessageEl.textContent =
      percent === 100 ? "You're a master birder! 🦅🏆" :
      percent >= 80   ? "Fantastic job! You really know your birds 🐦👏" :
      percent >= 50   ? "Nice work! There’s a birder in you yet 🌿" :
                        "Keep exploring — birding is a journey 🐣";
  }

  // --- Donate block (add once) ---
  const donate = document.getElementById("donate-controls") || document.createElement("div");
  donate.id = "donate-controls";
  donate.innerHTML = `
  <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap">
    <label for="pi-amount" class="muted">Amount:</label>
    <select id="pi-amount">
      <option value="0.1">0.1 π</option>
      <option value="0.5">0.5 π</option>
      <option value="1">1 π</option>
      <option value="custom">Custom…</option>
    </select>

    <input id="pi-amount-custom" type="number" min="0.01" step="0.01"
           placeholder="e.g., 2.5" style="display:none; width:8em">

    <button id="tip-pi" class="btn">Donate</button>
    <span id="tip-status" class="muted" style="margin-left:8px;"></span>
  </div>

  <p class="muted" style="margin:6px 0 0;">
    Pi donations work inside the <strong>Pi Browser</strong>.
    Otherwise, see our <a href="/ledger.html">Public Donations Ledger</a>.
  </p>
`;

    resultsSummaryEl.appendChild(donate);
    if (saveState) saveCompletedQuizState("results");
  }

function getSelectedAmount() {
  const sel = document.getElementById('pi-amount');
  const custom = document.getElementById('pi-amount-custom');

  let val = (sel && sel.value === 'custom') ? (custom?.value || '') : (sel?.value || '');
  const amt = parseFloat(val);

  if (!isFinite(amt) || amt <= 0) {
    throw new Error('Please enter a valid amount.');
  }
  // keep at most 4 decimals
  return Math.round(amt * 10000) / 10000;
}

// Toggle the custom amount box when dropdown changes
document.addEventListener('change', (e) => {
  if (e.target && e.target.id === 'pi-amount') {
    const showCustom = e.target.value === 'custom';
    const custom = document.getElementById('pi-amount-custom');
    if (custom) {
      custom.style.display = showCustom ? 'inline-block' : 'none';
      if (showCustom) custom.focus();
    }
  }
});

// Use the selected amount when donating
document.addEventListener('click', (e) => {
  const t = e.target;
  if (t && t.id === 'tip-pi') {
    e.preventDefault();
    const status = document.getElementById('tip-status');
    try {
      const amt = getSelectedAmount();
      if (status) status.textContent = `Preparing to donate ${amt} π…`;
      tipInPi(amt);
    } catch (err) {
      if (status) status.textContent = err.message;
    }
  }
});

async function tipInPi(amount = 0.1) {
  console.warn("Pi donations are not yet enabled.");
  const status = document.getElementById('tip-status');
  if (status) status.textContent = 'Pi donations are not yet supported.';
  return;
}


function renderAnswerReview() {
  if (!reviewContentEl) return;
  reviewContentEl.innerHTML = "";

  userAnswers.forEach((e, i) => {
    const hasLink = !!(e.infoUrl || e.infoText);
    const infoHtml = e.infoUrl
      ? `<a href="${e.infoUrl}" data-birdid-external target="_blank" rel="noopener noreferrer">🔗 More Information</a>`
      : (e.infoText ? `<em>${e.infoText}</em>` : "");

    const imgHtml = e.image
      ? `<img src="${e.image}" alt="Bird image" class="question-image" />`
      : "";

    const div = document.createElement("div");
    div.className = `result-item ${e.isCorrect ? "correct" : "incorrect"}`;
    div.innerHTML = `
      <h3>Question ${i + 1}</h3>
      ${imgHtml}
      <p><strong>Question:</strong> ${e.question}</p>
      <p><strong>Your Answer:</strong> ${e.selected || "(none)"}</p>
      <p><strong>Correct Answer:</strong> ${e.correct}</p>
      ${hasLink ? infoHtml : ""}
    `;
    reviewContentEl.appendChild(div);
  });
}


// ---------- Timer / Progress (safe no-ops if elements missing) ----------
function startTimer(duration = 30) {
  if (!quizHeader || !timerText || !progressFill) return; // no timer UI on this page
  quizHeader.style.display = "flex";
  let timeLeft = duration;

  timerText.textContent = `Time left: ${timeLeft}s`;
  timerText.style.color = "black";
  timerText.style.fontWeight = "normal";
  progressFill.style.width = `100%`;

  timerInterval = setInterval(() => {
    timeLeft--;
    timerText.textContent = `Time left: ${timeLeft}s`;
    const pct = Math.max(0, (timeLeft / duration) * 100);
    progressFill.style.width = `${pct}%`;

    if (timeLeft === 10) timerText.style.color = "orange";
    if (timeLeft <= 5) { timerText.style.color = "red"; timerText.style.fontWeight = "bold"; }

    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      const q = questions[currentQuestionIndex];
      handleAnswer("", q);
    }
  }, 1000);
}

function updateProgressBar() {
  if (!progressFill) return;
  const pct = questions.length ? ((currentQuestionIndex + 1) / questions.length) * 100 : 0;
  progressFill.style.width = `${pct}%`;
}


// ---------- Boot ----------
document.addEventListener("DOMContentLoaded", async () => {
  try {

    // Only initialize on pages that actually have the quiz UI
    const hasQuizImg = birdImage;
    const hasQuizUI =
      hasQuizImg ||
      document.getElementById("choices") ||
      document.getElementById("quiz-section") ||
      document.getElementById("quiz-wrapper");

    if (!hasQuizUI) return;

    await loadConfig();

    // Mode override via URL ?mode=timed|leisure
    const mode = new URLSearchParams(window.location.search).get("mode");
    const startFresh = new URLSearchParams(window.location.search).get("start") === "1";
    if (startFresh) {
      // Consume the start request so a later external-browser return can restore.
      const currentUrl = new URL(window.location.href);
      currentUrl.searchParams.delete("start");
      window.history.replaceState(window.history.state, "", currentUrl.href);
    }
    if (mode === "timed")   isTimedMode = true;
    if (mode === "leisure") isTimedMode = false;

    // Events
    if (nextButton) nextButton.addEventListener("click", nextQuestion);
    if (viewAnswersBtn) {
     viewAnswersBtn.addEventListener("click", () => {
       if (!userAnswers.length) {
         restoreCompletedQuizState();
       }

       if (resultsSummary) resultsSummary.classList.add("hidden");
       if (answerReviewEl) answerReviewEl.classList.remove("hidden");

       renderAnswerReview();
       document.body.classList.add("results-mode");
       saveCompletedQuizState("review");
     });
    }

    // Load questions
    const raw = await loadQuestions(appConfig.questionsFile || "questions.json");
    questions = sanitizeQuizData(raw);

    if (!questions.length) {
    if (questionEl) questionEl.textContent = "No questions available.";
    return;
    }

    // Show quiz area if it’s hidden by default
    if (quizSection) quizSection.style.display = "block";

    const navEntry = performance.getEntriesByType("navigation")[0];
    const isHistoryReturn = navEntry && navEntry.type === "back_forward";

    if (!startFresh && (isHistoryReturn || hasPendingReviewReturn()) && restoreCompletedQuizState()) {
    return;
    }

    try {
      sessionStorage.removeItem(getReviewReturnKey());
      localStorage.removeItem(getCompletedQuizStateKey());
      localStorage.removeItem("birdid.returnToReview");
    } catch (_) {}
    currentQuestionIndex = 0;
    score = 0;
    userAnswers = [];
    renderQuestion();

    } catch (err) {
    console.error(err);
    if (questionEl) questionEl.textContent = "⚠️ Failed to load quiz questions.";
  }
 });

// A cached page already retains its quiz state; restore only after data is ready.
window.addEventListener("pageshow", (event) => {
  if (event.persisted && questions.length && hasPendingReviewReturn()) {
    restoreCompletedQuizState(true);
  }
});
