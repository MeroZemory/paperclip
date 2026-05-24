import { describe, expect, it } from "vitest";
import { evaluateIssueAmbiguity } from "../issue-ambiguity.js";

describe("evaluateIssueAmbiguity", () => {
  it("returns null for a well-scoped task description", () => {
    const signal = evaluateIssueAmbiguity({
      title: "Add `paperclipai status` command",
      description:
        "Add a new `paperclipai status` command that prints the pending board confirmations, the longest-waiting one, and the current monthly budget. Reads existing dashboard and issues endpoints. No server change required. Cover with unit tests for the formatter and the report builder.",
    });
    expect(signal).toBeNull();
  });

  it("flags empty descriptions", () => {
    const signal = evaluateIssueAmbiguity({ title: "Untitled", description: null });
    expect(signal).not.toBeNull();
    expect(signal!.reasons).toContain("empty_description");
    expect(signal!.suggestedSkill).toBe("paperclip-grill-me");
  });

  it("flags whitespace-only descriptions as empty", () => {
    const signal = evaluateIssueAmbiguity({ title: "Untitled", description: "   \n  " });
    expect(signal!.reasons).toContain("empty_description");
  });

  it("flags very short descriptions", () => {
    const signal = evaluateIssueAmbiguity({
      title: "Build a thing",
      description: "Make it work, you decide the rest.",
    });
    expect(signal).not.toBeNull();
    expect(signal!.reasons).toContain("very_short_description");
    expect(signal!.reasons).not.toContain("empty_description");
  });

  it("flags Korean 심문하라 invitation", () => {
    const signal = evaluateIssueAmbiguity({
      title: "감자 튀김 게임 개발",
      description:
        "일단 개발 테스트를 위해 \"감자튀김\" 게임을 만들어보자. 감자튀김을 자동으로 튀기는 알바나 뭐 이런걸 고용하고 이런 게임이면 좋겠고 뭐 어떻게 구체적으로 만들어야될지 모르면 나를 심문하라.",
    });
    expect(signal).not.toBeNull();
    expect(signal!.reasons).toContain("explicit_question_invitation");
    expect(signal!.matchedKeywords).toContain("심문하라");
  });

  it("flags English ask/grill keywords case-insensitively", () => {
    const askSignal = evaluateIssueAmbiguity({
      title: "Auth redesign",
      description:
        "Rework the entire auth stack — pick the vendor and the schema yourself, but ASK ME before changing any public endpoint or rotating any production secret.",
    });
    expect(askSignal!.matchedKeywords).toContain("ask me");

    const grillSignal = evaluateIssueAmbiguity({
      title: "Brand naming",
      description:
        "We need a new product name and a one-line positioning statement. Grill me on tone, audience, and adjacent brands before suggesting candidates.",
    });
    expect(grillSignal!.matchedKeywords).toContain("grill me");
  });

  it("combines multiple reasons when both length and keyword fire", () => {
    const signal = evaluateIssueAmbiguity({
      title: "Plan thing",
      description: "Ask me",
    });
    expect(signal!.reasons).toContain("very_short_description");
    expect(signal!.reasons).toContain("explicit_question_invitation");
    expect(signal!.matchedKeywords).toContain("ask me");
  });

  it("treats the suggestion string as a single instruction line referencing the grill-me skill", () => {
    const signal = evaluateIssueAmbiguity({ title: "x", description: null });
    expect(signal!.suggestion).toMatch(/paperclip-grill-me/);
    expect(signal!.suggestion).toMatch(/one-way-door/i);
  });

  it("does NOT match unrelated text that merely contains substrings", () => {
    // "Clarification meeting in calendar" — we match "clarify" not "clarification".
    const signal = evaluateIssueAmbiguity({
      title: "Internal training session",
      description:
        "Schedule the all-hands meeting on the engineering calendar for Thursday at 10am. Include a short agenda covering deployment, postmortem reviews, and an open Q&A segment.",
    });
    expect(signal).toBeNull();
  });

  it("still matches `clarify` when the requester actively asks for clarification", () => {
    const signal = evaluateIssueAmbiguity({
      title: "Pricing rework",
      description:
        "We need a new pricing structure. I have a rough idea but want you to clarify the open assumptions with me before drafting anything concrete.",
    });
    expect(signal!.matchedKeywords).toContain("clarify");
  });
});
