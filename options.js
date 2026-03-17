const STORAGE_KEY = "message-templates";

const templateForm = document.getElementById("template-form");
const templateNameInput = document.getElementById("template-name");
const templateTextInput = document.getElementById("template-text");
const templateList = document.getElementById("template-list");
const statusElement = document.getElementById("status");

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

async function getTemplates() {
  const result = await chrome.storage.sync.get([STORAGE_KEY]);
  const templates = Array.isArray(result[STORAGE_KEY]) ? result[STORAGE_KEY] : [];
  return templates.map(sanitizeTemplate).filter(Boolean);
}

async function saveTemplates(templates) {
  await chrome.storage.sync.set({ [STORAGE_KEY]: templates });
}

function setStatus(message) {
  statusElement.textContent = message;
}

function createDeleteButton(index) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "delete";
  button.textContent = "Delete";
  button.addEventListener("click", async () => {
    const templates = await getTemplates();
    templates.splice(index, 1);
    await saveTemplates(templates);
    await renderTemplates();
    setStatus("Template deleted.");
  });

  return button;
}

function createTemplateItem(template, index) {
  const item = document.createElement("li");

  const header = document.createElement("div");
  header.className = "template-header";

  const title = document.createElement("strong");
  title.textContent = template.name;

  const removeButton = createDeleteButton(index);

  header.append(title, removeButton);

  const text = document.createElement("p");
  text.className = "template-text";
  text.textContent = template.text;

  item.append(header, text);
  return item;
}

async function renderTemplates() {
  const templates = await getTemplates();
  templateList.replaceChildren();

  templates.forEach((template, index) => {
    templateList.append(createTemplateItem(template, index));
  });
}

templateForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const template = sanitizeTemplate({
    name: templateNameInput.value,
    text: templateTextInput.value
  });

  if (!template) {
    setStatus("Please provide both name and text.");
    return;
  }

  const templates = await getTemplates();
  templates.push(template);
  await saveTemplates(templates);

  templateForm.reset();
  await renderTemplates();
  setStatus("Template added.");
});

renderTemplates();
