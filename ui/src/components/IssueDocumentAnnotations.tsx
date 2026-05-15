import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import type { DocumentAnnotationThreadWithComments, IssueDocument } from "@paperclipai/shared";
import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { documentAnnotationsApi } from "@/api/document-annotations";
import { queryKeys } from "@/lib/queryKeys";
import { parseDocumentAnnotationHash } from "@/lib/document-annotation-hash";
import { DocumentAnnotationLayer, type PendingAnchor } from "./DocumentAnnotationLayer";
import { DocumentAnnotationPanel } from "./DocumentAnnotationPanel";

export interface IssueDocumentAnnotationsProps {
  issueId: string;
  doc: IssueDocument;
  /** The body that is being rendered/edited (current or historical revision). */
  bodyMarkdown: string;
  /** True when a draft has unsaved changes or is currently saving. */
  draftDirty: boolean;
  /** True when there is a remote conflict that requires user resolution. */
  draftConflicted: boolean;
  /** True when the document is being viewed in historical revision preview. */
  historicalPreview: boolean;
  /** Render the document body (rendered MarkdownBody or MarkdownEditor) inside the wrapper. */
  children: ReactNode;
  /** Current location hash so we can resolve deep-link targets. */
  locationHash: string;
}

export function IssueDocumentAnnotations({
  issueId,
  doc,
  bodyMarkdown,
  draftDirty,
  draftConflicted,
  historicalPreview,
  children,
  locationHash,
}: IssueDocumentAnnotationsProps) {
  const containerRef = useRef<HTMLElement | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [focusedThreadId, setFocusedThreadId] = useState<string | null>(null);
  const [focusedCommentId, setFocusedCommentId] = useState<string | null>(null);
  const [pendingAnchor, setPendingAnchor] = useState<PendingAnchor | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const hashHandledRef = useRef<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mediaQuery = window.matchMedia("(max-width: 1023px)");
    const handler = () => setIsMobile(mediaQuery.matches);
    handler();
    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", handler);
      return () => mediaQuery.removeEventListener("change", handler);
    }
    return undefined;
  }, []);

  const annotationsQuery = useQuery({
    queryKey: queryKeys.issues.documentAnnotations(issueId, doc.key, "all"),
    queryFn: () => documentAnnotationsApi.list(issueId, doc.key, { status: "all", includeComments: true }),
    staleTime: 30_000,
  });
  const allThreads = annotationsQuery.data ?? [];

  const openCount = useMemo(
    () => allThreads.filter((thread) => thread.status === "open" && thread.anchorState !== "orphaned").length,
    [allThreads],
  );

  // Resolve deep link `#document-<key>&thread=...&comment=...` once per change.
  useEffect(() => {
    if (!locationHash) return;
    if (hashHandledRef.current === locationHash) return;
    const target = parseDocumentAnnotationHash(locationHash);
    if (!target || target.documentKey !== doc.key) return;
    if (!target.threadId) return;
    hashHandledRef.current = locationHash;
    setPanelOpen(true);
    setFocusedThreadId(target.threadId);
    setFocusedCommentId(target.commentId);
  }, [doc.key, locationHash]);

  const newCommentDisabled = draftDirty || draftConflicted || historicalPreview || !doc.latestRevisionId;
  const newCommentDisabledReason = historicalPreview
    ? "New comments are disabled while previewing a historical revision."
    : draftConflicted
      ? "Resolve the document conflict before adding new comments."
      : draftDirty
        ? "Save the draft to anchor new comments."
        : !doc.latestRevisionId
          ? "Document has no saved revision yet."
          : null;

  const handleRequestComment = useCallback((anchor: PendingAnchor) => {
    if (newCommentDisabled) return;
    setPendingAnchor(anchor);
    setPanelOpen(true);
  }, [newCommentDisabled]);

  const handleThreadFocus = useCallback((threadId: string | null) => {
    setFocusedThreadId(threadId);
    if (threadId) {
      setPanelOpen(true);
      setFocusedCommentId(null);
    }
  }, []);

  const focusedThread = useMemo(() => {
    if (!focusedThreadId) return null;
    return allThreads.find((thread) => thread.id === focusedThreadId) ?? null;
  }, [allThreads, focusedThreadId]);

  const overlayThreads = useMemo(
    () => allThreads.map((thread) => ({
      id: thread.id,
      selectedText: thread.selectedText,
      status: thread.status,
      anchorState: thread.anchorState,
    })),
    [allThreads],
  );

  return (
    <div className="paperclip-doc-annotation-host flex flex-col gap-3 lg:flex-row lg:items-start">
      <div className="relative min-w-0 flex-1">
        <div className="mb-2 flex items-center justify-end gap-1.5">
          <Button
            type="button"
            size="sm"
            variant={openCount > 0 ? "secondary" : "ghost"}
            className={cn(
              "h-7 gap-1 rounded-full px-2 text-[11px] font-medium",
              openCount === 0 && "text-muted-foreground",
            )}
            onClick={() => setPanelOpen((current) => !current)}
            data-testid={`document-annotation-count-${doc.key}`}
            aria-label={openCount === 0
              ? `Open comments on ${doc.key}`
              : `Open ${openCount} unresolved comments on ${doc.key}`}
            aria-expanded={panelOpen}
          >
            <MessageSquare className="h-3 w-3" aria-hidden="true" />
            <span aria-hidden="true">{openCount}</span>
            <span className="hidden sm:inline">{openCount === 1 ? " comment" : " comments"}</span>
          </Button>
        </div>
        <section
          ref={(element) => {
            containerRef.current = element;
          }}
          className="relative"
          data-testid={`document-annotation-body-${doc.key}`}
        >
          {children}
          {!historicalPreview && doc.latestRevisionId ? (
            <DocumentAnnotationLayer
              containerRef={containerRef}
              markdown={bodyMarkdown}
              threads={overlayThreads}
              focusedThreadId={focusedThread?.id ?? null}
              onThreadFocus={handleThreadFocus}
              pendingAnchor={pendingAnchor}
              onPendingAnchorChange={(anchor) => setPendingAnchor(anchor)}
              onRequestComment={handleRequestComment}
              newCommentDisabled={newCommentDisabled}
              newCommentDisabledReason={newCommentDisabledReason}
              hideResolved
            />
          ) : null}
        </section>
      </div>
      {panelOpen ? (
        <DocumentAnnotationPanel
          open={panelOpen}
          onOpenChange={(open) => {
            setPanelOpen(open);
            if (!open) {
              setPendingAnchor(null);
              setFocusedThreadId(null);
              setFocusedCommentId(null);
            }
          }}
          issueId={issueId}
          documentKey={doc.key}
          documentRevisionNumber={doc.latestRevisionNumber}
          baseRevisionId={doc.latestRevisionId}
          baseRevisionNumber={doc.latestRevisionNumber}
          threads={allThreads as DocumentAnnotationThreadWithComments[]}
          focusedThreadId={focusedThreadId}
          focusedCommentId={focusedCommentId}
          onFocusThread={(id) => {
            setFocusedThreadId(id);
            if (!id) setFocusedCommentId(null);
          }}
          pendingAnchor={pendingAnchor}
          onClearPendingAnchor={() => setPendingAnchor(null)}
          newCommentDisabled={newCommentDisabled}
          newCommentDisabledReason={newCommentDisabledReason}
          isMobile={isMobile}
          className={isMobile ? undefined : "lg:w-[360px] lg:max-w-[360px]"}
        />
      ) : null}
    </div>
  );
}
