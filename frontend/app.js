const STORAGE_KEY = "active-study-id";
const PAGE_LABELS = {
  home: "Home",
  dashboard: "Dashboard",
  studies: "Studies",
  workspace: "Workspace",
  protocol: "Protocol",
  personas: "Personas",
  "interview-guide": "Interview Guide",
  transcripts: "Transcripts",
  simulations: "Simulations",
  comparisons: "Comparisons",
  settings: "Settings",
  "sign-in": "Sign In",
};

const PRIMARY_NAV = [
  { key: "home", label: "Home", href: "/", icon: "home" },
  { key: "dashboard", label: "Dashboard", href: "/dashboard", icon: "grid" },
  { key: "studies", label: "Studies", href: "/studies", icon: "folder" },
  { key: "workspace", label: "Workspace", href: "/workspace", icon: "layers" },
  { key: "protocol", label: "Protocol", href: "/protocol", icon: "clipboard" },
  { key: "personas", label: "Personas", href: "/personas", icon: "users" },
  { key: "interview-guide", label: "Interview Guide", href: "/interview-guide", icon: "spark" },
  { key: "transcripts", label: "Transcripts", href: "/transcripts", icon: "file" },
  { key: "simulations", label: "Simulations", href: "/simulations", icon: "play" },
  { key: "comparisons", label: "Comparisons", href: "/comparisons", icon: "chart" },
];

const UTILITY_NAV = [{ key: "settings", label: "Settings", href: "/settings", icon: "gear" }];

const WORKSPACE_NAV = [
  { key: "workspace", label: "Overview", href: "/workspace" },
  { key: "protocol", label: "Protocol", href: "/protocol" },
  { key: "personas", label: "Personas", href: "/personas" },
  { key: "interview-guide", label: "Interview Guide", href: "/interview-guide" },
  { key: "transcripts", label: "Transcripts", href: "/transcripts" },
  { key: "simulations", label: "Simulations", href: "/simulations" },
  { key: "comparisons", label: "Comparisons", href: "/comparisons" },
];

const WORKSPACE_PAGES = new Set(WORKSPACE_NAV.map((item) => item.key));
const PUBLIC_PAGES = new Set(["home", "sign-in"]);
const state = {
  studies: [],
  activeStudyId: "",
  extractedQuestions: [],
  auth: {
    authenticated: false,
    user: null,
  },
};

let page = document.body.dataset.page || "home";
let pageEventController = null;
let navigationToken = 0;
const pageDateFormatter = new Intl.DateTimeFormat(undefined, {
  month: "long",
  day: "numeric",
  year: "numeric",
});
const relativeDateFormatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

function el(tagName, options = {}) {
  const node = document.createElement(tagName);
  if (options.className) node.className = options.className;
  if (options.text) node.textContent = options.text;
  if (options.html) node.innerHTML = options.html;
  if (options.attrs) {
    Object.entries(options.attrs).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== false) {
        node.setAttribute(key, value === true ? "" : value);
      }
    });
  }
  return node;
}

