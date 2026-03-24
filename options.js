const templateForm = document.getElementById("template-form");
const templateNameInput = document.getElementById("template-name");
const templateTextInput = document.getElementById("template-text");
const formSubmitButton = document.getElementById("form-submit-button");
const formCancelButton = document.getElementById("form-cancel-button");
const exportTemplatesButton = document.getElementById("export-templates-button");
const importTemplatesButton = document.getElementById("import-templates-button");
const importTemplatesInput = document.getElementById("import-templates-input");
const templateList = document.getElementById("template-list");
const statusElement = document.getElementById("status");

let editingTemplateId = null;

function getMessage(key, substitutions) {
  return chrome.i18n.getMessage(key, substitutions) || key;
}

function localizePage() {
  document.title = getMessage("optionsPageTitle");

  document.querySelectorAll("[data-i18n]").forEach((element) => {
    const key = element.dataset.i18n;
    if (!key) {
      return;
    }

    element.textContent = getMessage(key);
  });
}

function setStatus(message) {
  statusElement.textContent = message;
}

function setFormMode(isEditing) {
  formSubmitButton.textContent = isEditing
    ? getMessage("saveChangesButton")
    : getMessage("addTemplateButton");
  formCancelButton.hidden = !isEditing;
}

function resetForm() {
  editingTemplateId = null;
  templateForm.reset();
  setFormMode(false);
}

function createDeleteButton(templateId) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "delete";
  button.textContent = getMessage("deleteButton");
  button.addEventListener("click", async () => {
    const templates = await getStoredTemplates();
    const nextTemplates = templates.filter((template) => template.id !== templateId);

    if (nextTemplates.length === templates.length) {
      return;
    }

    if (editingTemplateId === templateId) {
      resetForm();
    }

    await saveTemplates(nextTemplates);
    await renderTemplates();
    setStatus(getMessage("statusTemplateDeleted"));
  });

  return button;
}

function createEditButton(template) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "edit";
  button.textContent = getMessage("editButton");
  button.addEventListener("click", () => {
    editingTemplateId = template.id;
    templateNameInput.value = template.name;
    templateTextInput.value = template.text;
    setFormMode(true);
    templateNameInput.focus();
    setStatus(getMessage("statusEditingTemplate", template.name));
  });

  return button;
}

function createTemplateItem(template) {
  const item = document.createElement("li");

  const header = document.createElement("div");
  header.className = "template-header";

  const title = document.createElement("strong");
  title.textContent = template.name;

  const actions = document.createElement("div");
  actions.className = "template-actions";

  const editButton = createEditButton(template);
  const removeButton = createDeleteButton(template.id);
  actions.append(editButton, removeButton);

  header.append(title, actions);

  const text = document.createElement("p");
  text.className = "template-text";
  text.textContent = template.text;

  item.append(header, text);
  return item;
}

async function renderTemplates() {
  const templates = await getStoredTemplates();
  templateList.replaceChildren();

  templates.forEach((template) => {
    templateList.append(createTemplateItem(template));
  });
}

function downloadTemplatesFile(payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const downloadUrl = URL.createObjectURL(blob);
  const downloadLink = document.createElement("a");

  downloadLink.href = downloadUrl;
  downloadLink.download = "message-templates-export.json";
  downloadLink.click();

  URL.revokeObjectURL(downloadUrl);
}

formCancelButton.addEventListener("click", () => {
  resetForm();
  setStatus(getMessage("statusEditCancelled"));
});

exportTemplatesButton.addEventListener("click", async () => {
  const templates = await getStoredTemplates();
  downloadTemplatesFile(buildTemplateExportPayload(templates));
  setStatus(getMessage("statusTemplatesExported", String(templates.length)));
});

importTemplatesButton.addEventListener("click", () => {
  importTemplatesInput.click();
});

importTemplatesInput.addEventListener("change", async () => {
  const [selectedFile] = importTemplatesInput.files || [];

  if (!selectedFile) {
    return;
  }

  try {
    const importedTemplates = parseImportedTemplates(await selectedFile.text());
    await saveTemplates(importedTemplates);

    if (editingTemplateId !== null) {
      resetForm();
    }

    await renderTemplates();
    setStatus(getMessage("statusTemplatesImported", String(importedTemplates.length)));
  } catch (error) {
    setStatus(getMessage("statusTemplateImportFailed"));
  } finally {
    importTemplatesInput.value = "";
  }
});

templateForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const template = sanitizeTemplate({
    id: editingTemplateId ?? generateTemplateId(),
    name: templateNameInput.value,
    text: templateTextInput.value
  });

  if (!template) {
    setStatus(getMessage("statusTemplateValidationError"));
    return;
  }

  const templates = await getStoredTemplates();

  if (editingTemplateId !== null) {
    const templateIndex = templates.findIndex(
      (storedTemplate) => storedTemplate.id === editingTemplateId
    );

    if (templateIndex === -1) {
      resetForm();
      await renderTemplates();
      setStatus(getMessage("statusTemplateMissing"));
      return;
    }

    templates[templateIndex] = template;
    await saveTemplates(templates);
    await renderTemplates();
    resetForm();
    setStatus(getMessage("statusTemplateUpdated"));
    return;
  }

  templates.push(template);
  await saveTemplates(templates);

  resetForm();
  await renderTemplates();
  setStatus(getMessage("statusTemplateAdded"));
});

localizePage();
setFormMode(false);
renderTemplates();
