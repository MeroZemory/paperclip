import { useMemo, useRef, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { DocumentAnnotationThreadWithComments } from "@paperclipai/shared";
import { DocumentAnnotationPanel } from "@/components/DocumentAnnotationPanel";
import { DocumentAnnotationLayer, type PendingAnchor } from "@/components/DocumentAnnotationLayer";
import { MarkdownBody } from "@/components/MarkdownBody";

const sampleMarkdown = `# Plan: Document Highlights And Comment Threads

We should **keep** the current markdown document stack for the first version.
The existing editor is MDXEditor on top of Lexical, and the current code already uses Lexical-level customization.

## Reader And Goal

Reader: board reviewer, CTO, and implementing engineers.

## Anchor Strategy

Do not insert comment markers into markdown. The markdown document body must
remain portable and readable.

Use a sidecar anchor made from two selectors:

- Text quote selector: exact selected text plus prefix/suffix context.
- Text position selector: normalized rendered-text offsets plus markdown source offsets.

## Future Work

Phase 5 covers QA validation across desktop and mobile.`;

function makeThread(
  overrides: Partial<DocumentAnnotationThreadWithComments> = {},
): DocumentAnnotationThreadWithComments {
  const id = overrides.id ?? "thread-1";
  return {
    id,
    companyId: "co-1",
    issueId: "issue-1",
    documentId: "doc-1",
    documentKey: "plan",
    status: "open",
    anchorState: "active",
    anchorConfidence: "exact",
    originalRevisionId: "rev-4",
    originalRevisionNumber: 4,
    currentRevisionId: "rev-4",
    currentRevisionNumber: 4,
    selectedText: "keep the current markdown document stack",
    prefixText: "We should ",
    suffixText: " for the first version",
    normalizedStart: 0,
    normalizedEnd: 40,
    markdownStart: 0,
    markdownEnd: 40,
    anchorSelector: {
      quote: {
        exact: "keep the current markdown document stack",
        prefix: "We should ",
        suffix: " for the first version",
      },
      position: { normalizedStart: 0, normalizedEnd: 40, markdownStart: 0, markdownEnd: 40 },
    },
    createdByAgentId: null,
    createdByUserId: "user-1",
    resolvedByAgentId: null,
    resolvedByUserId: null,
    resolvedAt: null,
    createdAt: new Date("2026-05-12T10:00:00Z"),
    updatedAt: new Date("2026-05-12T10:01:00Z"),
    comments: [
      {
        id: "comment-1",
        companyId: "co-1",
        threadId: id,
        issueId: "issue-1",
        documentId: "doc-1",
        body: "Could we benchmark the editor against a CRDT alternative before committing?",
        authorType: "user",
        authorAgentId: null,
        authorUserId: "user-1",
        createdByRunId: null,
        createdAt: new Date("2026-05-12T10:00:00Z"),
        updatedAt: new Date("2026-05-12T10:00:00Z"),
      },
      {
        id: "comment-2",
        companyId: "co-1",
        threadId: id,
        issueId: "issue-1",
        documentId: "doc-1",
        body: "We did a small spike — happy to share results in the plan.",
        authorType: "agent",
        authorAgentId: "agent-1",
        authorUserId: null,
        createdByRunId: "run-1",
        createdAt: new Date("2026-05-12T10:01:00Z"),
        updatedAt: new Date("2026-05-12T10:01:00Z"),
      },
    ],
    ...overrides,
  };
}

const baseThreads: DocumentAnnotationThreadWithComments[] = [
  makeThread({ id: "open-1" }),
  makeThread({
    id: "stale-1",
    anchorState: "stale",
    anchorConfidence: "fuzzy",
    selectedText: "two selectors",
    prefixText: "anchor made from ",
    suffixText: ":",
    comments: [
      {
        id: "comment-stale",
        companyId: "co-1",
        threadId: "stale-1",
        issueId: "issue-1",
        documentId: "doc-1",
        body: "Original wording was slightly different — re-anchor when convenient.",
        authorType: "user",
        authorAgentId: null,
        authorUserId: "user-1",
        createdByRunId: null,
        createdAt: new Date("2026-05-12T11:00:00Z"),
        updatedAt: new Date("2026-05-12T11:00:00Z"),
      },
    ],
  }),
  makeThread({
    id: "resolved-1",
    status: "resolved",
    selectedText: "Reader: board reviewer, CTO, and implementing engineers",
    comments: [
      {
        id: "comment-resolved",
        companyId: "co-1",
        threadId: "resolved-1",
        issueId: "issue-1",
        documentId: "doc-1",
        body: "Updated reader list to add the security lead.",
        authorType: "agent",
        authorAgentId: "agent-1",
        authorUserId: null,
        createdByRunId: "run-1",
        createdAt: new Date("2026-05-12T12:00:00Z"),
        updatedAt: new Date("2026-05-12T12:00:00Z"),
      },
    ],
  }),
  makeThread({
    id: "orphan-1",
    anchorState: "orphaned",
    selectedText: "an earlier paragraph that has been rewritten",
    comments: [
      {
        id: "comment-orphan",
        companyId: "co-1",
        threadId: "orphan-1",
        issueId: "issue-1",
        documentId: "doc-1",
        body: "This anchor lost its location after the rewrite. Original quote preserved.",
        authorType: "user",
        authorAgentId: null,
        authorUserId: "user-1",
        createdByRunId: null,
        createdAt: new Date("2026-05-12T13:00:00Z"),
        updatedAt: new Date("2026-05-12T13:00:00Z"),
      },
    ],
  }),
];

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function StatesShowcase({ focusedThreadId = "open-1" }: { focusedThreadId?: string }) {
  const queryClient = useMemo(() => makeClient(), []);
  const bodyRef = useRef<HTMLElement | null>(null);
  const [pendingAnchor, setPendingAnchor] = useState<PendingAnchor | null>(null);
  const [focused, setFocused] = useState<string | null>(focusedThreadId);

  return (
    <QueryClientProvider client={queryClient}>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="relative rounded-lg border border-border bg-card p-4">
          <section
            ref={(element) => {
              bodyRef.current = element;
            }}
            className="relative"
          >
            <MarkdownBody className="text-[15px] leading-7">{sampleMarkdown}</MarkdownBody>
            <DocumentAnnotationLayer
              containerRef={bodyRef}
              markdown={sampleMarkdown}
              threads={baseThreads.map((thread) => ({
                id: thread.id,
                selectedText: thread.selectedText,
                status: thread.status,
                anchorState: thread.anchorState,
              }))}
              focusedThreadId={focused}
              onThreadFocus={(id) => setFocused(id)}
              pendingAnchor={pendingAnchor}
              onPendingAnchorChange={setPendingAnchor}
              onRequestComment={() => {}}
              hideResolved={false}
            />
          </section>
        </div>
        <DocumentAnnotationPanel
          open
          onOpenChange={() => {}}
          issueId="issue-1"
          documentKey="plan"
          documentRevisionNumber={4}
          baseRevisionId="rev-4"
          baseRevisionNumber={4}
          threads={baseThreads}
          focusedThreadId={focused}
          focusedCommentId={null}
          onFocusThread={(id) => setFocused(id)}
          pendingAnchor={null}
          onClearPendingAnchor={() => setPendingAnchor(null)}
        />
      </div>
    </QueryClientProvider>
  );
}

function DirtyDraftBlocked() {
  const queryClient = useMemo(() => makeClient(), []);

  return (
    <QueryClientProvider client={queryClient}>
      <DocumentAnnotationPanel
        open
        onOpenChange={() => {}}
        issueId="issue-1"
        documentKey="plan"
        documentRevisionNumber={4}
        baseRevisionId="rev-4"
        baseRevisionNumber={4}
        threads={baseThreads}
        focusedThreadId={null}
        focusedCommentId={null}
        onFocusThread={() => {}}
        pendingAnchor={null}
        onClearPendingAnchor={() => {}}
        newCommentDisabled
        newCommentDisabledReason="Save the draft to anchor new comments."
      />
    </QueryClientProvider>
  );
}

function MobileBottomSheet() {
  const queryClient = useMemo(() => makeClient(), []);
  return (
    <QueryClientProvider client={queryClient}>
      <div className="relative h-[640px] bg-card p-4">
        <MarkdownBody className="text-[15px] leading-7">{sampleMarkdown}</MarkdownBody>
        <DocumentAnnotationPanel
          open
          onOpenChange={() => {}}
          issueId="issue-1"
          documentKey="plan"
          documentRevisionNumber={4}
          baseRevisionId="rev-4"
          baseRevisionNumber={4}
          threads={baseThreads}
          focusedThreadId="open-1"
          focusedCommentId={null}
          onFocusThread={() => {}}
          pendingAnchor={null}
          onClearPendingAnchor={() => {}}
          isMobile
        />
      </div>
    </QueryClientProvider>
  );
}

const meta = {
  title: "Product/Documents/Annotations",
  component: StatesShowcase,
  parameters: {
    docs: {
      description: {
        component:
          "Document annotation surface for issue documents. Covers the count chip, side panel, mobile bottom sheet, dirty-draft disable, and the open/resolved/stale/orphaned state matrix.",
      },
    },
  },
} satisfies Meta<typeof StatesShowcase>;

export default meta;

type Story = StoryObj<typeof meta>;

export const DesktopOpenFocused: Story = {
  render: () => <StatesShowcase focusedThreadId="open-1" />,
};

export const DesktopResolvedFocused: Story = {
  render: () => <StatesShowcase focusedThreadId="resolved-1" />,
};

export const DesktopStaleFocused: Story = {
  render: () => <StatesShowcase focusedThreadId="stale-1" />,
};

export const DesktopOrphanedFocused: Story = {
  render: () => <StatesShowcase focusedThreadId="orphan-1" />,
};

export const DirtyDraftDisablesNewComments: Story = {
  render: () => <DirtyDraftBlocked />,
};

export const MobileBottomSheetView: Story = {
  parameters: { viewport: { defaultViewport: "mobile1" } },
  render: () => <MobileBottomSheet />,
};