function pretty(value) {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

function bodyReady() {
  requestAnimationFrame(() => document.body.classList.add("is-ready"));
}

function installPageTransitions() {
  document.addEventListener("click", async (event) => {
    const link = event.target.closest("a[href]");
    if (!link) return;
    const url = new URL(link.href, window.location.origin);
    const target = `${url.pathname}${url.search}${url.hash}`;
    if (url.origin !== window.location.origin) return;
    if (link.target === "_blank" || event.metaKey || event.ctrlKey || event.shiftKey) return;
    if (target === `${window.location.pathname}${window.location.search}${window.location.hash}`) return;
    event.preventDefault();
    await navigateTo(target);
  });
}

function installCardSpotlight() {
  const targets = document.querySelectorAll(".panel-card, .showcase-card, .metric-card, .resource-card, .report-block");
  targets.forEach((node) => {
    if (node.dataset.spotlightBound === "true") return;
    node.dataset.spotlightBound = "true";
    node.addEventListener("pointermove", (event) => {
      const rect = node.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      node.style.setProperty("--mx", `${x}px`);
      node.style.setProperty("--my", `${y}px`);
      node.style.setProperty("--glow", "1");
    });
    node.addEventListener("pointerleave", () => {
      node.style.setProperty("--glow", "0");
    });
  });
}

async function callApi(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  const isFormData = options.body instanceof FormData;
  if (!isFormData && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(path, { ...options, headers });
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = text;
  }

  if (!response.ok) {
    throw new Error(typeof data === "string" ? data : pretty(data));
  }
  return data;
}

async function loadAuthSession() {
  try {
    const session = await callApi("/api/auth/session");
    state.auth.authenticated = Boolean(session?.authenticated);
    state.auth.user = session?.user || null;
  } catch {
    state.auth.authenticated = false;
    state.auth.user = null;
  }
}

function currentStudy() {
  return state.studies.find((study) => study.id === state.activeStudyId) || null;
}

function activeStudyStorageKey() {
  const userId = state.auth.user?.id || "guest";
  return `${STORAGE_KEY}:${userId}`;
}

function migrateLegacyActiveStudyKey() {
  const legacyValue = localStorage.getItem(STORAGE_KEY);
  if (!legacyValue || !state.auth.user?.id) return;
  const scopedKey = activeStudyStorageKey();
  if (!localStorage.getItem(scopedKey)) {
    localStorage.setItem(scopedKey, legacyValue);
  }
  localStorage.removeItem(STORAGE_KEY);
}

function loadActiveStudyId() {
  if (!state.auth.authenticated || !state.auth.user?.id) {
    state.activeStudyId = "";
    localStorage.removeItem(STORAGE_KEY);
    return;
  }
  migrateLegacyActiveStudyKey();
  state.activeStudyId = localStorage.getItem(activeStudyStorageKey()) || "";
}

function setActiveStudyId(studyId) {
  state.activeStudyId = studyId || "";
  if (!state.auth.authenticated || !state.auth.user?.id) {
    localStorage.removeItem(STORAGE_KEY);
    return;
  }
  const scopedKey = activeStudyStorageKey();
  if (state.activeStudyId) {
    localStorage.setItem(scopedKey, state.activeStudyId);
  } else {
    localStorage.removeItem(scopedKey);
  }
}

function resetPageEventController() {
  pageEventController?.abort();
  pageEventController = new AbortController();
  return pageEventController.signal;
}

function scopedPath(path) {
  if (!state.activeStudyId) return path;
  const url = new URL(path, window.location.origin);
  url.searchParams.set("study_id", state.activeStudyId);
  return `${url.pathname}${url.search}`;
}

function formatDate(value) {
  if (!value) return "Unknown date";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function formatRelativeDate(value) {
  if (!value) return "No timestamp";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No timestamp";
  const diffMs = date.getTime() - Date.now();
  const diffHours = Math.round(diffMs / (1000 * 60 * 60));
  if (Math.abs(diffHours) < 24) {
    return relativeDateFormatter.format(diffHours, "hour");
  }
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  return relativeDateFormatter.format(diffDays, "day");
}

function formatUserDisplayName(user) {
  const email = user?.email || "";
  const localPart = email.split("@")[0] || "";
  if (!localPart) return "Researcher";
  return localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function userRoleLabel(user) {
  return user?.role || "Research workspace";
}

function userInitials(user) {
  const name = formatUserDisplayName(user);
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
  return initials || "R";
}

function latestRecord(items) {
  return [...items].sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())[0] || null;
}

function iconSprite(name) {
  const sprites = {
    home:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 10.5 8-6 8 6M6.5 9v10h11V9m-7.5 10v-5h4v5"/></svg>',
    grid:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z"/></svg>',
    folder:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H10l2 2h6.5A2.5 2.5 0 0 1 21 9.5v7A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5z"/></svg>',
    layers:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 4 8 4.5-8 4.5-8-4.5zm-8 8 8 4.5 8-4.5M4 15.5 12 20l8-4.5"/></svg>',
    clipboard:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4.5h6M9.75 3h4.5A1.75 1.75 0 0 1 16 4.75V6h2.5A1.5 1.5 0 0 1 20 7.5v11A2.5 2.5 0 0 1 17.5 21h-11A2.5 2.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H8V4.75A1.75 1.75 0 0 1 9.75 3Z"/></svg>',
    users:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7 1a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM4.5 19a4.5 4.5 0 0 1 9 0m1 0a3.5 3.5 0 0 1 6.5-1.75"/></svg>',
    spark:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 1.8 4.7L18.5 9 13.8 10.8 12 15.5l-1.8-4.7L5.5 9l4.7-1.3zm6.5 10.5.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9zM6 15l1 2.5L9.5 18 7 19l-1 2.5L5 19l-2.5-1L5 17.5z"/></svg>',
    file:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3.5h7l4 4v13A1.5 1.5 0 0 1 16.5 22h-9A1.5 1.5 0 0 1 6 20.5v-15A2 2 0 0 1 8 3.5Zm7 1.5v3h3"/></svg>',
    play:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 6.5A2.5 2.5 0 0 1 8.8 4.4l8 5.1a2.5 2.5 0 0 1 0 4.2l-8 5.1A2.5 2.5 0 0 1 5 16.7z"/></svg>',
    chart:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19.5h14M8 17V11m4 6V6m4 11v-8"/></svg>',
    gear:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 1.3 2.6 2.9.5.9 2.8 2.4 1.7-1.1 2.7 1.1 2.7-2.4 1.7-.9 2.8-2.9.5L12 21l-1.3-2.6-2.9-.5-.9-2.8-2.4-1.7 1.1-2.7-1.1-2.7 2.4-1.7.9-2.8 2.9-.5zm0 5.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z"/></svg>',
    arrow:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5"/></svg>',
  };
  return sprites[name] || sprites.grid;
}

function setNodeContent(node, content) {
  if (!node) return;
  node.textContent = typeof content === "string" ? content : pretty(content);
}

function setMessageState(node, message, options = {}) {
  if (!node) return;
  setNodeContent(node, message);
  node.classList.toggle("is-loading", Boolean(options.loading));
}

function startButtonLoading(button, loadingText) {
  if (!button) return;
  if (!button.dataset.originalText) {
    button.dataset.originalText = button.textContent || "";
  }
  button.disabled = true;
  button.classList.add("is-loading");
  if (loadingText) {
    button.textContent = loadingText;
  }
}

function stopButtonLoading(button) {
  if (!button) return;
  button.disabled = false;
  button.classList.remove("is-loading");
  if (button.dataset.originalText) {
    button.textContent = button.dataset.originalText;
  }
}

function makeEmptyNote(message) {
  return el("div", { className: "empty-note", text: message });
}

function createMetaPills(items) {
  const row = el("div", { className: "meta-row" });
  items.forEach((item) => row.appendChild(el("span", { className: "pill", text: item })));
  return row;
}

async function signOutCurrentSession() {
  try {
    await callApi("/api/auth/sign-out", { method: "POST" });
  } catch (error) {
    console.error("Sign out request failed", error);
  } finally {
    state.auth.authenticated = false;
    state.auth.user = null;
    setActiveStudyId("");
    window.location.assign("/sign-in");
  }
}

async function fetchPageDocument(path) {
  const response = await fetch(path, {
    headers: { "X-Requested-With": "partial-navigation" },
    credentials: "same-origin",
  });
  const html = await response.text();
  const parser = new DOMParser();
  const nextDocument = parser.parseFromString(html, "text/html");
  const main = nextDocument.querySelector("main");
  const nextPage = nextDocument.body?.dataset.page || "home";
  const nextTitle = nextDocument.title || document.title;
  const finalUrl = response.url ? new URL(response.url, window.location.origin) : new URL(path, window.location.origin);
  return { main, nextPage, nextTitle, finalUrl };
}

async function navigateTo(path, options = {}) {
  const url = new URL(path, window.location.origin);
  const target = `${url.pathname}${url.search}${url.hash}`;
  if (!options.force && target === `${window.location.pathname}${window.location.search}${window.location.hash}`) return;

  const token = ++navigationToken;

  try {
    const { main, nextPage, nextTitle, finalUrl } = await fetchPageDocument(target);
    if (token !== navigationToken || !main) return;

    const currentMain = document.querySelector("main");
    if (!currentMain) return;

    currentMain.replaceWith(main);
    page = nextPage;
    document.body.dataset.page = nextPage;
    document.title = nextTitle;

    const finalPath = `${finalUrl.pathname}${finalUrl.search}${finalUrl.hash}`;
    if (options.replaceHistory) {
      window.history.replaceState({ path: finalPath }, "", finalPath);
    } else {
      window.history.pushState({ path: finalPath }, "", finalPath);
    }

    await refreshCurrentPage({ scrollToTop: options.scrollToTop !== false });
  } catch (error) {
    console.error("Partial navigation failed, falling back to full navigation.", error);
    window.location.assign(target);
    return;
  }
}

function renderHeader() {
  const header = document.querySelector("[data-site-header]");
  if (!header) return;

  const shell = el("div", { className: "shell-chrome" });
  const sidebar = el("aside", { className: "app-sidebar", attrs: { "aria-label": "Primary navigation" } });
  const brand = el("a", { className: "app-brand", attrs: { href: "/dashboard" } });
  brand.appendChild(el("span", { className: "app-brand__mark", html: iconSprite("spark") }));
  const brandCopy = el("span", { className: "app-brand__copy" });
  brandCopy.appendChild(el("strong", { text: "Qualitative AI" }));
  brandCopy.appendChild(el("span", { text: "Interview Studio" }));
  brand.appendChild(brandCopy);

  const nav = el("nav", { className: "sidebar-nav", attrs: { "aria-label": "Application navigation" } });
  PRIMARY_NAV.forEach((item) => {
    const link = el("a", {
      className: `sidebar-nav__link${isTopNavActive(item.key) ? " is-active" : ""}`,
      attrs: { href: item.href, title: item.label },
    });
    link.appendChild(el("span", { className: "sidebar-nav__icon", html: iconSprite(item.icon) }));
    link.appendChild(el("span", { className: "sidebar-nav__label", text: item.label }));
    nav.appendChild(link);
  });

  const utilityNav = el("nav", { className: "sidebar-nav sidebar-nav--utility", attrs: { "aria-label": "Utility navigation" } });
  UTILITY_NAV.forEach((item) => {
    const link = el("a", {
      className: `sidebar-nav__link${page === item.key ? " is-active" : ""}`,
      attrs: { href: item.href, title: item.label },
    });
    link.appendChild(el("span", { className: "sidebar-nav__icon", html: iconSprite(item.icon) }));
    link.appendChild(el("span", { className: "sidebar-nav__label", text: item.label }));
    utilityNav.appendChild(link);
  });

  const topbar = el("div", { className: "header-bar" });
  const pageIntro = el("div", { className: "page-intro" });
  pageIntro.appendChild(el("span", { className: "page-intro__eyebrow", text: "Research Portal" }));
  pageIntro.appendChild(el("strong", { className: "page-intro__title", text: PAGE_LABELS[page] || "Workspace" }));
  pageIntro.appendChild(
    el("span", {
      className: "page-intro__copy",
      text: currentStudy() ? `Scoped to ${currentStudy().name}` : "Choose a study to focus the workspace.",
    }),
  );

  const utility = el("div", { className: "header-utility" });
  const switcher = el("div", { className: "study-switcher" });
  const selectLabel = el("label");
  selectLabel.appendChild(el("span", { className: "field-label", text: "Active Study" }));
  const select = el("select", { attrs: { id: "global-study-select" } });
  select.appendChild(el("option", { text: "All studies / unscoped", attrs: { value: "" } }));
  state.studies.forEach((study) => {
    select.appendChild(el("option", { text: study.name, attrs: { value: study.id } }));
  });
  select.value = state.activeStudyId;
  select.addEventListener("change", async () => {
    setActiveStudyId(select.value);
    await refreshCurrentPage();
  });
  selectLabel.appendChild(select);
  switcher.appendChild(selectLabel);

  const account = el("div", { className: "account-chip" });
  account.appendChild(el("span", { className: "account-chip__avatar", text: userInitials(state.auth.user) }));
  const accountCopy = el("div", { className: "account-chip__copy" });
  accountCopy.appendChild(
    el("strong", { text: state.auth.authenticated ? formatUserDisplayName(state.auth.user) : "Guest session" }),
  );
  accountCopy.appendChild(
    el("span", {
      className: "brand__copy",
      text: state.auth.authenticated
        ? `${userRoleLabel(state.auth.user)} • ${state.auth.user?.email || "Signed in"}`
        : "Sign in to access study operations.",
    }),
  );
  account.appendChild(accountCopy);

  if (state.auth.authenticated) {
    const signOutButton = el("button", {
      className: "button button--secondary sidebar-signout",
      text: "Log out",
      attrs: { type: "button" },
    });
    signOutButton.addEventListener("click", async () => {
      await signOutCurrentSession();
    });
    sidebar.appendChild(signOutButton);
  } else {
    sidebar.appendChild(el("a", { className: "button button--secondary sidebar-signout", text: "Sign in", attrs: { href: "/sign-in" } }));
  }

  utility.append(switcher, account);
  sidebar.append(brand, nav, utilityNav);
  topbar.append(pageIntro, utility);
  shell.append(sidebar, topbar);
  header.replaceChildren(shell);
}

function renderWorkspaceNav() {
  const nav = document.querySelector("[data-workspace-nav]");
  if (!nav) return;
  nav.replaceChildren();
  WORKSPACE_NAV.forEach((item) => {
    nav.appendChild(
      el("a", {
        className: `workspace-nav__link${page === item.key ? " is-active" : ""}`,
        text: item.label,
        attrs: { href: item.href },
      }),
    );
  });
}

function isTopNavActive(key) {
  return page === key;
}

function requireActiveStudy(containerId, message) {
  if (currentStudy()) return false;
  const node = document.getElementById(containerId);
  if (node) {
    node.replaceChildren(makeEmptyNote(message));
  }
  return true;
}

function renderResourceCards(container, items, formatter) {
  container.replaceChildren();
  if (!items.length) {
    container.appendChild(makeEmptyNote("No records found in the current scope."));
    return;
  }
  items.forEach((item) => container.appendChild(formatter(item)));
}

function resourceCard(title, bodyText, pills = []) {
  const card = el("article", { className: "resource-card" });
  card.appendChild(el("h3", { text: title }));
  if (bodyText) card.appendChild(el("p", { text: bodyText }));
  if (pills.length) card.appendChild(createMetaPills(pills));
  return card;
}

function joinNonEmpty(parts, separator = " ") {
  return parts.filter(Boolean).join(separator).trim();
}

function normalizeSentence(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
}

function truncateCopy(text, limit = 200) {
  const clean = normalizeSentence(text);
  if (clean.length <= limit) return clean;
  const clipped = clean.slice(0, limit);
  const safeBreak = Math.max(clipped.lastIndexOf(". "), clipped.lastIndexOf("; "), clipped.lastIndexOf(", "), clipped.lastIndexOf(" "));
  return `${clipped.slice(0, safeBreak > 80 ? safeBreak : limit).trim()}...`;
}

function scoreComparisonEntry(entry) {
  const text = normalizeSentence(joinNonEmpty([
    entry.theme,
    entry.difference,
    entry.review_note,
    entry.real_pattern,
    entry.ai_pattern,
    entry.research_implication,
    entry.real_evidence,
    entry.ai_evidence,
  ])).toLowerCase();

  const alignedHits = [
    "align",
    "aligned",
    "overlap",
    "shared",
    "same",
    "similar",
    "consistent",
    "converge",
    "common",
    "parallel",
  ].reduce((total, token) => total + (text.includes(token) ? 1 : 0), 0);

  const divergenceHits = [
    "miss",
    "missed",
    "fail",
    "failed",
    "lack",
    "lacks",
    "absent",
    "generic",
    "shallow",
    "diverge",
    "diverged",
    "flatten",
    "omit",
    "omits",
    "limited",
    "hallucinat",
    "over-structure",
    "overstructured",
  ].reduce((total, token) => total + (text.includes(token) ? 1 : 0), 0);

  return { alignedHits, divergenceHits };
}

function summarizeComparisonEntry(entry, fallback) {
  if (!entry) return fallback;
  const summary = joinNonEmpty([
    entry.theme ? `${entry.theme}:` : "",
    entry.difference || entry.review_note || entry.research_implication || entry.ai_pattern || entry.real_pattern,
  ]);
  return truncateCopy(summary || fallback);
}

function summarizeStrengths(payload) {
  const overview = payload.overview || {};
  const table = Array.isArray(payload.comparison_table) ? payload.comparison_table : [];
  const positiveRow = table.find((row) =>
    /consistent|coverage|structured|coherent|clear|broad|systematic|organized|comprehensive/i.test(
      joinNonEmpty([row.ai_pattern, row.difference, row.research_implication]),
    ),
  );
  const text = joinNonEmpty([
    positiveRow?.theme ? `${positiveRow.theme}:` : "",
    positiveRow?.ai_pattern,
    overview.ai_summary,
  ]);
  return truncateCopy(
    text ||
      "AI responses stayed consistent and legible across themes, which helps with protocol testing and early-stage comparison work.",
  );
}

function summarizeWeaknesses(payload) {
  const overview = payload.overview || {};
  const entries = [
    ...(Array.isArray(payload.comparison_table) ? payload.comparison_table : []),
    ...(Array.isArray(payload.theme_review) ? payload.theme_review : []),
  ];
  const weakRow = entries.find((entry) =>
    /generic|lacks|lack|shallow|limited|hallucinat|emotion|hesitation|context|specific|specificity|lived/i.test(
      joinNonEmpty([
        entry.difference,
        entry.review_note,
        entry.ai_pattern,
        entry.ai_evidence,
        entry.research_implication,
      ]),
    ),
  );
  const text = joinNonEmpty([
    weakRow?.theme ? `${weakRow.theme}:` : "",
    weakRow?.difference || weakRow?.review_note || weakRow?.research_implication,
    overview.key_takeaway,
  ]);
  return truncateCopy(
    text ||
      "AI outputs still flatten lived context and emotional nuance, which makes them weaker substitutes for real interviews when depth matters.",
  );
}

function buildComparisonCards(payload) {
  const overview = payload.overview || {};
  const table = Array.isArray(payload.comparison_table) ? payload.comparison_table : [];
  const reviews = Array.isArray(payload.theme_review) ? payload.theme_review : [];
  const entries = [...table, ...reviews].filter(Boolean);

  let alignedEntry = null;
  let missedEntry = null;
  let alignedScore = -1;
  let missedScore = -1;

  entries.forEach((entry) => {
    const scores = scoreComparisonEntry(entry);
    if (scores.alignedHits > alignedScore) {
      alignedScore = scores.alignedHits;
      alignedEntry = entry;
    }
    if (scores.divergenceHits > missedScore) {
      missedScore = scores.divergenceHits;
      missedEntry = entry;
    }
  });

  if (!alignedEntry && table[0]) alignedEntry = table[0];
  if (!missedEntry && table[1]) missedEntry = table[1];
  if (!missedEntry && reviews[0]) missedEntry = reviews[0];

  const catchCopy = truncateCopy(
    summarizeComparisonEntry(
      alignedEntry,
      overview.real_summary || overview.key_takeaway || "AI and human interviews surfaced overlapping themes in the same analytical territory.",
    ),
  );

  const missCopy = truncateCopy(
    summarizeComparisonEntry(
      missedEntry,
      overview.key_takeaway || "AI diverged from the human interview in the places where context, tension, or lived nuance mattered most.",
    ),
  );

  return [
    {
      tone: "catch",
      title: "Catch",
      subtitle: "topics aligned",
      body: catchCopy,
    },
    {
      tone: "miss",
      title: "Miss",
      subtitle: "topics diverged",
      body: missCopy,
    },
    {
      tone: "strengths",
      title: "Strengths",
      subtitle: "AI advantages",
      body: summarizeStrengths(payload),
    },
    {
      tone: "weaknesses",
      title: "Weaknesses",
      subtitle: "AI limitations",
      body: summarizeWeaknesses(payload),
    },
  ];
}

function comparisonSummaryCard({ tone, title, subtitle, body }) {
  const card = el("article", { className: `comparison-summary-card comparison-summary-card--${tone}` });
  const header = el("div", { className: "comparison-summary-card__header" });
  header.appendChild(el("h3", { text: title }));
  header.appendChild(el("span", { className: "comparison-summary-card__subtitle", text: subtitle }));
  card.appendChild(header);
  card.appendChild(el("p", { className: "comparison-summary-card__body", text: body }));
  return card;
}

function dashboardEntityCard({ label, title, count, copy, href, icon, meta }) {
  const card = el("article", { className: "dashboard-entity-card" });
  const header = el("div", { className: "dashboard-entity-card__header" });
  header.appendChild(el("span", { className: "dashboard-entity-card__icon", html: iconSprite(icon) }));
  const heading = el("div");
  heading.appendChild(el("span", { className: "panel-card__label", text: label }));
  heading.appendChild(el("h3", { text: title }));
  header.appendChild(heading);

  const countNode = el("strong", { className: "dashboard-entity-card__count", text: String(count) });
  const copyNode = el("p", { text: copy });
  const footer = el("div", { className: "dashboard-entity-card__footer" });
  if (meta) footer.appendChild(el("span", { className: "dashboard-entity-card__meta", text: meta }));
  footer.appendChild(el("a", { className: "button button--primary", text: "Open", attrs: { href } }));

  card.append(header, countNode, copyNode, footer);
  return card;
}

async function loadStudies() {
  state.studies = await callApi("/api/studies");
  if (state.activeStudyId && !state.studies.some((study) => study.id === state.activeStudyId)) {
    setActiveStudyId("");
  }
}

async function loadCollection(name) {
  return callApi(scopedPath(`/api/${name}`));
}

async function initDashboard() {
  const [protocols, personas, guides, transcripts, simulations, comparisons] = await Promise.all([
    loadCollection("protocols"),
    loadCollection("personas"),
    loadCollection("question-guides"),
    loadCollection("transcripts"),
    loadCollection("simulations"),
    loadCollection("comparisons"),
  ]);

  const active = currentStudy();
  const setupAssets = protocols.length + personas.length + guides.length + transcripts.length;
  const analysisRuns = simulations.length + comparisons.length;
  const workflowStage = !active
    ? "Waiting for study selection"
    : !protocols.length
      ? "Protocol setup"
      : !personas.length || !guides.length
        ? "Asset preparation"
        : !simulations.length
          ? "Ready for simulation"
          : !comparisons.length
            ? "Comparison setup"
            : "Analysis in progress";

  setNodeContent(document.getElementById("dashboard-studies-count"), state.studies.length);
  setNodeContent(document.getElementById("dashboard-assets-count"), setupAssets);
  setNodeContent(document.getElementById("dashboard-analysis-count"), analysisRuns);

  setNodeContent(document.getElementById("dashboard-date-label"), pageDateFormatter.format(new Date()));
  setNodeContent(
    document.getElementById("dashboard-greeting"),
    state.auth.authenticated ? `Welcome back, ${formatUserDisplayName(state.auth.user)}.` : "Welcome to your research portal.",
  );
  setNodeContent(
    document.getElementById("dashboard-greeting-copy"),
    active
      ? `Your current workspace is scoped to ${active.name}. Review setup coverage, recent records, and the next recommended move.`
      : "Choose a study from the top bar to scope the dashboard and unlock study-specific workflow guidance.",
  );
  setNodeContent(document.getElementById("dashboard-active-study"), active ? active.name : "No study selected");
  setNodeContent(document.getElementById("dashboard-active-stage"), workflowStage);
  setNodeContent(document.getElementById("dashboard-active-study-sidebar"), active ? active.name : "No study selected");
  setNodeContent(
    document.getElementById("dashboard-active-study-copy"),
    active
      ? active.description || "This study is currently active across the app."
      : "Select a study from the top bar to scope dashboard summaries and workflow links.",
  );

  const entityGrid = document.getElementById("dashboard-entity-grid");
  entityGrid.replaceChildren(
    dashboardEntityCard({
      label: "Protocol",
      title: "Protocol Guidance",
      count: protocols.length,
      copy: protocols.length ? "Review the rules shaping interview behavior and analysis focus." : "Create protocol guidance to anchor the study workflow.",
      href: "/protocol",
      icon: "clipboard",
      meta: latestRecord(protocols) ? `Updated ${formatRelativeDate(latestRecord(protocols).created_at)}` : "No protocol records yet",
    }),
    dashboardEntityCard({
      label: "Participants",
      title: "Personas",
      count: personas.length,
      copy: personas.length ? "Ground participant profiles are ready for simulation work." : "Extract or author study personas before simulation begins.",
      href: "/personas",
      icon: "users",
      meta: latestRecord(personas) ? `Updated ${formatRelativeDate(latestRecord(personas).created_at)}` : "No personas created yet",
    }),
    dashboardEntityCard({
      label: "Interview Design",
      title: "Interview Guide",
      count: guides.length,
      copy: guides.length ? "Shared interview questions are available for reuse." : "Extract and save a guide to standardize the interview flow.",
      href: "/interview-guide",
      icon: "spark",
      meta: latestRecord(guides) ? `Updated ${formatRelativeDate(latestRecord(guides).created_at)}` : "No guides saved yet",
    }),
    dashboardEntityCard({
      label: "Source Material",
      title: "Transcripts",
      count: transcripts.length,
      copy: transcripts.length ? "Real interview material is stored for grounded comparison." : "Upload transcripts to compare AI outputs against real interviews.",
      href: "/transcripts",
      icon: "file",
      meta: latestRecord(transcripts) ? `Updated ${formatRelativeDate(latestRecord(transcripts).created_at)}` : "No transcripts loaded yet",
    }),
    dashboardEntityCard({
      label: "Generation",
      title: "Simulations",
      count: simulations.length,
      copy: simulations.length ? "Generated interviews are ready for export and review." : "Run simulations once personas, guides, and protocol are in place.",
      href: "/simulations",
      icon: "play",
      meta: latestRecord(simulations) ? `Updated ${formatRelativeDate(latestRecord(simulations).created_at)}` : "No simulations generated yet",
    }),
    dashboardEntityCard({
      label: "Review",
      title: "Comparisons",
      count: comparisons.length,
      copy: comparisons.length ? "Comparison reports are available for analytic review." : "Generate comparisons after transcripts and simulations are available.",
      href: "/comparisons",
      icon: "chart",
      meta: latestRecord(comparisons) ? `Updated ${formatRelativeDate(latestRecord(comparisons).created_at)}` : "No comparisons saved yet",
    }),
  );

  const readiness = document.getElementById("dashboard-readiness");
  readiness.replaceChildren(
    resourceCard("Protocol coverage", protocols.length ? `${protocols.length} protocol record(s) are available in the current scope.` : "No protocol records yet."),
    resourceCard("Participant preparation", personas.length ? `${personas.length} persona record(s) are available for simulations.` : "No personas created yet."),
    resourceCard(
      "Interview assets",
      guides.length && transcripts.length
        ? `${guides.length} guide(s) and ${transcripts.length} transcript(s) are available for structured comparison work.`
        : "Guides and transcripts are still incomplete in the current scope.",
    ),
    resourceCard(
      "Analysis readiness",
      simulations.length
        ? comparisons.length
          ? "Simulations and comparisons both exist, so analytic review is already underway."
          : "Simulations exist and can now be paired with transcripts for comparison."
        : "Run simulations to unlock comparison work.",
    ),
  );

  const recentRecords = [
    ...protocols.map((item) => ({ label: "Protocol", name: item.name, created_at: item.created_at })),
    ...personas.map((item) => ({ label: "Persona", name: item.name, created_at: item.created_at })),
    ...guides.map((item) => ({ label: "Interview guide", name: item.name, created_at: item.created_at })),
    ...transcripts.map((item) => ({ label: "Transcript", name: item.name, created_at: item.created_at })),
    ...simulations.map((item) => ({ label: "Simulation", name: `Simulation ${item.id.slice(0, 8)}`, created_at: item.created_at })),
    ...comparisons.map((item) => ({ label: "Comparison", name: `Comparison ${item.id.slice(0, 8)}`, created_at: item.created_at })),
  ].sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());

  const collections = document.getElementById("dashboard-collections");
  if (!recentRecords.length) {
    collections.replaceChildren(makeEmptyNote("No scoped records yet. Start by creating a study asset."));
  } else {
    collections.replaceChildren(
      ...recentRecords.slice(0, 4).map((record) =>
        resourceCard(record.label, record.name, [formatRelativeDate(record.created_at), formatDate(record.created_at)]),
      ),
    );
  }

  const nextSteps = document.getElementById("dashboard-next-steps");
  const nextStepCards = [];
  if (!active) {
    nextStepCards.push(resourceCard("Select a study", "Use the active study control in the top bar to focus the workspace."));
  } else if (!protocols.length) {
    nextStepCards.push(resourceCard("Define protocol", "Start in Protocol to establish study context, interview style, and consistency rules.", ["Recommended next move"]));
  } else if (!personas.length) {
    nextStepCards.push(resourceCard("Prepare personas", "Extract participant profiles from source material so the study can move into simulation.", ["Recommended next move"]));
  } else if (!guides.length) {
    nextStepCards.push(resourceCard("Build interview guide", "Save a shared guide so simulations follow the same question structure.", ["Recommended next move"]));
  } else if (!simulations.length) {
    nextStepCards.push(resourceCard("Run simulations", "The core study assets exist. Generate simulated interviews next.", ["Recommended next move"]));
  } else if (!transcripts.length) {
    nextStepCards.push(resourceCard("Load transcripts", "Add real interview material before generating comparisons.", ["Recommended next move"]));
  } else if (!comparisons.length) {
    nextStepCards.push(resourceCard("Generate comparisons", "Pair transcripts and simulations to produce structured comparison reports.", ["Recommended next move"]));
  } else {
    nextStepCards.push(resourceCard("Continue review", "Comparison artifacts already exist. Review the latest report and export any simulations you need.", ["Current focus"]));
  }
  nextStepCards.push(resourceCard("Open workspace", "Use the workspace overview to inspect the full study pipeline and quick links.", ["Shared navigation"]));
  nextSteps.replaceChildren(...nextStepCards);
}

async function initStudies() {
  const portfolioCount = document.getElementById("studies-portfolio-count");
  const portfolioCopy = document.getElementById("studies-portfolio-copy");
  const activeCard = document.getElementById("active-study-card");
  const list = document.getElementById("study-list");

  setNodeContent(portfolioCount, `${state.studies.length} ${state.studies.length === 1 ? "study" : "studies"} loaded`);
  setNodeContent(
    portfolioCopy,
    state.studies.length
      ? "Select an active study from the top bar or the list below to scope the rest of the platform."
      : "Create a study to start building a structured workflow around a specific research question.",
  );

  const active = currentStudy();
  activeCard.replaceChildren(
    active
      ? resourceCard(active.name, active.description || "No description added yet.", [
          `Created ${formatDate(active.created_at)}`,
          "Current active study",
        ])
      : makeEmptyNote("No study selected yet."),
  );

  renderResourceCards(list, state.studies, (study) => {
    const card = resourceCard(study.name, study.description || "No description added yet.", [
      `Created ${formatDate(study.created_at)}`,
      study.id === state.activeStudyId ? "Active study" : "Available",
    ]);
    const button = el("button", {
      className: "button button--secondary",
      text: study.id === state.activeStudyId ? "Selected" : "Set active study",
      attrs: { type: "button" },
    });
    button.addEventListener("click", async () => {
      setActiveStudyId(study.id);
      await refreshCurrentPage();
    });
    card.appendChild(button);
    return card;
  });

  const form = document.getElementById("study-create-form");
  const signal = pageEventController?.signal;
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const output = document.getElementById("study-create-output");
    const submitButton = form.querySelector('button[type="submit"]');
    const formData = new FormData(form);
    const payload = {
      name: String(formData.get("name") || "").trim(),
      description: String(formData.get("description") || "").trim(),
    };

    try {
      startButtonLoading(submitButton, "Creating study...");
      setMessageState(output, "Creating study workspace...", { loading: true });
      const record = await callApi("/api/studies", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setActiveStudyId(record.id);
      setMessageState(output, `Created study: ${record.name}`);
      await loadStudies();
      renderHeader();
      await initStudies();
    } catch (error) {
      setMessageState(output, error.message);
    } finally {
      stopButtonLoading(submitButton);
    }
  }, { signal });
}

