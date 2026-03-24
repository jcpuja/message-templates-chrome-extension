const templateForm = document.getElementById("template-form");
const templateNameInput = document.getElementById("template-name");
const templateTextInput = document.getElementById("template-text");
const formSubmitButton = document.getElementById("form-submit-button");
const formCancelButton = document.getElementById("form-cancel-button");
const templateList = document.getElementById("template-list");
const statusElement = document.getElementById("status");

let editingTemplateId = null;

function setStatus(message) {
  statusElement.textContent = message;
}

function setFormMode(isEditing) {
  formSubmitButton.textContent = isEditing ? "Save changes" : "Add template";
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
  button.textContent = "Delete";
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
    setStatus("Template deleted.");
  });

  return button;
}

function createEditButton(template) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "edit";
  button.textContent = "Edit";
  button.addEventListener("click", () => {
    editingTemplateId = template.id;
    templateNameInput.value = template.name;
    templateTextInput.value = template.text;
    setFormMode(true);
    templateNameInput.focus();
    setStatus(`Editing template: ${template.name}`);
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

formCancelButton.addEventListener("click", () => {
  resetForm();
  setStatus("Edit cancelled.");
});

templateForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const template = sanitizeTemplate({
    id: editingTemplateId ?? generateTemplateId(),
    name: templateNameInput.value,
    text: templateTextInput.value
  });

  if (!template) {
    setStatus("Please provide both name and text.");
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
      setStatus("Template no longer exists.");
      return;
    }

    templates[templateIndex] = template;
    await saveTemplates(templates);
    await renderTemplates();
    resetForm();
    setStatus("Template updated.");
    return;
  }

  templates.push(template);
  await saveTemplates(templates);

  resetForm();
  await renderTemplates();
  setStatus("Template added.");
});

setFormMode(false);
renderTemplates();
