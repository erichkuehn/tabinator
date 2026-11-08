// Holds the tab's custom name and keeps re-applying it, because many sites
// (Gmail, Slack, Jira...) rewrite document.title constantly.
(() => {
  // A copy left over from before an extension reload can't reach the
  // extension any more. Stop it and take over the page title it remembered.
  const previous = window.__tabinatorStop?.();

  let customName = null;
  let pageTitle = previous?.pageTitle ?? null; // the title the page itself most recently wanted
  let observer = null;

  function connected() {
    try {
      return Boolean(chrome.runtime?.id);
    } catch {
      return false;
    }
  }

  function stop() {
    observer?.disconnect();
    observer = null;
    customName = null;
    try {
      chrome.runtime.onMessage.removeListener(onMessage);
    } catch {}
    return { pageTitle };
  }
  window.__tabinatorStop = stop;

  function apply() {
    if (!connected()) {
      stop();
      return;
    }
    if (customName === null || document.title === customName) return;
    pageTitle = document.title;
    document.title = customName;
  }

  function watch() {
    if (observer || !document.head) return;
    observer = new MutationObserver(apply);
    // Watching <head> catches both text changes and the <title> being replaced.
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
  }

  function setName(name) {
    if (name) {
      customName = name;
      apply();
      watch();
    } else {
      customName = null;
      observer?.disconnect();
      observer = null;
      if (pageTitle !== null) document.title = pageTitle;
    }
  }

  function onMessage(msg, _sender, sendResponse) {
    if (msg.type !== "apply") return false;
    setName(msg.name);
    sendResponse({ ok: true });
    return false;
  }
  chrome.runtime.onMessage.addListener(onMessage);

  // At document_start <head> may not exist yet; retry once the DOM is parsed.
  document.addEventListener("DOMContentLoaded", () => {
    if (customName !== null) {
      apply();
      watch();
    }
  });

  chrome.runtime.sendMessage({ type: "get" }).then((res) => {
    if (res?.name && customName === null) setName(res.name);
  }).catch(() => {});
})();