async function initWorkspace() {
  const title = document.getElementById("workspace-title");
  const copy = document.getElementById("workspace-copy");
  const stage = document.getElementById("workspace-stage");
  const stageCopy = document.getElementById("workspace-stage-copy");
  const workflow = document.getElementById("workspace-workflow");

  if (!currentStudy()) {
    workflow.replaceChildren(makeEmptyNote("Select a study from the top bar to unlock workspace details."));
    return;
  }

  const [protocols, personas, guides, comparisons] = await Promise.all([
    loadCollection("protocols"),
    loadCollection("personas"),
    loadCollection("question-guides"),
    loadCollection("comparisons"),
  ]);

  title.textContent = currentStudy().name;
  copy.textContent = currentStudy().description || "This study is now the active workspace for protocol, asset, and comparison work.";

  let stageText = "Protocol setup";
  let stageBody = "Define the protocol that should guide the rest of the workflow.";
  if (protocols.length && (!personas.length || !guides.length)) {
    stageText = "Asset preparation";
    stageBody = "The protocol exists. Prepare personas and the shared guide next.";
  } else if (protocols.length && personas.length && guides.length && !comparisons.length) {
    stageText = "Ready for simulation and comparison";
    stageBody = "Core study assets exist. You can move into simulation and comparative review.";
  } else if (comparisons.length) {
    stageText = "Analysis in progress";
    stageBody = "Comparison records already exist for this study.";
  }

  stage.textContent = stageText;
  stageCopy.textContent = stageBody;

  setNodeContent(document.getElementById("workspace-protocol-count"), protocols.length);
  setNodeContent(document.getElementById("workspace-persona-count"), personas.length);
  setNodeContent(document.getElementById("workspace-guide-count"), guides.length);
  setNodeContent(document.getElementById("workspace-comparison-count"), comparisons.length);

  workflow.replaceChildren(
    resourceCard("1. Protocol", protocols.length ? `${protocols.length} protocol record(s) saved.` : "No protocol yet."),
    resourceCard("2. Personas and guide", personas.length && guides.length ? "Both are available." : "Prepare personas and the shared guide."),
    resourceCard("3. Comparison work", comparisons.length ? `${comparisons.length} comparison record(s) saved.` : "No comparisons generated yet."),
  );
}

