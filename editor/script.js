const STORAGE_KEY = "portfolio-content-draft";
const DRAFT_DB_NAME = "portfolio-editor";
const DRAFT_STORE_NAME = "drafts";
const DRAFT_RECORD_KEY = "site-content";

let content = null;
let pendingImageTarget = null;

function normalizeContent(data) {
  if (data?.projects?.items) {
    data.projects.items = data.projects.items.map((item) => {
      if (Array.isArray(item.links) && item.links.length) {
        return item;
      }

      return {
        ...item,
        links: [
          { label: item.linkText || "Project", url: item.linkUrl || "#contact" },
          { label: "Code", url: "#contact" },
          { label: "Paper", url: "#contact" },
        ],
      };
    });
  }

  if (data?.publications?.items) {
    data.publications.items = data.publications.items.map((item) => {
      const normalized = {
        image: "",
        ...item,
      };

      if (Array.isArray(normalized.links) && normalized.links.length) {
        return normalized;
      }

      return {
        ...normalized,
        links: [
          { label: "Project", url: "#contact" },
          { label: "Code", url: "#contact" },
          { label: "Paper", url: "#contact" },
        ],
      };
    });
  }

  return data;
}

function setStatus(message) {
  const node = document.getElementById("status-text");
  if (node) node.textContent = message;
}

function openDraftDb() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      resolve(null);
      return;
    }

    const request = window.indexedDB.open(DRAFT_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DRAFT_STORE_NAME)) {
        db.createObjectStore(DRAFT_STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function persistDraft(data) {
  const serialized = JSON.stringify(data);

  try {
    const db = await openDraftDb();
    if (db) {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(DRAFT_STORE_NAME, "readwrite");
        tx.objectStore(DRAFT_STORE_NAME).put(serialized, DRAFT_RECORD_KEY);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error || new Error("Draft save failed."));
        tx.onabort = () => reject(tx.error || new Error("Draft save aborted."));
      });
      db.close();
      return;
    }
  } catch (error) {
    console.warn("IndexedDB draft save failed, falling back to localStorage.", error);
  }

  window.localStorage.setItem(STORAGE_KEY, serialized);
}

async function readStoredDraft() {
  try {
    const db = await openDraftDb();
    if (db) {
      const result = await new Promise((resolve, reject) => {
        const tx = db.transaction(DRAFT_STORE_NAME, "readonly");
        const request = tx.objectStore(DRAFT_STORE_NAME).get(DRAFT_RECORD_KEY);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
      db.close();
      if (result) {
        return result;
      }
    }
  } catch (error) {
    console.warn("IndexedDB draft read failed, falling back to localStorage.", error);
  }

  return window.localStorage.getItem(STORAGE_KEY);
}

async function clearStoredDraft() {
  try {
    const db = await openDraftDb();
    if (db) {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(DRAFT_STORE_NAME, "readwrite");
        tx.objectStore(DRAFT_STORE_NAME).delete(DRAFT_RECORD_KEY);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error || new Error("Draft reset failed."));
        tx.onabort = () => reject(tx.error || new Error("Draft reset aborted."));
      });
      db.close();
    }
  } catch (error) {
    console.warn("IndexedDB draft reset failed.", error);
  }

  window.localStorage.removeItem(STORAGE_KEY);
}

async function saveDraft(message = "Draft saved locally.") {
  try {
    await persistDraft(content);
    setStatus(message);
  } catch (error) {
    console.error(error);
    setStatus("Could not save the draft locally.");
  }
}

function autosave(message = "Draft updated.") {
  void saveDraft(message);
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (error) => {
      URL.revokeObjectURL(url);
      reject(error);
    };
    img.src = url;
  });
}

async function prepareUploadData(file) {
  if (!file.type.startsWith("image/")) {
    return fileToDataUrl(file);
  }

  if (file.type === "image/gif" || file.type === "image/svg+xml") {
    return fileToDataUrl(file);
  }

  const maxDimension = 1800;
  const image = await loadImage(file);
  const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) {
    return fileToDataUrl(file);
  }

  context.drawImage(image, 0, 0, width, height);

  const prefersPng = file.type === "image/png";
  const mimeType = prefersPng ? "image/webp" : file.type;
  const quality = mimeType === "image/webp" || mimeType === "image/jpeg" ? 0.86 : undefined;

  return canvas.toDataURL(mimeType, quality);
}

