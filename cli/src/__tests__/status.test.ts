import { describe, expect, it } from "vitest";
import {
  buildStatusReport,
  formatStatusReport,
  formatWaitingDuration,
  type StatusApi,
  type StatusReport,
} from "../commands/status.js";

interface MockCall {
  path: string;
}

function createMockApi(handlers: Record<string, unknown>): { api: StatusApi; calls: MockCall[] } {
  const calls: MockCall[] = [];
  const api: StatusApi = {
    async get<T>(path: string): Promise<T> {
      calls.push({ path });
      const matchKey = Object.keys(handlers).find((key) => path.startsWith(key));
      if (!matchKey) {
        throw new Error(`Unexpected path: ${path}`);
      }
      return handlers[matchKey] as T;
    },
  };
  return { api, calls };
}

const dashboardFixture = {
  companyId: "company-1",
  agents: { active: 1, running: 0, paused: 0, error: 0 },
  tasks: { open: 3, inProgress: 1, blocked: 0, done: 5 },
  costs: {
    monthSpendCents: 1850,
    monthBudgetCents: 10000,
    monthUtilizationPercent: 18.5,
  },
  pendingApprovals: 0,
  budgets: {
    activeIncidents: 0,
    pendingApprovals: 0,
    pausedAgents: 0,
    pausedProjects: 0,
  },
  runActivity: [],
};

describe("formatWaitingDuration", () => {
  it("renders sub-hour durations in minutes", () => {
    expect(formatWaitingDuration(0)).toBe("0m");
    expect(formatWaitingDuration(0.5)).toBe("30m");
    expect(formatWaitingDuration(0.99)).toBe("59m");
  });

  it("renders single-day durations in tenths of an hour", () => {
    expect(formatWaitingDuration(1)).toBe("1.0h");
    expect(formatWaitingDuration(6.25)).toBe("6.3h");
    expect(formatWaitingDuration(23.4)).toBe("23.4h");
  });

  it("renders multi-day durations in days + hours", () => {
    expect(formatWaitingDuration(24)).toBe("1d 0h");
    expect(formatWaitingDuration(49.5)).toBe("2d 2h");
  });
});

describe("buildStatusReport", () => {
  it("reports empty board queue when no issues are pending", async () => {
    const { api, calls } = createMockApi({
      "/api/companies/c1/dashboard": dashboardFixture,
      "/api/companies/c1/issues": [],
    });

    const report = await buildStatusReport(api, "c1");

    expect(report.boardPendingIssues).toBe(0);
    expect(report.longestWaitingIssue).toBeNull();
    expect(report.pendingApprovals).toBe(0);
    expect(calls).toHaveLength(2);
    expect(calls[1].path).toContain("status=in_review,pending_board_decision");
    expect(calls[1].path).toContain("sortField=updated");
    expect(calls[1].path).toContain("sortDir=asc");
  });

  it("computes waiting hours for the oldest pending issue", async () => {
    const now = new Date("2026-05-24T12:00:00.000Z");
    const fiveHoursAgo = new Date(now.getTime() - 5 * 3_600_000);
    const twoHoursAgo = new Date(now.getTime() - 2 * 3_600_000);

    const { api } = createMockApi({
      "/api/companies/c1/dashboard": dashboardFixture,
      "/api/companies/c1/issues": [
        {
          id: "issue-old",
          identifier: "AGE-19",
          title: "Approve alpha go-live",
          status: "in_review",
          updatedAt: fiveHoursAgo.toISOString(),
        },
        {
          id: "issue-new",
          identifier: "AGE-23",
          title: "Confirm pricing",
          status: "in_review",
          updatedAt: twoHoursAgo.toISOString(),
        },
      ],
    });

    const report = await buildStatusReport(api, "c1", now);

    expect(report.boardPendingIssues).toBe(2);
    expect(report.longestWaitingIssue).not.toBeNull();
    expect(report.longestWaitingIssue?.id).toBe("issue-old");
    expect(report.longestWaitingIssue?.identifier).toBe("AGE-19");
    expect(report.longestWaitingIssue?.waitingHours).toBeCloseTo(5, 5);
  });

  it("clamps waiting hours to zero when updatedAt is in the future", async () => {
    const now = new Date("2026-05-24T12:00:00.000Z");
    const future = new Date(now.getTime() + 3_600_000).toISOString();
    const { api } = createMockApi({
      "/api/companies/c1/dashboard": dashboardFixture,
      "/api/companies/c1/issues": [
        { id: "issue-future", identifier: null, title: "Future", status: "in_review", updatedAt: future },
      ],
    });

    const report = await buildStatusReport(api, "c1", now);
    expect(report.longestWaitingIssue?.waitingHours).toBe(0);
  });

  it("surfaces dashboard pendingApprovals and budget", async () => {
    const withApprovals = {
      ...dashboardFixture,
      pendingApprovals: 3,
      costs: { monthSpendCents: 8500, monthBudgetCents: 10000, monthUtilizationPercent: 85 },
    };
    const { api } = createMockApi({
      "/api/companies/c1/dashboard": withApprovals,
      "/api/companies/c1/issues": [],
    });

    const report = await buildStatusReport(api, "c1");
    expect(report.pendingApprovals).toBe(3);
    expect(report.budget.monthSpendCents).toBe(8500);
    expect(report.budget.utilizationPercent).toBe(85);
  });

  it("tolerates a null body from the issues endpoint", async () => {
    const { api } = createMockApi({
      "/api/companies/c1/dashboard": dashboardFixture,
      "/api/companies/c1/issues": null,
    });

    const report = await buildStatusReport(api, "c1");
    expect(report.boardPendingIssues).toBe(0);
    expect(report.longestWaitingIssue).toBeNull();
  });
});

