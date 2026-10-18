const privacyStyle = `
  :host {
    color-scheme: dark !important;
  }

  .ipr-container {
    background-color: #050505 !important;
    border-color: #681326 !important;
    color: #f5f5f5 !important;
    box-shadow: 0 0 10px rgb(255 23 68 / 30%) !important;
  }

  .ipr-button {
    background-color: #160208 !important;
    border: 1px solid #ff1744 !important;
    border-radius: 4px !important;
    color: #ff6682 !important;
    padding: 2px 8px !important;
  }

  .ipr-info {
    color: #c8c8c8 !important;
  }
`;

const currentRoute = new URLSearchParams(location.search).get("r");
document.documentElement?.classList.toggle("tw-settings-page", currentRoute === "option/index");
document.documentElement?.classList.toggle("tw-typefish-page", currentRoute === "typefish/start");

const styledRoots = new WeakSet();

function applyPrivacyStyle(element) {
  const root = element.shadowRoot;
  if (!root || styledRoots.has(root)) {
    return;
  }

  const style = document.createElement("style");
  style.textContent = privacyStyle;
  root.append(style);
  styledRoots.add(root);
}

function scanForShadowRoots(node) {
  if (!(node instanceof Element)) {
    return;
  }

  applyPrivacyStyle(node);
  for (const element of node.querySelectorAll("*")) {
    applyPrivacyStyle(element);
  }
}

const gradeBadgeClasses = [
  "tw-grade-badge-1",
  "tw-grade-badge-2",
  "tw-grade-badge-3",
  "tw-grade-badge-4",
  "tw-grade-badge-5",
];

function styleGradeBadges() {
  for (const badge of document.querySelectorAll("table.items td.grid-cell-right > span")) {
    const grade = badge.textContent.trim();
    const gradeClass = /^[1-5]$/.test(grade)
      ? `tw-grade-badge-${grade}`
      : null;

    for (const className of gradeBadgeClasses) {
      if (className !== gradeClass) {
        badge.classList.remove(className);
      }
    }
    if (gradeClass && !badge.classList.contains(gradeClass)) {
      badge.classList.add(gradeClass);
    }
  }
}

let performanceTable = null;
let progressDashboard = null;

function readAttemptsWithTemporaryExpansion(table) {
  const groups = [];
  for (const trigger of table.querySelectorAll(".collapsibleTrigger[id^='collapsibleTrigger_']")) {
    const match = trigger.id.match(/^collapsibleTrigger_(\d+)$/);
    if (!match) {
      continue;
    }

    const groupClass = `collapsContentWrapper_${match[1]}`;
    const attemptRows = Array.from(table.querySelectorAll("tbody tr"))
      .filter((row) => row.classList.contains(groupClass));
    if (!attemptRows.length) {
      continue;
    }

    groups.push({ trigger, attemptRows });
    if (attemptRows.length && attemptRows.some((row) => getComputedStyle(row).display === "none")) {
      trigger.click();
    }
  }

  try {
    return readPerformanceAttempts(table);
  } finally {
    for (const { trigger, attemptRows } of groups) {
      if (attemptRows.some((row) => getComputedStyle(row).display !== "none")) {
        trigger.click();
      }
    }
  }
}

function cachePerformanceAttempts(attempts) {
  if (typeof browser === "undefined" || !browser.storage?.local) {
    return;
  }

  const accountNames = Array.from(
    document.querySelectorAll('a[href*="userProfile"]'),
    (link) => link.textContent.trim(),
  ).filter((name) => name && name.toLowerCase() !== "profil");
  const account = accountNames[accountNames.length - 1] || "default";
  const key = `performance-attempts-v1:${encodeURIComponent(account.toLowerCase())}`;
  browser.storage.local.set({ [key]: attempts }).catch(() => {});
}

