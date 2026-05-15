import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  DocumentAnnotationComment,
  DocumentAnnotationThreadStatus,
  DocumentAnnotationThreadWithComments,
} from "@paperclipai/shared";
import { Check, Copy, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { cn, relativeTime } from "@/lib/utils";
import { documentAnnotationsApi } from "@/api/document-annotations";
import { MarkdownBody } from "./MarkdownBody";
import type { PendingAnchor } from "./DocumentAnnotationLayer";

type AnnotationFilter = "open" | "resolved" | "stale" | "orphan";

const FILTERS: { id: AnnotationFilter; label: string }[] = [
  { id: "open", label: "Open" },
  { id: "resolved", label: "Resolved" },
  { id: "stale", label: "Stale" },
  { id: "orphan", label: "Orphaned" },
];

export interface AnnotationPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  issueId: string;
  documentKey: string;
  documentRevisionNumber: number;
  baseRevisionId: string | null;
  baseRevisionNumber: number;
  threads: DocumentAnnotationThreadWithComments[];
  focusedThreadId: string | null;
  onFocusThread: (threadId: string | null) => void;
  focusedCommentId: string | null;
  /** External pending anchor captured from the layer for the composer. */
  pendingAnchor: PendingAnchor | null;
  onClearPendingAnchor: () => void;
  newCommentDisabled?: boolean;
  newCommentDisabledReason?: string | null;
  /** When mobile is true, render as a bottom sheet style panel instead of side panel. */
  isMobile?: boolean;
  className?: string;
}

