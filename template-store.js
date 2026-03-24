const STORAGE_KEY = "message-templates";
const EXPORT_SCHEMA_VERSION = 1;

function generateTemplateId() {
  return crypto.randomUUID();
}

function createDefaultTemplates() {
  return [
    {
      id: generateTemplateId(),
      name: "Example template",
      text: "A simple example text template"
    }
  ];
}

function sanitizeTemplate(template) {
  if (!template || typeof template !== "object") {
    return null;
  }

  const id = typeof template.id === "string" ? template.id.trim() : "";
  const name = typeof template.name === "string" ? template.name.trim() : "";
  const text = typeof template.text === "string" ? template.text : "";

  if (!id || !name || !text) {
    return null;
  }

  return { id, name, text };
}

function normalizeTemplates(templates) {
  if (!Array.isArray(templates)) {
    return [];
  }

  return templates.map(sanitizeTemplate).filter(Boolean);
}

function dedupeTemplatesById(templates) {
  const seenTemplateIds = new Set();

  return templates.filter((template) => {
    if (seenTemplateIds.has(template.id)) {
      return false;
    }

    seenTemplateIds.add(template.id);
    return true;
  });
}

function buildTemplateExportPayload(templates) {
  return {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    templates: dedupeTemplatesById(normalizeTemplates(templates))
  };
}

function parseImportedTemplates(rawText) {
  let parsedPayload;

  try {
    parsedPayload = JSON.parse(rawText);
  } catch (error) {
    throw new Error("invalid-json");
  }

  if (!parsedPayload || typeof parsedPayload !== "object") {
    throw new Error("invalid-format");
  }

  if (parsedPayload.schemaVersion !== EXPORT_SCHEMA_VERSION) {
    throw new Error("unsupported-version");
  }

  if (!Array.isArray(parsedPayload.templates)) {
    throw new Error("invalid-format");
  }

  const normalizedTemplates = normalizeTemplates(parsedPayload.templates);

  if (
    parsedPayload.templates.length > 0 &&
    normalizedTemplates.length !== parsedPayload.templates.length
  ) {
    throw new Error("invalid-template");
  }

  return dedupeTemplatesById(normalizedTemplates);
}

async function getStoredTemplates() {
  const result = await chrome.storage.sync.get([STORAGE_KEY]);
  return normalizeTemplates(result[STORAGE_KEY]);
}

async function getTemplatesWithDefaults() {
  const templates = await getStoredTemplates();
  return templates.length > 0 ? templates : createDefaultTemplates();
}

async function saveTemplates(templates) {
  await chrome.storage.sync.set({ [STORAGE_KEY]: normalizeTemplates(templates) });
}

async function ensureDefaultTemplates() {
  const templates = await getStoredTemplates();

  if (templates.length === 0) {
    await saveTemplates(createDefaultTemplates());
  }
}