function makeEditableText(node, getter, setter, message) {
  node.textContent = getter() || "";
  node.contentEditable = "true";
  node.spellcheck = true;
  node.addEventListener("input", () => {
    setter(node.textContent);
    autosave(message);
  });
}

function makeEditableLink(node, textGetter, textSetter, hrefGetter, hrefSetter, textMessage, hrefMessage) {
  node.textContent = textGetter() || "";
  node.href = hrefGetter() || "#contact";
  node.contentEditable = "true";
  node.spellcheck = false;
  node.addEventListener("click", (event) => {
    event.preventDefault();
  });
  node.addEventListener("input", () => {
    textSetter(node.textContent);
    autosave(textMessage);
  });
  node.addEventListener("dblclick", () => {
    const nextUrl = window.prompt("Enter link URL", hrefGetter() || "");
    if (nextUrl !== null) {
      hrefSetter(nextUrl);
      node.href = nextUrl || "#contact";
      autosave(hrefMessage);
    }
  });
}

function attachImageUpload(container, item, message, placeholderText, options = {}) {
  const imageKey = options.imageKey || "image";
  const videoKey = options.videoKey || "video";
  const isHero = container.id === "hero-portrait";
  container.classList.add("upload-target");
  container.innerHTML = "";

  if (isHero) {
    const ring = document.createElement("span");
    ring.className = "portrait-ring";
    container.appendChild(ring);
  }

  if (!isHero && item[videoKey]) {
    const video = document.createElement("video");
    video.className = "project-video";
    video.src = item[videoKey];
    video.controls = true;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    container.appendChild(video);
  } else if (item[imageKey]) {
    const img = document.createElement("img");
    img.className = isHero ? "portrait-image" : "content-media";
    img.src = item[imageKey];
    img.alt = item.alt || item.title || "Uploaded image";
    container.appendChild(img);
  } else {
    const placeholder = document.createElement("div");
    placeholder.className =
      isHero
        ? "upload-placeholder portrait-placeholder"
        : "upload-placeholder content-media project-placeholder";

    if (isHero) {
      const initials = document.createElement("span");
      initials.className = "portrait-core";
      initials.textContent = content.hero.initials || "YN";
      placeholder.appendChild(initials);
    }

    const label = document.createElement("div");
    label.innerHTML = `<strong>${placeholderText}</strong><span>Choose an image, GIF, or small video</span>`;
    placeholder.appendChild(label);
    container.appendChild(placeholder);
  }

  container.onclick = () => {
    pendingImageTarget = { container, item, message, placeholderText, imageKey, videoKey, isHero };
    setStatus("Opening file picker…");
    const input = document.getElementById("image-upload-input");
    if (!input) {
      setStatus("Upload input is missing.");
      return;
    }
    input.value = "";
    if (typeof input.showPicker === "function") {
      input.showPicker();
    } else {
      input.click();
    }
  };
}

function renderSimpleCardGrid(containerId, items, typeLabel) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = "";

  items.forEach((item, index) => {
    const card = document.createElement("article");
    card.className = "info-card";

    const title = document.createElement("h3");
    title.className = "editable";
    makeEditableText(title, () => item.title, (value) => (item.title = value), `${typeLabel} title updated.`);
    card.appendChild(title);

    const description = document.createElement("p");
    description.className = "editable";
    makeEditableText(
      description,
      () => item.description,
      (value) => (item.description = value),
      `${typeLabel} description updated.`
    );
    card.appendChild(description);

    const link = document.createElement("a");
    link.className = "editable-link";
    makeEditableLink(
      link,
      () => item.linkText,
      (value) => (item.linkText = value),
      () => item.linkUrl,
      (value) => (item.linkUrl = value),
      `${typeLabel} link text updated.`,
      `${typeLabel} link URL updated.`
    );
    card.appendChild(link);

    container.appendChild(card);
  });
}