async function initProtocols(signal) {
  if (requireActiveStudy("protocol-list", "Select a study before saving or viewing protocol records.")) return;
  const list = document.getElementById("protocol-list");
  const output = document.getElementById("protocol-output");
  const form = document.getElementById("protocol-form");
  const uploadForm = document.getElementById("protocol-upload-form");
  const sourceText = form?.querySelector('textarea[name="source_text"]');
  const sharedContext = form?.querySelector('textarea[name="shared_context"]');

  async function refresh() {
    const protocols = await loadCollection("protocols");
    renderResourceCards(list, protocols, (protocol) =>
      resourceCard(protocol.name, protocol.analysis_focus || "No analysis focus provided.", [formatDate(protocol.created_at)]),
    );
  }

  uploadForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitButton = uploadForm.querySelector('button[type="submit"]');
    const formData = new FormData(uploadForm);
    const file = formData.get("file");
    if (!(file instanceof File) || !file.name) {
      setMessageState(output, "Choose a protocol document before uploading.");
      return;
    }

    const payload = new FormData();
    payload.append("file", file);

    try {
      startButtonLoading(submitButton, "Loading document...");
      setMessageState(output, "Extracting protocol text from the uploaded file...", { loading: true });
      const extracted = await callApi("/api/protocols/extract-upload", {
        method: "POST",
        body: payload,
      });
      if (sourceText) {
        sourceText.value = extracted.text || "";
      }
      if (sharedContext && !sharedContext.value.trim()) {
        sharedContext.value = extracted.text || "";
      }
      setMessageState(output, `Loaded protocol text from ${file.name}. Review and split it across the protocol fields as needed.`);
    } catch (error) {
      setMessageState(output, error.message);
    } finally {
      stopButtonLoading(submitButton);
    }
  }, { signal });

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitButton = form.querySelector('button[type="submit"]');
    const formData = new FormData(form);
    const payload = {
      name: String(formData.get("name") || "").trim(),
      shared_context: String(formData.get("shared_context") || "").trim(),
      interview_style_guidance: String(formData.get("interview_style_guidance") || "").trim(),
      consistency_rules: String(formData.get("consistency_rules") || "").trim(),
      analysis_focus: String(formData.get("analysis_focus") || "").trim(),
      study_id: state.activeStudyId,
    };

    try {
      startButtonLoading(submitButton, "Saving protocol...");
      setMessageState(output, "Saving protocol guidance for this study...", { loading: true });
      const record = await callApi("/api/protocols", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setMessageState(output, `Saved protocol: ${record.name}`);
      await refresh();
    } catch (error) {
      setMessageState(output, error.message);
    } finally {
      stopButtonLoading(submitButton);
    }
  }, { signal });

  await refresh();
}