describe("formatStatusReport", () => {
  const baseReport: StatusReport = {
    companyId: "c1",
    pendingApprovals: 0,
    boardPendingIssues: 0,
    longestWaitingIssue: null,
    budget: { monthSpendCents: 1000, monthBudgetCents: 10000, utilizationPercent: 10 },
  };

  function stripAnsi(s: string): string {
    return s.replace(/\[[0-9;]*m/g, "");
  }

  it("renders a clean state when nothing is pending", () => {
    const out = stripAnsi(formatStatusReport(baseReport));
    expect(out).toContain("No board decisions pending");
    expect(out).toContain("Monthly budget: 10.00 / 100.00 USD (10%)");
  });

  it("renders pending counts and longest wait", () => {
    const out = stripAnsi(
      formatStatusReport({
        ...baseReport,
        pendingApprovals: 1,
        boardPendingIssues: 2,
        longestWaitingIssue: {
          id: "issue-1",
          identifier: "AGE-19",
          title: "Approve alpha go-live",
          status: "in_review",
          updatedAt: "2026-05-22T20:00:00.000Z",
          waitingHours: 28,
        },
      }),
    );
    expect(out).toContain("Board waiting on 3 items");
    expect(out).toContain("Pending approvals: 1");
    expect(out).toContain("Issues awaiting board response: 2");
    expect(out).toContain("Longest wait: 1d 4h — Approve alpha go-live (AGE-19)");
  });

  it("uses singular wording when only one item is pending", () => {
    const out = stripAnsi(
      formatStatusReport({
        ...baseReport,
        pendingApprovals: 1,
        boardPendingIssues: 0,
      }),
    );
    expect(out).toContain("Board waiting on 1 item");
    expect(out).not.toContain("items");
  });

  it("falls back to a short issue id when no identifier is set", () => {
    const out = stripAnsi(
      formatStatusReport({
        ...baseReport,
        boardPendingIssues: 1,
        longestWaitingIssue: {
          id: "abcd1234-0000-0000-0000-000000000000",
          identifier: null,
          title: "Untitled",
          status: "in_review",
          updatedAt: "2026-05-22T20:00:00.000Z",
          waitingHours: 2,
        },
      }),
    );
    expect(out).toContain("Untitled (abcd1234)");
  });
});
