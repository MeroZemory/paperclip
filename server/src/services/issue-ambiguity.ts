/**
 * Issue ambiguity detector.
 *
 * Surfaces a structured signal whenever a task description is empty, very
 * short, or explicitly invites questions (e.g. "ask me", "grill me",
 * "clarify", "심문하라"). The signal is attached to the heartbeat-context
 * response so an agent reaches for the `paperclip-grill-me` skill before
 * silently guessing and shipping the wrong thing.
 *
 * Heuristic-only — keep the false-positive rate low. We surface a signal
 * only when the title or description gives us concrete evidence the
 * requester left scope ambiguous on purpose or by accident. Decisions
 * about how strongly to lean on the signal live in the agent persona and
 * the grill-me skill, not here.
 */

export type IssueAmbiguityReason =
  | "empty_description"
  | "very_short_description"
  | "explicit_question_invitation";

export interface IssueAmbiguitySignalInput {
  title: string;
  description: string | null;
}

export interface IssueAmbiguitySignal {
  matched: boolean;
  reasons: IssueAmbiguityReason[];
  suggestedSkill: "paperclip-grill-me";
  suggestion: string;
  matchedKeywords: string[];
}

const SHORT_DESCRIPTION_CHAR_THRESHOLD = 80;

/**
 * Invitations to ask the requester before building. Each entry must be a
 * lowercased fragment that we will match against the lowercased text of
 * the title + description. Keep the list short and high-precision — every
 * false positive adds friction to a working assignment.
 */
const EXPLICIT_INVITATION_FRAGMENTS = [
  "ask me",
  "grill me",
  "interview me",
  "clarify",
  "심문하라",
  "심문해",
  "물어봐",
  "물어보고",
  "질문해",
  "질문해줘",
] as const;

export function evaluateIssueAmbiguity(
  issue: IssueAmbiguitySignalInput,
): IssueAmbiguitySignal | null {
  const reasons: IssueAmbiguityReason[] = [];
  const matchedKeywords: string[] = [];

  const description = (issue.description ?? "").trim();
  const haystack = `${issue.title} ${description}`.toLowerCase();

  for (const fragment of EXPLICIT_INVITATION_FRAGMENTS) {
    if (haystack.includes(fragment)) {
      matchedKeywords.push(fragment);
    }
  }
  if (matchedKeywords.length > 0) {
    reasons.push("explicit_question_invitation");
  }

  if (description.length === 0) {
    reasons.push("empty_description");
  } else if (description.length < SHORT_DESCRIPTION_CHAR_THRESHOLD) {
    reasons.push("very_short_description");
  }

  if (reasons.length === 0) return null;

  return {
    matched: true,
    reasons,
    suggestedSkill: "paperclip-grill-me",
    suggestion: buildSuggestion(reasons, matchedKeywords),
    matchedKeywords,
  };
}

function buildSuggestion(
  reasons: readonly IssueAmbiguityReason[],
  matchedKeywords: readonly string[],
): string {
  const pieces: string[] = [];
  if (reasons.includes("explicit_question_invitation")) {
    pieces.push(
      `The requester explicitly invited questions (matched: ${matchedKeywords.join(", ")}).`,
    );
  }
  if (reasons.includes("empty_description")) {
    pieces.push("The task description is empty.");
  } else if (reasons.includes("very_short_description")) {
    pieces.push(
      `The task description is shorter than ${SHORT_DESCRIPTION_CHAR_THRESHOLD} characters.`,
    );
  }
  pieces.push(
    "Follow the `paperclip-grill-me` skill: enumerate one-way-door decisions, ask one at a time with a recommended answer, and record the resolved choices in a `decision` document before starting to build.",
  );
  return pieces.join(" ");
}