function readPerformanceAttempts(table) {
  const attempts = [];
  for (const row of table.querySelectorAll("tbody tr")) {
    const cells = row.cells;
    if (cells.length < 12) {
      continue;
    }

    const lessonText = cells[1].textContent.trim();
    const isLesson = /^\d+$/.test(lessonText);
    const isRepeat = /^[├└]─$/.test(lessonText);
    if (!isLesson && !isRepeat) {
      continue;
    }

    const parseNumber = (cell) => {
      const value = Number.parseFloat(cell.textContent.trim().replace(",", "."));
      return Number.isFinite(value) ? value : null;
    };
    const strokes = parseNumber(cells[3]);
    const errors = parseNumber(cells[4]);
    const durationParts = cells[6].textContent.trim().match(/^(\d+):(\d{2})$/);
    const durationSeconds = durationParts
      ? Number(durationParts[1]) * 60 + Number(durationParts[2])
      : null;
    const dateText = cells[11].textContent.trim();
    const dateParts = dateText.match(/^(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})$/);
    const timestamp = dateParts
      ? new Date(+dateParts[3], +dateParts[2] - 1, +dateParts[1], +dateParts[4], +dateParts[5]).getTime()
      : null;

    attempts.push({
      lesson: isLesson ? Number(lessonText) : null,
      completed: isLesson && /✓|✔/.test(cells[2].textContent),
      strokes,
      errors,
      accuracy: parseNumber(cells[5]),
      speed: parseNumber(cells[7]),
      durationSeconds,
      wpm: strokes !== null && durationSeconds > 0
        ? strokes / 5 / (durationSeconds / 60)
        : null,
      grade: parseNumber(cells[9]),
      timestamp,
      dateText,
      sequence: attempts.length,
    });
  }
  return attempts.sort((first, second) =>
    (first.timestamp ?? first.sequence) - (second.timestamp ?? second.sequence),
  );
}

