// The Contributors table answers "who is working on this repository", and three
// decisions keep it from answering something else: profile submissions are not
// contributions to the repository, a reviewer who leaves five comments on one
// pull request reviewed one pull request, and a bot is not a contributor.
//
//   node --test tests/

import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { fetchMergedPulls, countReviews, rankContributors } =
  require(join(root, ".github/workflows/readme-update.js"));

const context = { repo: { owner: "holdex", repo: "trial" } };

/** A `pulls.list` that answers with one page and then an empty one. */
const pullsListing = (pulls) => ({
  rest: {
    pulls: {
      list: async ({ page }) => ({ data: page === 1 ? pulls : [] }),
    },
  },
});

// 163 of the 210 merged pull requests here add a profile file. Counting them
// would print the leaderboard's list of candidates a second time, under a
// heading that promises the people improving the repository.
test("a profile submission is not counted as a contribution", async () => {
  const github = pullsListing([
    { number: 1, title: "chore(profile): add someone profile", merged_at: "2026-01-01T00:00:00Z", user: { login: "candidate" } },
    { number: 2, title: "feat(readme): rank contributors", merged_at: "2026-01-02T00:00:00Z", user: { login: "builder" } },
  ]);

  const merged = await fetchMergedPulls(github, context);

  assert.deepEqual(merged.map((pr) => pr.number), [2]);
});

test("a pull request that closed without merging is not counted", async () => {
  const github = pullsListing([
    { number: 3, title: "feat(readme): abandoned", merged_at: null, user: { login: "builder" } },
    { number: 4, title: "feat(readme): landed", merged_at: "2026-01-02T00:00:00Z", user: { login: "builder" } },
  ]);

  const merged = await fetchMergedPulls(github, context);

  assert.deepEqual(merged.map((pr) => pr.number), [4]);
});

test("five comments on one pull request count as one review", async () => {
  const github = {
    rest: {
      pulls: {
        listReviews: async () => ({
          data: [
            { user: { login: "reviewer" } },
            { user: { login: "reviewer" } },
            { user: { login: "other" } },
          ],
        }),
      },
    },
  };

  const counts = await countReviews(github, context, [{ number: 9 }]);

  assert.equal(counts.get("reviewer"), 1);
  assert.equal(counts.get("other"), 1);
});

// coderabbitai[bot] reviews pull requests here and would otherwise sit at the
// top of a table about who is building the repository.
test("a bot is left out of the table", () => {
  const rows = rankContributors(
    new Map([["builder", 2]]),
    new Map([["coderabbitai[bot]", 40], ["reviewer", 1]])
  );

  assert.deepEqual(rows.map((r) => r.login), ["builder", "reviewer"]);
});

test("contributors rank by merged pull requests, then reviews, then name", () => {
  const rows = rankContributors(
    new Map([["few", 1], ["many", 5], ["none", 0]]),
    new Map([["none", 9], ["few", 0], ["alsoFew", 0]])
  );

  assert.deepEqual(
    rows.map((r) => [r.login, r.merged, r.reviews]),
    [
      ["many", 5, 0],
      ["few", 1, 0],
      ["none", 0, 9],
      ["alsoFew", 0, 0],
    ]
  );
});

test("someone who only reviewed still appears", () => {
  const rows = rankContributors(new Map(), new Map([["reviewer", 3]]));

  assert.deepEqual(rows, [{ login: "reviewer", merged: 0, reviews: 3 }]);
});
