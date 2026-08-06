import { loadPublication, renderPublication } from "./reader.js";

const root = document.querySelector("#vvbt-reader");
const query = new URLSearchParams(location.search);
const publicationUrl = query.get("publication") || root.dataset.publicationUrl || "";
const requestedLetter = query.get("letter") || root.dataset.letter || "";

function updateVisualViewportInsets() {
  const viewport = window.visualViewport;
  const coveredBottom = viewport
    ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
    : 0;
  document.documentElement.style.setProperty("--visual-viewport-bottom", `${coveredBottom}px`);
}

updateVisualViewportInsets();
window.addEventListener("resize", updateVisualViewportInsets, { passive: true });
window.visualViewport?.addEventListener("resize", updateVisualViewportInsets, { passive: true });
window.visualViewport?.addEventListener("scroll", updateVisualViewportInsets, { passive: true });

function showError(error) {
  const box = document.createElement("div");
  box.className = "reader-state reader-error";
  box.textContent = error instanceof Error ? error.message : "Не удалось загрузить письмо.";
  root.replaceChildren(box);
}

if (!publicationUrl) {
  showError(new Error("Не указан адрес publication.json. Добавьте параметр ?publication=…"));
} else {
  loadPublication(publicationUrl)
    .then(data => renderPublication(root, data, requestedLetter))
    .catch(showError);
}