function renderHero() {
  makeEditableText(
    document.getElementById("hero-eyebrow"),
    () => content.hero.eyebrow,
    (value) => (content.hero.eyebrow = value),
    "Hero intro updated."
  );
  makeEditableText(
    document.getElementById("hero-title-prefix"),
    () => content.hero.titlePrefix,
    (value) => (content.hero.titlePrefix = value),
    "Hero title updated."
  );
  makeEditableText(
    document.getElementById("hero-description"),
    () => content.hero.description,
    (value) => (content.hero.description = value),
    "Hero description updated."
  );
  makeEditableText(
    document.getElementById("hero-badge"),
    () => content.hero.badge,
    (value) => (content.hero.badge = value),
    "Hero badge updated."
  );
  makeEditableLink(
    document.getElementById("hero-cta"),
    () => content.hero.cta.text,
    (value) => (content.hero.cta.text = value),
    () => content.hero.cta.url,
    (value) => (content.hero.cta.url = value),
    "Hero button text updated.",
    "Hero button URL updated."
  );

  const rolesNode = document.getElementById("hero-roles-inline");
  rolesNode.classList.add("editable");
  rolesNode.contentEditable = "true";
  rolesNode.textContent = (content.hero.roles || []).join(" / ");
  rolesNode.addEventListener("input", () => {
    content.hero.roles = rolesNode.textContent
      .split("/")
      .map((role) => role.trim())
      .filter(Boolean);
    autosave("Hero roles updated.");
  });

  attachImageUpload(
    document.getElementById("hero-portrait"),
    content.hero,
    "Hero image updated.",
    "Click to upload portrait",
    { imageKey: "portraitImage", videoKey: "portraitVideo" }
  );
}

function renderAbout() {
  makeEditableText(
    document.getElementById("about-heading"),
    () => content.about.heading,
    (value) => (content.about.heading = value),
    "About heading updated."
  );

  const container = document.getElementById("about-paragraphs");
  container.innerHTML = "";

  content.about.paragraphs.forEach((paragraph, index) => {
    const p = document.createElement("p");
    p.className = "editable";
    p.contentEditable = "true";
    p.textContent = paragraph;
    p.addEventListener("input", () => {
      content.about.paragraphs[index] = p.textContent;
      autosave("About text updated.");
    });
    container.appendChild(p);
  });
}

