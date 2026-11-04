import { cairoDate, fetchMonth, getSuggestion, prayerClock, relativeMonth } from "./schedule.js";

const $ = (selector) => document.querySelector(selector);
const root = document.documentElement;
const reader = $("#reader");
const article = $("#routine");
const dayList = $("#day-list");
const nowButton = $("#now");
const dayButton = $("#day");
const indexButton = $("#index-button");
const indexDialog = $("#index");
const indexList = $("#index-list");
const jumps = $(".jumps");
const phaseButtons = [...jumps.querySelectorAll("button")];
const routineButtons = [...dayList.querySelectorAll("button")];
const titles = new Map(routineButtons.map((button) => [button.dataset.routine, button.firstElementChild.textContent]));
const scheduleStatus = $("#schedule-status");
const folio = $("#folio");
const folioTime = $("#folio-time");
const prayerTime = $("#prayer-time");
const sizeInput = $("#reading-size");
const nightButton = $("#night");

const SCHEDULE_KEY = "awrad-cairo-calendar-v1";
const PREFS_KEY = "awrad-reading-v1";
const WEEK = 7 * 24 * 60 * 60 * 1000;
const RETRY = 5 * 60 * 1000;

function load(key) {
  try { return JSON.parse(localStorage.getItem(key)) || {}; }
  catch { return {}; }
}

function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch { /* The reader still works with the in-memory copy. */ }
}

const months = load(SCHEDULE_KEY);
const preferences = load(PREFS_KEY);
const requests = new Map();
const attempts = new Map();
let suggestion = null;
let selected = null;
let waitingForNow = true;
let clockTimer;

function dateBefore(date) {
  return new Date(Date.parse(date + "T00:00:00Z") - 86400000).toISOString().slice(0, 10);
}

function getDay(date) {
  return months[date.slice(0, 7)]?.days?.[date];
}

function markPhase() {
  const after = article.querySelector('[data-phase="after"]');
  const phase = after && reader.scrollTop >= after.offsetTop - 15 ? "after" : "before";
  for (const button of phaseButtons) {
    if (button.dataset.phaseJump === phase) button.setAttribute("aria-current", "true");
    else button.removeAttribute("aria-current");
  }
}

function updateNavigation() {
  const readingNow = selected !== null && selected === suggestion?.id;
  if (readingNow) nowButton.setAttribute("aria-current", "page");
  else nowButton.removeAttribute("aria-current");
  if (!selected) dayButton.setAttribute("aria-current", "page");
  else dayButton.removeAttribute("aria-current");
  $("#now-label").textContent = suggestion ? "الآن · " + titles.get(suggestion.id).replace(/^صلاة /, "") : "الآن";
  folio.dataset.current = String(readingNow);
  $("#eyebrow").textContent = readingNow ? "الآن · القاهرة" : "القاهرة";
  folioTime.hidden = !readingNow;
  if (readingNow) {
    prayerTime.textContent = prayerClock(suggestion.at);
    prayerTime.dateTime = new Date(suggestion.at).toISOString();
  }
  for (const button of routineButtons) {
    if (button.dataset.routine === suggestion?.id) button.setAttribute("aria-current", "time");
    else button.removeAttribute("aria-current");
  }
}

function showRoutine(id) {
  const template = document.getElementById("routine-" + id);
  if (!template) return;
  waitingForNow = false;
  selected = id;
  $("#title").textContent = titles.get(id);
  dayList.hidden = true;
  scheduleStatus.hidden = true;
  article.hidden = false;
  article.replaceChildren(template.content.cloneNode(true));
  jumps.hidden = !article.querySelector('[data-phase="before"]');
  reader.scrollTop = 0;
  indexList.replaceChildren();
  for (const section of article.querySelectorAll(".topic")) {
    const heading = section.querySelector("h2");
    if (!heading) continue;
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = heading.textContent;
    button.dataset.target = section.id;
    indexList.append(button);
  }
  indexButton.disabled = !indexList.childElementCount;
  markPhase();
  updateNavigation();
}

function showDay() {
  selected = null;
  $("#title").textContent = "أقسام اليوم";
  article.hidden = true;
  jumps.hidden = true;
  scheduleStatus.hidden = false;
  dayList.hidden = false;
  indexButton.disabled = true;
  reader.scrollTop = 0;
  updateNavigation();
}

function jumpTo(section) {
  if (section) reader.scrollTop = section.offsetTop - 10;
  markPhase();
}

