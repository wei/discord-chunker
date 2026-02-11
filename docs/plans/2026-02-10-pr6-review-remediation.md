# PR #6 Review Remediation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Resolve selected PR #6 reviewer comments using strict TDD, with scoped deferrals and batched commits.

**Architecture:** Keep the existing chunking architecture and Discord-specific behavior intact, while fixing correctness/safety gaps (whitespace preservation, fence overhead edge case, shell escaping) and improving tests/tooling quality. Explicitly document intentional behavior where reviewer suggestions were declined. Defer one complex chunker behavior change for separate design discussion.

**Tech Stack:** TypeScript, Vitest, pnpm, Cloudflare Workers, esbuild.

---

## Scope Decisions (from Wei)

- ✅ Include #1 as a documentation/intent acceptance (clarify intentional behavior, no algorithm rewrite).
- ✅ Include #2 now: remove `trim` behavior.
- ⏸️ Defer #3 for later discussion (no implementation in this batch).
- ✅ Include #4, #6, #9, #10, #11, #12 now.

---

## Commit Batching Strategy

1. **Commit A (chunker semantics + tests):** #2 + #4 + #1 documentation clarification.
2. **Commit B (curl safety + tests):** #6.
3. **Commit C (dependency placement + verification):** #9.
4. **Commit D (URL/web-chunker tests):** #10 + #11.
5. **Commit E (watch-mode DX logging):** #12.
6. **PR thread updates (no code):** mark #3 deferred and explain rationale.

---

### Task 1: Chunker whitespace + fence-overhead fix + intent docs (Commit A)

**Files:**
- Modify: `src/chunker.ts`
- Modify: `test/chunker.test.ts`
- Modify: `README.md` (or nearest chunking behavior section)

**Step 1: Write failing tests**

Add tests in `test/chunker.test.ts`:
- `preserves leading indentation when flushing` (proves `.trim()` regression)
- `does not prematurely flush when current line closes active fence` (edge case for effective close overhead)

Example test intent:
- Build input where a line starts with spaces and causes flush; assert spaces remain.
- Build input where closing fence line is near maxChars boundary; assert no unnecessary split before closer.

**Step 2: Run targeted tests to verify failure**

Run: `pnpm vitest run test/chunker.test.ts`
Expected: new tests fail against current implementation.

**Step 3: Write minimal implementation**

In `src/chunker.ts`:
- Remove `.trim()` from `chunks.push(current.join("\n").trim())` (use raw join).
- Replace close overhead calculation with effective variant:
  - `effectiveFenceCloseOverhead = fence && !lineIsFence ? 1 + closeLen : 0`.
- Keep current intentional soft `maxChars` behavior under fence wrappers; do not introduce strict re-check logic from reviewer suggestion #1.

In `README.md`:
- Add explicit note that configured `maxChars` may be exceeded by fence wrapper overhead while still enforcing Discord hard max 2000.

**Step 4: Run tests to verify pass**

Run:
- `pnpm vitest run test/chunker.test.ts`
- `pnpm test`
Expected: pass.

**Step 5: Commit**

```bash
git add src/chunker.ts test/chunker.test.ts README.md
git commit -m "fix(chunker): preserve whitespace and handle closing-fence overhead edge case"
```

---

### Task 2: Curl URL shell escaping (Commit B)

**Files:**
- Modify: `web/curl-generator.ts`
- Modify: `test/web-curl-generator.test.ts`

**Step 1: Write failing test**

Add test:
- `escapes single quotes in proxy URL`.

Expectation:
- Generated command contains shell-escaped URL single quote sequence (`'\''`).

**Step 2: Run targeted test to verify failure**

Run: `pnpm vitest run test/web-curl-generator.test.ts`
Expected: new URL-escaping test fails.

**Step 3: Write minimal implementation**

In `web/curl-generator.ts`:
- Introduce `safeUrl = proxyUrl.replace(/'/g, "'\\''")`.
- Use `safeUrl` in the curl command string.

**Step 4: Run tests to verify pass**

Run:
- `pnpm vitest run test/web-curl-generator.test.ts`
- `pnpm test`
Expected: pass.

**Step 5: Commit**

