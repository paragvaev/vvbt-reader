import { loadPublication, renderLetterNavigation, renderPublication } from "./reader.js";
import { installThemeToggle } from "./theme.js";
import { createAccessClient, resolveAccessToken, resolveShareToken, selectAccessibleLetter } from "./access.js";

const root = document.querySelector("#vvbt-reader");
const query = new URLSearchParams(location.search);
const publicationUrl = query.get("publication") || root.dataset.publicationUrl || "";
const requestedLetter = query.get("letter") || root.dataset.letter || "";
const accessToken = resolveAccessToken(query);
const shareToken = resolveShareToken(query);

installThemeToggle();

function updateVisualViewportInsets() {
  const viewport = window.visualViewport;
  const coveredBottom = viewport
    ? Math.min(56, Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop))
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

async function renderPersonalReader() {
  const apiBase = root.dataset.apiBase || (location.hostname.endsWith("github.io") ? "https://wwy.vlsv.gay" : location.origin);
  const client = createAccessClient(shareToken || accessToken, apiBase, { shared: !!shareToken });
  const session = await client.session();
  const openLetter = async letter => {
    const data = await client.letter(letter.slug);
    renderPublication(root, data);
    if (session.letters.length > 1) renderLetterNavigation(root, session, letter, openLetter);
    const url = new URL(location.href);
    url.searchParams.delete("publication");
    url.searchParams.delete("t");
    url.searchParams.set("letter", letter.slug);
    history.replaceState(null, "", url);
  };
  await openLetter(selectAccessibleLetter(session, requestedLetter));
}

if (shareToken || accessToken) {
  renderPersonalReader().catch(showError);
} else if (!publicationUrl) {
  showError(new Error("Не указан адрес publication.json. Добавьте параметр ?publication=…"));
} else {
  loadPublication(publicationUrl)
    .then(data => renderPublication(root, data, requestedLetter))
    .catch(showError);
}
