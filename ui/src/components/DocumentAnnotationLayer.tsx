import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { MessageSquarePlus } from "lucide-react";
import type {
  DocumentAnnotationAnchorState,
  DocumentAnnotationThreadStatus,
} from "@paperclipai/shared";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  buildAnchorFromContainerSelection,
  getContainerTextOffset,
  rangesForNormalizedSpan,
} from "@/lib/document-annotation-selection";
import type { DocumentAnnotationAnchorSelector } from "@paperclipai/shared";

export interface AnnotationOverlayThread {
  id: string;
  selectedText: string;
  status: DocumentAnnotationThreadStatus;
  anchorState: DocumentAnnotationAnchorState;
  unreadCount?: number;
}

export interface PendingAnchor {
  selector: DocumentAnnotationAnchorSelector;
  selectedText: string;
}

export interface AnnotationLayerProps {
  containerRef: React.RefObject<HTMLElement | null>;
  markdown: string;
  threads: AnnotationOverlayThread[];
  focusedThreadId: string | null;
  onThreadFocus: (threadId: string) => void;
  /** Tracks the most recently captured pending selection. */
  pendingAnchor: PendingAnchor | null;
  onPendingAnchorChange: (anchor: PendingAnchor | null) => void;
  onRequestComment: (anchor: PendingAnchor) => void;
  /** Disables the "add comment" affordance when set. */
  newCommentDisabled?: boolean;
  newCommentDisabledReason?: string | null;
  /** Hide resolved highlights even when included in the threads list. */
  hideResolved?: boolean;
  /** Test-only: override window object for layout calculations. */
  testWindow?: { innerWidth: number; innerHeight: number };
}

interface HighlightRect {
  threadId: string;
  status: DocumentAnnotationThreadStatus;
  anchorState: DocumentAnnotationAnchorState;
  top: number;
  left: number;
  width: number;
  height: number;
}

interface ToolbarPosition {
  top: number;
  left: number;
}

const POSITION_REFRESH_INTERVAL_MS = 250;

