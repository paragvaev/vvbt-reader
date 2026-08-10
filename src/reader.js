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
    if (block.type === "break") return { ...block, type: "break" };
    if (block.type === "image") {
      const image = images[block.imageId] || {};
      return { ...image, ...block, type: "image", src: block.src || image.src || "" };
    }
    const fragment = fragments.get(block.fragmentId);
    if (!fragment) return null;
    return {
      ...fragment,
      type: "fragment",
      source: sources.get(fragment.sourceId) || null,
      displayText: text(fragment.translation) || text(fragment.text)
    };
  }).filter(Boolean);
  const usedSources = [];
  const seenSources = new Set();
  for (const block of blocks) {
    if (block.type !== "fragment" || !block.source || seenSources.has(block.source.id)) continue;
    seenSources.add(block.source.id);
    usedSources.push(block.source);
  }
  return { project: data.project || {}, letter, blocks, usedSources };
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
  const shareSource = quoteSourceLabel(block);
  if (shareSource) article.dataset.shareSource = shareSource;
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

function renderBreak() {
  const spacer = element("div", "letter-break");
  spacer.setAttribute("aria-hidden", "true");
  return spacer;
}

const SHARE_SIGNATURE = "ВСТРЕЧАЯ ВОЙНУ БЕЗ ТЕБЯ | ВИЛИСОВ";

export function quoteSourceLabel(fragment) {
  const source = fragment?.source;
  if (!source) return "";
  return [text(source.author), text(source.title)].filter(Boolean).join(" • ");
}

export function wrapCanvasText(context, value, maxWidth) {
  const words = text(value).trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && context.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function roundedRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
}

export async function createQuoteCard(value, sourceLabel = "") {
  await document.fonts?.ready;
  const width = 1080;
  const height = 1350;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  context.fillStyle = "#eeece7";
  context.fillRect(0, 0, width, height);

  const card = { x: 58, y: 58, width: 964, height: 1234, radius: 54 };
  context.save();
  context.shadowColor = "rgba(31, 28, 23, .13)";
  context.shadowBlur = 38;
  context.shadowOffsetY = 16;
  roundedRect(context, card.x, card.y, card.width, card.height, card.radius);
  context.fillStyle = "#fffefa";
  context.fill();
  context.restore();

  const padding = 78;
  const textWidth = card.width - padding * 2;
  const availableHeight = 860;

  if (sourceLabel) {
    context.fillStyle = "#888681";
    context.font = "500 22px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    context.letterSpacing = ".4px";
    const sourceLines = wrapCanvasText(context, sourceLabel, textWidth).slice(0, 2);
    sourceLines.forEach((line, index) => context.fillText(line, card.x + padding, card.y + 72 + index * 30));
  }

  let fontSize = 57;
  let lineHeight = 84;
  let lines = [];
  while (fontSize >= 34) {
    context.font = `500 ${fontSize}px ui-serif, Georgia, serif`;
    lines = wrapCanvasText(context, value, textWidth);
    lineHeight = Math.round(fontSize * 1.46);
    if (lines.length * lineHeight <= availableHeight) break;
    fontSize -= 2;
  }
  const maxLines = Math.floor(availableHeight / lineHeight);
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    let last = lines.at(-1);
    while (last && context.measureText(`${last}…`).width > textWidth) last = last.slice(0, -1).trimEnd();
    lines[lines.length - 1] = `${last}…`;
  }
  context.fillStyle = "#1f1f1d";
  context.textBaseline = "top";
  const textHeight = lines.length * lineHeight;
  let y = card.y + Math.max(padding, (card.height - 180 - textHeight) / 2);
  for (const line of lines) {
    context.fillText(line, card.x + padding, y);
    y += lineHeight;
  }

  context.fillStyle = "#0044BA";
  context.font = "650 25px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  context.letterSpacing = "1.1px";
  const footerY = card.y + card.height - 92;
  context.fillText(SHARE_SIGNATURE, card.x + padding, footerY);
  context.textAlign = "right";
  context.fillText("@vvllsv", card.x + card.width - padding, footerY);
  context.textAlign = "left";

  return new Promise((resolve, reject) => canvas.toBlob(
    blob => blob ? resolve(blob) : reject(new Error("Не удалось подготовить изображение.")),
    "image/png"
  ));
}

async function deliverQuoteCard(blob) {
  const file = new File([blob], "vstrechaya-voynu-bez-tebya.png", { type: "image/png" });
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return "shared";
    } catch (error) {
      if (error?.name === "AbortError") throw error;
    }
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return "downloaded";
}

function shareGlyph() {
  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("aria-hidden", "true");
  icon.innerHTML = '<path d="M12 3v12m0-12 4 4m-4-4L8 7M5 11v8h14v-8"/>';
  return icon;
}

function createShareLoader() {
  const loader = element("div", "share-loader");
  loader.hidden = true;
  loader.setAttribute("role", "status");
  loader.setAttribute("aria-live", "polite");
  loader.append(element("span", "share-loader-label", "Готовим картинку"), element("span", "share-loader-track"));
  document.body.append(loader);
  return loader;
}