function updateClock() {
  clearTimeout(clockTimer);
  const time = Date.now();
  const date = cairoDate(time);
  const today = getDay(date);
  const yesterday = getDay(dateBefore(date));
  suggestion = getSuggestion(time, today, yesterday);
  if (waitingForNow && suggestion) showRoutine(suggestion.id);
  scheduleStatus.textContent = suggestion ? "" : requests.size
    ? "جارٍ تحميل مواقيت الصلاة…" : "مواقيت الصلاة غير متاحة";
  for (const button of routineButtons) {
    const id = button.dataset.routine;
    const secondary = button.querySelector("small");
    secondary.textContent = id === "wake" ? "عند الاستيقاظ" : id === "sleep" ? "عند النوم" :
      today?.[id] ? prayerClock(today[id]) : "";
  }
  updateNavigation();
  const upcoming = Object.values(today || {}).find((start) => start > time);
  clockTimer = setTimeout(refresh, Math.min(30000, upcoming ? Math.max(100, upcoming - time + 20) : 30000));
}

function requestMonth(key, time) {
  if (requests.has(key) || (months[key] && time - months[key].savedAt < WEEK) ||
      (attempts.has(key) && time - attempts.get(key) < RETRY)) return;
  attempts.set(key, time);
  const request = fetchMonth(key).then((days) => {
    months[key] = { days, savedAt: Date.now() };
    const date = cairoDate(Date.now());
    const keep = new Set([-1, 0, 1].map((offset) => relativeMonth(date, offset)));
    for (const storedKey of Object.keys(months)) {
      if (!keep.has(storedKey)) delete months[storedKey];
    }
    save(SCHEDULE_KEY, months);
  }).catch(() => {
    // Keep the last validated calendar for this month.
  }).finally(() => {
    requests.delete(key);
    updateClock();
  });
  requests.set(key, request);
}

function refresh() {
  const now = Date.now();
  const date = cairoDate(now);
  if (navigator.onLine) {
    requestMonth(relativeMonth(date, 0), now);
    requestMonth(relativeMonth(date, 1), now);
    if (date.endsWith("-01") && (!getDay(date) || now < getDay(date).fajr)) {
      requestMonth(relativeMonth(date, -1), now);
    }
  }
  updateClock();
}

function renderPreferences() {
  const size = preferences.size >= 20 && preferences.size <= 34 ? preferences.size : 23;
  sizeInput.value = size;
  root.style.setProperty("--reading", size + "px");
  const night = preferences.night === true;
  root.dataset.night = String(night);
  nightButton.setAttribute("aria-pressed", String(night));
  nightButton.textContent = night ? "استخدم مظهر الجهاز" : "الوضع الليلي";
}

nowButton.addEventListener("click", () => {
  waitingForNow = true;
  refresh();
  if (!suggestion) showDay();
});
dayButton.addEventListener("click", () => {
  waitingForNow = false;
  showDay();
});
dayList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-routine]");
  if (button) showRoutine(button.dataset.routine);
});
for (const button of document.querySelectorAll("[data-open]")) {
  button.addEventListener("click", () => document.getElementById(button.dataset.open).showModal());
}
indexList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-target]");
  if (!button) return;
  indexDialog.close();
  jumpTo(document.getElementById(button.dataset.target));
});
for (const button of phaseButtons) {
  button.addEventListener("click", () => {
    if (button.dataset.phaseJump === "before") {
      reader.scrollTop = 0;
      markPhase();
    } else {
      jumpTo(article.querySelector('[data-phase="after"]'));
    }
  });
}
reader.addEventListener("scroll", markPhase, { passive: true });
sizeInput.addEventListener("input", () => {
  preferences.size = Number(sizeInput.value);
  renderPreferences();
});
sizeInput.addEventListener("change", () => save(PREFS_KEY, preferences));
nightButton.addEventListener("click", () => {
  preferences.night = !preferences.night;
  renderPreferences();
  save(PREFS_KEY, preferences);
});
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) refresh();
});
window.addEventListener("online", () => {
  attempts.clear();
  refresh();
});
window.addEventListener("pageshow", refresh);

renderPreferences();
refresh();
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").then(() => navigator.serviceWorker.ready).then(() => {
    $("#offline-status").textContent = "الأوراد متاحة دون اتصال";
  }).catch(() => {
    $("#offline-status").textContent = "تعذّر تجهيز القراءة دون اتصال";
  });
}