export function DocumentAnnotationPanel(props: AnnotationPanelProps) {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<AnnotationFilter>("open");
  const [composerValue, setComposerValue] = useState("");
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const composerRef = useRef<HTMLTextAreaElement | null>(null);

  const filteredThreads = useMemo(() => {
    return props.threads.filter((thread) => {
      if (filter === "open") return thread.status === "open" && thread.anchorState !== "orphaned";
      if (filter === "resolved") return thread.status === "resolved";
      if (filter === "stale") return thread.anchorState === "stale";
      if (filter === "orphan") return thread.anchorState === "orphaned";
      return true;
    });
  }, [props.threads, filter]);

  const counts = useMemo(() => {
    const result = { open: 0, resolved: 0, stale: 0, orphan: 0 };
    for (const thread of props.threads) {
      if (thread.status === "resolved") result.resolved += 1;
      if (thread.anchorState === "stale") result.stale += 1;
      if (thread.anchorState === "orphaned") result.orphan += 1;
      if (thread.status === "open" && thread.anchorState !== "orphaned") result.open += 1;
    }
    return result;
  }, [props.threads]);

  const createThread = useMutation({
    mutationFn: async (body: string) => {
      if (!props.pendingAnchor) throw new Error("No selection to anchor to.");
      if (!props.baseRevisionId) throw new Error("Document has no revision yet.");
      return documentAnnotationsApi.create(props.issueId, props.documentKey, {
        baseRevisionId: props.baseRevisionId,
        baseRevisionNumber: props.baseRevisionNumber,
        selector: props.pendingAnchor.selector,
        body,
      });
    },
    onSuccess: (thread) => {
      props.onClearPendingAnchor();
      setComposerValue("");
      props.onFocusThread(thread.id);
      invalidateAll();
    },
  });

  const addReply = useMutation({
    mutationFn: ({ threadId, body }: { threadId: string; body: string }) =>
      documentAnnotationsApi.addComment(props.issueId, props.documentKey, threadId, { body }),
    onSuccess: (_data, variables) => {
      setReplyDrafts((current) => ({ ...current, [variables.threadId]: "" }));
      invalidateAll();
    },
  });

  const updateStatus = useMutation({
    mutationFn: ({ threadId, status }: { threadId: string; status: DocumentAnnotationThreadStatus }) =>
      documentAnnotationsApi.updateStatus(props.issueId, props.documentKey, threadId, status),
    onSuccess: () => invalidateAll(),
  });

  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({
      predicate: (query) =>
        Array.isArray(query.queryKey)
        && query.queryKey[0] === "issues"
        && query.queryKey[1] === "document-annotations"
        && query.queryKey[2] === props.issueId
        && query.queryKey[3] === props.documentKey,
    });
  }, [props.documentKey, props.issueId, queryClient]);

  useEffect(() => {
    if (!props.open) {
      setComposerValue("");
    }
  }, [props.open]);

  useEffect(() => {
    if (props.pendingAnchor && props.open) {
      composerRef.current?.focus();
    }
  }, [props.open, props.pendingAnchor]);

  useEffect(() => {
    if (!props.focusedThreadId) return;
    const focused = props.threads.find((thread) => thread.id === props.focusedThreadId);
    if (!focused) return;
    if (focused.anchorState === "orphaned") setFilter("orphan");
    else if (focused.anchorState === "stale") setFilter("stale");
    else if (focused.status === "resolved") setFilter("resolved");
    else setFilter("open");
  }, [props.focusedThreadId, props.threads]);

  if (!props.open) return null;

  const baseClasses = props.isMobile
    ? "fixed inset-x-0 bottom-0 z-40 max-h-[80vh] rounded-t-xl border-t border-border bg-background shadow-2xl"
    : "sticky top-4 z-30 flex h-full max-h-[80vh] w-[360px] shrink-0 flex-col rounded-lg border border-border bg-card shadow-md";

  return (
    <aside
      role="complementary"
      aria-label={`Annotations for ${props.documentKey.toUpperCase()}, revision ${props.documentRevisionNumber}`}
      data-testid="document-annotation-panel"
      className={cn(baseClasses, "flex flex-col overflow-hidden", props.className)}
    >
      <header className="flex items-start justify-between gap-2 border-b border-border px-3 py-2.5">
        <div className="min-w-0">
          <p className="text-sm font-medium">Comments</p>
          <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            {props.documentKey} · rev {props.documentRevisionNumber}
          </p>
        </div>
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          className="text-muted-foreground"
          onClick={() => {
            props.onFocusThread(null);
            props.onOpenChange(false);
          }}
          aria-label="Close annotation panel"
        >
          <X className="h-4 w-4" />
        </Button>
      </header>
      <div className="flex flex-wrap gap-1.5 border-b border-border px-3 py-2">
        {FILTERS.map((entry) => {
          const count = counts[entry.id];
          const isActive = filter === entry.id;
          return (
            <Button
              key={entry.id}
              type="button"
              size="sm"
              variant={isActive ? "default" : "secondary"}
              className="h-7 gap-1 px-2 text-[11px] font-medium"
              onClick={() => setFilter(entry.id)}
            >
              {entry.label}
              <span className="opacity-70">{count}</span>
            </Button>
          );
        })}
      </div>
      {props.newCommentDisabled && props.newCommentDisabledReason ? (
        <p
          data-testid="document-annotation-disabled-reason"
          className="border-b border-border bg-muted/40 px-3 py-1.5 text-[11px] text-muted-foreground"
        >
          {props.newCommentDisabledReason}
        </p>
      ) : null}
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2">
        {filteredThreads.length === 0 ? (
          <p className="py-8 text-center text-xs text-muted-foreground">
            {filter === "open" ? "No open comments yet. Select text to add one." : `No ${filter} comments.`}
          </p>
        ) : (
          <ul className="space-y-2">
            {filteredThreads.map((thread) => (
              <ThreadCard
                key={thread.id}
                thread={thread}
                expanded={thread.id === props.focusedThreadId}
                focusedCommentId={
                  thread.id === props.focusedThreadId ? props.focusedCommentId : null
                }
                onFocus={() => props.onFocusThread(thread.id)}
                replyDraft={replyDrafts[thread.id] ?? ""}
                onReplyChange={(value) =>
                  setReplyDrafts((current) => ({ ...current, [thread.id]: value }))
                }
                onSubmitReply={() => {
                  const body = (replyDrafts[thread.id] ?? "").trim();
                  if (!body) return;
                  addReply.mutate({ threadId: thread.id, body });
                }}
                onResolveToggle={() =>
                  updateStatus.mutate({
                    threadId: thread.id,
                    status: thread.status === "resolved" ? "open" : "resolved",
                  })
                }
                onCopyLink={() => copyAnnotationLink(props.documentKey, thread.id)}
                pendingReply={addReply.isPending && addReply.variables?.threadId === thread.id}
                pendingStatus={updateStatus.isPending && updateStatus.variables?.threadId === thread.id}
              />
            ))}
          </ul>
        )}
      </div>
      {props.pendingAnchor ? (
        <div className="border-t border-border bg-muted/20 px-3 py-2">
          <p className="mb-1 text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
            New comment on selection
          </p>
          <blockquote className="mb-2 max-h-24 overflow-y-auto rounded-md border-l-2 border-muted-foreground/60 bg-background px-2 py-1 text-xs italic text-muted-foreground">
            {truncate(props.pendingAnchor.selectedText, 240)}
          </blockquote>
          <Textarea
            ref={composerRef}
            data-testid="document-annotation-composer"
            rows={3}
            value={composerValue}
            onChange={(event) => setComposerValue(event.target.value)}
            placeholder="Write a comment…"
            disabled={props.newCommentDisabled}
            className="resize-y text-sm"
          />
          {createThread.isError ? (
            <p className="mt-1 text-xs text-destructive">
              {(createThread.error as Error).message || "Failed to create comment"}
            </p>
          ) : null}
          <div className="mt-2 flex items-center justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                props.onClearPendingAnchor();
                setComposerValue("");
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={
                createThread.isPending
                || !composerValue.trim()
                || props.newCommentDisabled
                || !props.baseRevisionId
              }
              onClick={() => createThread.mutate(composerValue.trim())}
            >
              {createThread.isPending ? "Posting…" : "Comment"}
            </Button>
          </div>
        </div>
      ) : null}
    </aside>
  );
}