async function initPersonas(signal) {
  if (requireActiveStudy("persona-list", "Select a study before creating or viewing personas.")) return;
  const list = document.getElementById("persona-list");
  const output = document.getElementById("persona-output");
  const form = document.getElementById("persona-form");
  const uploadForm = document.getElementById("persona-upload-form");
  const personaText = form?.querySelector('textarea[name="text"]');

  async function refresh() {
    const personas = await loadCollection("personas");
    renderResourceCards(list, personas, (persona) =>
      resourceCard(persona.name, `${persona.job || "Participant role"} • ${persona.education || "Education not specified"}`, [
        persona.personality || "No personality note",
      ]),
    );
  }

  uploadForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitButton = uploadForm.querySelector('button[type="submit"]');
    const formData = new FormData(uploadForm);
    const file = formData.get("file");
    if (!(file instanceof File) || !file.name) {
      setMessageState(output, "Choose a document before uploading.");
      return;
    }

    const payload = new FormData();
    payload.append("file", file);

    try {
      startButtonLoading(submitButton, "Loading document...");
      setMessageState(output, "Reading source text from the uploaded file...", { loading: true });
      const extracted = await callApi("/api/personas/extract-upload", {
        method: "POST",
        body: payload,
      });
      if (personaText) {
        personaText.value = extracted.text || "";
      }
      setMessageState(output, `Loaded text from ${file.name}. Review it, then extract the persona.`);
    } catch (error) {
      setMessageState(output, error.message);
    } finally {
      stopButtonLoading(submitButton);
    }
  }, { signal });

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitButton = form.querySelector('button[type="submit"]');
    const formData = new FormData(form);
    try {
      startButtonLoading(submitButton, "Extracting persona...");
      setMessageState(output, "Extracting persona details and saving the study profile...", { loading: true });
      const extracted = await callApi("/api/personas/extract", {
        method: "POST",
        body: JSON.stringify({
          text: String(formData.get("text") || ""),
          suggested_name: String(formData.get("suggested_name") || "").trim() || null,
        }),
      });
      const saved = await callApi("/api/personas", {
        method: "POST",
        body: JSON.stringify({ ...extracted, study_id: state.activeStudyId }),
      });
      setMessageState(output, `Saved persona: ${saved.name}`);
      await refresh();
    } catch (error) {
      setMessageState(output, error.message);
    } finally {
      stopButtonLoading(submitButton);
    }
  }, { signal });

  await refresh();
}

