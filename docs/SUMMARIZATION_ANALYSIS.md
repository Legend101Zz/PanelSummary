# Summarization Pipeline — Research vs Our Implementation

> Date: 2026-04-04
> Sources: BooookScore (ICLR 2024), FABLES (COLM 2024), r/LocalLLaMA community, dev.to guide
> Scope: What the research says, what we do, what's right, what's wrong, what to do

---

## The Research Landscape (TL;DR)

There are only two fundamental strategies for summarizing documents that exceed an LLM's working memory:

| Strategy | How it works | Strength | Weakness |
|----------|-------------|----------|----------|
| **Hierarchical Merging** | Summarize chunks independently, then merge summaries upward recursively | Coherent structure, well-organized | Loses detail at each merge level — information literally disappears |
| **Incremental Updating** | Maintain a running summary, update it as you process each new chunk | Retains more detail, captures nuance | Entity/event omissions, coherence degrades, recency bias |

BooookScore (ICLR 2024) tested both on 100 books. Key numbers:
- Hierarchical: BooookScore 91.1 (fewer coherence errors)
- Incremental: BooookScore 90.9 (at 88K chunk size), but **83% of humans preferred it** for detail despite lower coherence
- At 2K chunk size, incremental drops to 78.6 — **chunk size matters enormously**

