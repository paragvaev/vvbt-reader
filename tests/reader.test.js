import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { letterGridColumns, normalizePublicationUrl, orderedBlocks, publicationModel, selectLetter, sourceMetadata, validatePublication } from "../src/reader.js";

const publication = {
  schemaVersion: "1.0",
  project: { title: "ВВБТ" },
  sources: [{ id: "source-1", title: "Источник" }],
  fragments: [
    { id: "fragment-1", sourceId: "source-1", text: "Original", translation: "Перевод" },
    { id: "fragment-2", sourceId: "source-1", text: "Второй" }
  ],
  images: { "image-1": { id: "image-1", src: "https://example.com/image.jpg", caption: "Подпись" } },
  letters: [{
    id: "letter-1",
    slug: "first-letter",
    title: "Первое письмо",
    blocks: [
      { type: "fragment", fragmentId: "fragment-2", position: 3 },
      { type: "image", imageId: "image-1", position: 2 },
      { type: "fragment", fragmentId: "fragment-1", position: 1 }
    ]
  }]
};

test("validates publication and selects a letter by stable slug", () => {
  assert.equal(validatePublication(publication), publication);
  assert.equal(selectLetter(publication, "first-letter").id, "letter-1");
});

test("preserves explicit block order", () => {
  assert.deepEqual(orderedBlocks(publication.letters[0]).map(block => block.position), [1, 2, 3]);
});

test("resolves fragments, translations, sources and remote images", () => {
  const model = publicationModel(publication, "letter-1");
  assert.equal(model.blocks[0].type, "fragment");
  assert.equal(model.blocks[0].displayText, "Перевод");
  assert.equal(model.blocks[0].source.title, "Источник");
  assert.equal(model.blocks[1].src, "https://example.com/image.jpg");
  assert.equal(model.blocks[2].displayText, "Второй");
  assert.deepEqual(model.usedSources.map(source => source.id), ["source-1"]);
});

test("rejects malformed publication data", () => {
  assert.throws(() => validatePublication({}), /нет писем/);
});

test("converts Dropbox shared links to the CORS-enabled content host", () => {
  const url = normalizePublicationUrl(
    "https://www.dropbox.com/scl/fi/file-id/publication.json?rlkey=public-key&raw=1",
    "https://reader.example/"
  );
  assert.equal(url.hostname, "dl.dropboxusercontent.com");
  assert.equal(url.searchParams.get("rlkey"), "public-key");
  assert.equal(url.searchParams.has("raw"), false);
});

test("builds compact source metadata for the contextual dock", () => {
  assert.equal(sourceMetadata({
    source: { title: "Источник", author: "Автор", year: "1942" },
    page: "17"
  }), "Источник · Автор · 1942 · с. 17");
  assert.equal(sourceMetadata({ source: { title: "Скрытый", citationVisibility: "hidden" } }), "");
});

test("letter navigation uses one row through four letters and then a second row", () => {
  assert.equal(letterGridColumns(1), 1);
  assert.equal(letterGridColumns(4), 4);
  assert.equal(letterGridColumns(5), 4);
  assert.equal(letterGridColumns(8), 4);
  const source = fs.readFileSync(new URL("../src/reader.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /element\("select", "letter-navigation-select"\)/);
  assert.match(source, /letter-navigation-item/);
});