function installMetadataDock(root, content) {
  const dock = element("aside", "metadata-dock");
  dock.hidden = true;
  dock.setAttribute("aria-live", "polite");
  dock.setAttribute("aria-label", "Сведения об источнике");
  const label = element("span", "metadata-text");
  const shareButton = element("button", "metadata-share");
  shareButton.type = "button";
  shareButton.setAttribute("aria-label", "Поделиться абзацем");
  shareButton.append(shareGlyph());
  dock.append(label, shareButton);
  root.append(dock);
  const loader = createShareLoader();

  let active = null;
  let pinned = false;
  let pulseTimer = 0;
  let hideTimer = 0;
  const prefersTouch = () => matchMedia("(hover: none), (pointer: coarse)").matches;

  const hide = () => {
    clearTimeout(hideTimer);
    dock.hidden = true;
    label.textContent = "";
    active = null;
    pinned = false;
  };
  const show = (card, options = {}) => {
    const metadata = card.dataset.metadata;
    if (!metadata) return;
    clearTimeout(hideTimer);
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

  dock.addEventListener("pointerenter", () => clearTimeout(hideTimer));
  dock.addEventListener("pointerleave", () => {
    if (!prefersTouch() && !pinned) hideTimer = setTimeout(hide, 100);
  });
  shareButton.addEventListener("click", async event => {
    event.preventDefault();
    event.stopPropagation();
    if (!active) return;
    const clearAfterShare = !prefersTouch();
    shareButton.disabled = true;
    loader.hidden = false;
    try {
      const blob = await createQuoteCard(active.querySelector(".fragment-text")?.textContent || "", active.dataset.shareSource || "");
      loader.hidden = true;
      await deliverQuoteCard(blob);
    } catch (error) {
      if (error?.name !== "AbortError") alert(error?.message || "Не удалось поделиться изображением.");
    } finally {
      loader.hidden = true;
      shareButton.disabled = false;
      if (clearAfterShare) hide();
    }
  });

  content.querySelectorAll(".letter-fragment[data-metadata]").forEach(card => {
    card.addEventListener("pointerenter", () => {
      if (!prefersTouch() && !pinned) show(card);
    });
    card.addEventListener("pointerleave", () => {
      if (!prefersTouch() && !pinned && active === card) hideTimer = setTimeout(hide, 100);
    });
    card.addEventListener("focus", () => {
      if (!prefersTouch() && card.matches(":focus-visible")) show(card);
    });
    card.addEventListener("click", event => {
      event.stopPropagation();
      const touch = prefersTouch();
      if (active === card && !dock.hidden && (touch || pinned)) {
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

function renderSources(sources) {
  if (!sources.length) return null;
  const section = element("section", "publication-sources");
  section.setAttribute("aria-labelledby", "publication-sources-title");
  const heading = element("h2", "sources-title", "Источники");
  heading.id = "publication-sources-title";
  const list = element("ol", "sources-list");
  for (const source of sources) {
    const details = [text(source.title), text(source.author), text(source.year)].filter(Boolean);
    list.append(element("li", "source-item", details.join(" · ")));
  }
  section.append(heading, list);
  return section;
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
  model.blocks.forEach(block => content.append(block.type === "break" ? renderBreak() : block.type === "image" ? renderImage(block) : renderFragment(block)));
  root.append(content);
  const sources = renderSources(model.usedSources);
  if (sources) root.append(sources);
  installMetadataDock(root, content);
  document.title = `${text(model.letter.title) || "Письмо"} — ${projectTitle || "ВВБТ"}`;
  return model;
}

export function letterGridColumns(count) {
  return Math.max(1, Math.min(4, Number(count) || 0));
}

export function renderLetterNavigation(root, session, activeLetter, onSelect) {
  const nav = element("nav", "letter-navigation");
  nav.setAttribute("aria-label", "Доступные письма");
  const toggle = element("button", "letter-navigation-toggle");
  toggle.type = "button";
  toggle.setAttribute("aria-label", `Письмо ${activeLetter.number}. Открыть список писем`);
  toggle.setAttribute("aria-expanded", "false");
  toggle.setAttribute("aria-controls", "letter-navigation-menu");
  const current = element("span", "letter-navigation-current", String(activeLetter.number));
  current.setAttribute("aria-hidden", "true");
  toggle.append(current);

  const menu = element("div", "letter-navigation-menu");
  menu.id = "letter-navigation-menu";
  menu.hidden = true;
  menu.setAttribute("role", "menu");
  menu.style.setProperty("--letter-columns", String(letterGridColumns(session.letters.length)));
  for (const letter of session.letters) {
    const button = element("button", "letter-navigation-item", String(letter.number));
    button.type = "button";
    button.setAttribute("role", "menuitem");
    button.setAttribute("aria-label", `Открыть письмо ${letter.number}`);
    if (letter.slug === activeLetter.slug) {
      button.classList.add("is-current");
      button.setAttribute("aria-current", "page");
    }
    button.addEventListener("click", event => {
      event.stopPropagation();
      closeMenu(false);
      if (letter.slug !== activeLetter.slug) onSelect(letter);
    });
    menu.append(button);
  }

  const closeOnOutside = event => {
    if (!nav.contains(event.target)) closeMenu(false);
  };
  const closeMenu = (restoreFocus = true) => {
    menu.hidden = true;
    nav.classList.remove("is-open");
    toggle.setAttribute("aria-expanded", "false");
    document.removeEventListener("pointerdown", closeOnOutside);
    if (restoreFocus) toggle.focus();
  };
  const openMenu = () => {
    nav.classList.add("is-open");
    menu.hidden = false;
    toggle.setAttribute("aria-expanded", "true");
    requestAnimationFrame(() => menu.querySelector(".is-current")?.focus());
    setTimeout(() => document.addEventListener("pointerdown", closeOnOutside), 0);
  };
  toggle.addEventListener("click", event => {
    event.stopPropagation();
    if (menu.hidden) openMenu(); else closeMenu();
  });
  nav.addEventListener("keydown", event => {
    if (event.key === "Escape" && !menu.hidden) {
      event.preventDefault();
      closeMenu();
    }
  });
  nav.append(toggle, menu);
  root.prepend(nav);
  return nav;
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