function createProgressChart(title, attempts, metric, color, unit) {
  const card = document.createElement("section");
  card.className = "tw-progress-chart";
  const heading = document.createElement("h4");
  heading.textContent = title;
  card.append(heading);

  const values = attempts.filter((attempt) => Number.isFinite(attempt[metric]));
  if (!values.length) {
    const empty = document.createElement("p");
    empty.textContent = "Noch keine Werte verfügbar";
    card.append(empty);
    return card;
  }

  const width = 600;
  const height = 180;
  const margin = { top: 14, right: 18, bottom: 30, left: 48 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const rawValues = values.map((attempt) => attempt[metric]);
  const minValue = Math.min(...rawValues);
  const maxValue = Math.max(...rawValues);
  const range = maxValue - minValue || Math.max(maxValue * 0.08, 1);
  const lower = Math.max(0, minValue - range * 0.12);
  const upper = maxValue + range * 0.12;
  const x = (index) => margin.left + (values.length < 2 ? plotWidth / 2 : index * plotWidth / (values.length - 1));
  const y = (value) => margin.top + (upper - value) * plotHeight / (upper - lower || 1);
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", `${title}, ${values.length} Versuche`);

  for (let step = 0; step <= 2; step += 1) {
    const value = upper - (upper - lower) * step / 2;
    const line = document.createElementNS(svg.namespaceURI, "line");
    line.setAttribute("x1", String(margin.left));
    line.setAttribute("x2", String(width - margin.right));
    line.setAttribute("y1", String(y(value)));
    line.setAttribute("y2", String(y(value)));
    line.setAttribute("class", "tw-chart-gridline");
    svg.append(line);

    const label = document.createElementNS(svg.namespaceURI, "text");
    label.setAttribute("x", String(margin.left - 8));
    label.setAttribute("y", String(y(value) + 4));
    label.setAttribute("text-anchor", "end");
    label.setAttribute("class", "tw-chart-label");
    label.textContent = `${value.toFixed(0)}${unit}`;
    svg.append(label);
  }

  const line = document.createElementNS(svg.namespaceURI, "polyline");
  line.setAttribute("points", values.map((attempt, index) => `${x(index)},${y(attempt[metric])}`).join(" "));
  line.setAttribute("class", "tw-chart-line");
  line.style.stroke = color;
  svg.append(line);

  const sampleStep = Math.max(1, Math.ceil(values.length / 90));
  for (let index = 0; index < values.length; index += sampleStep) {
    const point = document.createElementNS(svg.namespaceURI, "circle");
    point.setAttribute("cx", String(x(index)));
    point.setAttribute("cy", String(y(values[index][metric])));
    point.setAttribute("r", "2.4");
    point.setAttribute("class", "tw-chart-point");
    point.style.fill = color;
    const titleElement = document.createElementNS(svg.namespaceURI, "title");
    titleElement.textContent = `${values[index].dateText}: ${values[index][metric]}${unit}`;
    point.append(titleElement);
    svg.append(point);
  }

  const firstDate = document.createElementNS(svg.namespaceURI, "text");
  firstDate.setAttribute("x", String(margin.left));
  firstDate.setAttribute("y", String(height - 7));
  firstDate.setAttribute("class", "tw-chart-label");
  firstDate.textContent = values[0].dateText.split(" ")[0] || "Ältester Versuch";
  svg.append(firstDate);

  const lastDate = document.createElementNS(svg.namespaceURI, "text");
  lastDate.setAttribute("x", String(width - margin.right));
  lastDate.setAttribute("y", String(height - 7));
  lastDate.setAttribute("text-anchor", "end");
  lastDate.setAttribute("class", "tw-chart-label");
  lastDate.textContent = values[values.length - 1].dateText.split(" ")[0] || "Letzter Versuch";
  svg.append(lastDate);
  card.append(svg);
  return card;
}

function updateProgressDashboard(table) {
  const allAttempts = readAttemptsWithTemporaryExpansion(table);
  cachePerformanceAttempts(allAttempts);
  const selectedPeriod = progressDashboard.querySelector(".tw-progress-period")?.value ?? "30";
  const periodDays = Number(selectedPeriod);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const periodStart = selectedPeriod === "today"
    ? todayStart.getTime()
    : Number.isFinite(periodDays) && periodDays > 0
      ? Date.now() - periodDays * 86400000
      : null;
  const attempts = periodStart !== null
    ? allAttempts.filter((attempt) => Number.isFinite(attempt.timestamp) && attempt.timestamp >= periodStart)
    : allAttempts;
  const completedLessons = new Set(
    attempts.filter((attempt) => attempt.completed).map((attempt) => attempt.lesson),
  );
  const lessonCount = new Set(attempts.map((attempt) => attempt.lesson).filter(Number.isFinite)).size;
  const speeds = attempts.map((attempt) => attempt.speed).filter(Number.isFinite);
  const wpms = attempts.map((attempt) => attempt.wpm).filter(Number.isFinite);
  const grades = attempts.map((attempt) => attempt.grade).filter(Number.isFinite);
  const totalStrokes = attempts.reduce((sum, attempt) => sum + (attempt.strokes ?? 0), 0);
  const totalErrors = attempts.reduce((sum, attempt) => sum + (attempt.errors ?? 0), 0);
  const totalCorrect = Math.max(0, totalStrokes - totalErrors);
  const totalDuration = attempts.reduce((sum, attempt) => sum + (attempt.durationSeconds ?? 0), 0);
  const overallAccuracy = totalStrokes ? totalCorrect / totalStrokes * 100 : null;
  const averageWpm = totalDuration ? totalStrokes / 5 / (totalDuration / 60) : null;
  const practiceDays = new Set(attempts
    .filter((attempt) => attempt.dateText)
    .map((attempt) => attempt.dateText.split(" ")[0])).size;
  const formatNumber = (value, digits = 0) => Number.isFinite(value)
    ? new Intl.NumberFormat("de-AT", { maximumFractionDigits: digits }).format(value)
    : "–";
  const formatTrainingTime = (seconds) => {
    const totalMinutes = Math.round(seconds / 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return hours ? `${hours} h ${minutes} min` : `${minutes} min`;
  };
  const stats = [
    [selectedPeriod !== "all" ? "Versuche im Zeitraum" : "Versuche insgesamt", formatNumber(attempts.length)],
    ["Tastenanschläge", formatNumber(totalStrokes)],
    ["Richtig", formatNumber(totalCorrect)],
    ["Fehler", formatNumber(totalErrors)],
    ["Genauigkeit gesamt", overallAccuracy === null ? "–" : `${formatNumber(overallAccuracy, 1)} %`],
    ["Ø WPM", averageWpm === null ? "–" : formatNumber(averageWpm, 1)],
    ["Bestes WPM", wpms.length ? formatNumber(Math.max(...wpms), 1) : "–"],
    ["Bestes Tempo / 10 min", speeds.length ? formatNumber(Math.max(...speeds)) : "–"],
    ["Ø Tempo / 10 min", speeds.length ? formatNumber(speeds.reduce((sum, value) => sum + value, 0) / speeds.length, 1) : "–"],
    ["Trainingszeit", formatTrainingTime(totalDuration)],
    ["Lektionen erledigt", `${completedLessons.size} / ${lessonCount}`],
    ["Ø Note", grades.length ? formatNumber(grades.reduce((sum, value) => sum + value, 0) / grades.length, 1) : "–"],
    ["Übungstage", formatNumber(practiceDays)],
  ];

  progressDashboard.replaceChildren();
  const chartToolbar = document.createElement("div");
  chartToolbar.className = "tw-progress-toolbar";
  const chartHeading = document.createElement("h4");
  chartHeading.textContent = "Verlauf";
  const periodLabel = document.createElement("label");
  periodLabel.textContent = "Zeitraum";
  const periodSelect = document.createElement("select");
  periodSelect.className = "tw-progress-period";
  periodSelect.setAttribute("aria-label", "Zeitraum für die Diagramme");
  for (const [value, label] of [
    ["today", "Heute"],
    ["all", "Alle Daten"],
    ["7", "Letzte 7 Tage"],
    ["30", "Letzte 30 Tage"],
    ["90", "Letzte 90 Tage"],
    ["365", "Letztes Jahr"],
  ]) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    periodSelect.append(option);
  }
  periodSelect.value = selectedPeriod;
  periodSelect.addEventListener("change", () => updateProgressDashboard(table));
  periodLabel.append(periodSelect);
  chartToolbar.append(chartHeading, periodLabel);
  progressDashboard.append(chartToolbar);

  const metrics = document.createElement("div");
  metrics.className = "tw-progress-metrics";
  for (const [label, value] of stats) {
    const item = document.createElement("div");
    item.className = "tw-progress-metric";
    const heading = document.createElement("span");
    heading.textContent = label;
    const number = document.createElement("strong");
    number.textContent = value;
    item.append(heading, number);
    metrics.append(item);
  }
  progressDashboard.append(metrics);

  const chartCount = document.createElement("p");
  chartCount.className = "tw-progress-chart-count";
  chartCount.textContent = `${formatNumber(attempts.length)} Versuche im gewählten Zeitraum`;
  progressDashboard.append(chartCount);

  const charts = document.createElement("div");
  charts.className = "tw-progress-charts";
  charts.append(
    createProgressChart("Tempo je Versuch", attempts, "speed", "#ff9b36", ""),
    createProgressChart("Genauigkeit je Versuch", attempts, "accuracy", "#76e62f", "%"),
  );
  progressDashboard.append(charts);
}

function setupPerformanceDashboard(table) {
  if (!location.search.includes("r=user/userLevels") || !table) {
    return;
  }
  const headers = Array.from(table.querySelectorAll("thead th"), (header) => header.textContent.trim());
  if (!headers.includes("Lektion") || !headers.includes("Anschläge") || !headers.includes("% ok")) {
    return;
  }

  if (performanceTable !== table || !progressDashboard?.isConnected) {
    performanceTable = table;
    progressDashboard = document.createElement("section");
    progressDashboard.id = "tw-progress-dashboard";
    progressDashboard.setAttribute("aria-label", "Fortschrittsstatistik für alle Versuche");
    table.closest(".gridBox")?.querySelector("h3")?.insertAdjacentElement("afterend", progressDashboard);
  }
  updateProgressDashboard(table);
}

let activeLessonPanel = null;
let isLessonKeyboardHidden = false;
let lessonPanelOffset = { left: 0, top: 0 };

function hideOverviewNews(node = document.documentElement) {
  if (new URLSearchParams(location.search).get("r") !== "user/overview" || !(node instanceof Element)) {
    return;
  }

  const headings = [];
  if (node.matches(".gradientBox > h3") && node.closest("#contentBody")) {
    headings.push(node);
  }
  headings.push(...node.querySelectorAll("#contentBody .gradientBox > h3"));

  for (const heading of headings) {
    const title = heading.textContent.replace(/\s+/g, " ").trim();
    if (/^Was gibt es Neues beim\s+Typewriter\?$/i.test(title)) {
      heading.closest(".gradientBox")?.classList.add("tw-hide-overview-news");
    }
  }
}

function setKeyboardGuideVisibility(hidden) {
  const markedElements = document.querySelectorAll(".tw-hidden-keyboard-guide");
  for (const element of markedElements) {
    element.classList.remove("tw-hidden-keyboard-guide");
  }
  if (!hidden) {
    return;
  }

  const isGoldColor = (value) => {
    const match = String(value).match(/rgba?\((\d+)[, ]+([\d.]+)[, ]+([\d.]+)/i);
    if (!match) {
      return false;
    }
    const [red, green, blue] = match.slice(1).map(Number);
    return red > 180 && green > 65 && green < 230 && blue < 110 && red - green < 125 && red > blue * 1.7;
  };

  for (const element of document.querySelectorAll("body *")) {
    const rect = element.getBoundingClientRect();
    if (
      rect.width === 0 ||
      rect.height === 0 ||
      element.matches(".keyboard .def")
    ) {
      continue;
    }

    const style = getComputedStyle(element);
    const before = getComputedStyle(element, "::before");
    const after = getComputedStyle(element, "::after");
    const borderColors = [
      style.borderTopColor,
      style.borderRightColor,
      style.borderBottomColor,
      style.borderLeftColor,
    ];
    const borderIsGold = borderColors.some(isGoldColor);
    const goldVisible = [
      style.backgroundColor,
      style.color,
      style.outlineColor,
      style.boxShadow,
      style.stroke,
      before.backgroundColor,
      before.borderColor,
      before.color,
      after.backgroundColor,
      after.borderColor,
      after.color,
    ].some(isGoldColor);
    if (!goldVisible) {
      continue;
    }

    const borderWidths = [
      style.borderTopWidth,
      style.borderRightWidth,
      style.borderBottomWidth,
      style.borderLeftWidth,
    ];
    const thinGoldBorder = borderIsGold && borderWidths.some((width, index) =>
      isGoldColor(borderColors[index]) && Number.parseFloat(width) <= 4,
    );
    const guideNamed = /(?:line|guide|finger|pointer|hint)/i.test(
      `${element.id} ${typeof element.className === "string" ? element.className : ""}`,
    );
    const thinShape = rect.width <= 8 || rect.height <= 8;
    if (thinShape || thinGoldBorder || guideNamed) {
      const target = element instanceof SVGElement ? element.closest("svg") : element;
      target?.classList.add("tw-hidden-keyboard-guide");
    }
  }
}

function setupLessonControls() {
  const lessonPanel = document.querySelector("#contentBodyKeyboard");
  if (!lessonPanel || !document.body) {
    activeLessonPanel = null;
    document.body?.classList.remove("tw-lesson-page");
    document.querySelector("#tw-keyboard-toggle")?.remove();
    document.querySelector("#tw-pause-toggle")?.remove();
    return;
  }

  document.body.classList.add("tw-lesson-page");

  const panelWasReplaced = activeLessonPanel !== lessonPanel;
  if (panelWasReplaced) {
    activeLessonPanel = lessonPanel;
    lessonPanel.style.position = "relative";
    lessonPanel.style.left = `${lessonPanelOffset.left}px`;
    lessonPanel.style.top = `${lessonPanelOffset.top}px`;
  }
  if (panelWasReplaced && isLessonKeyboardHidden) {
    setKeyboardGuideVisibility(true);
  }
  lessonPanel.classList.toggle("tw-keyboard-hidden", isLessonKeyboardHidden);

  if (!lessonPanel.querySelector(".tw-panel-drag-handle")) {
    const handle = document.createElement("div");
    handle.className = "tw-panel-drag-handle";
    handle.title = "Ziehen, um das obere Feld zu verschieben";
    handle.setAttribute("aria-label", handle.title);
    handle.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) {
        return;
      }
      event.preventDefault();
      const startX = event.clientX;
      const startY = event.clientY;
      const startLeft = lessonPanelOffset.left;
      const startTop = lessonPanelOffset.top;
      handle.setPointerCapture(event.pointerId);

      const movePanel = (moveEvent) => {
        lessonPanelOffset = {
          left: startLeft + moveEvent.clientX - startX,
          top: startTop + moveEvent.clientY - startY,
        };
        lessonPanel.style.left = `${lessonPanelOffset.left}px`;
        lessonPanel.style.top = `${lessonPanelOffset.top}px`;
      };
      const stopMoving = () => {
        handle.removeEventListener("pointermove", movePanel);
        handle.removeEventListener("pointerup", stopMoving);
        handle.removeEventListener("pointercancel", stopMoving);
      };

      handle.addEventListener("pointermove", movePanel);
      handle.addEventListener("pointerup", stopMoving);
      handle.addEventListener("pointercancel", stopMoving);
    });
    lessonPanel.append(handle);
  }

  if (!document.querySelector("#tw-keyboard-toggle")) {
    const keyboardToggle = document.createElement("button");
    keyboardToggle.id = "tw-keyboard-toggle";
    keyboardToggle.type = "button";
    keyboardToggle.title = "Tastatur ein- oder ausblenden";
    keyboardToggle.setAttribute("aria-label", keyboardToggle.title);
    keyboardToggle.setAttribute("aria-pressed", "false");
    keyboardToggle.addEventListener("click", () => {
      isLessonKeyboardHidden = !isLessonKeyboardHidden;
      setKeyboardGuideVisibility(isLessonKeyboardHidden);
      const currentPanel = document.querySelector("#contentBodyKeyboard");
      currentPanel?.classList.toggle(
        "tw-keyboard-hidden",
        isLessonKeyboardHidden,
      );
      document.body.classList.toggle(
        "tw-lesson-controls-hidden",
        isLessonKeyboardHidden,
      );
      document.querySelector("#input_area")?.focus({ preventScroll: true });
      keyboardToggle.setAttribute("aria-pressed", String(isLessonKeyboardHidden));
      keyboardToggle.title = isLessonKeyboardHidden
        ? "Tastatur einblenden"
        : "Tastatur ausblenden";
    });
    document.body.append(keyboardToggle);
  }

  if (!document.querySelector("#tw-pause-toggle")) {
    const pauseToggle = document.createElement("button");
    pauseToggle.id = "tw-pause-toggle";
    pauseToggle.type = "button";
    pauseToggle.title = "Lektion pausieren oder fortsetzen";
    pauseToggle.setAttribute("aria-label", pauseToggle.title);
    pauseToggle.addEventListener("click", () => {
      const keyboardPauseButton = document.querySelector(".keyboard .tPause");
      if (keyboardPauseButton) {
        keyboardPauseButton.click();
        return;
      }
      if (typeof window.togglePauseTypewriter === "function") {
        window.togglePauseTypewriter();
      }
    });
    document.body.append(pauseToggle);
  }
}