async function initInterviewGuide(signal) {
  if (requireActiveStudy("guide-list", "Select a study before creating or viewing interview guides.")) return;
  const questionsOutput = document.getElementById("questions-output");
  const list = document.getElementById("guide-list");
  const extractForm = document.getElementById("questions-form");
  const saveForm = document.getElementById("guide-save-form");
  const uploadForm = document.getElementById("guide-upload-form");
  const guideText = extractForm?.querySelector('textarea[name="text"]');

  async function refresh() {
    const guides = await loadCollection("question-guides");
    renderResourceCards(list, guides, (guide) =>
      resourceCard(guide.name, `${guide.questions.length} question(s)`, [formatDate(guide.created_at)]),
    );
  }

  uploadForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitButton = uploadForm.querySelector('button[type="submit"]');
    const formData = new FormData(uploadForm);
    const file = formData.get("file");
    if (!(file instanceof File) || !file.name) {
      setMessageState(questionsOutput, "Choose a guide document before uploading.");
      return;
    }

    const payload = new FormData();
    payload.append("file", file);

    try {
      startButtonLoading(submitButton, "Loading guide...");
      setMessageState(questionsOutput, "Reading interview guide text from the uploaded file...", { loading: true });
      const extracted = await callApi("/api/question-guides/extract-upload", {
        method: "POST",
        body: payload,
      });
      if (guideText) {
        guideText.value = extracted.text || "";
      }
      setMessageState(questionsOutput, `Loaded text from ${file.name}. Review it, then extract questions.`);
    } catch (error) {
      setMessageState(questionsOutput, error.message);
    } finally {
      stopButtonLoading(submitButton);
    }
  }, { signal });

  extractForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitButton = extractForm.querySelector('button[type="submit"]');
    const formData = new FormData(extractForm);
    try {
      startButtonLoading(submitButton, "Extracting questions...");
      setMessageState(questionsOutput, "Extracting interview questions from the guide text...", { loading: true });
      const questions = await callApi("/api/question-guides/extract", {
        method: "POST",
        body: JSON.stringify({
          text: String(formData.get("text") || ""),
          improve_with_ai: formData.get("improve_with_ai") === "on",
        }),
      });
      state.extractedQuestions = questions;
      setMessageState(
        questionsOutput,
        questions.length ? questions.map((item, index) => `${index + 1}. ${item}`).join("\n") : "No questions extracted.",
      );
    } catch (error) {
      setMessageState(questionsOutput, error.message);
    } finally {
      stopButtonLoading(submitButton);
    }
  }, { signal });

  saveForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitButton = saveForm.querySelector('button[type="submit"]');
    const formData = new FormData(saveForm);
    if (!state.extractedQuestions.length) {
      setMessageState(questionsOutput, "Extract questions before saving a guide.");
      return;
    }
    try {
      startButtonLoading(submitButton, "Saving guide...");
      setMessageState(questionsOutput, "Saving extracted guide to the current study...", { loading: true });
      await callApi("/api/question-guides", {
        method: "POST",
        body: JSON.stringify({
          name: String(formData.get("name") || "").trim(),
          questions: state.extractedQuestions,
          study_id: state.activeStudyId,
        }),
      });
      setMessageState(questionsOutput, "Guide saved successfully.");
      await refresh();
    } catch (error) {
      setMessageState(questionsOutput, error.message);
    } finally {
      stopButtonLoading(submitButton);
    }
  }, { signal });

  await refresh();
}

