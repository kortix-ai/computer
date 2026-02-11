---
name: kortix-web-research
description: "Lightweight web exploration skill for moderate research tasks. Use when the user needs more than a quick factual lookup but less than a full deep research report. Handles: comparisons ('A vs B'), 'what are the options for X', 'how does X work', 'find examples of Y', technical lookups requiring multiple sources, pros/cons analysis. Returns findings in conversation with inline source links. Do NOT use for: simple factual lookups (use web-search directly) or comprehensive investigations requiring formal cited reports (delegate to @kortix-research)."
---

# Web Research (Lightweight Exploration)

Fast, focused web exploration that synthesizes information from multiple sources without the overhead of deep recursive research. Use this when a single search isn't enough but a full investigation is overkill.

## Workflow

1. **Formulate 2-4 search queries.** Vary:
   - Phrasing (synonyms, technical vs. lay terms)
   - Angle (include at least one alternative/counter perspective)
   - Source type (official docs, comparisons, community discussions)

2. **Batch search:**
   ```
   web-search("query1 ||| query2 ||| query3")
   ```
   Use `search_depth: "basic"` (default). Only escalate to `"advanced"` if basic results are clearly insufficient.

3. **Evaluate results.** Read the Tavily-provided snippets and AI answer first. Only scrape full pages when:
   - The snippet is insufficient to answer the question
   - You need specific details (code examples, configuration, pricing)
   - The source is authoritative and worth reading fully

4. **Scrape selectively** (0-3 pages max):
   ```
   scrape-webpage("url1, url2")
   ```

5. **Synthesize** a concise answer with inline `[Source Title](url)` links.

## Constraints

- **Max 5 web searches** per invocation
- **Max 3 page scrapes** per invocation
- **No recursive deepening** -- one round of search is enough
- **No numbered bibliography** -- inline links are sufficient
- **No file output** -- return findings directly in conversation
- **No formal report structure** -- conversational, focused answer

## Search Strategy

| Query Type | Strategy |
|---|---|
| Comparison ("A vs B") | Search "[A] vs [B]", "[A] alternative to [B]", "[A] review 2025/2026" |
| How-to / Explainer | Search official docs first, then tutorials, then community answers |
| Options / Landscape | Search "best [category] 2025/2026", "[category] comparison", "[specific option] review" |
| Technical lookup | Search official docs `site:docs.example.com`, then Stack Overflow, then blog posts |

## Source Quality

- Prefer official documentation, established publications, .edu/.gov domains
- Note publication date -- flag anything older than 2 years for fast-moving topics
- If sources conflict, briefly note the disagreement rather than picking a side

## Output Format

Write a focused, conversational answer. Integrate source links naturally in the text. End with a Sources section:

```markdown
**Sources:**
- [Source Title](url) -- brief relevance note
- [Source Title](url) -- brief relevance note
```

Keep it concise. The user asked a question, not for a research paper.