```bash
git add web/curl-generator.ts test/web-curl-generator.test.ts
git commit -m "fix(web): shell-escape proxy url in generated curl command"
```

---

### Task 3: Move discord-markdown to devDependencies (Commit C)

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

**Step 1: Write verification-first check (dependency classification test)**

Use build/runtime checks as verification gates:
- Web build still succeeds.
- Worker tests still pass in CI/local with regular install.

**Step 2: Run baseline checks before change**

Run:
- `pnpm build`
- `pnpm test`
Expected: pass baseline.

**Step 3: Write minimal implementation**

- Move `discord-markdown` from `dependencies` to `devDependencies`.
- Run `pnpm install` to refresh lockfile.

**Step 4: Run verification after change**

Run:
- `pnpm build`
- `pnpm test`
Expected: pass.

**Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore(deps): classify discord-markdown as dev dependency"
```

---

### Task 4: Add missing tests for fragments + config-based maxChars assertion (Commit D)

**Files:**
- Modify: `test/web-url-converter.test.ts`
- Modify: `test/web-chunker.test.ts`

**Step 1: Write failing tests**

- Add `extractWebhookParts` fragment behavior test:
  - URL with `#fragment` should return id/token/search without fragment (or null if desired; choose and codify current intended behavior).
- Update chunk length assertion in `web-chunker` test to enforce `config.maxChars`.

**Step 2: Run targeted tests to verify failure (or mismatch)**

Run:
- `pnpm vitest run test/web-url-converter.test.ts test/web-chunker.test.ts`
Expected:
- Fragment test clarifies current behavior.
- `config.maxChars` assertion should pass once updated, but validates tighter guard.

**Step 3: Implement minimal code only if test reveals inconsistency**

- If fragment behavior is acceptable and stable, no production code change.
- If inconsistency appears, patch `web/url-converter.ts` minimally to match intended behavior.

**Step 4: Run tests to verify pass**

Run:
- `pnpm vitest run test/web-url-converter.test.ts test/web-chunker.test.ts`
- `pnpm test`
Expected: pass.

**Step 5: Commit**

```bash
git add test/web-url-converter.test.ts test/web-chunker.test.ts web/url-converter.ts
git commit -m "test(web): tighten chunk-size assertion and cover fragment extraction behavior"
```

---

### Task 5: Watch-mode rebuild error logging (Commit E)

**Files:**
- Modify: `web/build.ts`
- (Optional) add test only if practical; otherwise verify manually via watch run.

**Step 1: Write failing behavior check**

- Reproduce by introducing a temporary syntax error in `web/app.ts` while running watch and verify there is no explicit plugin error count output.

**Step 2: Run watch to confirm current behavior gap**

Run: `pnpm build:web --watch`
Expected: rebuild fails without explicit `[watch] Build failed with X error(s)` from plugin.

**Step 3: Write minimal implementation**

In `web/build.ts` plugin `onEnd`:
- Add `else` branch logging `result.errors.length`.

**Step 4: Verify behavior manually**

Run: `pnpm build:web --watch`
- Introduce and fix temporary syntax error to confirm failure + recovery logs.

**Step 5: Commit**

```bash
git add web/build.ts
git commit -m "chore(web-build): surface watch rebuild error counts"
```

---

### Task 6: Deferred item (#3) and PR thread responses

**Files:**
- No code required.

**Step 1: Post PR thread responses for completed items**

- For each addressed comment, reply in-thread with concrete change summary + commit reference.

**Step 2: Mark #3 as deferred for design discussion**

- State that hard-cut line semantic preservation needs a dedicated design decision due to chunk model implications.
- Keep thread open or resolve with explicit deferred note (team preference).

**Step 3: Track deferred work**

- Create follow-up issue or TODO in `docs/plans/` for #3 deep-dive.

**Step 4: Final verification gate before pushing updates**

Run:
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
Expected: all pass.

**Step 5: Push and update PR**

```bash
git push
```

---

## Notes on TDD Discipline

For each implementation task above:
1. Add/adjust failing test first.
2. Run only relevant tests to confirm failure.
3. Apply smallest production change.
4. Re-run targeted tests.
5. Run full verification suite before final push.
6. Commit per planned batch.