function renderPublications() {
  makeEditableText(
    document.getElementById("publications-heading"),
    () => content.publications.heading,
    (value) => (content.publications.heading = value),
    "Publications heading updated."
  );

  const container = document.getElementById("publication-cards");
  container.innerHTML = "";

  content.publications.items.forEach((item, index) => {
    const card = document.createElement("article");
    card.className = "publication-card";

    const tools = document.createElement("div");
    tools.className = "editor-item-tools";
    tools.innerHTML = `<span>Publication ${index + 1}</span>`;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Remove";
    remove.addEventListener("click", () => {
      content.publications.items.splice(index, 1);
      autosave("Publication removed.");
      renderPublications();
    });
    tools.appendChild(remove);
    card.appendChild(tools);

    const mediaWrap = document.createElement("div");
    mediaWrap.className = "publication-media";
    const media = document.createElement("div");
    attachImageUpload(media, item, "Publication image updated.", "Click to upload publication image");
    mediaWrap.appendChild(media);
    card.appendChild(mediaWrap);

    const contentWrap = document.createElement("div");
    contentWrap.className = "publication-content";

    const source = document.createElement("span");
    source.className = "publication-source editable";
    makeEditableText(source, () => item.source, (value) => (item.source = value), "Publication source updated.");
    contentWrap.appendChild(source);

    const title = document.createElement("h3");
    title.className = "editable";
    makeEditableText(title, () => item.title, (value) => (item.title = value), "Publication title updated.");
    contentWrap.appendChild(title);

    const year = document.createElement("p");
    year.className = "editable";
    makeEditableText(year, () => item.year, (value) => (item.year = value), "Publication year updated.");
    contentWrap.appendChild(year);

    const linksRow = document.createElement("div");
    linksRow.className = "project-links";

    (item.links || []).forEach((linkItem) => {
      const chip = document.createElement("div");
      chip.className = "project-link-chip";

      const linkButton = document.createElement("a");
      linkButton.className = "editable-link";
      makeEditableLink(
        linkButton,
        () => linkItem.label,
        (value) => (linkItem.label = value),
        () => linkItem.url,
        (value) => (linkItem.url = value),
        "Publication button text updated.",
        "Publication button URL updated."
      );
      chip.appendChild(linkButton);

      const removeLink = document.createElement("button");
      removeLink.type = "button";
      removeLink.className = "project-link-remove";
      removeLink.textContent = "Remove";
      removeLink.addEventListener("click", () => {
        item.links = (item.links || []).filter((candidate) => candidate !== linkItem);
        autosave("Publication button removed.");
        renderPublications();
      });
      chip.appendChild(removeLink);

      linksRow.appendChild(chip);
    });

    const addLink = document.createElement("button");
    addLink.type = "button";
    addLink.className = "project-link-add";
    addLink.textContent = "Add Button";
    addLink.addEventListener("click", () => {
      if (!Array.isArray(item.links)) {
        item.links = [];
      }
      item.links.push({ label: "New Button", url: "#contact" });
      autosave("Publication button added.");
      renderPublications();
    });
    linksRow.appendChild(addLink);
    contentWrap.appendChild(linksRow);

    const link = document.createElement("a");
    link.className = "editable-link";
    makeEditableLink(
      link,
      () => item.linkText,
      (value) => (item.linkText = value),
      () => item.linkUrl,
      (value) => (item.linkUrl = value),
      "Publication link text updated.",
      "Publication link URL updated."
    );
    contentWrap.appendChild(link);

    card.appendChild(contentWrap);
    container.appendChild(card);
  });

  const addButton = document.createElement("button");
  addButton.className = "add-inline-button";
  addButton.type = "button";
  addButton.textContent = "Add Publication";
  addButton.addEventListener("click", () => {
    content.publications.items.push({
      source: "Journal / Conference",
      title: "New publication",
      image: "",
      year: new Date().getFullYear().toString(),
      links: [
        { label: "Project", url: "#contact" },
        { label: "Code", url: "#contact" },
        { label: "Paper", url: "#contact" },
      ],
      linkText: "View Publication",
      linkUrl: "#contact",
    });
    autosave("Publication added.");
    renderPublications();
  });
  container.appendChild(addButton);
}

