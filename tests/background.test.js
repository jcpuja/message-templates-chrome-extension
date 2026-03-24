import { beforeEach, describe, expect, it, vi } from "vitest";
import { createBrowserContext, loadScript } from "./helpers/browser-context.js";

async function flushTasks() {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("background.js", () => {
  let chrome;
  let context;
  let messages;
  let onInstalledListener;
  let onStartupListener;
  let onStorageChangedListener;
  let onContextMenuClickedListener;

  beforeEach(() => {
    messages = {
      contextMenuRootTitle: "Insert message template"
    };

    chrome = {
      i18n: {
        getMessage: vi.fn((key, substitutions) => {
          const message = messages[key];
          if (!message) {
            return "";
          }

          if (substitutions === undefined) {
            return message;
          }

          const values = Array.isArray(substitutions) ? substitutions : [substitutions];
          return values.reduce(
            (currentMessage, value, index) => currentMessage.replace(`$${index + 1}$`, value),
            message
          );
        })
      },
      storage: {
        sync: {
          get: vi.fn(),
          set: vi.fn()
        },
        onChanged: {
          addListener: vi.fn((listener) => {
            onStorageChangedListener = listener;
          })
        }
      },
      contextMenus: {
        removeAll: vi.fn().mockResolvedValue(undefined),
        create: vi.fn().mockResolvedValue(undefined),
        onClicked: {
          addListener: vi.fn((listener) => {
            onContextMenuClickedListener = listener;
          })
        }
      },
      runtime: {
        onInstalled: {
          addListener: vi.fn((listener) => {
            onInstalledListener = listener;
          })
        },
        onStartup: {
          addListener: vi.fn((listener) => {
            onStartupListener = listener;
          })
        }
      },
      scripting: {
        executeScript: vi.fn()
      }
    };

    ({ context } = createBrowserContext({
      globals: {
        chrome,
        importScripts: (...paths) => {
          paths.forEach((relativePath) => loadScript(context, relativePath));
        }
      }
    }));

    context.crypto.randomUUID = vi.fn(() => "generated-id");
    loadScript(context, "background.js");
  });

  it("rebuilds the root and child context menus from stored templates", async () => {
    chrome.storage.sync.get.mockResolvedValue({
      "message-templates": [{ id: "welcome", name: "Welcome", text: "Hello there" }]
    });

    await context.rebuildContextMenus();

    expect(chrome.contextMenus.removeAll).toHaveBeenCalledTimes(1);
    expect(chrome.contextMenus.create).toHaveBeenNthCalledWith(1, {
      id: "message-templates-root",
      title: "Insert message template",
      contexts: ["editable"]
    });
    expect(chrome.contextMenus.create).toHaveBeenNthCalledWith(2, {
      id: "template-welcome",
      parentId: "message-templates-root",
      title: "Welcome",
      contexts: ["editable"]
    });
  });

  it("injects the selected template into the clicked tab and frame", async () => {
    chrome.storage.sync.get.mockResolvedValue({
      "message-templates": [{ id: "welcome", name: "Welcome", text: "Hello there" }]
    });

    await onContextMenuClickedListener(
      { menuItemId: "template-welcome", frameId: 5 },
      { id: 17 }
    );

    expect(chrome.scripting.executeScript).toHaveBeenCalledWith({
      target: { tabId: 17, frameIds: [5] },
      func: context.insertTemplateText,
      args: ["Hello there"]
    });
  });

  it("ignores unrelated menu clicks", async () => {
    chrome.storage.sync.get.mockResolvedValue({
      "message-templates": [{ id: "welcome", name: "Welcome", text: "Hello there" }]
    });

    await onContextMenuClickedListener({ menuItemId: "message-templates-root" }, { id: 17 });

    expect(chrome.scripting.executeScript).not.toHaveBeenCalled();
  });

  it("refreshes menus only for sync storage changes on the templates key", async () => {
    chrome.storage.sync.get.mockResolvedValue({
      "message-templates": [{ id: "welcome", name: "Welcome", text: "Hello there" }]
    });

    onStorageChangedListener({}, "local");
    await flushTasks();
    expect(chrome.contextMenus.removeAll).not.toHaveBeenCalled();

    onStorageChangedListener({ other: { newValue: [] } }, "sync");
    await flushTasks();
    expect(chrome.contextMenus.removeAll).not.toHaveBeenCalled();

    onStorageChangedListener({ "message-templates": { newValue: [] } }, "sync");
    await flushTasks();
    expect(chrome.contextMenus.removeAll).toHaveBeenCalledTimes(1);
  });

  it("inserts text into text inputs and dispatches input/change events", () => {
    const input = context.document.createElement("input");
    input.type = "text";
    input.value = "Hello world";
    context.document.body.append(input);
    input.focus();
    input.selectionStart = 6;
    input.selectionEnd = 11;

    const inputEvent = vi.fn();
    const changeEvent = vi.fn();
    input.addEventListener("input", inputEvent);
    input.addEventListener("change", changeEvent);

    context.insertTemplateText("friend");

    expect(input.value).toBe("Hello friend");
    expect(input.selectionStart).toBe(12);
    expect(input.selectionEnd).toBe(12);
    expect(inputEvent).toHaveBeenCalledTimes(1);
    expect(changeEvent).toHaveBeenCalledTimes(1);
  });

  it("uses execCommand for contenteditable elements", () => {
    const editable = context.document.createElement("div");
    context.document.body.append(editable);
    Object.defineProperty(editable, "isContentEditable", {
      configurable: true,
      get: () => true
    });
    Object.defineProperty(context.document, "activeElement", {
      configurable: true,
      get: () => editable
    });

    context.document.execCommand = vi.fn();

    context.insertTemplateText("Inserted");

    expect(context.document.execCommand).toHaveBeenCalledWith("insertText", false, "Inserted");
  });

  it("registers startup and install listeners", () => {
    expect(onInstalledListener).toBeTypeOf("function");
    expect(onStartupListener).toBeTypeOf("function");
  });
});
