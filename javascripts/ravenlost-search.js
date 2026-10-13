
/* Ask Ravenlost: section-level search using MkDocs' built-in index. */

(() => {
  const STOP_WORDS = new Set([
    "a", "an", "and", "are", "at", "be", "did", "do",
    "does", "for", "from", "how", "i", "in", "is",
    "it", "me", "of", "on", "our", "us", "the", "to",
    "was", "we", "were", "what", "when", "where",
    "who", "with", "first", "earliest", "initially",
    "originally", "encounter", "encountered", "meet",
    "met", "travel", "traveled", "travelled",
    "arrive", "arrived", "visit", "visited",
    "go", "went"
  ]);

  // Words that can describe a job, task, or assignment.
  const TASK_TERMS = [
    "task",
    "job",
    "assignment",
    "mission",
    "work",
    "asked",
    "wanted",
    "recover",
    "retrieve",
    "search"
  ];

  const normalize = value => String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

    /**
     * Checks whether a complete word or phrase appears in text.
     *
     * @param {string} text Normalized text.
     * @param {string} term Normalized word or phrase.
     * @returns {boolean} Whether the term is present.
     */
    function containsTerm(text, term) {
      return (` ${text} `).includes(` ${term} `);
    }

  const escapeHtml = value =>
    String(value).replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);

  /**
   * Converts indexed HTML to plain text while
   * preserving paragraph and block boundaries.
   *
   * @param {string} html HTML from the MkDocs search index.
   * @returns {string} Plain text with paragraph breaks.
   */
  function plainText(html) {
    const node = document.createElement("div");
    node.innerHTML = html || "";

    // Insert paragraph breaks after block-level elements.
    node.querySelectorAll(
      "p, li, h1, h2, h3, h4, h5, h6, tr, blockquote"
    ).forEach(element => {
      element.appendChild(
        document.createTextNode("\n\n")
      );
    });

    return (node.textContent || "")
      .replace(/[ \t]+/g, " ")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
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
          .map(word =>
            /^(hire|hired|hires|hiring)$/.test(word)
              ? "hir"
              : word
          )
      )
    ];
  }

  /**
   * Extracts phrases while preserving connecting words
   * inside names and locations.
   *
   * @param {string} query User's search question.
   * @returns {string[]} Candidate phrases.
   */
  function phrases(query) {
    const words = normalize(query).split(" ");

    const connectors = new Set([
      "of", "on", "the", "at", "in"
    ]);

    const results = [];
    let current = [];

    for (const word of words) {
      if (!STOP_WORDS.has(word) || connectors.has(word)) {
        current.push(word);
      } else {
        if (current.length >= 2) {
          results.push(current.join(" "));
        }

        current = [];
      }
    }

    if (current.length >= 2) {
      results.push(current.join(" "));
    }

    return results;
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

    // Treat an unspecified "where did we meet" question
    // as a request for the earliest documented meeting.
    if (
      /\bwhere\b/.test(q) &&
      /\b(meet|met|encounter|encountered)\b/.test(q)
    ) {
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

  /**
   * Identifies questions about jobs or assignments.
   *
   * @param {string} query User's question.
   * @returns {boolean} Whether the question concerns a task.
   */
  function isTaskQuestion(query) {
    return /\b(hire|hired|hires|hiring|task|job|assignment|mission)\b/
      .test(normalize(query));
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
  function extractAnswer(text, terms, taskQuestion = false) {
    const sentences = text.match(
        /[^.!?]+(?:[.!?]+|$)/g
    ) || [text];

    const ranked = sentences
      .map((sentence, index) => {
        const normalized = normalize(sentence);

        const matches = terms.filter(term =>
            normalized.includes(term)
        );

        const taskMatches = taskQuestion
          ? TASK_TERMS.filter(term =>
              containsTerm(normalized, term)
            )
          : [];

        const objectiveMatches = taskQuestion
          ? ["recover", "retrieve", "search", "find", "locate"]
              .filter(term => containsTerm(normalized, term))
          : [];

        return {
          sentence: sentence.trim(),
          matches:
            matches.length +
            taskMatches.length * 2 +
            objectiveMatches.length * 5,
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

  /**
   * Scores paragraphs based on how closely they match
   * the user's search terms.
   *
   * @param {string} text Full section text.
   * @param {string[]} terms Search terms.
   * @returns {object} Best passage and its score.
   */
  function scorePassages(text, terms) {
    const passages = text
      .split(/\n\s*\n/)
      .map(passage => passage.trim())
      .filter(Boolean);

    let best = {
      passage: "",
      score: 0,
      matchedTerms: 0
    };

    for (let i = 0; i < passages.length; i++) {
      // Consider the current paragraph and its neighbors.
      const passage = passages
        .slice(
          Math.max(0, i - 1),
          Math.min(passages.length, i + 2)
        )
        .join("\n\n");

      const normalized = normalize(passage);

      const matched = terms.filter(term =>
        normalized.includes(term)
      );

      if (!matched.length) {
        continue;
      }

      // Reward passages containing more search terms.
      let score = matched.length * 3;

      // Bonus when all search terms appear together.
      if (matched.length === terms.length) {
        score += 10;
      }

      // Prefer shorter, more focused passages.
      score += Math.max(
        0,
        5 - Math.floor(passage.length / 200)
      );

      if (score > best.score) {
        best = {
          passage,
          score,
          matchedTerms: matched.length
        };
      }
    }

    return best;
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
    const searchPhrases = phrases(query);

    if (!terms.length) {
      return [];
    }

    const intent = detectIntent(query);
    const chronological = intent === "first";
    const taskQuestion = isTaskQuestion(query);

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

        const searchableText = text.replace(
          /\b(hire|hired|hires|hiring)\b/g,
          "hir"
        );

        // For task questions, allow task-related vocabulary
        // to stand in for "hire" and its variations.
        const requiredTerms = taskQuestion
          ? terms.filter(term => term !== "hir")
          : terms;

        const matched = requiredTerms.filter(term =>
          containsTerm(title, term) ||
          containsTerm(searchableText, term)
        );

        const hasTaskContext = !taskQuestion ||
          TASK_TERMS.some(term => containsTerm(text, term));

        if (
          record.chapter === 1 &&
          record.title === "The Black Lantern Inn"
        ) {
          console.table(
            terms.map(term => ({
              term,
              inTitle: title.includes(term),
              inText: searchableText.includes(term)
            }))
          );
        }

        if (
          matched.length !== requiredTerms.length ||
          !hasTaskContext
        ) {
          return null;
        }

        let score = terms.reduce(
          (sum, term) =>
            sum +
            (containsTerm(title, term) ? 4 : 0) +
            (containsTerm(searchableText, term) ? 1 : 0),
          0
        );

        // Reward sections containing task-related vocabulary.
        if (taskQuestion) {
          const taskMatches = TASK_TERMS.filter(term =>
            new RegExp(`\\b${term}\\b`).test(text)
          );

          score += Math.min(taskMatches.length, 3) * 3;
        }

        // Reward complete phrases appearing together.
        for (const phrase of searchPhrases) {
          if (title.includes(phrase)) {
            score += 8;
          }

          if (text.includes(phrase)) {
            score += 6;
          }
        }

        // Favor passages describing an introduction
        // rather than a later encounter.
        if (encounterQuestion) {
          if (/\b(introduced|introduced himself|introduced herself)\b/.test(text)) {
            score += 10;
          } else if (/\b(greeted|met|encountered)\b/.test(text)) {
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

        // Find the paragraph containing the strongest
        // concentration of search terms.
        const bestPassage = scorePassages(
          record.text,
          terms
        );

        // Use passage relevance as an additional ranking signal.
        score += bestPassage.score;

        return {
          ...record,
          score,
          bestPassage: bestPassage.passage,
          excerpt: snippet(
            bestPassage.passage || record.text,
            terms
          )
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        if (chronological) {
          return (
            a.chapter - b.chapter ||
            sourceRank(a) - sourceRank(b) ||
            b.score - a.score ||
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

        // For task questions, prioritize chapter narration.
        if (taskQuestion) {
          return (
            sourceRank(a) - sourceRank(b) ||
            a.chapter - b.chapter ||
            b.score - a.score ||
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
        isTaskQuestion(query)
          ? bestMatch.text
          : (bestMatch.bestPassage || bestMatch.text),
        tokens(query),
        isTaskQuestion(query)
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