async function initTranscripts(signal) {
  if (requireActiveStudy("transcript-list", "Select a study before saving or viewing transcripts.")) return;
  const list = document.getElementById("transcript-list");
  const output = document.getElementById("transcript-output");
  const form = document.getElementById("transcript-form");
  const uploadForm = document.getElementById("transcript-upload-form");
  const transcriptText = form?.querySelector('textarea[name="content"]');
  const transcriptName = form?.querySelector('input[name="name"]');

  async function refresh() {
    const transcripts = await loadCollection("transcripts");
    renderResourceCards(list, transcripts, (transcript) =>
      resourceCard(transcript.name, `${transcript.content.slice(0, 180)}${transcript.content.length > 180 ? "..." : ""}`, [
        transcript.source_type || "text",
      ]),
    );
  }

  uploadForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitButton = uploadForm.querySelector('button[type="submit"]');
    const formData = new FormData(uploadForm);
    const file = formData.get("file");
    if (!(file instanceof File) || !file.name) {
      setMessageState(output, "Choose a transcript document before uploading.");
      return;
    }

    const payload = new FormData();
    payload.append("file", file);

    try {
      startButtonLoading(submitButton, "Loading transcript...");
      setMessageState(output, "Extracting transcript text from the uploaded file...", { loading: true });
      const extracted = await callApi("/api/transcripts/extract-upload", {
        method: "POST",
        body: payload,
      });
      if (transcriptText) {
        transcriptText.value = extracted.text || "";
      }
      if (transcriptName && !transcriptName.value.trim()) {
        transcriptName.value = file.name.replace(/\.[^.]+$/, "");
      }
      setMessageState(output, `Loaded text from ${file.name}. Review it, then save the transcript.`);
    } catch (error) {
      setMessageState(output, error.message);
    } finally {
      stopButtonLoading(submitButton);
    }
  }, { signal });

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitButton = form.querySelector('button[type="submit"]');
    const formData = new FormData(form);
    try {
      startButtonLoading(submitButton, "Saving transcript...");
      setMessageState(output, "Saving transcript to the current study...", { loading: true });
      const record = await callApi("/api/transcripts", {
        method: "POST",
        body: JSON.stringify({
          name: String(formData.get("name") || "").trim(),
          content: String(formData.get("content") || "").trim(),
          source_type: "uploaded_or_text",
          study_id: state.activeStudyId,
        }),
      });
      setMessageState(output, `Saved transcript: ${record.name}`);
      await refresh();
    } catch (error) {
      setMessageState(output, error.message);
    } finally {
      stopButtonLoading(submitButton);
    }
  }, { signal });

  await refresh();
}

function populateSelect(node, items, labelKey = "name", includeBlank = true) {
  if (!node) return;
  node.replaceChildren();
  if (includeBlank) {
    node.appendChild(el("option", { text: "Select an option", attrs: { value: "" } }));
  }
  items.forEach((item) => {
    node.appendChild(el("option", { text: item[labelKey], attrs: { value: item.id } }));
  });
}

async function initSimulations(signal) {
  if (requireActiveStudy("simulation-list", "Select a study before running or viewing simulations.")) return;
  const [personas, guides, protocols] = await Promise.all([
    loadCollection("personas"),
    loadCollection("question-guides"),
    loadCollection("protocols"),
  ]);

  populateSelect(document.getElementById("simulation-persona-select"), personas);
  populateSelect(document.getElementById("simulation-guide-select"), guides);
  populateSelect(document.getElementById("simulation-protocol-select"), protocols);

  const form = document.getElementById("simulation-form");
  const output = document.getElementById("simulation-output");
  const list = document.getElementById("simulation-list");

  async function refresh() {
    const simulations = await loadCollection("simulations");
    renderResourceCards(list, simulations, (simulation) => {
      const card = resourceCard(
        `Simulation ${simulation.id.slice(0, 8)}`,
        `${simulation.responses.length} response(s) captured`,
        [formatDate(simulation.created_at)],
      );
      const exportsRow = el("div", { className: "meta-row" });
      ["txt", "docx", "pdf", "html", "csv"].forEach((fileType) => {
        exportsRow.appendChild(
          el("a", {
            className: "text-link",
            text: `Export ${fileType.toUpperCase()}`,
            attrs: { href: `/api/simulations/${simulation.id}/exports/${fileType}` },
          }),
        );
      });
      card.appendChild(exportsRow);
      return card;
    });
  }

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitButton = form.querySelector('button[type="submit"]');
    const formData = new FormData(form);
    try {
      startButtonLoading(submitButton, "Running simulation...");
      setMessageState(output, "Running the AI interview simulation for this study...", { loading: true });
      const result = await callApi("/api/simulations", {
        method: "POST",
        body: JSON.stringify({
          persona_id: String(formData.get("persona_id") || ""),
          question_guide_id: String(formData.get("question_guide_id") || ""),
          protocol_id: String(formData.get("protocol_id") || "") || null,
          study_id: state.activeStudyId,
        }),
      });
      setMessageState(output, `Simulation created with ${result.responses.length} responses.`);
      await refresh();
    } catch (error) {
      setMessageState(output, error.message);
    } finally {
      stopButtonLoading(submitButton);
    }
  }, { signal });

  await refresh();
}

function renderComparisonReport(container, payload) {
  container.replaceChildren();
  if (!payload || typeof payload !== "object") {
    container.appendChild(makeEmptyNote("No comparison payload available."));
    return;
  }

  const overview = payload.overview || {};
  const summaryGrid = el("section", { className: "comparison-summary-grid" });
  buildComparisonCards(payload).forEach((card) => summaryGrid.appendChild(comparisonSummaryCard(card)));
  container.appendChild(summaryGrid);

  const caption = el("p", {
    className: "comparison-summary-caption",
    text: overview.key_takeaway || "Structured comparison synthesized from the current real and AI interview pair.",
  });
  container.appendChild(caption);

  const table = payload.comparison_table || [];
  if (table.length) {
    const tableWrap = el("div", { className: "comparison-table-wrap" });
    tableWrap.appendChild(el("h3", { className: "comparison-section-title", text: "Theme-by-theme comparison" }));
    const tableNode = el("table", { className: "comparison-table" });
    tableNode.innerHTML = `
      <thead>
        <tr>
          <th>Theme</th>
          <th>Real Pattern</th>
          <th>AI Pattern</th>
          <th>Difference</th>
        </tr>
      </thead>
      <tbody></tbody>
    `;
    const tbody = tableNode.querySelector("tbody");
    table.forEach((row) => {
      const tr = el("tr");
      [row.theme, row.real_pattern, row.ai_pattern, row.difference].forEach((value) => {
        tr.appendChild(el("td", { text: value || "" }));
      });
      tbody.appendChild(tr);
    });
    tableWrap.appendChild(tableNode);
    container.appendChild(tableWrap);
  }

  if (payload.markdown_report) {
    const block = el("div", { className: "report-block" });
    block.appendChild(el("h3", { className: "comparison-section-title", text: "Narrative report" }));
    block.appendChild(el("p", { text: payload.markdown_report }));
    container.appendChild(block);
  }
}

