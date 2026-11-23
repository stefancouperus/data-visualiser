import test from "node:test";
import assert from "node:assert/strict";
import { analyse } from "../src/analysis.js";
import { analyticalEvidence } from "../src/tutor-evidence.js";
import { passageUnits } from "../src/transcript-index.js";

// Two identical interviews. North has saved highlights; South has accepted
// bot labels with evidence on the original passage.
function interviews() {
  return {
    kind: "text",
    sources: ["N", "S"],
    metadata: { N: { Region: "North" }, S: { Region: "South" } },
    passages: [
      {
        id: "n",
        source: "N",
        text: "My rent rose.",
        codes: [],
        reviewed: true,
      },
      {
        id: "q",
        source: "N",
        text: "rent rose",
        parent: "n",
        start: 3,
        codes: ["Housing"],
        reviewed: true,
      },
      {
        id: "r",
        source: "N",
        text: "rent",
        parent: "q",
        start: 0,
        codes: ["Housing", "Cost"],
        reviewed: true,
      },
      {
        id: "s",
        source: "S",
        text: "My rent rose.",
        codes: ["Housing", "Cost"],
        reviewed: true,
        codingEvidence: [
          { code: "Housing", quote: "rent rose" },
          { code: "Cost", quote: "rent" },
        ],
      },
    ],
  };
}
test("manual, nested and bot labels give identical grouped passage counts and drill-down units", () => {
  const d = interviews(),
    before = structuredClone(d);
  const v = {
    task: "patterns",
    items: ["Housing", "Cost"],
    patternMode: "sources",
    groupBy: "Region",
    themeUnit: "passages",
    chart: "bars",
  };
  const groups = analyse(d, v);
  assert.deepEqual(
    groups.groupSizes.map(({ passages, reviewed }) => [passages, reviewed]),
    [
      [1, 1],
      [1, 1],
    ],
  );
  assert.equal(groups.records.length, 4);
  assert.ok(
    groups.records.every((r) => r.n === 1 && r.den === 1 && r.value === 100),
  );
  const combos = analyse(d, { ...v, groupBy: "", patternMode: "passages" });
  assert.equal(combos.n, 2);
  assert.deepEqual(
    combos.records.map((r) => [r.keyParts, r.n]),
    [[["Housing", "Cost"], 2]],
  );
  const both = analyse(d, {
    task: "two",
    chart: "bars",
    x: "Housing",
    y: "Cost",
    measure: "passages",
  });
  assert.deepEqual(
    both.records.map((r) => r.n),
    [0, 2, 0],
  );
  const one = {
    task: "one",
    chart: "bars",
    x: "Housing",
    measure: "passages",
    filter: "source",
    value: "N",
  };
  assert.deepEqual(analyse(d, one).themeCounts, {
    code: "Housing",
    matchingPassages: 1,
    interviewsWithCode: 1,
    listedInterviews: 1,
  });
  assert.deepEqual(
    analyse(d, { ...one, chart: "excerpts" }).excerpt.map((p) => [
      p.id,
      p.codes,
    ]),
    [["n", ["Housing", "Cost"]]],
  );
  const evidence = analyticalEvidence(d, one, "Housing");
  assert.equal(evidence.importedPassages, 1);
  assert.equal(evidence.reviewedPassages, 1);
  assert.deepEqual(
    evidence.codeCounts.map((c) => c.matchingPassages),
    [1, 1],
  );
  assert.deepEqual(d, before);
});

test("unanchored imports remain separate passages and reviewing a quotation alone does not check a whole answer", () => {
  const d = interviews();
  d.passages[0].reviewed = false;
  d.passages.push({
    id: "orphan",
    source: "N",
    parent: "missing",
    start: 0,
    text: "An imported excerpt",
    codes: ["Access"],
    reviewed: true,
  });
  d.openAnswers = { eligible: 2, answered: 2 };
  const units = passageUnits(d.passages);
  assert.deepEqual(
    units.map((p) => p.id),
    ["n", "s", "orphan"],
  );
  assert.equal(units[0].reviewed, false);
  const v = {
    task: "patterns",
    items: ["Housing"],
    patternMode: "sources",
    groupBy: "Region",
    themeUnit: "passages",
  };
  const [north, south] = analyse(d, v).records;
  assert.deepEqual([north.n, north.den, south.n, south.den], [1, 2, 1, 1]);
  const perPerson = analyse(d, { ...v, themeUnit: "interviews" });
  assert.ok(perPerson.records.every((r) => r.n === 1 && r.den === 1));
  assert.match(perPerson.unit, /respondents/);
});
