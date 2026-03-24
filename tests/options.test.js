import { beforeEach, describe, expect, it, vi } from "vitest";
import { createBrowserContext, loadScript } from "./helpers/browser-context.js";

const optionsHtml = `
<!doctype html>
<html lang="en">
  <body>
    <form id="template-form">
      <input id="template-name" name="name" type="text" />
      <textarea id="template-text" name="text"></textarea>
      <button id="form-submit-button" type="submit">Add template</button>
      <button id="form-cancel-button" type="button" hidden>Cancel edit</button>
    </form>
    <button id="export-templates-button" type="button">Export templates</button>
    <button id="import-templates-button" type="button">Import templates</button>
    <input id="import-templates-input" type="file" />
    <p class="template-order-help">Drag templates to change the order shown in the context menu.</p>
    <p id="status"></p>
    <ul id="template-list"></ul>
  </body>
</html>
`;

async function flushTasks() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("options.js", () => {
  let chrome;
  let context;
  let messages;
  let storedTemplates;
  let createObjectURL;
  let revokeObjectURL;

  beforeEach(async () => {
    storedTemplates = [{ id: "welcome", name: "Welcome", text: "Hello there" }];
    messages = {
      optionsPageTitle: "Message Templates Settings",
      optionsHeading: "Message Templates",
      optionsDescription: "Configure the templates shown in the context menu.",
      templateNameLabel: "Name",
      templateTextLabel: "Text",
      addTemplateButton: "Add template",
      saveChangesButton: "Save changes",
      cancelEditButton: "Cancel edit",
      exportTemplatesButton: "Export templates",
      importTemplatesButton: "Import templates",
      templateOrderHelp: "Drag templates to change the order shown in the context menu.",
      templateReorderHandleLabel: "Drag to reorder template: $1$",
      editButton: "Edit",
      deleteButton: "Delete",
      statusTemplateDeleted: "Template deleted.",
      statusEditingTemplate: "Editing template: $1$",
      statusEditCancelled: "Edit cancelled.",
      statusTemplateValidationError: "Please provide both name and text.",
      statusTemplateMissing: "Template no longer exists.",
      statusTemplateUpdated: "Template updated.",
      statusTemplateAdded: "Template added.",
      statusTemplateReordered: "Template order updated for $1$.",
      statusTemplatesExported: "Exported $1$ templates.",
      statusTemplatesImported: "Imported $1$ templates.",
      statusTemplateImportFailed: "The selected file is not a valid template export."
    };

    createObjectURL = vi.fn(() => "blob:export-url");
    revokeObjectURL = vi.fn();

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
          get: vi.fn(async () => ({ "message-templates": storedTemplates })),
          set: vi.fn(async ({ "message-templates": templates }) => {
            storedTemplates = templates;
          })
        }
      }
    };

    ({ context } = createBrowserContext({
      html: optionsHtml,
      globals: {
        chrome,
        URL: {
          createObjectURL,
          revokeObjectURL
        }
      }
    }));

    context.crypto.randomUUID = vi.fn(() => "generated-id");
    context.HTMLAnchorElement.prototype.click = vi.fn();
    loadScript(context, "template-store.js");
    loadScript(context, "options.js");
    await flushTasks();
  });

  it("renders the stored templates on load", () => {
    const items = [...context.document.querySelectorAll("#template-list li")];

    expect(items).toHaveLength(1);
    expect(context.document.title).toBe("Message Templates Settings");
    expect(items[0].querySelector("strong")?.textContent).toBe("Welcome");
    expect(items[0].querySelector(".template-text")?.textContent).toBe("Hello there");
    expect(items[0].querySelector(".drag-handle")?.getAttribute("aria-label")).toBe(
      "Drag to reorder template: Welcome"
    );
    expect(context.document.querySelector("button.edit")?.textContent).toBe("Edit");
    expect(context.document.querySelector("button.delete")?.textContent).toBe("Delete");
  });

  it("reorders templates via drag and drop and persists the new order", async () => {
    storedTemplates = [
      { id: "welcome", name: "Welcome", text: "Hello there" },
      { id: "follow-up", name: "Follow up", text: "Just checking in" }
    ];

    await context.renderTemplates();

    const handles = [...context.document.querySelectorAll(".drag-handle")];
    const items = [...context.document.querySelectorAll("#template-list li")];
    const dragData = {
      effectAllowed: "",
      dropEffect: "",
      setData: vi.fn()
    };

    const dragStartEvent = new context.Event("dragstart", { bubbles: true });
    Object.defineProperty(dragStartEvent, "dataTransfer", {
      configurable: true,
      value: dragData
    });
    handles[1].dispatchEvent(dragStartEvent);

    const dragOverEvent = new context.Event("dragover", { bubbles: true, cancelable: true });
    Object.defineProperty(dragOverEvent, "dataTransfer", {
      configurable: true,
      value: dragData
    });
    items[0].dispatchEvent(dragOverEvent);

    const dropEvent = new context.Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(dropEvent, "dataTransfer", {
      configurable: true,
      value: dragData
    });
    items[0].dispatchEvent(dropEvent);
    await flushTasks();

    expect(chrome.storage.sync.set).toHaveBeenCalledWith({
      "message-templates": [
        { id: "follow-up", name: "Follow up", text: "Just checking in" },
        { id: "welcome", name: "Welcome", text: "Hello there" }
      ]
    });
    expect(
      [...context.document.querySelectorAll("#template-list strong")].map((element) => element.textContent)
    ).toEqual(["Follow up", "Welcome"]);
    expect(context.document.getElementById("status").textContent).toBe(
      "Template order updated for Follow up."
    );
  });

  it("exports the current templates as a JSON download", async () => {
    context.document.getElementById("export-templates-button").click();
    await flushTasks();

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const exportedBlob = createObjectURL.mock.calls[0][0];
    const exportedPayload = JSON.parse(await exportedBlob.text());

    expect(exportedPayload.schemaVersion).toBe(1);
    expect(exportedPayload.templates).toEqual([
      { id: "welcome", name: "Welcome", text: "Hello there" }
    ]);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:export-url");
    expect(context.document.getElementById("status").textContent).toBe("Exported 1 templates.");
  });

  it("imports templates from a valid export file and replaces existing templates", async () => {
    const importInput = context.document.getElementById("import-templates-input");
    Object.defineProperty(importInput, "files", {
      configurable: true,
      value: [
        {
          text: vi.fn(async () =>
            JSON.stringify({
              schemaVersion: 1,
              templates: [{ id: "follow-up", name: "Follow up", text: "Just checking in" }]
            })
          )
        }
      ]
    });

    importInput.dispatchEvent(new context.Event("change", { bubbles: true }));
    await flushTasks();

    expect(chrome.storage.sync.set).toHaveBeenCalledWith({
      "message-templates": [{ id: "follow-up", name: "Follow up", text: "Just checking in" }]
    });
    expect(context.document.querySelectorAll("#template-list li")).toHaveLength(1);
    expect(context.document.querySelector("#template-list strong")?.textContent).toBe("Follow up");
    expect(context.document.getElementById("status").textContent).toBe("Imported 1 templates.");
  });

  it("shows an error when importing an invalid export file", async () => {
    const importInput = context.document.getElementById("import-templates-input");
    Object.defineProperty(importInput, "files", {
      configurable: true,
      value: [
        {
          text: vi.fn(async () => JSON.stringify({ schemaVersion: 1, templates: [{ id: "", name: "", text: "" }] }))
        }
      ]
    });

    importInput.dispatchEvent(new context.Event("change", { bubbles: true }));
    await flushTasks();

    expect(chrome.storage.sync.set).not.toHaveBeenCalledWith({
      "message-templates": []
    });
    expect(context.document.getElementById("status").textContent).toBe(
      "The selected file is not a valid template export."
    );
  });

  it("enters edit mode and populates the form when edit is clicked", () => {
    const editButton = context.document.querySelector("button.edit");
    editButton.click();

    expect(context.document.getElementById("template-name").value).toBe("Welcome");
    expect(context.document.getElementById("template-text").value).toBe("Hello there");
    expect(context.document.getElementById("form-submit-button").textContent).toBe("Save changes");
    expect(context.document.getElementById("form-cancel-button").hidden).toBe(false);
    expect(context.document.getElementById("status").textContent).toBe("Editing template: Welcome");
  });

  it("shows a validation message when the submitted template is invalid", async () => {
    context.document.getElementById("template-name").value = "  ";
    context.document.getElementById("template-text").value = "";

    context.document
      .getElementById("template-form")
      .dispatchEvent(new context.Event("submit", { bubbles: true, cancelable: true }));

    await flushTasks();

    expect(context.document.getElementById("status").textContent).toBe(
      "Please provide both name and text."
    );
    expect(chrome.storage.sync.set).not.toHaveBeenCalled();
  });

  it("adds a new template, saves it, and resets the form", async () => {
    context.document.getElementById("template-name").value = "Follow up";
    context.document.getElementById("template-text").value = "Just checking in";

    context.document
      .getElementById("template-form")
      .dispatchEvent(new context.Event("submit", { bubbles: true, cancelable: true }));

    await flushTasks();

    expect(chrome.storage.sync.set).toHaveBeenCalledWith({
      "message-templates": [
        { id: "welcome", name: "Welcome", text: "Hello there" },
        { id: "generated-id", name: "Follow up", text: "Just checking in" }
      ]
    });
    expect(context.document.getElementById("template-name").value).toBe("");
    expect(context.document.getElementById("template-text").value).toBe("");
    expect(context.document.getElementById("form-submit-button").textContent).toBe("Add template");
    expect(context.document.getElementById("status").textContent).toBe("Template added.");
  });

  it("updates an existing template when submitting from edit mode", async () => {
    context.document.querySelector("button.edit").click();
    context.document.getElementById("template-name").value = "Welcome again";

    context.document
      .getElementById("template-form")
      .dispatchEvent(new context.Event("submit", { bubbles: true, cancelable: true }));

    await flushTasks();

    expect(chrome.storage.sync.set).toHaveBeenCalledWith({
      "message-templates": [{ id: "welcome", name: "Welcome again", text: "Hello there" }]
    });
    expect(context.document.getElementById("status").textContent).toBe("Template updated.");
    expect(context.document.getElementById("form-cancel-button").hidden).toBe(true);
  });

  it("handles a missing template during edit submission", async () => {
    context.document.querySelector("button.edit").click();
    storedTemplates = [];

    context.document
      .getElementById("template-form")
      .dispatchEvent(new context.Event("submit", { bubbles: true, cancelable: true }));

    await flushTasks();

    expect(context.document.getElementById("status").textContent).toBe("Template no longer exists.");
    expect(chrome.storage.sync.set).not.toHaveBeenCalled();
  });

  it("deletes a template and resets the form if that template is being edited", async () => {
    context.document.querySelector("button.edit").click();
    context.document.querySelector("button.delete").click();

    await flushTasks();

    expect(chrome.storage.sync.set).toHaveBeenCalledWith({
      "message-templates": []
    });
    expect(context.document.getElementById("template-name").value).toBe("");
    expect(context.document.getElementById("template-text").value).toBe("");
    expect(context.document.getElementById("status").textContent).toBe("Template deleted.");
  });
});
