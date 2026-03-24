import { beforeEach, describe, expect, it, vi } from "vitest";
import { createBrowserContext, loadScript } from "./helpers/browser-context.js";

describe("template-store.js", () => {
  let chrome;
  let context;

  beforeEach(() => {
    chrome = {
      storage: {
        sync: {
          get: vi.fn(),
          set: vi.fn()
        }
      }
    };

    ({ context } = createBrowserContext({
      globals: {
        chrome
      }
    }));

    context.crypto.randomUUID = vi.fn(() => "generated-id");
    loadScript(context, "template-store.js");
  });

  it("sanitizes valid templates by trimming id and name while preserving text", () => {
    const sanitized = context.sanitizeTemplate({
      id: "  template-1  ",
      name: "  Follow up  ",
      text: "  keep spacing  "
    });

    expect(sanitized).toEqual({
      id: "template-1",
      name: "Follow up",
      text: "  keep spacing  "
    });
  });

  it("rejects invalid templates and filters them out during normalization", () => {
    expect(context.sanitizeTemplate(null)).toBeNull();
    expect(
      context.sanitizeTemplate({
        id: "template-1",
        name: "Valid name",
        text: ""
      })
    ).toBeNull();

    const normalized = context.normalizeTemplates([
      { id: "one", name: "First", text: "Body" },
      { id: "", name: "Missing id", text: "Body" },
      { id: "two", name: "  ", text: "Body" }
    ]);

    expect(normalized).toEqual([{ id: "one", name: "First", text: "Body" }]);
  });

  it("returns stored templates when present and falls back to defaults when empty", async () => {
    chrome.storage.sync.get.mockResolvedValueOnce({
      "message-templates": [{ id: "saved", name: "Saved", text: "Stored text" }]
    });

    await expect(context.getTemplatesWithDefaults()).resolves.toEqual([
      { id: "saved", name: "Saved", text: "Stored text" }
    ]);

    chrome.storage.sync.get.mockResolvedValueOnce({ "message-templates": [] });

    await expect(context.getTemplatesWithDefaults()).resolves.toEqual([
      {
        id: "generated-id",
        name: "Example template",
        text: "A simple example text template"
      }
    ]);
  });

  it("normalizes templates before saving", async () => {
    await context.saveTemplates([
      { id: " one ", name: " First ", text: "Hello" },
      { id: "bad", name: "", text: "Ignored" }
    ]);

    expect(chrome.storage.sync.set).toHaveBeenCalledWith({
      "message-templates": [{ id: "one", name: "First", text: "Hello" }]
    });
  });

  it("builds an export payload with a schema version and normalized templates", () => {
    const payload = context.buildTemplateExportPayload([
      { id: " one ", name: " First ", text: "Hello" },
      { id: "two", name: "Second", text: "World" }
    ]);

    expect(payload.schemaVersion).toBe(1);
    expect(payload.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(payload.templates).toEqual([
      { id: "one", name: "First", text: "Hello" },
      { id: "two", name: "Second", text: "World" }
    ]);
  });

  it("parses a valid export payload and rejects invalid imports", () => {
    expect(
      context.parseImportedTemplates(
        JSON.stringify({
          schemaVersion: 1,
          templates: [{ id: " one ", name: " First ", text: "Hello" }]
        })
      )
    ).toEqual([{ id: "one", name: "First", text: "Hello" }]);

    expect(() => context.parseImportedTemplates("{")).toThrow("invalid-json");
    expect(() =>
      context.parseImportedTemplates(
        JSON.stringify({
          schemaVersion: 2,
          templates: []
        })
      )
    ).toThrow("unsupported-version");
    expect(() =>
      context.parseImportedTemplates(
        JSON.stringify({
          schemaVersion: 1,
          templates: [{ id: "missing-name", name: "", text: "Hello" }]
        })
      )
    ).toThrow("invalid-template");
  });

  it("writes default templates only when storage is empty", async () => {
    chrome.storage.sync.get.mockResolvedValueOnce({ "message-templates": [] });

    await context.ensureDefaultTemplates();

    expect(chrome.storage.sync.set).toHaveBeenCalledWith({
      "message-templates": [
        {
          id: "generated-id",
          name: "Example template",
          text: "A simple example text template"
        }
      ]
    });

    chrome.storage.sync.set.mockClear();
    chrome.storage.sync.get.mockResolvedValueOnce({
      "message-templates": [{ id: "saved", name: "Saved", text: "Stored text" }]
    });

    await context.ensureDefaultTemplates();

    expect(chrome.storage.sync.set).not.toHaveBeenCalled();
  });
});