export function DocumentAnnotationLayer({
  containerRef,
  markdown,
  threads,
  focusedThreadId,
  onThreadFocus,
  pendingAnchor,
  onPendingAnchorChange,
  onRequestComment,
  newCommentDisabled = false,
  newCommentDisabledReason = null,
  hideResolved = true,
}: AnnotationLayerProps) {
  const [highlightRects, setHighlightRects] = useState<HighlightRect[]>([]);
  const [toolbarPosition, setToolbarPosition] = useState<ToolbarPosition | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const layerContainerRef = useRef<HTMLDivElement | null>(null);

  const visibleThreads = useMemo(() => {
    if (!hideResolved) return threads;
    return threads.filter((thread) => thread.status !== "resolved" || thread.anchorState === "orphaned" || thread.id === focusedThreadId);
  }, [threads, hideResolved, focusedThreadId]);

  const computeHighlightRects = useCallback(() => {
    const container = containerRef.current;
    const overlay = overlayRef.current;
    if (!container || !overlay) {
      setHighlightRects([]);
      return;
    }
    const overlayRect = overlay.getBoundingClientRect();
    const next: HighlightRect[] = [];
    for (const thread of visibleThreads) {
      if (thread.anchorState === "orphaned") continue;
      const ranges = rangesForNormalizedSpan({
        container,
        selectedText: thread.selectedText,
      });
      for (const range of ranges) {
        for (const rect of Array.from(range.getClientRects())) {
          if (rect.width === 0 || rect.height === 0) continue;
          next.push({
            threadId: thread.id,
            status: thread.status,
            anchorState: thread.anchorState,
            top: rect.top - overlayRect.top,
            left: rect.left - overlayRect.left,
            width: rect.width,
            height: rect.height,
          });
        }
      }
    }
    setHighlightRects(next);
  }, [containerRef, visibleThreads]);

  useLayoutEffect(() => {
    computeHighlightRects();
  }, [computeHighlightRects]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;
    const schedule = () => {
      if (cancelled) return;
      computeHighlightRects();
    };
    const interval = window.setInterval(schedule, POSITION_REFRESH_INTERVAL_MS);
    const handleResize = () => schedule();
    window.addEventListener("resize", handleResize);
    window.addEventListener("scroll", handleResize, true);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("scroll", handleResize, true);
    };
  }, [computeHighlightRects]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const handleSelectionChange = () => {
      const container = containerRef.current;
      const overlay = overlayRef.current;
      if (!container || !overlay) return;
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
        onPendingAnchorChange(null);
        setToolbarPosition(null);
        return;
      }
      const range = selection.getRangeAt(0);
      if (!container.contains(range.commonAncestorContainer)) {
        onPendingAnchorChange(null);
        setToolbarPosition(null);
        return;
      }
      const containerOffset = getContainerTextOffset(container, range);
      if (!containerOffset) {
        onPendingAnchorChange(null);
        setToolbarPosition(null);
        return;
      }
      const anchor = buildAnchorFromContainerSelection({
        markdown,
        containerOffset,
      });
      if (!anchor) {
        onPendingAnchorChange(null);
        setToolbarPosition(null);
        return;
      }
      onPendingAnchorChange({
        selector: anchor.selector,
        selectedText: containerOffset.selectedText,
      });

      const overlayRect = overlay.getBoundingClientRect();
      const rect = range.getBoundingClientRect();
      const top = Math.max(0, rect.top - overlayRect.top - 36);
      const left = Math.max(0, rect.left - overlayRect.left + rect.width / 2 - 80);
      setToolbarPosition({ top, left });
    };
    document.addEventListener("selectionchange", handleSelectionChange);
    return () => document.removeEventListener("selectionchange", handleSelectionChange);
  }, [containerRef, markdown, onPendingAnchorChange]);

  const handleAddComment = () => {
    if (pendingAnchor) onRequestComment(pendingAnchor);
  };

  return (
    <div
      ref={layerContainerRef}
      className="paperclip-doc-annotation-layer pointer-events-none absolute inset-0 z-0"
      aria-hidden="true"
    >
      <div ref={overlayRef} className="relative h-full w-full">
        {highlightRects.map((rect, index) => {
          const isFocused = rect.threadId === focusedThreadId;
          return (
            <button
              key={`${rect.threadId}-${index}`}
              type="button"
              data-thread-id={rect.threadId}
              data-anchor-state={rect.anchorState}
              data-status={rect.status}
              data-focused={isFocused || undefined}
              aria-label={`Open annotation thread`}
              className={cn(
                "paperclip-doc-annotation-highlight pointer-events-auto absolute cursor-pointer rounded-sm border-b-2 transition-colors",
                rect.status === "resolved"
                  ? "border-dashed border-muted-foreground/40 hover:bg-muted/40"
                  : rect.anchorState === "stale"
                    ? "border-dashed border-amber-500/60 hover:bg-amber-500/10"
                    : isFocused
                      ? "border-primary bg-primary/10"
                      : "border-muted-foreground/50 hover:bg-muted/30",
              )}
              style={{
                top: rect.top,
                left: rect.left,
                width: rect.width,
                height: rect.height,
              }}
              onMouseDown={(event) => {
                event.preventDefault();
                onThreadFocus(rect.threadId);
              }}
            />
          );
        })}
        {pendingAnchor && toolbarPosition ? (
          <div
            data-testid="document-annotation-selection-toolbar"
            role="toolbar"
            aria-label="Selection actions"
            className="paperclip-doc-annotation-selection-toolbar pointer-events-auto absolute z-10 flex items-center gap-1 rounded-md border border-border bg-popover px-1 py-1 shadow-md"
            style={{ top: toolbarPosition.top, left: toolbarPosition.left }}
            onMouseDown={(event) => event.preventDefault()}
          >
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 gap-1 px-2 text-xs"
              onClick={handleAddComment}
              disabled={newCommentDisabled}
              title={newCommentDisabled
                ? newCommentDisabledReason ?? undefined
                : "Add comment on selection (⌘⇧M)"}
            >
              <MessageSquarePlus className="h-3.5 w-3.5" aria-hidden="true" />
              Comment
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
