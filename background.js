// Custom names are saved to disk as { [tabId]: { name, url } }, and the url is
// kept current as the tab navigates. Tab IDs change when Brave restarts, so
// the first time the extension wakes in a new browser session it re-matches
// the saved names to the restored tabs by URL. Names whose tab hasn't
// appeared yet (windows restored late) wait briefly in `pending`.

const PENDING_MS = 2 * 60 * 1000; // how long unmatched names wait after startup
const QUIT_WINDOW_MS = 15 * 1000; // window closes this close to the last one count as quitting

let state = null; // { names, pending, pendingUntil }
let loading = null;

function urlOf(tab) {
  return tab.url || tab.pendingUrl || "";
}

function load() {
  loading ??= init().catch((err) => {
    loading = null;
    throw err;
  });
  return loading;
}

async function save() {
  await chrome.storage.local.set(state);
}

async function init() {
  const saved = await chrome.storage.local.get(["names", "pending", "pendingUntil"]);
  // Session storage is wiped on browser restart (and extension reload), so a
  // missing flag means the tab IDs in `saved.names` may be stale.
  const { synced } = await chrome.storage.session.get("synced");
  if (synced) {
    state = { names: saved.names ?? {}, pending: saved.pending ?? [], pendingUntil: saved.pendingUntil ?? 0 };
    return state;
  }

  state = await rematch(saved.names ?? {});
  await save();
  await chrome.storage.session.set({ synced: true });
  for (const [tabId, entry] of Object.entries(state.names)) {
    pushToTab(Number(tabId), entry.name).catch(() => {});
  }
  return state;
}

async function rematch(saved) {
  // Tabs closed with their window are kept so quitting doesn't lose them.
  // Only keep the ones closed at quit time, not windows closed earlier on purpose.
  const entries = Object.entries(saved);
  const lastClose = Math.max(0, ...entries.map(([, e]) => e.closedAt ?? 0));
  const candidates = entries
    .filter(([, e]) => !e.closedAt || lastClose - e.closedAt < QUIT_WINDOW_MS)
    .map(([id, { name, url }]) => [id, { name, url }]);

  const tabs = await chrome.tabs.query({});
  const byId = new Map(tabs.map((t) => [t.id, t]));
  const claimed = new Set();
  const names = {};
  const leftover = [];

  // Tabs that still exist with the same ID and URL keep their name.
  for (const [id, entry] of candidates) {
    const tab = byId.get(Number(id));
    if (tab && urlOf(tab) === entry.url) {
      names[tab.id] = entry;
      claimed.add(tab.id);
    } else {
      leftover.push(entry);
    }
  }
  // The rest go to the first unclaimed tab showing the same URL, or wait.
  const pending = [];
  for (const entry of leftover) {
    const tab = tabs.find((t) => !claimed.has(t.id) && urlOf(t) === entry.url);
    if (tab) {
      names[tab.id] = entry;
      claimed.add(tab.id);
    } else {
      pending.push(entry);
    }
  }
  return { names, pending, pendingUntil: Date.now() + PENDING_MS };
}

// Give a tab a name still waiting from the last session, if its URL matches.
async function claimPending(tab) {
  await load();
  if (state.names[tab.id] || state.pending.length === 0) return null;
  if (Date.now() > state.pendingUntil) {
    state.pending = [];
    await save();
    return null;
  }
  const i = state.pending.findIndex((e) => e.url === urlOf(tab));
  if (i === -1) return null;
  const [entry] = state.pending.splice(i, 1);
  state.names[tab.id] = entry;
  await save();
  return entry.name;
}

async function getName(tab) {
  await load();
  return state.names[tab.id]?.name ?? (await claimPending(tab));
}

async function setName(tabId, name) {
  await load();
  if (name) {
    // Apply first, so pages that can't be renamed don't leave a saved name.
    await pushToTab(tabId, name);
    const tab = await chrome.tabs.get(tabId);
    state.names[tabId] = { name, url: urlOf(tab) };
    await save();
  } else {
    delete state.names[tabId];
    await save();
    await pushToTab(tabId, null).catch(() => {});
  }
}

// Tell the tab's content script the new name. Tabs that were open before the
// extension was installed (or reloaded) have no working content script, so
// inject a fresh one and try again.
async function pushToTab(tabId, name) {
  const message = { type: "apply", name };
  const res = await chrome.tabs.sendMessage(tabId, message).catch(() => null);
  if (res?.ok) return;
  await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
  const retry = await chrome.tabs.sendMessage(tabId, message);
  if (!retry?.ok) throw new Error("The page didn't respond.");
}

