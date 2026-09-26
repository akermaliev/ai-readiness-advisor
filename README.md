# AI Readiness Advisor

A single-session AI-readiness assessment. 24 concrete questions produce a deterministic,
auditable score; hard gates flag what a company should not attempt yet; an optional model
call (bring your own Anthropic key) suggests use cases, which are checked in code against
the gates before they are shown.

**The part that produces the assessment has no runtime dependency on an LLM.** The score,
breakdown, diagnostics and gates are computed in the browser from the answers alone, and the
full report renders with the network disconnected. That is tested, not asserted
(`e2e/offline_report.py`).

## How it works

Inputs fall into three categories, kept apart in the types and the code:

| Inputs | What they do | Where they go |
| --- | --- | --- |
| **Profile** (industry, company size) | Select how answers are weighted and which gates apply. Earn no points. | `computeReadiness` |
| **Rubric** (24 answers, 6 dimensions) | The only things scored. | `computeReadiness` |
| **Intent** (bottleneck, target area, notes, horizon) | Never touch the score. | The recommendation prompt only |

```
src/data     Stage 1  the methodology as typed data: questions, weights, size modifiers, gates, bands
src/engine   Stage 2  pure scoring functions; no DOM, no fetch (enforced by tsconfig.core.json)
src/intake   Stage 3  the wizard; produces ReadinessInput with zero transformation
src/report   Stage 4  the deterministic report, rendered from ScoringOutput alone
src/model    Stage 5  prompt builder, API client, response validator, gate verification, fallback
```

- **Headline score** is a weighted geometric mean (each dimension floored at 1), so a strong
  dimension cannot mask a weak one. The weighted average is shown beside it; the gap between
  them is itself a finding.
- **Diagnostics:** dispersion, the largest weighted shortfall (where points are lost now), and
  marginal sensitivity (what raising each dimension to 75 would do to the headline — this
  ranking is "fix this first"). The two can name different dimensions, by design.
- **Gates** are boolean rules on answers plus industry, independent of the score. Blocked
  items are always shown with what would unblock them.
- **Cross-profile sensitivity** shows the score under all five industry weightings, because
  the weights are our own estimates.

## Run it

```bash
npm install          # on a fresh clone; if node_modules came from another OS, delete it first
npm run dev          # local dev server
npm test             # 103 unit tests: invariants, engine, calibration, Stage 5
npm run typecheck    # whole app + the browser-free core
npm run build        # typecheck + static build into dist/
```

Browser tests (Python Playwright), against a build served locally:

```bash
npm run build && python -m http.server 8765 --directory dist
python e2e/offline_report.py         http://localhost:8765/index.html e2e/screenshots
python e2e/stage5_recommendations.py http://localhost:8765/index.html e2e/screenshots
```

## Deploy

`.github/workflows/deploy.yml` runs the tests, builds, and publishes `dist/` to GitHub Pages on
every push to `main`. Enable it once under **Settings → Pages → Source: GitHub Actions**. The
build uses relative asset paths, so it also works on Vercel or any static host unchanged.

## Your API key

Recommendations are optional. If you add a key:

- it lives only in the page's memory (React state) and is gone on refresh;
- it is sent only to `api.anthropic.com`, straight from your browser, with no server in between;
- it is never written to storage, cookies, or logs. Tests scan the whole codebase for storage
  and console calls, and allow network access from one file only.

With no key, pre-written examples are one click away. They go through the same gate check as
live suggestions, and their summary and roadmap are filled in from your own score.

## Known limitations

1. **Weights are our own estimates**, assigned by reasoning about criticality per sector, not
   derived from an empirical study. Mitigated by showing the applied profile, its rationale,
   and the cross-profile range.
2. **Every input is unverified self-report.** Consistency checks catch internal contradictions,
   not a uniformly optimistic respondent.
3. **The size modifier is shared across industries**, not crossed with them — a deliberate
   simplification.
4. **Gate thresholds are conservative judgment calls**, tuned to prefer false blocks over false
   passes.
5. **No benchmarking.** The score is absolute against the rubric; "62" is not a percentile.
6. **Culture and change readiness are excluded**, because they cannot be asked about honestly in
   a self-report form.
7. **The recommendation layer is a single model call**, with no retrieval over a use-case
   library. The gate check verifies a suggestion's *tagged* categories against the gates; it
   cannot tell whether the model tagged them correctly, so an under-tagged suggestion can pass.
8. **Single-session, no persistence**, so no re-assessment over time.
9. **Calibration rests on authored personas.** Three written personas land in the target ranges
   (weak 26, median 50, strong 77); they show the point values behave sensibly, not that scores
   match real organizations. The weak persona clears its range by one point.

This tool encodes a defensible methodology and makes its reasoning visible. It does not replace
an assessment engagement.
