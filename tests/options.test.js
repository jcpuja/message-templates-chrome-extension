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
  let storedTemplates;

  beforeEach(async () => {
    storedTemplates = [{ id: "welcome", name: "Welcome", text: "Hello there" }];

    chrome = {
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
        chrome
      }
    }));

    context.crypto.randomUUID = vi.fn(() => "generated-id");
    loadScript(context, "template-store.js");
    loadScript(context, "options.js");
    await flushTasks();
  });

  it("renders the stored templates on load", () => {
    const items = [...context.document.querySelectorAll("#template-list li")];

    expect(items).toHaveLength(1);
    expect(items[0].querySelector("strong")?.textContent).toBe("Welcome");
    expect(items[0].querySelector(".template-text")?.textContent).toBe("Hello there");
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
