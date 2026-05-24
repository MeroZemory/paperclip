import { Command } from "commander";
import pc from "picocolors";
import type { DashboardSummary, Issue } from "@paperclipai/shared";
import {
  addCommonClientOptions,
  handleCommandError,
  printOutput,
  resolveCommandContext,
  type BaseClientOptions,
} from "./client/common.js";

const BOARD_PENDING_STATUSES = "in_review,pending_board_decision";
const LIST_LIMIT = 50;

export interface StatusReportIssue {
  id: string;
  identifier: string | null;
  title: string;
  status: string;
  updatedAt: string;
  waitingHours: number;
}

export interface StatusReport {
  companyId: string;
  pendingApprovals: number;
  boardPendingIssues: number;
  longestWaitingIssue: StatusReportIssue | null;
  budget: {
    monthSpendCents: number;
    monthBudgetCents: number;
    utilizationPercent: number;
  };
}

export interface StatusApi {
  get<T>(path: string): Promise<T | null>;
}

export async function buildStatusReport(
  api: StatusApi,
  companyId: string,
  now: Date = new Date(),
): Promise<StatusReport> {
  const dashboard = await api.get<DashboardSummary>(`/api/companies/${companyId}/dashboard`);
  if (!dashboard) {
    throw new Error(`Failed to load dashboard summary for company ${companyId}`);
  }
  const issues =
    (await api.get<Issue[]>(
      `/api/companies/${companyId}/issues?status=${BOARD_PENDING_STATUSES}&sortField=updated&sortDir=asc&limit=${LIST_LIMIT}`,
    )) ?? [];

  const oldest = issues.length > 0 ? issues[0] : null;
  const longestWaitingIssue: StatusReportIssue | null = oldest
    ? {
        id: oldest.id,
        identifier: oldest.identifier ?? null,
        title: oldest.title,
        status: oldest.status,
        updatedAt:
          oldest.updatedAt instanceof Date ? oldest.updatedAt.toISOString() : String(oldest.updatedAt),
        waitingHours: computeWaitingHours(oldest.updatedAt, now),
      }
    : null;

  return {
    companyId,
    pendingApprovals: dashboard.pendingApprovals,
    boardPendingIssues: issues.length,
    longestWaitingIssue,
    budget: {
      monthSpendCents: dashboard.costs.monthSpendCents,
      monthBudgetCents: dashboard.costs.monthBudgetCents,
      utilizationPercent: dashboard.costs.monthUtilizationPercent,
    },
  };
}

function computeWaitingHours(updatedAt: Date | string, now: Date): number {
  const updated = updatedAt instanceof Date ? updatedAt : new Date(updatedAt);
  const diffMs = now.getTime() - updated.getTime();
  return Math.max(0, diffMs / 3_600_000);
}

export function formatWaitingDuration(hours: number): string {
  if (hours < 1) {
    const minutes = Math.max(0, Math.round(hours * 60));
    return `${minutes}m`;
  }
  if (hours < 24) {
    return `${hours.toFixed(1)}h`;
  }
  const days = Math.floor(hours / 24);
  const remHours = Math.round(hours % 24);
  return `${days}d ${remHours}h`;
}

export function formatStatusReport(report: StatusReport): string {
  const lines: string[] = [];
  const pendingTotal = report.pendingApprovals + report.boardPendingIssues;
  const itemSuffix = pendingTotal === 1 ? "" : "s";

  const header = pendingTotal > 0
    ? pc.yellow(`⚠ Board waiting on ${pendingTotal} item${itemSuffix}`)
    : pc.green("✓ No board decisions pending");
  lines.push(header);

  if (report.pendingApprovals > 0) {
    lines.push(`  • Pending approvals: ${pc.bold(String(report.pendingApprovals))}`);
  }

  if (report.boardPendingIssues > 0) {
    lines.push(`  • Issues awaiting board response: ${pc.bold(String(report.boardPendingIssues))}`);
    if (report.longestWaitingIssue) {
      const waited = formatWaitingDuration(report.longestWaitingIssue.waitingHours);
      const ref = report.longestWaitingIssue.identifier ?? report.longestWaitingIssue.id.slice(0, 8);
      lines.push(`  • Longest wait: ${pc.bold(waited)} — ${report.longestWaitingIssue.title} (${ref})`);
    }
  }

  const utilization = report.budget.utilizationPercent;
  const budgetTone = utilization >= 80 ? pc.red : utilization >= 60 ? pc.yellow : pc.dim;
  const spend = (report.budget.monthSpendCents / 100).toFixed(2);
  const budgetCap = (report.budget.monthBudgetCents / 100).toFixed(2);
  lines.push(budgetTone(`  • Monthly budget: ${spend} / ${budgetCap} USD (${utilization.toFixed(0)}%)`));

  return lines.join("\n");
}

interface StatusCommandOptions extends BaseClientOptions {
  companyId?: string;
}

export function registerStatusCommand(program: Command): void {
  const status = program
    .command("status")
    .description("Show pending board decisions and budget at a glance");

  addCommonClientOptions(status, { includeCompany: true });

  status.action(async (opts: StatusCommandOptions) => {
    try {
      const ctx = resolveCommandContext(opts, { requireCompany: true });
      const report = await buildStatusReport(ctx.api, ctx.companyId!);
      if (ctx.json) {
        printOutput(report, { json: true });
        return;
      }
      console.log(formatStatusReport(report));
    } catch (err) {
      handleCommandError(err);
    }
  });
}
