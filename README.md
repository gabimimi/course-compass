# Course Compass

A behaviorally aware AI academic-planning assistant for MIT students, built around four workflows for Course 6 majors:

1. **Requirement Matching** — "Does 6.1010 satisfy a CI-M for 6-3?"
2. **Degree Progress** — log completed classes, see what's left, and get candidate courses for each open requirement.
3. **Topic-Based Course Discovery** — "what classes teach distributed systems?" + similar-class recommendations via semantic search.
4. **Schedule Planning** — pick candidate classes, see them on a weekly grid with conflict detection.

The differentiator is the **behavioral classifier**: every question is routed to one of four lanes — `factual`, `opinion`, `personal_high_stakes`, `off_topic` — and the UI surfaces this routing so users always know whether they're getting a grounded answer, a deflection to evaluation resources, or an advisor redirect.

## Stack

- **Next.js 15** (App Router) + TypeScript + Tailwind v4
- **Anthropic Claude** (`claude-haiku-4-5` by default) for classification and answer generation
- **transformers.js** (`Xenova/all-MiniLM-L6-v2`, 384-dim) for local embeddings — no embedding API key required
- **FireRoad API** (https://fireroad.mit.edu) as the official MIT subject data source
- **Local JSON** index instead of a database (the corpus is small enough)
- **localStorage** for completed-courses and selected-schedule state (no auth in MVP)

## Setup

```bash
nvm use 22   # any Node 20+ should work
npm install
cp .env.local.example .env.local
# Edit .env.local and set ANTHROPIC_API_KEY=sk-ant-...

# One-time data build (≈30s):
npm run build:data        # fetch courses + compute embeddings

# Dev:
npm run dev
```

Open http://localhost:3000.

## Project layout

```
src/
  app/
    page.tsx                # Chat (home)
    progress/page.tsx       # Degree progress
    schedule/page.tsx       # Weekly grid
    api/
      chat/route.ts         # POST /api/chat   - classify + answer
      courses/route.ts      # GET  /api/courses - search
      progress/route.ts     # POST /api/progress - evaluate major
  components/
    AppShell.tsx            # layout shell + navigation
    chat/                   # CategoryBadge, Citations, MajorPicker
    progress/               # CourseSearch, RequirementTree
    schedule/               # WeekGrid (conflict detection)
  lib/
    data/                   # types + server-side store (loads JSON)
    llm/                    # Anthropic client, classifier, answer
    rag/                    # embedder, retrieve (semantic + filters)
    requirements/           # requirement DSL types, engine, all 7 majors
    userState.ts            # localStorage hook for major + completed courses

scripts/
  fetch-courses.ts          # FireRoad → data/build/courses.json
  build-embeddings.ts       # → data/build/embeddings.json

data/
  build/                    # Generated; don't edit by hand
```

## Behavioral design (the important part)

Every user message goes through a small classifier turn (`src/lib/llm/classifier.ts`) that returns one of:

| Category | UI treatment | Source of answer |
| --- | --- | --- |
| `factual` | green badge "Grounded answer" | RAG over course corpus, with course-id citations |
| `opinion` | amber badge | Static deflection that links out to OpenGrades and subject evaluations |
| `personal_high_stakes` | violet badge | Static empathetic redirect to academic advisor / S^3 |
| `off_topic` | gray badge | Polite refusal |

Only `factual` ever calls retrieval. The factual prompt explicitly forbids opining on classes/professors and requires every factual claim to be grounded in retrieved context.

## Caveats

- **Requirement structures are MVP approximations.** The schema and the engine are robust, but the actual `data/requirements/` content was hand-coded against my best knowledge of the 2025-2026 EECS curriculum. Please verify against:
  - https://www.eecs.mit.edu/academics/undergraduate-programs/curriculum/
  - https://catalog.mit.edu/degree-charts/
  - your degree audit in WebSIS
  - your department advisor
- **HASS concentration** (3 subjects in one HASS area) is not yet enforced.
- **CI-M** rules are coarse — many programs require specific classes from a "list of approved CI-M subjects". MVP just counts any CI-M tagged subject.
- **Schedule data** is whatever FireRoad has cached for the most recent published term. Some classes may show TBA or have no times at all.
- **No auth.** Anything you mark as "completed" lives only in your browser's localStorage.

## Scripts reference

- `npm run dev` — Next.js dev server
- `npm run build` — production build
- `npm run build:courses` — rebuild `data/build/courses.json` from FireRoad
- `npm run build:embeddings` — rebuild `data/build/embeddings.json` (depends on courses.json)
- `npm run build:data` — both, in order
- `npm run lint` — ESLint
