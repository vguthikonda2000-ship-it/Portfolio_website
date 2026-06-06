const defaultRoles = [
  "designer",
  "developer",
  "creative technologist",
  "product thinker",
];

let roles = [...defaultRoles];
let roleIndex = 0;
let charIndex = 0;
let deleting = false;
let typeTimer = null;
const STORAGE_KEY = "portfolio-content-draft";
const DRAFT_DB_NAME = "portfolio-editor";
const DRAFT_STORE_NAME = "drafts";
const DRAFT_RECORD_KEY = "site-content";

function normalizeContent(data) {
  if (data?.education?.items) {
    data.education.items = data.education.items.map((item) => {
      let out = item;
      if (!out.degree) {
        const desc = out.description || "";
        const parts = desc.replace(/\.$/, "").split(", ");
        const gpa = parts.find((p) => p.startsWith("GPA")) || "";
        const dates = parts.find((p) => /\d{4}/.test(p) && !p.startsWith("GPA")) || "";
        const degree = parts.filter((p) => p !== gpa && p !== dates).join(", ");
        out = { ...out, degree, gpa, dates };
      }
      const t = (out.title || "").toLowerCase();
      const logos = window.EDU_LOGOS || {};
      if (t.includes("connecticut")) out = { ...out, cardColor: "#002868", logo: logos.uconn || out.logo, logoOnColor: true };
      else if (t.includes("fairfield")) out = { ...out, cardColor: "#8B0000", logo: logos.fairfield || out.logo, logoOnColor: false };
      return out;
    });
  }

  if (data?.projects?.items) {
    data.projects.items = data.projects.items.map((item) => {
      if (Array.isArray(item.links)) {
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
        authors: "",
        authorNote: "",
        ...item,
      };

      if (Array.isArray(normalized.links)) {
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

function setText(id, value) {
  const node = document.getElementById(id);
  if (node && typeof value === "string") {
    node.textContent = value;
  }
}

function setLink(id, config, fallbackText) {
  const node = document.getElementById(id);
  if (!node || !config) return;

  node.textContent = config.text || fallbackText || node.textContent;
  node.href = config.url || node.href;
}

function createMediaElement(item, className) {
  if (item.video) {
    const video = document.createElement("video");
    video.className = className;
    video.src = item.video;
    video.controls = true;
    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.setAttribute("aria-label", item.alt || item.title || "Video preview");
    return video;
  }

  if (!item.image) {
    const fallback = document.createElement("div");
    fallback.className = className;
    return fallback;
  }

  const img = document.createElement("img");
  img.className = className;
  img.src = item.image || "";
  img.alt = item.alt || item.title || "";
  img.loading = "lazy";
  img.addEventListener("error", () => {
    const fallback = document.createElement("div");
    fallback.className = className;
    img.replaceWith(fallback);
  });
  return img;
}

function createCardLink(item, defaultLabel) {
  const link = document.createElement("a");
  link.textContent = item.linkText || defaultLabel;
  link.href = item.linkUrl || "#contact";
  return link;
}

function renderHero(hero) {
  if (!hero) return;

  setText("hero-eyebrow", hero.eyebrow);
  setText("hero-title-prefix", hero.titlePrefix);
  setText("hero-description", hero.description);
  setText("hero-badge", hero.badge);
  setLink("hero-cta", hero.cta, "Connect With Me!");

  if (Array.isArray(hero.roles) && hero.roles.length) {
    roles = hero.roles;
  }

  const portrait = document.getElementById("hero-portrait");
  if (!portrait) return;

  portrait.innerHTML = '<span class="portrait-ring"></span>';

  if (hero.portraitImage) {
    const img = document.createElement("img");
    img.className = "portrait-image";
    img.src = hero.portraitImage;
    img.alt = hero.portraitAlt || hero.eyebrow || "Portrait";
    portrait.appendChild(img);
    return;
  }

  const initials = document.createElement("span");
  initials.className = "portrait-core";
  initials.textContent = hero.initials || "YN";
  portrait.appendChild(initials);
}

function renderParagraphList(containerId, paragraphs) {
  const container = document.getElementById(containerId);
  if (!container || !Array.isArray(paragraphs)) return;

  container.innerHTML = "";
  paragraphs.forEach((text) => {
    const p = document.createElement("p");
    p.textContent = text;
    container.appendChild(p);
  });
}

function renderAbout(section) {
  if (!section) return;

  setText("about-heading", section.heading);
  renderParagraphList("about-paragraphs", section.paragraphs);

  const aboutCopy = document.getElementById("about-paragraphs");
  if (aboutCopy) {
    const textOffset = Math.min(140, Math.max(-120, Number(section.textOffset) || 0));
    aboutCopy.style.setProperty("--about-copy-offset", `${textOffset}px`);
  }

  const imageFrame = document.getElementById("about-image");
  if (!imageFrame) return;

  const imageWidth = Number(section.imageWidth) || 420;
  const clampedImageWidth = Math.min(760, Math.max(220, imageWidth));
  imageFrame.closest(".about-grid")?.style.setProperty("--about-image-width", `${clampedImageWidth}px`);
  imageFrame.innerHTML = "";
  if (!section.image) {
    imageFrame.classList.add("is-empty");
    return;
  }

  imageFrame.classList.remove("is-empty");
  const image = document.createElement("img");
  image.src = section.image;
  image.alt = section.imageAlt || "About image";
  image.loading = "lazy";
  imageFrame.appendChild(image);
}

function renderInfoCards(headingId, containerId, section, defaultLabel) {
  if (!section) return;

  setText(headingId, section.heading);
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = "";
  (section.items || []).forEach((item) => {
    const article = document.createElement("article");
    article.className = "info-card";
    if (item.cardColor) {
      article.style.setProperty("--edu-accent", item.cardColor);
      article.classList.add("edu-card");
    }

    const titleRow = document.createElement("div");
    titleRow.className = "edu-title-row";

    const title = document.createElement("h3");
    title.textContent = item.title || "";
    titleRow.appendChild(title);

    if (item.logo) {
      const logoImg = document.createElement("img");
      logoImg.src = item.logo;
      logoImg.alt = (item.title || "") + " logo";
      logoImg.className = "edu-logo";
      titleRow.appendChild(logoImg);
    }

    article.appendChild(titleRow);

    if (item.degree) {
      const degreeEl = document.createElement("p");
      degreeEl.className = "edu-degree";
      degreeEl.textContent = item.degree;
      article.appendChild(degreeEl);

      const gpaEl = document.createElement("p");
      gpaEl.className = "edu-meta";
      gpaEl.textContent = item.gpa || "";
      article.appendChild(gpaEl);

      const locationEl = document.createElement("p");
      locationEl.className = "edu-meta";
      locationEl.textContent = item.linkText || "";
      article.appendChild(locationEl);

      const datesEl = document.createElement("p");
      datesEl.className = "edu-meta";
      datesEl.textContent = item.dates || "";
      article.appendChild(datesEl);
    } else {
      const description = document.createElement("p");
      description.textContent = item.description || "";
      article.appendChild(description);

      article.appendChild(createCardLink(item, defaultLabel));
    }
    container.appendChild(article);
  });
}

function renderPublications(section) {
  if (!section) return;

  setText("publications-heading", section.heading);
  const container = document.getElementById("publication-cards");
  if (!container) return;

  container.innerHTML = "";
  (section.items || []).forEach((item) => {
    const article = document.createElement("article");
    article.className = "publication-card";

    const mediaWrap = document.createElement("div");
    mediaWrap.className = "publication-media";
    mediaWrap.appendChild(createMediaElement(item, "publication-image"));
    article.appendChild(mediaWrap);

    const contentWrap = document.createElement("div");
    contentWrap.className = "publication-content";

    const source = document.createElement("span");
    source.className = "publication-source";
    source.textContent = item.source || "";
    contentWrap.appendChild(source);

    const title = document.createElement("h3");
    title.textContent = item.title || "";
    contentWrap.appendChild(title);

    const hasAuthors = Boolean(item.authors);
    const hasAuthorNote = Boolean(item.authorNote);
    if (hasAuthors || hasAuthorNote) {
      const meta = document.createElement("div");
      meta.className = "publication-meta";

      if (hasAuthors) {
        const authors = document.createElement("p");
        authors.className = "publication-authors";
        authors.textContent = item.authors;
        meta.appendChild(authors);
      }

      if (hasAuthorNote) {
        const authorNote = document.createElement("span");
        authorNote.className = "publication-author-note";
        authorNote.textContent = item.authorNote;
        meta.appendChild(authorNote);
      }

      contentWrap.appendChild(meta);
    }

    const year = document.createElement("p");
    year.textContent = item.year || "";
    contentWrap.appendChild(year);

    const linksRow = document.createElement("div");
    linksRow.className = "project-links";
    (item.links || []).forEach((linkItem) => {
      const link = document.createElement("a");
      link.textContent = linkItem.label || "Link";
      link.href = linkItem.url || "#contact";
      linksRow.appendChild(link);
    });
    contentWrap.appendChild(linksRow);

    article.appendChild(contentWrap);
    container.appendChild(article);
  });
}

function renderProjects(section) {
  if (!section) return;

  setText("projects-heading", section.heading);
  const container = document.getElementById("project-slides");
  if (!container) return;

  container.innerHTML = "";
  (section.items || []).forEach((item) => {
    const article = document.createElement("article");
    article.className = "project-card";

    article.appendChild(createMediaElement(item, item.video ? "project-video" : "content-media"));

    const title = document.createElement("h3");
    title.textContent = item.title || "";
    article.appendChild(title);

    const subtitle = document.createElement("h4");
    subtitle.textContent = item.subtitle || "";
    article.appendChild(subtitle);

    const description = document.createElement("p");
    description.textContent = item.description || "";
    article.appendChild(description);

    const linksRow = document.createElement("div");
    linksRow.className = "project-links";

    (item.links || []).forEach((linkItem) => {
      const link = document.createElement("a");
      link.textContent = linkItem.label || "Link";
      link.href = linkItem.url || "#contact";
      linksRow.appendChild(link);
    });

    article.appendChild(linksRow);
    container.appendChild(article);
  });
}

function renderSkills(section) {
  if (!section) return;

  setText("skills-heading", section.heading);
  const container = document.getElementById("skills-grid");
  if (!container) return;

  container.innerHTML = "";
  (section.items || []).forEach((item) => {
    const article = document.createElement("article");
    article.className = "skill-item";

    const icon = document.createElement("span");
    icon.className = "skill-icon";
    icon.textContent = item.icon || "SK";
    article.appendChild(icon);

    const text = document.createElement("p");
    text.textContent = item.label || "";
    article.appendChild(text);

    container.appendChild(article);
  });
}

function renderContact(contact, footer) {
  if (!contact) return;

  setText("contact-heading", contact.heading);
  setText("contact-subheading", contact.subheading);
  setText("footer-prefix", footer?.prefix || "Made by");
  setText("footer-name", footer?.name || "");

  const email = document.getElementById("contact-email");
  if (email) {
    email.textContent = contact.email || "";
    email.href = `mailto:${contact.email || ""}`;
  }

  const socials = document.getElementById("social-links");
  if (!socials) return;

  socials.innerHTML = "";
  (contact.socials || []).forEach((item) => {
    const link = document.createElement("a");
    link.href = item.url || "#";
    link.textContent = item.label || "Link";
    link.target = "_blank";
    link.rel = "noreferrer";
    socials.appendChild(link);
  });
}

function setupCarousels() {
  document.querySelectorAll("[data-carousel]").forEach((carousel) => {
    const slides = Array.from(carousel.querySelectorAll(".carousel-slide"));
    const prev = carousel.querySelector(".prev");
    const next = carousel.querySelector(".next");
    let activeIndex = 0;

    if (!slides.length) return;

    const render = () => {
      slides.forEach((slide, index) => {
        slide.classList.toggle("active", index === activeIndex);
      });
    };

    prev?.addEventListener("click", () => {
      activeIndex = (activeIndex - 1 + slides.length) % slides.length;
      render();
    });

    next?.addEventListener("click", () => {
      activeIndex = (activeIndex + 1) % slides.length;
      render();
    });

    render();
  });
}

function tickType() {
  const target = document.getElementById("type-target");
  if (!target) return;

  const current = roles[roleIndex] || "";
  target.textContent = deleting
    ? current.slice(0, charIndex--)
    : current.slice(0, charIndex++);

  const finishedTyping = !deleting && charIndex === current.length + 1;
  const finishedDeleting = deleting && charIndex === -1;
  let delay = deleting ? 55 : 95;

  if (finishedTyping) {
    deleting = true;
    delay = 1400;
  } else if (finishedDeleting) {
    deleting = false;
    roleIndex = (roleIndex + 1) % roles.length;
    charIndex = 0;
    delay = 220;
  }

  typeTimer = window.setTimeout(tickType, delay);
}

function renderSite(data) {
  document.title = data.site?.title || document.title;
  const metaDescription = document.querySelector('meta[name="description"]');
  if (metaDescription && data.site?.description) {
    metaDescription.content = data.site.description;
  }

  roles = Array.isArray(data.hero?.roles) && data.hero.roles.length ? data.hero.roles : [...defaultRoles];
  roleIndex = 0;
  charIndex = 0;
  deleting = false;
  if (typeTimer) {
    window.clearTimeout(typeTimer);
  }

  setLink("resume-link", data.navigation?.resume, "Resume");
  renderHero(data.hero);
  renderAbout(data.about);
  renderInfoCards("education-heading", "education-cards", data.education, "Explore");
  renderPublications(data.publications);
  renderInfoCards("experience-heading", "experience-cards", data.experience, "Explore");
  renderProjects(data.projects);
  renderSkills(data.skills);
  renderContact(data.contact, data.footer);
  setupCarousels();
  tickType();
}

async function loadContent() {
  try {
    const localDraft = await readStoredDraft();
    const data = localDraft
      ? JSON.parse(localDraft)
      : window.PORTFOLIO_DEFAULT_CONTENT;
    renderSite(normalizeContent(data));
  } catch (error) {
    console.error("Unable to load site content", error);
    setupCarousels();
  }
}

window.addEventListener("message", (event) => {
  if (event.data?.type === "portfolio-preview-update" && event.data.payload) {
    renderSite(event.data.payload);
  }
});

loadContent();
