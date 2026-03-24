const STORAGE_KEY = "message-templates";

const DEFAULT_TEMPLATES = [
  {
    name: "Example template",
    text: "A simple example text template"
  }
];

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

function normalizeTemplates(templates) {
  if (!Array.isArray(templates)) {
    return [];
  }

  return templates.map(sanitizeTemplate).filter(Boolean);
}

async function getStoredTemplates() {
  const result = await chrome.storage.sync.get([STORAGE_KEY]);
  return normalizeTemplates(result[STORAGE_KEY]);
}

async function getTemplatesWithDefaults() {
  const templates = await getStoredTemplates();
  return templates.length > 0 ? templates : DEFAULT_TEMPLATES;
}

async function saveTemplates(templates) {
  await chrome.storage.sync.set({ [STORAGE_KEY]: normalizeTemplates(templates) });
}

async function ensureDefaultTemplates() {
  const templates = await getStoredTemplates();

  if (templates.length === 0) {
    await saveTemplates(DEFAULT_TEMPLATES);
  }
}
