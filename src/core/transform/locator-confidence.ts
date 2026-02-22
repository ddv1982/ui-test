/**
 * Confidence scoring for Playwright locator expressions.
 *
 * Assigns a confidence score (0–1) based on how stable/reliable
 * the locator strategy is expected to be across page changes.
 */

const METHOD_SCORES: Record<string, number> = {
  getByRole: 0.9,
  getByTestId: 0.9,
  getByLabel: 0.8,
  getByPlaceholder: 0.8,
  getByText: 0.7,
  getByAltText: 0.7,
  getByTitle: 0.7,
};

const POSITIONAL_PENALTY = -0.15;
const FILTER_PENALTY = -0.05;

const POSITIONAL_METHODS = new Set(["nth", "first", "last"]);

export function scoreLocatorConfidence(locatorExpression: string): number {
  const baseScore = getBaseScore(locatorExpression);
  const penalty = getPenalty(locatorExpression);
  return Math.round(clamp(baseScore + penalty, 0, 1) * 100) / 100;
}

function getBaseScore(expression: string): number {
  for (const [method, score] of Object.entries(METHOD_SCORES)) {
    if (expression.startsWith(`${method}(`)) {
      return score;
    }
  }

  if (expression.startsWith("locator(")) {
    return 0.5;
  }

  return 0.5;
}

function getPenalty(expression: string): number {
  const stripped = stripQuotedStrings(expression);
  let penalty = 0;

  for (const method of POSITIONAL_METHODS) {
    if (stripped.includes(`.${method}(`)) {
      penalty += POSITIONAL_PENALTY;
    }
  }

  if (stripped.includes(".filter(")) {
    penalty += FILTER_PENALTY;
  }

  return penalty;
}

function stripQuotedStrings(expr: string): string {
  return expr.replace(/'[^']*'/g, "''").replace(/"[^"]*"/g, '""');
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
