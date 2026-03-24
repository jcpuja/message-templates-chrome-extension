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
let draggedTemplateId = null;

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

function moveTemplate(templates, sourceTemplateId, targetTemplateId) {
  if (sourceTemplateId === targetTemplateId) {
    return templates;
  }

  const sourceIndex = templates.findIndex((template) => template.id === sourceTemplateId);
  const targetIndex = templates.findIndex((template) => template.id === targetTemplateId);

  if (sourceIndex === -1 || targetIndex === -1) {
    return templates;
  }

  const reorderedTemplates = [...templates];
  const [movedTemplate] = reorderedTemplates.splice(sourceIndex, 1);
  reorderedTemplates.splice(targetIndex, 0, movedTemplate);
  return reorderedTemplates;
}

function createDragHandle(template) {
  const handle = document.createElement("button");
  handle.type = "button";
  handle.className = "drag-handle";
  handle.draggable = true;
  handle.textContent = "≡";
  handle.setAttribute("aria-label", getMessage("templateReorderHandleLabel", template.name));
  handle.title = getMessage("templateReorderHandleLabel", template.name);
  handle.addEventListener("dragstart", (event) => {
    draggedTemplateId = template.id;
    const templateItem = handle.closest("li");

    if (templateItem) {
      templateItem.classList.add("dragging");
    }

    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", template.id);
    }
  });
  handle.addEventListener("dragend", () => {
    draggedTemplateId = null;
    templateList.querySelectorAll(".dragging").forEach((item) => {
      item.classList.remove("dragging");
    });
    templateList.querySelectorAll(".drag-over").forEach((item) => {
      item.classList.remove("drag-over");
    });
  });

  return handle;
}

function createTemplateItem(template) {
  const item = document.createElement("li");
  item.dataset.templateId = template.id;
  item.addEventListener("dragover", (event) => {
    if (!draggedTemplateId || draggedTemplateId === template.id) {
      return;
    }

    event.preventDefault();

    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "move";
    }

    templateList.querySelectorAll(".drag-over").forEach((entry) => {
      if (entry !== item) {
        entry.classList.remove("drag-over");
      }
    });
    item.classList.add("drag-over");
  });
  item.addEventListener("dragleave", (event) => {
    if (event.currentTarget === event.target) {
      item.classList.remove("drag-over");
    }
  });
  item.addEventListener("drop", async (event) => {
    event.preventDefault();
    item.classList.remove("drag-over");

    if (!draggedTemplateId || draggedTemplateId === template.id) {
      return;
    }

    const templates = await getStoredTemplates();
    const nextTemplates = moveTemplate(templates, draggedTemplateId, template.id);

    if (nextTemplates === templates) {
      return;
    }

    await saveTemplates(nextTemplates);
    await renderTemplates();

    const movedTemplate = nextTemplates.find((entry) => entry.id === draggedTemplateId);
    setStatus(getMessage("statusTemplateReordered", movedTemplate?.name || ""));
  });

  const header = document.createElement("div");
  header.className = "template-header";

  const identity = document.createElement("div");
  identity.className = "template-identity";

  const dragHandle = createDragHandle(template);

  const title = document.createElement("strong");
  title.textContent = template.name;
  identity.append(dragHandle, title);

  const actions = document.createElement("div");
  actions.className = "template-actions";

  const editButton = createEditButton(template);
  const removeButton = createDeleteButton(template.id);
  actions.append(editButton, removeButton);

  header.append(identity, actions);

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
