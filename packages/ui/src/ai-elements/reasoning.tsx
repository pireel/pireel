"use client";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../collapsible";
import { cn } from "../cn";
import { BrainIcon, ChevronDownIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

export type ReasoningProps = Omit<
  ComponentProps<typeof Collapsible>,
  "open" | "defaultOpen" | "onOpenChange"
> & {
  /** Streaming opens the panel (live thinking is the whole point); the stream
   *  ending collapses it. Manual toggles in between are respected until the
   *  next transition. Restored sessions start in the done state → collapsed. */
  isStreaming?: boolean;
};

export const Reasoning = ({
  className,
  isStreaming = false,
  ...props
}: ReasoningProps) => {
  const [open, setOpen] = useState(isStreaming);
  const prev = useRef(isStreaming);
  useEffect(() => {
    if (prev.current !== isStreaming) {
      prev.current = isStreaming;
      setOpen(isStreaming);
    }
  }, [isStreaming]);
  return (
    <Collapsible
      className={cn("not-prose w-full", className)}
      open={open}
      onOpenChange={setOpen}
      {...props}
    />
  );
};

export type ReasoningTriggerProps = ComponentProps<
  typeof CollapsibleTrigger
> & {
  children: ReactNode;
};

export const ReasoningTrigger = ({
  className,
  children,
  ...props
}: ReasoningTriggerProps) => (
  <CollapsibleTrigger
    className={cn(
      "flex items-center gap-1.5 text-muted-foreground text-xs transition-colors hover:text-foreground",
      className,
    )}
    {...props}
  >
    <BrainIcon className="size-3.5" />
    <span>{children}</span>
    <ChevronDownIcon className="size-3.5 transition-transform group-data-[state=open]:rotate-180 [[data-state=open]>&]:rotate-180" />
  </CollapsibleTrigger>
);

export type ReasoningContentProps = ComponentProps<typeof CollapsibleContent>;

export const ReasoningContent = ({
  className,
  ...props
}: ReasoningContentProps) => (
  <CollapsibleContent
    className={cn(
      "mt-2 border-muted-foreground/20 border-l-2 pl-3 text-muted-foreground text-xs leading-relaxed",
      className,
    )}
    {...props}
  />
);