function renderProjects() {
  makeEditableText(
    document.getElementById("projects-heading"),
    () => content.projects.heading,
    (value) => (content.projects.heading = value),
    "Projects heading updated."
  );

  const container = document.getElementById("project-cards");
  container.innerHTML = "";

  content.projects.items.forEach((project, index) => {
    const card = document.createElement("article");
    card.className = "editor-project-card";

    const tools = document.createElement("div");
    tools.className = "editor-item-tools";
    tools.innerHTML = `<span>Project ${index + 1}</span>`;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Remove";
    remove.addEventListener("click", () => {
      content.projects.items.splice(index, 1);
      autosave("Project removed.");
      renderProjects();
    });
    tools.appendChild(remove);
    card.appendChild(tools);

    const media = document.createElement("div");
    attachImageUpload(media, project, "Project media updated.", "Click to upload project media");
    card.appendChild(media);

    const title = document.createElement("h3");
    title.className = "editable";
    makeEditableText(title, () => project.title, (value) => (project.title = value), "Project title updated.");
    card.appendChild(title);

    const subtitle = document.createElement("h4");
    subtitle.className = "editable";
    makeEditableText(
      subtitle,
      () => project.subtitle,
      (value) => (project.subtitle = value),
      "Project subtitle updated."
    );
    card.appendChild(subtitle);

    const description = document.createElement("p");
    description.className = "editable";
    makeEditableText(
      description,
      () => project.description,
      (value) => (project.description = value),
      "Project description updated."
    );
    card.appendChild(description);

    const linksRow = document.createElement("div");
    linksRow.className = "project-links";

    (project.links || []).forEach((linkItem) => {
      const chip = document.createElement("div");
      chip.className = "project-link-chip";

      const link = document.createElement("a");
      link.className = "editable-link";
      makeEditableLink(
        link,
        () => linkItem.label,
        (value) => (linkItem.label = value),
        () => linkItem.url,
        (value) => (linkItem.url = value),
        "Project button text updated.",
        "Project button URL updated."
      );
      chip.appendChild(link);

      const removeLink = document.createElement("button");
      removeLink.type = "button";
      removeLink.className = "project-link-remove";
      removeLink.textContent = "Remove";
      removeLink.addEventListener("click", () => {
        project.links = (project.links || []).filter((candidate) => candidate !== linkItem);
        autosave("Project button removed.");
        renderProjects();
      });
      chip.appendChild(removeLink);

      linksRow.appendChild(chip);
    });

    const addLink = document.createElement("button");
    addLink.type = "button";
    addLink.className = "project-link-add";
    addLink.textContent = "Add Button";
    addLink.addEventListener("click", () => {
      if (!Array.isArray(project.links)) {
        project.links = [];
      }
      project.links.push({ label: "New Link", url: "#contact" });
      autosave("Project button added.");
      renderProjects();
    });
    linksRow.appendChild(addLink);

    card.appendChild(linksRow);

    container.appendChild(card);
  });

  const addButton = document.createElement("button");
  addButton.className = "add-inline-button";
  addButton.type = "button";
  addButton.textContent = "Add Project";
  addButton.addEventListener("click", () => {
    content.projects.items.push({
      title: "New project",
      subtitle: "Short subtitle",
      description: "Describe this project here.",
      image: "",
      video: "",
      alt: "",
      links: [
        { label: "Project", url: "#contact" },
        { label: "Code", url: "#contact" },
        { label: "Paper", url: "#contact" },
      ],
    });
    autosave("Project added.");
    renderProjects();
  });
  container.appendChild(addButton);
}

function renderSkills() {
  makeEditableText(
    document.getElementById("skills-heading"),
    () => content.skills.heading,
    (value) => (content.skills.heading = value),
    "Skills heading updated."
  );

  const container = document.getElementById("skills-grid");
  container.innerHTML = "";

  content.skills.items.forEach((item) => {
    const article = document.createElement("article");
    article.className = "skill-item";

    const icon = document.createElement("span");
    icon.className = "skill-icon editable";
    makeEditableText(icon, () => item.icon, (value) => (item.icon = value), "Skill icon updated.");
    article.appendChild(icon);

    const label = document.createElement("p");
    label.className = "editable";
    makeEditableText(label, () => item.label, (value) => (item.label = value), "Skill updated.");
    article.appendChild(label);

    container.appendChild(article);
  });
}

function renderSocials() {
  const container = document.getElementById("social-links");
  container.innerHTML = "";

  content.contact.socials.forEach((item, index) => {
    const row = document.createElement("div");
    row.className = "social-editor-row";

    const label = document.createElement("input");
    label.value = item.label || "";
    label.placeholder = "Label";
    label.addEventListener("input", () => {
      item.label = label.value;
      autosave("Social link updated.");
      renderSocials();
    });
    row.appendChild(label);

    const url = document.createElement("input");
    url.value = item.url || "";
    url.placeholder = "URL";
    url.addEventListener("input", () => {
      item.url = url.value;
      autosave("Social URL updated.");
    });
    row.appendChild(url);

    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Remove";
    remove.addEventListener("click", () => {
      content.contact.socials.splice(index, 1);
      autosave("Social link removed.");
      renderSocials();
    });
    row.appendChild(remove);

    container.appendChild(row);
  });

  const add = document.createElement("button");
  add.type = "button";
  add.className = "add-inline-button";
  add.textContent = "Add Social Link";
  add.addEventListener("click", () => {
    content.contact.socials.push({ label: "New Link", url: "https://" });
    autosave("Social link added.");
    renderSocials();
  });
  container.appendChild(add);
}

