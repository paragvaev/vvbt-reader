const text = value => typeof value === "string" ? value : "";

export function validatePublication(data) {
  if (!data || typeof data !== "object") throw new Error("Файл публикации повреждён.");
  if (!Array.isArray(data.letters)) throw new Error("В публикации нет писем.");
  if (!Array.isArray(data.fragments)) throw new Error("В публикации нет фрагментов.");
  return data;
}

export function selectLetter(data, requested = "") {
  const letters = data.letters;
  if (!letters.length) throw new Error("В публикации нет писем.");
  if (!requested) return letters[0];
  const letter = letters.find(item => item.id === requested || item.slug === requested);
  if (!letter) throw new Error("Запрошенное письмо не найдено.");
  return letter;
}

export function orderedBlocks(letter) {
  if (Array.isArray(letter.blocks)) {
    return [...letter.blocks].sort((a, b) => (Number(a.position) || 0) - (Number(b.position) || 0));
  }
  return (letter.fragments || []).map(item => ({
    type: "fragment",
    fragmentId: item.fragmentId,
    position: item.position
  })).sort((a, b) => (Number(a.position) || 0) - (Number(b.position) || 0));
}

export function publicationModel(data, requestedLetter = "") {
  validatePublication(data);
  const letter = selectLetter(data, requestedLetter);
  const fragments = new Map(data.fragments.map(item => [item.id, item]));
  const sources = new Map((data.sources || []).map(item => [item.id, item]));
  const images = data.images && typeof data.images === "object" ? data.images : {};
  const blocks = orderedBlocks(letter).map(block => {
    if (block.type === "image") {
      const image = images[block.imageId] || {};
      return { ...image, ...block, type: "image", src: block.src || image.src || "" };
    }
    const fragment = fragments.get(block.fragmentId);
    if (!fragment) return null;
    return {
      type: "fragment",
      ...fragment,
      source: sources.get(fragment.sourceId) || null,
      displayText: text(fragment.translation) || text(fragment.text)
    };
  }).filter(Boolean);
  return { project: data.project || {}, letter, blocks };
}

function element(tag, className = "", content = "") {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content) node.textContent = content;
  return node;
}

export function sourceMetadata(fragment) {
  const source = fragment.source;
  if (!source || source.citationVisibility === "hidden" || fragment.citationVisibility === "hidden") return "";
  const parts = [source.title, source.author, source.year].map(text).filter(Boolean);
  if (fragment.page) parts.push(`с. ${fragment.page}`);
  return parts.join(" · ");
}

function renderFragment(block) {
  const article = element("article", "letter-fragment");
  article.tabIndex = 0;
  const body = element("div", "fragment-text", block.displayText);
  article.append(body);
  const metadata = sourceMetadata(block);
  if (metadata) article.dataset.metadata = metadata;
  return article;
}

function renderImage(block) {
  const figure = element("figure", `letter-image size-${block.size || "medium"}`);
  if (!block.src) {
    figure.append(element("div", "image-missing", "Изображение недоступно"));
    return figure;
  }
  const image = document.createElement("img");
  image.src = block.src;
  image.alt = text(block.alt);
  image.loading = "lazy";
  image.decoding = "async";
  figure.append(image);
  if (block.caption) figure.append(element("figcaption", "image-caption", block.caption));
  return figure;
}

function installMetadataDock(root, content) {
  const dock = element("aside", "metadata-dock");
  dock.hidden = true;
  dock.setAttribute("aria-live", "polite");
  dock.setAttribute("aria-label", "Сведения об источнике");
  const marker = element("span", "metadata-marker", "i");
  marker.setAttribute("aria-hidden", "true");
  const label = element("span", "metadata-text");
  dock.append(marker, label);
  root.append(dock);

  let active = null;
  let pinned = false;
  let pulseTimer = 0;
  const prefersTouch = () => matchMedia("(hover: none), (pointer: coarse)").matches;

  const hide = () => {
    dock.hidden = true;
    label.textContent = "";
    active = null;
    pinned = false;
  };
  const show = (card, options = {}) => {
    const metadata = card.dataset.metadata;
    if (!metadata) return;
    active = card;
    pinned = Boolean(options.pinned);
    label.textContent = metadata;
    dock.hidden = false;
    if (options.pulse) {
      card.classList.remove("is-tapped");
      void card.offsetWidth;
      card.classList.add("is-tapped");
      clearTimeout(pulseTimer);
      pulseTimer = setTimeout(() => card.classList.remove("is-tapped"), 1800);
    }
  };

  content.querySelectorAll(".letter-fragment[data-metadata]").forEach(card => {
    card.addEventListener("pointerenter", () => {
      if (!prefersTouch()) show(card);
    });
    card.addEventListener("pointerleave", () => {
      if (!prefersTouch() && !pinned && active === card) hide();
    });
    card.addEventListener("focus", () => show(card));
    card.addEventListener("click", event => {
      event.stopPropagation();
      if (prefersTouch() && active === card && !dock.hidden) {
        hide();
        return;
      }
      show(card, { pinned: true, pulse: true });
    });
    card.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        card.click();
      }
      if (event.key === "Escape") hide();
    });
  });
  document.addEventListener("click", event => {
    if (!event.target.closest(".letter-fragment") && !event.target.closest(".metadata-dock")) hide();
  });
}

export function renderPublication(root, data, requestedLetter = "") {
  const model = publicationModel(data, requestedLetter);
  root.replaceChildren();
  const header = element("header", "letter-header");
  const projectTitle = text(model.project.title);
  if (projectTitle) header.append(element("div", "project-title", projectTitle));
  header.append(element("h1", "letter-title", text(model.letter.title) || "Без названия"));
  root.append(header);
  const content = element("div", "letter-content");
  model.blocks.forEach(block => content.append(block.type === "image" ? renderImage(block) : renderFragment(block)));
  root.append(content);
  installMetadataDock(root, content);
  document.title = `${text(model.letter.title) || "Письмо"} — ${projectTitle || "ВВБТ"}`;
  return model;
}

export function normalizePublicationUrl(value, base = window.location.href) {
  let parsed;
  try { parsed = new URL(value, base); } catch { throw new Error("Некорректный адрес публикации."); }
  if (!/^https?:$/.test(parsed.protocol)) throw new Error("Адрес публикации должен использовать HTTPS.");
  if (parsed.hostname === "www.dropbox.com" && parsed.pathname.startsWith("/scl/fi/")) {
    parsed.hostname = "dl.dropboxusercontent.com";
    parsed.searchParams.delete("raw");
    parsed.searchParams.delete("dl");
  }
  return parsed;
}

export async function loadPublication(url, options = {}) {
  if (!url) throw new Error("Не указан адрес публикации.");
  const parsed = normalizePublicationUrl(url);
  const response = await fetch(parsed, { cache: "no-store", signal: options.signal });
  if (!response.ok) throw new Error(`Публикация недоступна (${response.status}).`);
  return validatePublication(await response.json());
}