async function initComparisons(signal) {
  if (requireActiveStudy("comparison-list", "Select a study before generating or viewing comparisons.")) return;
  const [transcripts, simulations, protocols] = await Promise.all([
    loadCollection("transcripts"),
    loadCollection("simulations"),
    loadCollection("protocols"),
  ]);

  populateSelect(document.getElementById("comparison-transcript-select"), transcripts);
  populateSelect(document.getElementById("comparison-simulation-select"), simulations, "id");
  populateSelect(document.getElementById("comparison-protocol-select"), protocols);

  const form = document.getElementById("comparison-form");
  const output = document.getElementById("comparison-output");
  const report = document.getElementById("comparison-report");
  const list = document.getElementById("comparison-list");

  async function refresh() {
    const comparisons = await loadCollection("comparisons");
    renderResourceCards(list, comparisons, (comparison) =>
      resourceCard(`Comparison ${comparison.id.slice(0, 8)}`, comparison.payload?.overview?.key_takeaway || "No summary available.", [
        formatDate(comparison.created_at),
      ]),
    );
    if (comparisons[0]) {
      renderComparisonReport(report, comparisons[0].payload);
    }
  }

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitButton = form.querySelector('button[type="submit"]');
    const formData = new FormData(form);
    try {
      startButtonLoading(submitButton, "Generating comparison...");
      setMessageState(output, "Comparing the selected transcript and simulation...", { loading: true });
      const result = await callApi("/api/comparisons", {
        method: "POST",
        body: JSON.stringify({
          transcript_id: String(formData.get("transcript_id") || ""),
          simulation_id: String(formData.get("simulation_id") || ""),
          protocol_id: String(formData.get("protocol_id") || "") || null,
          study_id: state.activeStudyId,
        }),
      });
      setMessageState(output, "Comparison generated successfully.");
      renderComparisonReport(report, result.payload);
      await refresh();
    } catch (error) {
      setMessageState(output, error.message);
    } finally {
      stopButtonLoading(submitButton);
    }
  }, { signal });

  await refresh();
}

async function initSettings(signal) {
  const stateNode = document.getElementById("settings-state");
  if (stateNode) {
    stateNode.replaceChildren(
      resourceCard("Current page", PAGE_LABELS[page] || page),
      resourceCard("Auth session", state.auth.authenticated ? state.auth.user?.email || "Signed in" : "Not signed in"),
      resourceCard("Active study", currentStudy() ? currentStudy().name : "No active study selected"),
      resourceCard("Known studies in browser session", `${state.studies.length}`),
    );
  }

  document.getElementById("clear-study-selection")?.addEventListener("click", async () => {
    setActiveStudyId("");
    await refreshCurrentPage();
  }, { signal });
}

async function initSignIn(signal) {
  if (state.auth.authenticated) {
    window.location.assign("/dashboard");
    return;
  }

  const form = document.getElementById("sign-in-form");
  const output = document.getElementById("sign-in-output");
  const signInModeButton = document.getElementById("auth-mode-sign-in");
  const signUpModeButton = document.getElementById("auth-mode-sign-up");
  const authModeLabel = document.getElementById("auth-mode-label");
  const authModeCopy = document.getElementById("auth-mode-copy");
  const submitButton = form?.querySelector('button[type="submit"]');
  const title = document.querySelector(".panel-card--auth h1");
  let authMode = "sign-in";

  function refreshAuthModeUi() {
    if (!submitButton) return;
    submitButton.textContent = authMode === "sign-up" ? "Create account" : "Sign in";
    if (title) {
      title.textContent =
        authMode === "sign-up"
          ? "Create an account to access your research workspace."
          : "Sign in to access your research workspace.";
    }
    if (authModeLabel) {
      authModeLabel.textContent = authMode === "sign-up" ? "Current mode: Create account" : "Current mode: Sign in";
    }
    if (authModeCopy) {
      authModeCopy.textContent =
        authMode === "sign-up"
          ? "Create-account mode is active. Enter your email and password, then click the Create account button below."
          : "Sign-in mode is active. Enter your email and password, then submit the form.";
    }
    signInModeButton?.classList.toggle("is-active", authMode === "sign-in");
    signUpModeButton?.classList.toggle("is-active", authMode === "sign-up");
    signInModeButton?.setAttribute("aria-pressed", authMode === "sign-in" ? "true" : "false");
    signUpModeButton?.setAttribute("aria-pressed", authMode === "sign-up" ? "true" : "false");
  }

  signInModeButton?.addEventListener("click", () => {
    authMode = "sign-in";
    setNodeContent(output, "Enter your credentials to start a session.");
    refreshAuthModeUi();
  }, { signal });
  signUpModeButton?.addEventListener("click", () => {
    authMode = "sign-up";
    setNodeContent(output, "Create-account mode enabled. Submit the form below to register.");
    refreshAuthModeUi();
  }, { signal });
  refreshAuthModeUi();

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const email = String(formData.get("email") || "").trim();
    const password = String(formData.get("password") || "");
    if (!email || !password) {
      setNodeContent(output, "Email and password are required.");
      return;
    }

    try {
      startButtonLoading(submitButton, authMode === "sign-up" ? "Creating account..." : "Signing in...");
      setMessageState(output, authMode === "sign-up" ? "Creating your account..." : "Starting your session...", { loading: true });
      const endpoint = authMode === "sign-up" ? "/api/auth/sign-up" : "/api/auth/sign-in";
      const result = await callApi(endpoint, {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });

      if (result?.authenticated) {
        setMessageState(output, result?.message || "Signed in successfully. Redirecting...");
        window.setTimeout(() => window.location.assign("/dashboard"), 250);
        return;
      }

      if (authMode === "sign-up") {
        setMessageState(
          output,
          result?.message || "Account created. Check your email to confirm, then sign in.",
        );
        authMode = "sign-in";
        refreshAuthModeUi();
        return;
      }

      setMessageState(output, "Unable to start a session.");
    } catch (error) {
      setMessageState(output, error.message || "Sign in failed.");
    } finally {
      stopButtonLoading(submitButton);
    }
  }, { signal });
}

async function initializeCurrentPage() {
  const signal = resetPageEventController();
  switch (page) {
    case "dashboard":
      await initDashboard();
      break;
    case "studies":
      await initStudies(signal);
      break;
    case "workspace":
      await initWorkspace();
      break;
    case "protocol":
      await initProtocols(signal);
      break;
    case "personas":
      await initPersonas(signal);
      break;
    case "interview-guide":
      await initInterviewGuide(signal);
      break;
    case "transcripts":
      await initTranscripts(signal);
      break;
    case "simulations":
      await initSimulations(signal);
      break;
    case "comparisons":
      await initComparisons(signal);
      break;
    case "settings":
      await initSettings(signal);
      break;
    case "sign-in":
      await initSignIn(signal);
      break;
    default:
      break;
  }
}

async function refreshCurrentPage(options = {}) {
  renderHeader();
  renderWorkspaceNav();
  await initializeCurrentPage();
  installCardSpotlight();
  if (options.scrollToTop) {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }
}

async function initPage() {
  try {
    await loadAuthSession();
    if (state.auth.authenticated) {
      loadActiveStudyId();
      await loadStudies();
    } else {
      state.studies = [];
      state.activeStudyId = "";
      localStorage.removeItem(STORAGE_KEY);
    }

    if (!PUBLIC_PAGES.has(page) && !state.auth.authenticated) {
      window.location.assign("/sign-in");
      return;
    }

    window.history.replaceState({ path: `${window.location.pathname}${window.location.search}${window.location.hash}` }, "", window.location.href);
    await refreshCurrentPage();
  } catch (error) {
    console.error(error);
  } finally {
    bodyReady();
  }
}

installPageTransitions();
window.addEventListener("popstate", async () => {
  await navigateTo(`${window.location.pathname}${window.location.search}${window.location.hash}`, {
    replaceHistory: true,
    force: true,
    scrollToTop: true,
  });
});
initPage();