let gradeRefreshScheduled = false;
const observedGradeTables = new WeakSet();

function scheduleGradeBadgeRefresh() {
  if (gradeRefreshScheduled) {
    return;
  }
  gradeRefreshScheduled = true;
  requestAnimationFrame(() => {
    gradeRefreshScheduled = false;
    styleGradeBadges();
    setupPerformanceDashboard(document.querySelector("table.items"));
  });
}

const gradeObserver = new MutationObserver(scheduleGradeBadgeRefresh);

function observeGradeTables(node) {
  if (!(node instanceof Element)) {
    return;
  }

  const tables = [];
  if (node.matches("table.items")) {
    tables.push(node);
  }
  tables.push(...node.querySelectorAll("table.items"));

  for (const table of tables) {
    if (observedGradeTables.has(table)) {
      continue;
    }
    gradeObserver.observe(table, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    observedGradeTables.add(table);
    scheduleGradeBadgeRefresh();
  }
}

const observer = new MutationObserver((records) => {
  let lessonControlsMayHaveChanged = false;
  for (const record of records) {
    const target = record.target;
    if (record.type === "childList" && target instanceof Element) {
      lessonControlsMayHaveChanged ||= Boolean(
        target.closest("#contentBodyKeyboard") ||
        target.matches("#contentWrapper, body, html"),
      );
    }

    for (const node of record.addedNodes) {
      scanForShadowRoots(node);
      observeGradeTables(node);
      hideOverviewNews(node);
      if (node instanceof Element) {
        lessonControlsMayHaveChanged ||=
          node.matches("#contentBodyKeyboard") ||
          Boolean(node.querySelector("#contentBodyKeyboard"));
      }
    }

    for (const node of record.removedNodes) {
      if (node instanceof Element) {
        lessonControlsMayHaveChanged ||=
          node.matches("#contentBodyKeyboard") ||
          Boolean(node.querySelector("#contentBodyKeyboard"));
      }
    }
  }
  if (lessonControlsMayHaveChanged) {
    setupLessonControls();
  }
});

observer.observe(document.documentElement, {
  childList: true,
  subtree: true,
});
scanForShadowRoots(document.documentElement);
observeGradeTables(document.documentElement);
hideOverviewNews();
styleGradeBadges();
setupLessonControls();
