# Ask Ravenlost

Search the campaign's chapters, Bia's notes, and reference pages. Results link directly to the matching sections.

This is an experimental **section search**, not an AI assistant yet. For questions about first appearances, it lists matching passages in chapter order; it cannot yet distinguish a first encounter from an earlier mention.

<div id="ravenlost-ask">
  <form style="display:flex;gap:.5rem;flex-wrap:wrap;margin:1rem 0">
    <input type="search" aria-label="Ask a Ravenlost question" placeholder="When did we first encounter Henry Loust?" required style="flex:1;min-width:16rem;padding:.6rem;border:1px solid #888;border-radius:.3rem;background:var(--md-default-bg-color);color:var(--md-default-fg-color)">
    <button type="submit" class="md-button md-button--primary">Search</button>
  </form>
  <div data-results role="status" aria-live="polite">Loading the search index…</div>
</div>

<script src="../javascripts/ravenlost-search.js"></script>
