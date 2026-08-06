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

function sourceLine(fragment) {
  const source = fragment.source;
  if (!source || source.citationVisibility === "hidden" || fragment.citationVisibility === "hidden") return "";
  const parts = [source.title, source.author, source.year].map(text).filter(Boolean);
  if (fragment.page) parts.push(`с. ${fragment.page}`);
  return parts.join(" · ");
}

function renderFragment(block) {
  const article = element("article", "letter-fragment");
  const body = element("div", "fragment-text", block.displayText);
  article.append(body);
  const citation = sourceLine(block);
  if (citation) article.append(element("footer", "fragment-source", citation));
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
  document.title = `${text(model.letter.title) || "Письмо"} — ${projectTitle || "ВВБТ"}`;
  return model;
}

export async function loadPublication(url, options = {}) {
  if (!url) throw new Error("Не указан адрес публикации.");
  let parsed;
  try { parsed = new URL(url, window.location.href); } catch { throw new Error("Некорректный адрес публикации."); }
  if (!/^https?:$/.test(parsed.protocol)) throw new Error("Адрес публикации должен использовать HTTPS.");
  const response = await fetch(parsed, { cache: "no-store", signal: options.signal });
  if (!response.ok) throw new Error(`Публикация недоступна (${response.status}).`);
  return validatePublication(await response.json());
}
