import { describe, it, expect } from "vitest";
import { scoreLocatorConfidence } from "./locator-confidence.js";

describe("scoreLocatorConfidence", () => {
  it("scores getByRole as 0.9", () => {
    expect(scoreLocatorConfidence("getByRole('button', { name: 'Save' })")).toBe(0.9);
  });

  it("scores getByTestId as 0.9", () => {
    expect(scoreLocatorConfidence("getByTestId('submit-btn')")).toBe(0.9);
  });

  it("scores getByLabel as 0.8", () => {
    expect(scoreLocatorConfidence("getByLabel('Email')")).toBe(0.8);
  });

  it("scores getByPlaceholder as 0.8", () => {
    expect(scoreLocatorConfidence("getByPlaceholder('Enter email')")).toBe(0.8);
  });

  it("scores getByText as 0.7", () => {
    expect(scoreLocatorConfidence("getByText('Welcome')")).toBe(0.7);
  });

  it("scores getByAltText as 0.7", () => {
    expect(scoreLocatorConfidence("getByAltText('Logo')")).toBe(0.7);
  });

  it("scores getByTitle as 0.7", () => {
    expect(scoreLocatorConfidence("getByTitle('Settings')")).toBe(0.7);
  });

  it("scores locator() with CSS as 0.5", () => {
    expect(scoreLocatorConfidence("locator('#submit')")).toBe(0.5);
  });

  it("scores locator() with complex CSS as 0.5", () => {
    expect(scoreLocatorConfidence("locator('div.container > button')")).toBe(0.5);
  });

  it("penalizes nth() chain by -0.15", () => {
    expect(scoreLocatorConfidence("getByRole('button').nth(0)")).toBe(0.75);
  });

  it("penalizes first() chain by -0.15", () => {
    expect(scoreLocatorConfidence("getByRole('listitem').first()")).toBe(0.75);
  });

  it("penalizes last() chain by -0.15", () => {
    expect(scoreLocatorConfidence("getByRole('listitem').last()")).toBe(0.75);
  });

  it("penalizes filter() chain by -0.05", () => {
    expect(scoreLocatorConfidence("getByRole('row').filter({ hasText: 'Active' })")).toBe(0.85);
  });

  it("applies multiple penalties cumulatively", () => {
    expect(scoreLocatorConfidence("getByRole('row').filter({ hasText: 'Active' }).first()")).toBe(0.7);
  });

  it("clamps to minimum 0", () => {
    expect(scoreLocatorConfidence("locator('div').nth(0).first().last()")).toBe(0.05);
  });

  it("getByRole scores higher than locator()", () => {
    const roleScore = scoreLocatorConfidence("getByRole('button', { name: 'Save' })");
    const locatorScore = scoreLocatorConfidence("locator('#submit')");
    expect(roleScore).toBeGreaterThan(locatorScore);
  });

  it("does not penalize text content that looks like chain methods", () => {
    expect(scoreLocatorConfidence("getByText('.first(item)')")).toBe(0.7);
    expect(scoreLocatorConfidence("getByText('.nth(2)')")).toBe(0.7);
    expect(scoreLocatorConfidence("getByText('.last()')")).toBe(0.7);
    expect(scoreLocatorConfidence("getByText('.filter(x)')")).toBe(0.7);
  });

  it("getByTestId scores higher than getByText", () => {
    const testIdScore = scoreLocatorConfidence("getByTestId('login-btn')");
    const textScore = scoreLocatorConfidence("getByText('Login')");
    expect(testIdScore).toBeGreaterThan(textScore);
  });
});
