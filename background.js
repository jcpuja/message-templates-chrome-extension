const TEMPLATES = [
  {
    id: "template-lorem-1",
    title: "Lorem Greeting",
    text: "Lorem ipsum dolor sit amet, consectetur adipiscing elit."
  },
  {
    id: "template-lorem-2",
    title: "Lorem Follow-up",
    text: "Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua."
  }
];

const ROOT_MENU_ID = "message-templates-root";

function createContextMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: ROOT_MENU_ID,
      title: "Insert message template",
      contexts: ["editable"]
    });

    for (const template of TEMPLATES) {
      chrome.contextMenus.create({
        id: template.id,
        parentId: ROOT_MENU_ID,
        title: template.title,
        contexts: ["editable"]
      });
    }
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

chrome.runtime.onInstalled.addListener(() => {
  createContextMenus();
});

chrome.runtime.onStartup.addListener(() => {
  createContextMenus();
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const selectedTemplate = TEMPLATES.find((template) => template.id === info.menuItemId);
  if (!selectedTemplate || !tab?.id) {
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
