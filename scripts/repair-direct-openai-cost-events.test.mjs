import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function runHelperCheck(source) {
  return execFileSync(
    "pnpm",
    ["--filter", "@paperclipai/db", "--silent", "exec", "tsx", "-e", source],
    { cwd: repoRoot, encoding: "utf8" },
  ).trim();
}

describe("repair-direct-openai-cost-events", () => {
  it("starts through the documented direct command and prints help", () => {
    const output = execFileSync(
      "pnpm",
      [
        "--filter",
        "@paperclipai/db",
        "exec",
        "tsx",
        "../../scripts/repair-direct-openai-cost-events.ts",
        "--help",
      ],
      { cwd: repoRoot, encoding: "utf8" },
    );

    assert.match(output, /Repair direct OpenAI metered cost_events rows/);
    assert.match(output, /--apply/);
  });

  it("estimates gpt-5.5-pro direct API costs with the maintained rate card", () => {
    const output = runHelperCheck(`
      import assert from "node:assert/strict";
      import { estimateDirectOpenAiCostUsd, normalizeCostCents } from "../../scripts/repair-direct-openai-cost-events.ts";
      const estimate = estimateDirectOpenAiCostUsd({
        model: "gpt-5.5-pro",
        input_tokens: 907396,
        cached_input_tokens: 0,
        output_tokens: 14036,
      });
      assert.ok(estimate);
      assert.equal(normalizeCostCents(estimate.costUsd), 2975);
      console.log("ok");
    `);

    assert.equal(output, "ok");
  });

  it("only treats direct OpenAI adapter env as repair proof", () => {
    const output = runHelperCheck(`
      import assert from "node:assert/strict";
      import { adapterConfigProvesDirectOpenAi } from "../../scripts/repair-direct-openai-cost-events.ts";
      assert.equal(adapterConfigProvesDirectOpenAi({ env: { OPENAI_API_KEY: { type: "secret_ref" } } }), true);
      assert.equal(adapterConfigProvesDirectOpenAi({ env: { OPENAI_API_KEY: "sk-test", OPENROUTER_API_KEY: "or-test" } }), false);
      assert.equal(adapterConfigProvesDirectOpenAi({ env: { OPENAI_API_KEY: "sk-test", OPENAI_BASE_URL: "https://openrouter.ai/api/v1" } }), false);
      console.log("ok");
    `);

    assert.equal(output, "ok");
  });
});
