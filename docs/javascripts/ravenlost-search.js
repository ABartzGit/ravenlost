
/* Ask Ravenlost: section-level search using MkDocs' built-in index. */

(() => {
  const STOP_WORDS = new Set([
    "a", "an", "and", "are", "at", "be", "did", "do",
    "does", "for", "from", "how", "i", "in", "is",
    "it", "me", "of", "on", "our", "the", "to",
    "was", "we", "were", "what", "when", "where",
    "who", "with", "first", "earliest", "initially",
    "originally", "encounter", "encountered", "meet",
    "met", "travel", "traveled", "travelled",
    "arrive", "arrived", "visit", "visited",
    "go", "went"
  ]);

  const normalize = value => String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  const escapeHtml = value =>
    String(value).replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);

  function plainText(html) {
    const node = document.createElement("div");
    node.innerHTML = html || "";

    return (node.textContent || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function tokens(query) {
    return [
      ...new Set(
        normalize(query)
          .split(" ")
          .filter(word =>
            word && !STOP_WORDS.has(word)
          )
      )
    ];
  }

  /**
   * Identifies the type of question being asked.
   *
   * @param {string} query User's search question.
   * @returns {string} Question intent.
   */
  function detectIntent(query) {
    const q = normalize(query);

    if (/\b(first|earliest|initially|originally)\b/.test(q)) {
      return "first";
    }

    if (/\b(where|location)\b/.test(q)) {
      return "location";
    }

    if (
      /\b(when)\b/.test(q) &&
      /\b(travel|traveled|travelled|arrive|arrived|visit|visited|go|went)\b/.test(q)
    ) {
      return "event";
    }

    if (/\b(what|who|tell me about)\b/.test(q)) {
      return "general";
    }

    return "keyword";
  }

  function chapterNumber(location) {
    const match = location.match(
      /(?:chapters|notes)\/chapter0*(\d+)\//i
    );

    return match
      ? Number(match[1])
      : Number.POSITIVE_INFINITY;
  }

  function snippet(text, terms) {
    const normalizedText = text.toLowerCase();

    const matches = terms
      .map(term => normalizedText.indexOf(term))
      .filter(index => index >= 0);

    const start = matches.length
      ? Math.max(0, Math.min(...matches) - 85)
      : 0;

    const end = Math.min(
      text.length,
      start + 240
    );

    return (
      (start ? "…" : "") +
      text.slice(start, end).trim() +
      (end < text.length ? "…" : "")
    );
  }

    /**
     * Extracts a relevant sentence from a matching section.
     *
     * This is a heuristic, not an AI-generated answer.
     *
     * @param {string} text Full section text.
     * @param {string[]} terms Search terms.
     * @returns {string} Relevant sentence or short excerpt.
     */
    function extractAnswer(text, terms) {
    const sentences = text.match(
        /[^.!?]+(?:[.!?]+|$)/g
    ) || [text];

    const ranked = sentences
        .map((sentence, index) => {
        const normalized = normalize(sentence);

        const matches = terms.filter(term =>
            normalized.includes(term)
        );

        return {
            sentence: sentence.trim(),
            matches: matches.length,
            index
        };
        })
        .filter(item => item.matches > 0)
        .sort((a, b) =>
        b.matches - a.matches ||
        a.index - b.index
        );

    if (!ranked.length) {
      return snippet(text, terms);
    }

    const best = ranked[0];

    // Include the preceding sentence for context,
    // and the following sentence if available.
    const start = Math.max(0, best.index - 1);
    const end = Math.min(sentences.length, best.index + 2);

    return sentences
      .slice(start, end)
      .map(sentence => sentence.trim())
      .join(" ");
    }
    
  function buildRecords(docs) {
    return docs
      .map((doc, position) => ({
        title: plainText(doc.title),
        text: plainText(doc.text),
        location: doc.location,
        chapter: chapterNumber(doc.location),
        position
      }))
      .filter(doc =>
        doc.location && doc.text
      );
  }

  function search(records, query) {
    const terms = tokens(query);

    if (!terms.length) {
      return [];
    }

    const intent = detectIntent(query);
    const chronological = intent === "first";

    const encounterQuestion =
      /\b(meet|met|encounter|encountered)\b/i.test(query);

    const sourceRank = record => {
      if (record.location.startsWith("chapters/")) {
        return 0;
      }
      if (record.location.startsWith("notes/")) {
        return 1;
      }
      return 2;
    };

    return records
      .map(record => {
        const title = normalize(record.title);
        const text = normalize(record.text);

        const matched = terms.filter(term =>
          title.includes(term) ||
          text.includes(term)
        );

        if (matched.length !== terms.length) {
          return null;
        }

        let score = terms.reduce(
          (sum, term) =>
            sum +
            (title.includes(term) ? 4 : 0) +
            (text.includes(term) ? 1 : 0),
          0
        );

        // For encounter questions, favor descriptions of
        // introductions or meetings.
        if (encounterQuestion) {
          if (
            /\b(introduced|greeted|met|encountered)\b/.test(text)
          ) {
            score += 3;
          }
        }

        // For travel questions, favor passages describing
        // movement rather than reference summaries.
        if (intent === "event") {
          if (
            /\b(arrived|traveled|travelled|entered|reached|visited|went)\b/.test(text)
          ) {
            score += 3;
          }
        }

        return {
          ...record,
          score,
          excerpt: snippet(record.text, terms)
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        if (chronological) {
          return (
            a.chapter - b.chapter ||
            sourceRank(a) - sourceRank(b) ||
            a.position - b.position
          );
        }

        if (intent === "event" || encounterQuestion) {
          return (
            sourceRank(a) - sourceRank(b) ||
            b.score - a.score ||
            a.chapter - b.chapter ||
            a.position - b.position
          );
        }

        return (
          b.score - a.score ||
          a.position - b.position
        );
      });
  }

  async function init() {
    const root =
      document.getElementById("ravenlost-ask");

    if (!root) {
      return;
    }

    const form = root.querySelector("form");
    const input = root.querySelector("input");

    const results =
      root.querySelector("[data-results]");

    const basePath =
      location.pathname.includes("/ravenlost/")
        ? "/ravenlost/"
        : "/";

    const indexUrl = new URL(
      `${basePath}search/search_index.json`,
      location.origin
    );

    let records;

    try {
      const response = await fetch(indexUrl);

      if (!response.ok) {
        throw new Error(
          `HTTP ${response.status}`
        );
      }

      const data = await response.json();

      records = buildRecords(
        data.docs || []
      );
    } catch (error) {
      results.textContent =
        `Could not load the search index: ${error.message}`;

      return;
    }

    results.textContent =
      `Ready to search ${records.length} indexed sections.`;

    form.addEventListener("submit", event => {
      event.preventDefault();

      const query = input.value.trim();

      if (!query) {
        return;
      }

      const matches = search(records, query);

      if (!matches.length) {
        results.textContent =
          "No matching sections found. " +
          "Try a shorter search, such as 'Henry Loust'.";

        return;
      }

      const chronological =
        /\b(first|earliest|initially|originally)\b/i
          .test(query);

      const countText =
        `${matches.length} matching sections` +
        (chronological
          ? " — earliest chapters first."
          : ".");

      const items = matches
        .slice(0, 30)
        .map(match => {
          const url = new URL(
            match.location,
            new URL(basePath, location.origin)
          );

          const chapter =
            Number.isFinite(match.chapter)
              ? `Chapter ${match.chapter} · `
              : "";

          return `
            <li>
              <a href="${escapeHtml(url.href)}">
                ${escapeHtml(chapter + match.title)}
              </a>
              <p>${escapeHtml(match.excerpt)}</p>
            </li>
          `;
        })
        .join("");

      const bestMatch = matches[0];

      const answer = extractAnswer(
        bestMatch.text,
        tokens(query)
      );

      const answerUrl = new URL(
        bestMatch.location,
        new URL(basePath, location.origin)
      );

      const additionalCount = Math.max(0, matches.length - 1);

      const additionalResults = matches
        .slice(1)
        .map(match => {
          const url = new URL(
            match.location,
            new URL(basePath, location.origin)
          );

          const chapter =
            Number.isFinite(match.chapter)
              ? `Chapter ${match.chapter}`
              : "Reference";

          const sourceType =
            match.location.startsWith("notes/")
              ? "Bia's notes"
              : match.location.startsWith("chapters/")
                ? "Chapter narration"
                : "Reference";

          return `
            <li>
              <a href="${escapeHtml(url.href)}">
                ${escapeHtml(match.title)}
              </a>
              <span class="ravenlost-result-meta">
                ${escapeHtml(sourceType)} · ${escapeHtml(chapter)}
              </span>
              <p>${escapeHtml(match.excerpt)}</p>
            </li>
          `;
        })
        .join("");

      const bestChapter =
        Number.isFinite(bestMatch.chapter)
          ? `Chapter ${bestMatch.chapter}`
          : "Reference";

      const bestSource =
        bestMatch.location.startsWith("notes/")
          ? "Bia's notes"
          : bestMatch.location.startsWith("chapters/")
            ? "Chapter narration"
            : "Reference";

      results.innerHTML = `
        <div class="ravenlost-answer">
          <div class="ravenlost-answer-header">
            <h3>Best matching passage</h3>
            <span class="ravenlost-answer-badge">
              ${escapeHtml(bestChapter)}
            </span>
          </div>

          <p class="ravenlost-answer-text">
            ${escapeHtml(answer)}
          </p>

          <p class="ravenlost-answer-source">
            ${escapeHtml(bestSource)} ·
            <a href="${escapeHtml(answerUrl.href)}">
              ${escapeHtml(bestMatch.title)} →
            </a>
          </p>
        </div>

        ${
          additionalCount > 0
            ? `
              <details class="ravenlost-more-results">
                <summary>
                  View ${additionalCount} additional matching sections
                </summary>
                <ol>
                  ${additionalResults}
                </ol>
              </details>
            `
            : ""
        }
      `;
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      init
    );
  } else {
    init();
  }
})();