function renderContact() {
  makeEditableText(
    document.getElementById("contact-heading"),
    () => content.contact.heading,
    (value) => (content.contact.heading = value),
    "Contact heading updated."
  );
  makeEditableText(
    document.getElementById("contact-subheading"),
    () => content.contact.subheading,
    (value) => (content.contact.subheading = value),
    "Contact subheading updated."
  );
  makeEditableLink(
    document.getElementById("contact-email"),
    () => content.contact.email,
    (value) => (content.contact.email = value),
    () => `mailto:${content.contact.email || ""}`,
    () => {},
    "Contact email updated.",
    "Contact email updated."
  );
  makeEditableText(
    document.getElementById("footer-prefix"),
    () => content.footer.prefix,
    (value) => (content.footer.prefix = value),
    "Footer prefix updated."
  );
  makeEditableLink(
    document.getElementById("footer-name"),
    () => content.footer.name,
    (value) => (content.footer.name = value),
    () => "#home",
    () => {},
    "Footer name updated.",
    "Footer name updated."
  );
  renderSocials();
}

function renderAll() {
  makeEditableLink(
    document.getElementById("resume-link"),
    () => content.navigation.resume.text,
    (value) => (content.navigation.resume.text = value),
    () => content.navigation.resume.url,
    (value) => (content.navigation.resume.url = value),
    "Resume text updated.",
    "Resume URL updated."
  );
  renderHero();
  renderAbout();
  makeEditableText(
    document.getElementById("education-heading"),
    () => content.education.heading,
    (value) => (content.education.heading = value),
    "Education heading updated."
  );
  renderSimpleCardGrid("education-cards", content.education.items, "Education");
  renderPublications();
  makeEditableText(
    document.getElementById("experience-heading"),
    () => content.experience.heading,
    (value) => (content.experience.heading = value),
    "Experience heading updated."
  );
  renderSimpleCardGrid("experience-cards", content.experience.items, "Experience");
  renderProjects();
  renderSkills();
  renderContact();
}

async function loadInitialContent() {
  const draft = await readStoredDraft();
  if (draft) {
    content = normalizeContent(JSON.parse(draft));
    setStatus("Loaded your local draft.");
    return;
  }
  content = normalizeContent(JSON.parse(JSON.stringify(window.PORTFOLIO_DEFAULT_CONTENT)));
  setStatus("Loaded site content. Start editing directly on the page.");
}

function setupImageUpload() {
  const input = document.getElementById("image-upload-input");
  input?.addEventListener("cancel", () => {
    setStatus("File picker closed.");
    pendingImageTarget = null;
  });
  input?.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file || !pendingImageTarget) {
      setStatus("No image selected.");
      return;
    }

    let dataUrl;
    try {
      dataUrl = await prepareUploadData(file);
    } catch (error) {
      console.error(error);
      setStatus("That file could not be processed.");
      pendingImageTarget = null;
      event.target.value = "";
      return;
    }

    if (file.type.startsWith("video/") && !pendingImageTarget.isHero) {
      pendingImageTarget.item[pendingImageTarget.videoKey] = dataUrl;
      pendingImageTarget.item[pendingImageTarget.imageKey] = "";
    } else {
      pendingImageTarget.item[pendingImageTarget.imageKey] = dataUrl;
      if (pendingImageTarget.videoKey) {
        pendingImageTarget.item[pendingImageTarget.videoKey] = "";
      }
    }
    if (!pendingImageTarget.item.alt) {
      pendingImageTarget.item.alt = file.name.replace(/\.[^.]+$/, "");
    }
    autosave(pendingImageTarget.message);
    renderAll();
    event.target.value = "";
    pendingImageTarget = null;
  });
}

async function init() {
  await loadInitialContent();
  setupImageUpload();
  renderAll();

  document.getElementById("save-button")?.addEventListener("click", () => {
    saveDraft("Draft saved locally.");
  });

  document.getElementById("reset-button")?.addEventListener("click", () => {
    const shouldReset = window.confirm("Reset your draft and remove all unsaved local edits?");
    if (!shouldReset) {
      setStatus("Reset cancelled.");
      return;
    }
    void clearStoredDraft().finally(() => window.location.reload());
  });
}

init().catch((error) => {
  console.error(error);
  setStatus("Could not load the editable page.");
});