FABLES (COLM 2024) found something scarier: even the best model (Claude-3-Opus) only produces **90.89% faithful claims**. Nearly 1 in 10 claims is unfaithful — and 50% of unfaithful claims require **indirect reasoning** to detect (you can't just Ctrl+F for a contradiction).

---

## What Our Pipeline Does

```
PDF → Parse chapters → Compress each chapter independently (3000-word cap)
                           → Document Understanding (Knowledge Document)
                           → Manga Story Design (Blueprint: chars + scenes)
                           → Planner (from blueprint + chapters)
                           → DSL panels (from plan + bible)
```

**Our strategy is: Independent chapter compression → deep understanding → story design → generation.**

Each chapter is summarized in isolation (one LLM call per chapter, seeing only that chapter's content, capped at 3000 words). A Document Understanding stage then builds a Knowledge Document from ALL chapter summaries — extracting entities, relationships, data points, and emotional arc. The Manga Story Design stage takes this Knowledge Document and designs the complete story (characters mapped to real entities, specific scenes with dialogue beats). Downstream agents (planner, DSL generator) work from this rich blueprint.

---

## What We're Doing RIGHT

### 1. Chapter-level chunking (not smaller)

Reddit user u/Finguili (who built a novel reverse-outliner) found that **sub-chapter chunks don't work**. The LLM "cannot understand the text on a good enough level" with smaller chunks. Our pipeline processes one chapter at a time — this is the minimum viable unit and it's correct.

> *"Settled approach: include whole summary up to this point, narrative state, whole chapter to summarize. Smaller-than-chapter chunks did not work."*

### 2. Canonical summaries as a single source of truth

Our `CanonicalChapterSummary` is a structured JSON (one_liner, key_concepts, narrative_summary, dramatic_moment, metaphor). Everything downstream derives from this — manga bible, planner, DSL generator, reels. This is good architecture: summarize once, reuse everywhere.

The dev.to article emphasizes this exact pattern: "You need middleware handling chunk logic, prompt management, multi-call orchestration, and output combination."

### 3. Structured extraction, not free-form prose

We extract structured fields (one_liner, key_concepts, dramatic_moment, metaphor) rather than asking for a blob of text. This forces the LLM to make explicit decisions about what matters. The dev.to article calls this "prompt templates" and recommends it for production systems.

### 4. Synopsis creates narrative arc awareness

The synopsis agent (book_thesis, core_conflict, narrative_arc, act_one/two/three) gives downstream agents awareness of where each chapter sits in the overall story. Without this, each chapter's manga panels would be drawn in isolation — the architecture document correctly identifies this.

### 5. Separate cost tracking and budget enforcement

Credit tracking with cancel support is a production concern that none of the research papers address. Having it is good engineering.

---

## What We're Doing WRONG

### PROBLEM 1: Each chapter is summarized in total isolation (no accumulated context)

**This is the single biggest research-backed problem in our pipeline.**

Our `celery_worker.py` processes chapters in a loop:
```python
for i, chapter in enumerate(all_chapters):
    result = await llm.chat_with_retry(
        system_prompt=get_canonical_summary_prompt(summary_style),
        user_message=format_chapter_for_llm(chapter_dict),
    )
```

Each chapter sees ONLY its own content. The LLM summarizing chapter 8 has zero context about chapters 1-7. It doesn't know who the characters are, what happened before, or what the book's arc is.

**What the research says:**

BooookScore found that **incremental updating** (maintaining a running summary) retains more detail. The hybrid approach — carry forward a compressed context — is what practitioners converge on:

> u/adcimagery: *"Chapters 1-3 summarized, character sheets + key locations/items/plot points created. Feed summary + reference material forward into fresh context with chapters 4-6."*

> u/Finguili: *"Include (1) whole summary up to this point, (2) narrative state the LLM maintains, (3) whole chapter to summarize."*

**Why it matters for us:** When chapter 5 references a concept introduced in chapter 2, our LLM doesn't know about it. It might:
- Omit the reference entirely (entity omission — the #1 coherence error at 7.3%)
- Hallucinate a wrong explanation
- Produce a summary that doesn't connect to the book's arc

**For manga specifically**, this means the planner builds panels from disconnected summaries. Character arcs can't flow. Callbacks to earlier chapters don't register. The "aha moment" of chapter 8 that depends on the setup from chapter 3 gets flattened.

### PROBLEM 2: 3000-word truncation silently drops content

```python
def format_chapter_for_llm(chapter: dict, max_words: int = 3000) -> str:
    words = content.split()
    if len(words) > max_words:
        content = " ".join(words[:max_words])
        content += "\n\n[Content truncated at {max_words} words for summarization]"
```

This hard-truncates at 3000 words from the front. For a 6000-word chapter, the entire second half is silently dropped. This is catastrophic because:

1. **Chapters typically build to their conclusion.** The "dramatic_moment" and key insight are usually in the second half. Truncating from the front means we lose the most important part.
2. **BooookScore found recency bias is already a problem** — models over-emphasize endings. But our truncation creates the opposite: a forced bias toward beginnings.
3. **FABLES found 52-84.6% of summaries have significant omissions.** We're making this worse by literally not showing the LLM the full content.

**What to do:**
- Use the model's actual context window. Most models today can handle 32K-128K tokens. A 6000-word chapter is ~8K tokens — well within limits.
- If truncation is truly needed (for cost), truncate from the middle (keep beginning + end) or use the embedding+clustering approach from the dev.to article to select the most diverse/important passages.

### PROBLEM 3: No narrative state tracking

The research consistently points to maintaining a **narrative state** alongside the running summary:

> u/adcimagery: *"Character sheets + key locations/items/plot points created. Feed summary + reference material forward."*

> u/Finguili: *"Narrative state the LLM maintains"*

Our pipeline has nothing like this. The manga bible creates characters, but only AFTER all chapters are compressed. The characters are invented from already-lossy summaries, not tracked through the actual text.

**What a narrative state would look like:**
```json
{
  "characters_introduced": [
    {"name": "Dr. Aiko", "first_seen": "ch2", "role": "researcher", "last_known_state": "discovered the anomaly"}
  ],
  "key_terms": {"consciousness": "defined in ch1 as...", "the experiment": "first mentioned ch3..."},
  "unresolved_threads": ["Will the board approve the study?", "What happened to Subject 7?"],
  "emotional_tone_progression": ["curious → worried → determined"]
}
```

This state would be updated after each chapter summary and passed forward to the next chapter's summarization call. It solves the entity omission problem (the LLM knows who "Dr. Aiko" is when she reappears in chapter 8) without needing the full text of all previous chapters.

### PROBLEM 4: No deduplication of semantically similar content

The dev.to article's most advanced technique is **embeddings + clustering** before summarization:

> *"Books contain repeated ideas phrased differently. Blindly chunking sends multiple semantically similar chunks to the LLM, producing near-identical summaries and wasting money."*

Our pipeline sends every chapter through the same summarization prompt regardless of how much overlap exists. Non-fiction books frequently restate core arguments across chapters. This means:
- Multiple canonical summaries say essentially the same thing
- The planner creates redundant panels for the same concept
- Token spend is wasted on duplicate content

This is less of an issue for fiction but significant for non-fiction (our primary use case given the "book summary" framing).

### PROBLEM 5: Synopsis is built from lossy summaries, not original text

The synopsis agent receives `format_all_summaries_for_synopsis()` which is:
```
CHAPTER 0 — Title:
  One-liner: ...
  Key concepts: ...
  Summary: [first 300 chars of narrative_summary]
```

This is a summary of a summary of a (possibly truncated) chapter. By this point, we're 2-3 compression levels deep. The synopsis is working from ~300 characters per chapter — roughly one tweet per chapter.

BooookScore's key finding: **hierarchical merging loses detail at each level.** Our pipeline has three merging levels (truncation → canonical summary → synopsis), and the synopsis level is extremely aggressive (300 chars).

---

## What To Do — Prioritized Recommendations

### P0: Add accumulated context to chapter summarization

**Effort: Low | Impact: High (addresses Problem 1)**

Change the chapter compression loop from independent calls to a chain where each chapter receives context from previous chapters:

```python
running_context = ""  # accumulated so far

for i, chapter in enumerate(all_chapters):
    user_message = f"""CONTEXT FROM PREVIOUS CHAPTERS:
{running_context}

CHAPTER TO SUMMARIZE:
{format_chapter_for_llm(chapter_dict)}"""

    result = await llm.chat_with_retry(...)
    canonical = parse_result(result)
    canonical_chapters.append(canonical)

    # Update running context (compact form)
    running_context += f"\nCh{i} ({canonical['chapter_title']}): {canonical['one_liner']}. Key: {', '.join(canonical['key_concepts'][:3])}\n"
```

This costs ~200-500 extra tokens per chapter (the running context grows linearly) but gives each chapter awareness of what came before. The LLM summarizing chapter 8 now knows the characters, concepts, and arc from chapters 1-7.

**Cost increase:** For a 10-chapter book, roughly 2.5K extra input tokens total (~$0.002). Negligible.

**Quality increase:** Directly addresses entity omission (7.3%), event omission (4.3%), and causal omission (2.8%) — the top 3 coherence errors from BooookScore.

### P1: Remove the 3000-word truncation (or fix it)

**Effort: Very Low | Impact: High (addresses Problem 2)**

Most models used (Gemini Flash, Qwen, Claude) have 128K+ context windows. A 6000-word chapter is ~8K tokens — well within limits.

```python
def format_chapter_for_llm(chapter: dict, max_words: int = 8000) -> str:
```

If cost is a concern, truncate from the middle rather than the end:
```python
if len(words) > max_words:
    half = max_words // 2
    content = " ".join(words[:half]) + "\n\n[...middle section omitted...]\n\n" + " ".join(words[-half:])
```

This preserves the introduction AND the conclusion — the two most important parts of any chapter.

### P2: Add narrative state tracking

**Effort: Medium | Impact: High (addresses Problem 3)**

After each chapter summary, ask the LLM to also update a narrative state object. This can be done within the same call by extending the output schema:

```json
{
  "chapter_title": "...",
  "one_liner": "...",
  "key_concepts": [...],
  "narrative_summary": "...",
  // existing fields above, new field below:
  "narrative_state_update": {
    "new_characters": [{"name": "...", "role": "..."}],
    "new_terms": [{"term": "...", "definition": "..."}],
    "resolved_threads": ["..."],
    "new_threads": ["..."],
    "emotional_shift": "..."
  }
}
```

The accumulated narrative state is then passed to the next chapter (as part of P0's running context) and to the synopsis/bible agents (so they work from tracked facts, not guesses).

**This directly addresses the practitioner consensus.** Both u/Finguili and u/adcimagery independently converged on "narrative state + running summary + current chapter" as the winning formula.

### P3: Give synopsis agent the full canonical summaries

**Effort: Very Low | Impact: Medium (addresses Problem 5)**

`format_all_summaries_for_synopsis()` truncates `narrative_summary` to 300 characters. The synopsis agent is making book-level decisions from tweet-length inputs.

Fix: pass the full `narrative_summary` (100-300 words as generated). This adds ~2-3K tokens to one call. The synopsis quality improvement is direct — it actually has material to synthesize.

```python
def format_all_summaries_for_synopsis(canonical_chapters: list[dict]) -> str:
    sections = []
    for ch in canonical_chapters:
        concepts = ", ".join(ch.get('key_concepts', []))
        sections.append(
            f"CHAPTER {ch.get('chapter_index', 0)} — {ch.get('chapter_title', 'Unknown')}:\n"
            f"  One-liner: {ch.get('one_liner', '')}\n"
            f"  Key concepts: {concepts}\n"
            f"  Dramatic moment: {ch.get('dramatic_moment', '')}\n"
            f"  Summary: {ch.get('narrative_summary', '')}"  # FULL summary, not truncated
        )
    return "\n\n".join(sections)
```

### P4: Consider embedding-based deduplication for non-fiction

**Effort: Medium-High | Impact: Medium (addresses Problem 4)**

For non-fiction books that restate arguments across chapters:
1. After chapter compression, embed each canonical summary
2. Cluster similar summaries
3. In the planner, merge/collapse chapters that cover the same ground
4. Produce fewer, denser panels instead of redundant ones

This is the dev.to article's most advanced technique and is most valuable for non-fiction self-help/business books where chapter 3 and chapter 7 might make the same point in different contexts.

**For fiction**, this is less important — chapters rarely duplicate.

### P5: Evaluate summary quality with BooookScore-lite

**Effort: Medium | Impact: Meta (addresses future quality tracking)**

BooookScore provides a concrete metric: "proportion of sentences without coherence errors." We could implement a lightweight version:

1. After generating all canonical summaries, pick a random sample (3-5 sentences per chapter)
2. Ask the LLM: "Is this sentence coherent given the surrounding context? Does it reference entities/events that were properly introduced?"
3. Track the score over time as we change the pipeline

This gives us a number to optimize against instead of guessing.

---

## Summary Table

| Issue | Research Basis | Our Current State | Fix | Effort |
|-------|---------------|-------------------|-----|--------|
| No accumulated context | BooookScore, Reddit consensus | Each chapter summarized in isolation | P0: Pass running context forward | Low |
| Content truncation | FABLES (omission rates) | Hard 3000-word front-cut | P1: Raise limit or middle-truncate | Very Low |
| No narrative state | Practitioner consensus | Characters invented after the fact | P2: Track characters/terms/threads | Medium |
| Synopsis from lossy summaries | BooookScore (hierarchical merge loss) | 300 chars per chapter to synopsis | P3: Pass full summaries | Very Low |
| No deduplication | Dev.to (embedding+clustering) | Every chapter processed identically | P4: Cluster before planning | Medium-High |
| No quality metric | BooookScore, FABLES | No measurement at all | P5: BooookScore-lite | Medium |

**P0 + P1 + P3 together cost almost nothing extra in tokens but address the 3 biggest quality gaps identified by the research. They should be implemented together as one change.**
