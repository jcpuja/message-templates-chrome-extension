const ROOT_MENU_ID = "message-templates-root";
const STORAGE_KEY = "message-templates";

const DEFAULT_TEMPLATES = [];

function sanitizeTemplate(template) {
  if (!template || typeof template !== "object") {
    return null;
  }

  const name = typeof template.name === "string" ? template.name.trim() : "";
  const text = typeof template.text === "string" ? template.text : "";

  if (!name || !text) {
    return null;
  }

  return { name, text };
}

function buildMenuId(index) {
  return `template-${index}`;
}

async function getTemplates() {
  const result = await chrome.storage.sync.get([STORAGE_KEY]);
  const rawTemplates = result[STORAGE_KEY];

  if (!Array.isArray(rawTemplates) || rawTemplates.length === 0) {
    return DEFAULT_TEMPLATES;
  }

  const templates = rawTemplates.map(sanitizeTemplate).filter(Boolean);
  return templates.length > 0 ? templates : DEFAULT_TEMPLATES;
}

async function createContextMenus() {
  const templates = await getTemplates();

  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: ROOT_MENU_ID,
      title: "Insert message template",
      contexts: ["editable"]
    });

    templates.forEach((template, index) => {
      chrome.contextMenus.create({
        id: buildMenuId(index),
        parentId: ROOT_MENU_ID,
        title: template.name,
        contexts: ["editable"]
      });
    });
  });
}

function insertTemplateText(text) {
  const activeElement = document.activeElement;
  if (!activeElement) {
    return;
  }

  const textSelectableInputTypes = new Set(["text", "search", "url", "tel", "password"]);
  const isTextInput =
    (activeElement instanceof HTMLInputElement &&
      textSelectableInputTypes.has(activeElement.type.toLowerCase())) ||
    activeElement instanceof HTMLTextAreaElement;
  const isContentEditable = activeElement.isContentEditable;

  if (isTextInput) {
    const start = activeElement.selectionStart ?? activeElement.value.length;
    const end = activeElement.selectionEnd ?? activeElement.value.length;
    const value = activeElement.value;

    activeElement.value = value.slice(0, start) + text + value.slice(end);

    const cursor = start + text.length;
    activeElement.selectionStart = cursor;
    activeElement.selectionEnd = cursor;
    activeElement.dispatchEvent(new Event("input", { bubbles: true }));
    activeElement.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }

  if (isContentEditable) {
    document.execCommand("insertText", false, text);
  }
}

async function ensureDefaultTemplates() {
  const result = await chrome.storage.sync.get([STORAGE_KEY]);
  const hasTemplates = Array.isArray(result[STORAGE_KEY]) && result[STORAGE_KEY].length > 0;

  if (!hasTemplates) {
    await chrome.storage.sync.set({ [STORAGE_KEY]: DEFAULT_TEMPLATES });
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  await ensureDefaultTemplates();
  await createContextMenus();
});

chrome.runtime.onStartup.addListener(() => {
  createContextMenus();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "sync" && changes[STORAGE_KEY]) {
    createContextMenus();
  }
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id || typeof info.menuItemId !== "string") {
    return;
  }

  const menuIdMatch = info.menuItemId.match(/^template-(\d+)$/);
  if (!menuIdMatch) {
    return;
  }

  const templateIndex = Number.parseInt(menuIdMatch[1], 10);
  const templates = await getTemplates();
  const selectedTemplate = templates[templateIndex];

  if (!selectedTemplate) {
    return;
  }

  chrome.scripting.executeScript({
    target: {
      tabId: tab.id,
      frameIds: typeof info.frameId === "number" ? [info.frameId] : undefined
    },
    func: insertTemplateText,
    args: [selectedTemplate.text]
  });
});
