import { Matrix, SingularValueDecomposition, inverse } from "ml-matrix";
import jStat from "jstat";
const sigmoid = (x) => 1 / (1 + Math.exp(-Math.max(-35, Math.min(35, x))));
export function fitModel(
  table,
  rows,
  { outcome, predictors, positive, interaction = false },
) {
  const fields = table.fields,
    field = (k) => fields.find((f) => f.id === k),
    yField = field(outcome);
  if (!yField || !predictors.length || predictors.includes(outcome))
    throw Error("Select an outcome and at least one different predictor.");
  const used = rows.filter((r) =>
    [outcome, ...predictors].every(
      (k) =>
        r[k] != null &&
        r[k] !== "" &&
        (field(k).type !== "number" || Number.isFinite(Number(r[k]))),
    ),
  );
  if (used.length < 3) throw Error("There are too few complete observations.");
  const yLevels = [...new Set(used.map((r) => r[outcome]))],
    logistic = yField.type !== "number";
  if (logistic && (yLevels.length !== 2 || !yLevels.includes(positive)))
    throw Error(
      "For logistic regression select a binary outcome and the event to model. For a numerical outcome confirm its type in Check.",
    );
  const specs = predictors.map((k) => {
    const f = field(k),
      values = [...new Set(used.map((r) => r[k]))];
    return {
      k,
      f,
      levels: values,
      terms:
        f.type === "number"
          ? [{ name: f.label, fn: (r) => Number(r[k]) }]
          : values.slice(1).map((v) => ({
              name: f.label + " = " + v,
              fn: (r) => +(r[k] === v),
            })),
    };
  });
  const termCount =
    1 +
    specs.reduce((n, s) => n + s.terms.length, 0) +
    (interaction && specs.length >= 2
      ? specs[0].terms.length * specs[1].terms.length
      : 0);
  if (termCount > 45 || termCount >= used.length)
    throw Error(
      "The model needs more complete records or fewer predictor categories.",
    );
  const terms = [
    { name: "Intercept", fn: () => 1 },
    ...specs.flatMap((s) => s.terms),
  ];
  if (interaction && specs.length >= 2)
    for (const a of specs[0].terms)
      for (const b of specs[1].terms)
        terms.push({
          name: a.name + " × " + b.name,
          fn: (r) => a.fn(r) * b.fn(r),
        });
  if (used.length <= terms.length || terms.length < 2 || terms.length > 45)
    throw Error(
      "The model has too few independent observations for these terms. Reduce the predictors or inspect the group counts.",
    );
  const X = new Matrix(used.map((r) => terms.map((t) => t.fn(r)))),
    y = Matrix.columnVector(
      used.map((r) =>
        logistic ? +(r[outcome] === positive) : Number(r[outcome]),
      ),
    );
  if (
    new SingularValueDecomposition(X, { autoTranspose: true }).rank < X.columns
  )
    throw Error(
      "Some predictors duplicate one another or have no independent variation.",
    );
  let coef, cov, fit;
  if (!logistic) {
    cov = inverse(X.transpose().mmul(X));
    coef = cov.mmul(X.transpose()).mmul(y);
    fit = X.mmul(coef).to1DArray();
    const rss = fit.reduce((s, v, i) => s + (v - y.get(i, 0)) ** 2, 0);
    cov.mul(rss / (used.length - terms.length));
  } else {
    coef = Matrix.zeros(X.columns, 1);
    let converged = false;
    for (let i = 0; i < 50; i++) {
      const p = X.mmul(coef).to1DArray().map(sigmoid),
        wx = X.clone();
      p.forEach((v, j) => wx.mulRow(j, Math.max(v * (1 - v), 1e-12)));
      cov = inverse(X.transpose().mmul(wx));
      const delta = cov
        .mmul(X.transpose())
        .mmul(Matrix.columnVector(p.map((v, j) => y.get(j, 0) - v)));
      coef.add(delta);
      if (Math.max(...delta.to1DArray().map(Math.abs)) < 1e-7) {
        converged = true;
        break;
      }
    }
    if (
      !converged ||
      coef.to1DArray().some((x) => !Number.isFinite(x) || Math.abs(x) > 30)
    )
      throw Error(
        "The logistic estimate is unstable or separated. Try fewer predictors or show observed counts.",
      );
    fit = X.mmul(coef).to1DArray().map(sigmoid);
  }
  const crit = logistic
    ? 1.959964
    : jStat.studentt.inv(0.975, used.length - terms.length);
  const coefficients = coef.to1DArray().map((v, i) => {
    const se = Math.sqrt(cov.get(i, i));
    return {
      term: terms[i].name,
      estimate: v,
      low: v - crit * se,
      high: v + crit * se,
    };
  });
  const base = Object.fromEntries(
    specs.map((s) => [
      s.k,
      s.f.type === "number"
        ? used.reduce((sum, r) => sum + Number(r[s.k]), 0) / used.length
        : s.levels[0],
    ]),
  );
  const s = specs[0],
    sorted = s.levels.map(Number).sort((a, b) => a - b);
  const values =
    s.f.type === "number"
      ? Array.from(
          { length: Math.min(8, sorted.length) },
          (_, i) =>
            sorted[
              Math.round(
                (i * (sorted.length - 1)) / (Math.min(8, sorted.length) - 1),
              )
            ],
        )
      : s.levels;
  const predictions = [...new Set(values)].map((v) => {
    const r = { ...base, [s.k]: v },
      x = Matrix.rowVector(terms.map((t) => t.fn(r))),
      z = x.mmul(coef).get(0, 0),
      se = Math.sqrt(x.mmul(cov).mmul(x.transpose()).get(0, 0));
    const transform = logistic ? sigmoid : (a) => a;
    return {
      label: String(v),
      value: transform(z),
      low: transform(z - crit * se),
      high: transform(z + crit * se),
    };
  });
  const observed = y.to1DArray(),
    mean = observed.reduce((s, n) => s + n, 0) / observed.length;
  const rss = observed.reduce((s, n, i) => s + (n - fit[i]) ** 2, 0),
    tss = observed.reduce((s, n) => s + (n - mean) ** 2, 0);
  const clipped = fit.map((p) => Math.max(1e-12, Math.min(1 - 1e-12, p)));
  const diagnostics = logistic
    ? {
        Events: observed.reduce((s, n) => s + n, 0),
        "Non-events": observed.filter((n) => !n).length,
        "Mean squared probability error": rss / used.length,
        "Log likelihood": observed.reduce(
          (s, n, i) =>
            s + n * Math.log(clipped[i]) + (1 - n) * Math.log(1 - clipped[i]),
          0,
        ),
      }
    : {
        "R squared": tss > 0 ? 1 - rss / tss : null,
        "Residual standard error": Math.sqrt(
          rss / (used.length - terms.length),
        ),
      };
  return {
    diagnostics,
    method: logistic ? "Logistic regression" : "Linear regression",
    event: logistic ? positive : "",
    n: used.length,
    excluded: rows.length - used.length,
    coefficients,
    predictions,
    predictor: s.f.label,
    numericalPredictor: s.f.type === "number",
    held: specs
      .slice(1)
      .map((q) => q.f.label + " = " + String(base[q.k]))
      .join(", "),
    reference: specs
      .filter((q) => q.f.type !== "number")
      .map((q) => q.f.label + " = " + q.levels[0])
      .join(", "),
    df: used.length - X.columns,
  };
}