function ThreadCard(props: {
  thread: DocumentAnnotationThreadWithComments;
  expanded: boolean;
  focusedCommentId: string | null;
  onFocus: () => void;
  replyDraft: string;
  onReplyChange: (value: string) => void;
  onSubmitReply: () => void;
  onResolveToggle: () => void;
  onCopyLink: () => void;
  pendingReply: boolean;
  pendingStatus: boolean;
}) {
  const { thread } = props;
  const statusVariant: { variant: "default" | "outline" | "secondary"; label: string } =
    thread.status === "resolved"
      ? { variant: "outline", label: "Resolved" }
      : thread.anchorState === "orphaned"
        ? { variant: "outline", label: "Orphaned" }
        : thread.anchorState === "stale"
          ? { variant: "outline", label: "Stale" }
          : { variant: "default", label: "Open" };
  const latestComment = thread.comments[thread.comments.length - 1];

  return (
    <li>
      <article
        role="article"
        data-thread-id={thread.id}
        data-anchor-state={thread.anchorState}
        data-status={thread.status}
        data-focused={props.expanded || undefined}
        aria-labelledby={`thread-quote-${thread.id}`}
        className={cn(
          "rounded-md border bg-card transition-colors",
          props.expanded ? "border-primary/60" : "border-border",
          thread.status === "resolved" && "bg-muted/30",
        )}
        tabIndex={0}
        onClick={props.onFocus}
      >
        <div className="flex items-center justify-between gap-2 px-3 pt-2 text-[11px] text-muted-foreground">
          <Badge variant={statusVariant.variant} className="px-1.5 py-0 text-[10px] uppercase tracking-[0.12em]">
            {statusVariant.label}
          </Badge>
          <span>{relativeTime(thread.updatedAt)}</span>
        </div>
        <blockquote
          id={`thread-quote-${thread.id}`}
          className={cn(
            "mx-3 mt-1 max-h-20 overflow-hidden rounded-sm border-l-2 px-2 py-1 text-xs italic text-muted-foreground",
            thread.anchorState === "stale" || thread.status === "resolved"
              ? "border-dashed border-muted-foreground/40"
              : "border-muted-foreground/60",
          )}
        >
          {truncate(thread.selectedText, 160)}
        </blockquote>
        {props.expanded ? (
          <div className="space-y-2 px-3 py-2">
            {thread.comments.map((comment) => (
              <CommentRow
                key={comment.id}
                comment={comment}
                focused={props.focusedCommentId === comment.id}
              />
            ))}
            <Textarea
              data-testid={`document-annotation-reply-${thread.id}`}
              rows={2}
              value={props.replyDraft}
              onChange={(event) => props.onReplyChange(event.target.value)}
              placeholder="Reply…"
              className="resize-y text-sm"
              disabled={props.pendingReply}
            />
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={props.onCopyLink}
                className="gap-1"
                title="Copy link"
              >
                <Copy className="h-3 w-3" /> Copy link
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={props.onResolveToggle}
                disabled={props.pendingStatus}
                className="gap-1"
              >
                {thread.status === "resolved" ? (
                  <>
                    <RotateCcw className="h-3 w-3" /> Reopen
                  </>
                ) : (
                  <>
                    <Check className="h-3 w-3" /> Resolve
                  </>
                )}
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={!props.replyDraft.trim() || props.pendingReply}
                onClick={props.onSubmitReply}
              >
                {props.pendingReply ? "Sending…" : "Reply"}
              </Button>
            </div>
          </div>
        ) : (
          <p className="px-3 py-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">
              {thread.comments.length} comment{thread.comments.length === 1 ? "" : "s"}
            </span>
            {latestComment ? <span className="ml-1">· {truncate(latestComment.body, 120)}</span> : null}
          </p>
        )}
      </article>
    </li>
  );
}

function CommentRow({
  comment,
  focused,
}: {
  comment: DocumentAnnotationComment;
  focused: boolean;
}) {
  return (
    <div
      id={`comment-${comment.id}`}
      data-focused={focused || undefined}
      className={cn(
        "rounded-md border border-border bg-background px-2 py-1.5",
        focused && "ring-2 ring-primary/40",
      )}
    >
      <div className="mb-0.5 flex items-center justify-between text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
        <span>{comment.authorType === "user" ? "Board" : "Agent"}</span>
        <span>{relativeTime(comment.createdAt)}</span>
      </div>
      <MarkdownBody className="text-sm leading-6">{comment.body}</MarkdownBody>
    </div>
  );
}

function truncate(value: string, limit: number) {
  if (value.length <= limit) return value;
  return `${value.slice(0, limit - 1)}…`;
}

async function copyAnnotationLink(documentKey: string, threadId: string) {
  if (typeof window === "undefined" || !navigator.clipboard) return;
  const { pathname } = window.location;
  const hash = `#document-${encodeURIComponent(documentKey)}&thread=${encodeURIComponent(threadId)}`;
  try {
    await navigator.clipboard.writeText(`${window.location.origin}${pathname}${hash}`);
  } catch {
    /* swallow */
  }
}
