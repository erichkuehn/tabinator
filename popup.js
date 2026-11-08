const input = document.getElementById("name");
const errorEl = document.getElementById("error");
const statusEl = document.getElementById("status");
const swatchesEl = document.getElementById("swatches");

// Approximate display colors for Brave's tab group palette.
const COLORS = {
  grey: "#5f6368",
  blue: "#1a73e8",
  red: "#d93025",
  yellow: "#f9ab00",
  green: "#1e8e3e",
  pink: "#d01884",
  purple: "#a142f4",
  cyan: "#007b83",
  orange: "#fa903e",
};

let tab;
let currentName = null;

function showError(text) {
  errorEl.textContent = text;
  errorEl.hidden = false;
}

async function save(name) {
  if (!tab) return;
  // Enter on an untouched box shouldn't freeze the page's current title.
  if (!currentName && name === tab.title) {
    window.close();
    return;
  }
  const res = await chrome.runtime.sendMessage({ type: "set", tabId: tab.id, name });
  if (res?.ok) {
    window.close();
  } else if (/^(chrome|brave|edge|about|chrome-extension):|chromewebstore\.google\.com/.test(tab.url ?? "")) {
    showError("Browser pages (brave://, the Web Store, etc.) can't be renamed by extensions.");
  } else {
    showError(`Couldn't rename this tab: ${res?.error ?? "unknown error"}. Try reloading the page.`);
  }
}

function renderSwatches(current) {
  swatchesEl.replaceChildren();
  const options = [...Object.entries(COLORS), ["none", null]];
  for (const [color, hex] of options) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = hex ? "swatch" : "swatch none";
    if (hex) btn.style.background = hex;
    btn.title = hex ? color[0].toUpperCase() + color.slice(1) : "No color";
    btn.setAttribute("aria-pressed", String((current ?? "none") === color));
    btn.addEventListener("click", () => pickColor(hex ? color : null));
    swatchesEl.append(btn);
  }
}

async function pickColor(color) {
  if (!tab) return;
  const res = await chrome.runtime.sendMessage({ type: "color", tabId: tab.id, color });
  if (res?.ok) {
    renderSwatches(color);
  } else {
    showError(`Couldn't set the color: ${res?.error ?? "unknown error"}`);
  }
}

async function currentColor() {
  if (tab.groupId === chrome.tabGroups.TAB_GROUP_ID_NONE) return null;
  const group = await chrome.tabGroups.get(tab.groupId).catch(() => null);
  return group?.color ?? null;
}

async function init() {
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) {
    showError("No tab found in this window.");
    return;
  }
  const res = await chrome.runtime.sendMessage({ type: "get", tabId: tab.id }).catch(() => null);
  currentName = res?.name ?? null;
  input.value = currentName ?? tab.title ?? "";
  if (currentName) statusEl.textContent = "Custom name active";
  input.select();
  renderSwatches(await currentColor());
}

document.getElementById("form").addEventListener("submit", (e) => {
  e.preventDefault();
  save(input.value.trim() || null);
});

document.getElementById("reset").addEventListener("click", () => save(null));

init();