// Show a message in the page; silently skipped on pages that can't be scripted.
function notify(tabId, text) {
  chrome.scripting
    .executeScript({ target: { tabId }, func: (t) => alert(t), args: [text] })
    .catch(() => {});
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "get") {
    // From the content script on page load, or the popup asking about a tab.
    const lookup = msg.tabId !== undefined ? chrome.tabs.get(msg.tabId) : Promise.resolve(sender.tab);
    lookup
      .then((tab) => (tab ? getName(tab) : null))
      .then((name) => sendResponse({ name }))
      .catch(() => sendResponse({ name: null }));
    return true;
  }
  if (msg.type === "color") {
    setColor(msg.tabId, msg.color)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: String(err?.message ?? err) }));
    return true;
  }
  if (msg.type === "set") {
    setName(msg.tabId, msg.name)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: String(err?.message ?? err) }));
    return true;
  }
  return false;
});

// Tab color uses tab groups, since extensions can't paint a tab directly.
// An ungrouped tab gets its own unnamed group; a tab already in a group
// recolors that whole group. "No color" takes the tab out of its group.
// Brave restores groups itself after a restart, so nothing is stored here.
const COLORS = ["grey", "blue", "red", "yellow", "green", "pink", "purple", "cyan", "orange"];

async function setColor(tabId, color) {
  const tab = await chrome.tabs.get(tabId);
  const grouped = tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE;
  if (!color) {
    if (grouped) await chrome.tabs.ungroup(tabId);
    return;
  }
  if (!COLORS.includes(color)) throw new Error(`Unknown color: ${color}`);
  if (tab.pinned) throw new Error("Pinned tabs can't be colored. Unpin the tab first.");
  const groupId = grouped ? tab.groupId : await chrome.tabs.group({ tabIds: tabId });
  await chrome.tabGroups.update(groupId, { color });
}

// Right-click menu on any web page. Extensions can't add items to the tab
// strip's own menu, so this lives on the page's menu instead.
// After an install, update or reload (and at browser startup), re-match saved
// names right away instead of waiting for some later tab event.
chrome.runtime.onStartup.addListener(() => {
  load().catch(() => {});
});

chrome.runtime.onInstalled.addListener(async () => {
  load().catch(() => {});
  await chrome.contextMenus.removeAll();
  const contexts = ["page", "frame", "selection", "link", "image"];
  chrome.contextMenus.create({ id: "rename-tab", title: "Rename tab…", contexts });
  chrome.contextMenus.create({ id: "tab-color", title: "Tab color", contexts });
  for (const color of COLORS) {
    chrome.contextMenus.create({
      id: `color:${color}`,
      parentId: "tab-color",
      title: color[0].toUpperCase() + color.slice(1),
      contexts,
    });
  }
  chrome.contextMenus.create({ id: "color-sep", parentId: "tab-color", type: "separator", contexts });
  chrome.contextMenus.create({ id: "color:none", parentId: "tab-color", title: "No color", contexts });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;
  const id = String(info.menuItemId);
  if (id.startsWith("color:")) {
    const color = id.slice("color:".length);
    try {
      await setColor(tab.id, color === "none" ? null : color);
    } catch (err) {
      notify(tab.id, `Tabinator couldn't set the color: ${err?.message ?? err}`);
    }
    return;
  }
  if (id !== "rename-tab") return;

  let result;
  try {
    const current = (await getName(tab)) ?? tab.title ?? "";
    [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (value) => prompt("Tab name (leave empty to reset):", value),
      args: [current],
    });
  } catch {
    return; // pages extensions can't script; the menu normally doesn't show there
  }
  if (result === null) return; // cancelled
  try {
    await setName(tab.id, result.trim() || null);
  } catch (err) {
    notify(tab.id, `Tabinator couldn't rename this tab: ${err?.message ?? err}`);
  }
});

chrome.tabs.onCreated.addListener((tab) => {
  claimPending(tab).catch(() => {});
});

// Keep the saved URL current so the name can be matched after a restart.
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (!changeInfo.url) return;
  await load();
  const entry = state.names[tabId];
  if (!entry) {
    const name = await claimPending(tab);
    if (name) pushToTab(tabId, name).catch(() => {});
  } else if (entry.url !== changeInfo.url) {
    entry.url = changeInfo.url;
    await save();
  }
});

chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
  await load();
  const entry = state.names[tabId];
  if (!entry) return;
  if (removeInfo.isWindowClosing) {
    // Might be quitting Brave; keep it, and let the next startup decide.
    entry.closedAt = Date.now();
  } else {
    delete state.names[tabId];
  }
  await save();
});
