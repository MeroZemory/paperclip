---
name: paperclip-grill-me
description: >
  Interview the board/user (or an internal stakeholder) one question at a
  time to resolve ambiguity in a plan, design, or task before you implement
  it. Use whenever the assignment description is short, vague, mentions
  "ask me / grill me / 심문하라 / clarify", or whenever the next decision
  you must make has more than one defensible answer. Pair with the
  `paperclip` skill for the API mechanics (issue-thread interactions) and
  with `paperclip-converting-plans-to-tasks` once the grilling produces a
  plan worth decomposing.
---

# Paperclip — Grill Me

A repeatable interview procedure for the moment **before** you start building.
The point is not to delay work — it is to make sure the work you start is
actually the work the requester wants.

This skill is a `paperclip`-native rewrite of Matt Pocock's
[`grill-me`](https://github.com/mattpocock/skills/tree/main/skills/productivity/grill-me)
(MIT). The original is two short paragraphs aimed at solo CLI use; this
version wires the same idea into Paperclip's issue-thread interactions and
heartbeat lifecycle so a board/user gets the questions in their inbox
instead of in a terminal they may have closed.

## When to use

Trigger whenever **any** of the following is true:

- The task description is shorter than ~3 sentences and the scope is large.
- The description includes "ask me", "grill me", "clarify", "심문하라",
  "interview me", or any explicit invitation to ask.
- The next decision you'd have to make has more than one defensible answer
  (visual style, data model, deployment target, naming, scope cut, …).
- You catch yourself thinking "I'll just guess and fix it later" on a
  one-way-door choice (codename, public schema, OSS license, pricing).
- The requester is the board/user, and you would not be comfortable showing
  them the result without a checkpoint first.

If none of those are true, **skip this skill** and start building.

## When NOT to use

- The task is clearly scoped and the next action is obvious (typo fix,
  rename, lint sweep, narrow bugfix).
- The requester is another agent and the parent issue already has the
  decisions recorded as documents or comments — read those first.
- You've already grilled the same person on the same plan in this issue.
  Don't re-interview them; just confirm the deltas.

## Core procedure

1. **Read everything available first.** Issue description, parent issue
   documents (especially `plan`, `strategy`, `decision`), recent comments,
   and any linked references. Many "ambiguities" disappear once you read
   the thread.
2. **List the open decisions.** Privately enumerate every concrete choice
   that has more than one defensible answer. Group them by whether they
   are **one-way doors** (hard to reverse: brand, schema, license, pricing,
   data model) or **two-way doors** (easy to reverse: variable names,
   internal helpers, UI copy). One-way doors need user input; two-way doors
   you can decide and note.
3. **Ask one question at a time.** Pick the highest-leverage open
   one-way-door decision. Frame it as a clear question with 2–4 explicit
   options, and **state your recommended answer with one short reason**.
   The requester should be able to skim, click, and move on.
4. **Use the right Paperclip channel for the question.**
   - For 1–4 structured choices: `POST /api/issues/{issueId}/interactions`
     with `kind: "ask_user_questions"` and `continuationPolicy:
     "wake_assignee"`. Put the issue in `in_review`.
   - For yes/no on a written artifact: `kind: "request_confirmation"`
     targeting the relevant document revision; use the idempotency-key
     pattern from the `paperclip` skill so re-asking does not duplicate.
   - For a proposed task tree the board should accept/reject as a unit:
     `kind: "suggest_tasks"`.
   - For genuinely open prose answers only: a markdown comment is fine,
     but expect higher latency and missing answers.
5. **Walk down the tree.** When the requester answers, integrate their
   answer, re-list the open decisions (some collapse, new ones may
   appear), and ask the next single highest-leverage one. Continue until
   the remaining decisions are all two-way doors you can defensibly make
   yourself.
6. **Record the decisions.** Before you close the grilling phase, update
   the relevant `decision` document or post a single summary comment
   listing every resolved choice with the requester's selection. This is
   the artifact the implementation phase reads.
7. **Hand off to implementation.** Either keep the issue and start
   building, or follow `paperclip-converting-plans-to-tasks` to decompose
   into subtasks. Do not re-grill at this point.

## Question shape that works

Write each question as four lines, in this order, in the
`ask_user_questions` payload (or its prose equivalent):

1. **The question** — concrete, single sentence, no jargon.
2. **2–4 options** — mutually exclusive labels with one-line descriptions.
3. **Your recommendation** — pick one option and say which.
4. **One-line reason** — what tradeoff your recommendation optimizes for.

Bad: *"What kind of game should this be? Let me know."*

Good:
> **What genre fits this prototype best?**
> - **clicker** — single-action repetition + automation (Cookie Clicker)
> - **idle** — long-horizon offline progression (Universal Paperclips)
> - **arcade** — short reflex-driven sessions
>
> Recommended: **clicker** — it lets us ship the smallest fun loop first
> and is the easiest to extend with the customer/order system you
> mentioned.

The recommendation matters. A grilling without recommendations becomes
homework, and the requester stops answering.

## Things to avoid

- **Batching every question into one giant questionnaire.** The point of
  this skill is one decision at a time. Batches get partial answers or no
  answer at all.
- **Asking questions whose answers are in the codebase or in linked
  documents.** Read those first. Asking the user something you could have
  grepped is a tax on their attention.
- **Asking with no recommendation.** "What do you want?" is a worse
  question than "I recommend X because Y — confirm or change?"
- **Re-grilling after the requester answered.** Treat answers as
  load-bearing. If a later question contradicts an earlier answer, name
  the contradiction explicitly instead of silently revising.
- **Letting the grilling phase outlive its usefulness.** Once the
  remaining decisions are two-way doors, decide and move on. Continued
  grilling is procrastination.

## Quick checklist before you start building

- [ ] Every one-way-door decision in this issue has an answer.
- [ ] Each answer is recorded in a `decision` document, an issue comment,
      or the resolved interaction payload — not just in your head.
- [ ] The remaining open questions are all two-way doors.
- [ ] The next implementation step is small and concrete enough that a
      different agent could pick it up cold.
- [ ] You have not asked the requester anything you could have read.

## Worked example

> "일단 개발 테스트를 위해 '감자튀김' 게임을 만들어보자. 감자튀김을 자동으로
> 튀기는 알바나 뭐 이런걸 고용하고 이런 게임이면 좋겠고 뭐 어떻게 구체적으로
> 만들어야될지 모르면 나를 심문하라."

This task literally invites grilling. The trigger word is "심문하라" /
"interview me." A grilling-first heartbeat for this issue would:

1. List one-way doors: **genre**, **visual style**, **game depth**, **must-have
   mechanics**.
2. Send a single `ask_user_questions` interaction with those four
   structured choices and a recommendation on each. Put the issue in
   `in_review`. Wait for `wake_assignee`.
3. On the wake, record the four answers into a `decision` document and
   start the v1 prototype against *those answers*, not against guesses.
4. Save v1 → v2 rewrites for cases where the user actually changes their
   mind on a recorded decision — not for self-driven aesthetic pivots.

The opposite of this — guessing, building v1 silently, then deleting 612
lines to write v2 without asking — is what `grill-me` is meant to prevent.

## What this skill is not

- Not a planning format. It produces decisions; the planning skill turns
  them into issues.
- Not a license to stall. If a decision is small and two-way, just decide.
- Not a substitute for reading the issue thread. Grilling without prior
  reading is more annoying than no grilling at all.

## Related

- `paperclip` — the issue-thread interaction API surface used to ask the
  questions.
- `paperclip-converting-plans-to-tasks` — what to do after the grilling
  produces a plan worth decomposing.

## Attribution

Concept and core procedure are adapted from
[`mattpocock/skills/grill-me`](https://github.com/mattpocock/skills/tree/main/skills/productivity/grill-me)
(MIT licensed, Copyright © 2026 Matt Pocock). The Paperclip-specific
wiring — issue-thread interactions, heartbeat lifecycle, one-way- vs
two-way-door framing, and the worked example — is original to this repo.
