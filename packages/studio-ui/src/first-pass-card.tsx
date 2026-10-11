import { Check, Loader2, Minus, X } from "lucide-react";
import type { UIMessage } from "ai";
import type { FineCutItem, FirstPassReport, FirstPassStepStatus } from "./first-pass";
import { editingSkillName } from "./editing-skills";
import { useToolProgress } from "./tool-progress";
import { t } from "./i18n";

/** The tool whose call shows as the rough cut's checklist. */
export const ROUGH_CUT_TOOL = "rough_cut";

/** The tool a message part calls ("" for a part that is not a tool call). */
export function toolNameOfPart(part: { type: string; toolName?: unknown }): string {
  if (part.type === "dynamic-tool") return typeof part.toolName === "string" ? part.toolName : "";
  return part.type.startsWith("tool-") ? part.type.slice("tool-".length) : "";
}

/** What the chat keeps on the reply that holds a rough cut (message metadata, never the tool receipt the
 *  model reads back): the agent's part of a one-click edit, and credits billed after the rough cut ended. */
export interface RoughCutReplyMeta {
  fineCut?: { state: "running" | "done"; items: FineCutItem[] };
  lateCredits?: number;
}

const FINE_ICON: Record<FineCutItem["status"], FirstPassStepStatus> = { running: "running", done: "done", "not-needed": "skipped", "not-added": "skipped", stopped: "skipped" };
const ICON: Record<FirstPassStepStatus, React.ReactNode> = {
  pending: <span className="border-line-2 size-3 rounded-full border" />,
  running: <Loader2 className="text-ink-2 size-3.5 animate-spin" />,
  done: <Check className="text-ink size-3.5" />,
  skipped: <Minus className="text-ink-4 size-3.5" />,
  failed: <X className="size-3.5 text-red-500" />,
};

/** Credits the agent's requests in this reply have used so far (each request reports its running cost). */
export function messageTurnCredits(message: UIMessage): number {
  const turns = (message.metadata as { turnCredits?: Record<string, unknown> } | undefined)?.turnCredits;
  return turns ? Object.values(turns).reduce<number>((sum, value) => sum + (typeof value === "number" && Number.isFinite(value) ? value : 0), 0) : 0;
}

/**
 * A rough_cut call as its checklist: live from the tool's progress while it runs in this tab, from its
 * receipt once done. A call a closed page left unanswered shows as stopped.
 */
export function RoughCutCard({ part, running, fineCutLive, brandName, meta, agentCredits, checkpoint }: {
  part: { state?: string; output?: unknown; errorText?: string };
  /** The call is executing in this tab right now. */
  running: boolean;
  /** The agent continuing this reply is still at work (the fine-cut rows are counting). */
  fineCutLive: boolean;
  brandName?: string;
  meta?: RoughCutReplyMeta;
  agentCredits: number;
  checkpoint?: FirstPassReport;
}) {
  const progress = useToolProgress(ROUGH_CUT_TOOL);
  const output = part.output as { data?: { report?: FirstPassReport } } | undefined;
  const report = output?.data?.report ?? checkpoint ?? (running ? (progress?.report as FirstPassReport | undefined) : undefined);
  if (!report) {
    return (
      <div className="border-line bg-panel text-ink-3 w-full rounded-lg border px-3 py-2.5 text-[12px]">
        <span className="text-ink font-medium">{t("chatGen.firstPass.title")}</span>
        {" · "}
        {running ? t("chatGen.firstPass.running") : part.state === "output-error" ? (part.errorText ?? t("chatGen.executionFailed")) : t("chatGen.firstPass.stoppedState")}
      </div>
    );
  }
  return <FirstPassCard report={report} live={running} fineCut={meta?.fineCut} fineCutLive={fineCutLive} lateCredits={meta?.lateCredits ?? 0} brandName={brandName} agentCredits={agentCredits} />;
}

/** The rough cut as a checklist: each fixed step and what it did, the agent's fine cut after it, and the
 *  credits the reply has used. */
export function FirstPassCard({ report, live, fineCut, fineCutLive, lateCredits, brandName, agentCredits }: {
  report: FirstPassReport;
  /** The pass is running in this tab. */
  live: boolean;
  fineCut?: RoughCutReplyMeta["fineCut"];
  fineCutLive: boolean;
  lateCredits: number;
  /** The brand the project is edited with (fixed once it starts), shown in the title. */
  brandName?: string;
  agentCredits: number;
}) {
  // A pass a closed page left "running" is stopped; the step it was on did not finish.
  const state = report.state === "running" && !live ? "stopped" : report.state;
  const stepStatus = (status: FirstPassStepStatus): FirstPassStepStatus => (status === "running" && !live ? "pending" : status);
  const fineStatus = (status: FineCutItem["status"]): FineCutItem["status"] => (status === "running" && !fineCutLive ? "stopped" : status);
  const stopping = state === "stopped" && live;
  return (
    <div className="border-line bg-panel w-full rounded-lg border px-3 py-2.5 text-[12px]">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-ink min-w-0 truncate font-medium">
          {t("chatGen.firstPass.title")}
          {brandName && <span className="text-ink-3 font-normal"> · {t("chatGen.firstPass.inBrand", { name: brandName })}</span>}
        </span>
        <span className="text-ink-3 shrink-0 tabular-nums">
          {state === "running" && <>{t("chatGen.firstPass.running")} · </>}
          {(state === 'partial' || state === 'failed') && <>{t('chatGen.firstPass.incomplete')} · </>}
          {state === "stopped" && <>{t(stopping ? "chatGen.firstPass.stopping" : "chatGen.firstPass.stoppedState")} · </>}
          {t("chatGen.firstPass.credits", { n: Math.round((report.credits + lateCredits + agentCredits) * 100) / 100 })}
        </span>
      </div>
      <ul className="flex flex-col gap-1">
        {report.steps.map((step) => (
          <li key={step.id} className="flex items-center gap-2">
            <span className="flex size-4 shrink-0 items-center justify-center">{ICON[stepStatus(step.status)]}</span>
            <span className={step.status === "skipped" ? "text-ink-4" : "text-ink-2"}>{t(`chatGen.firstPass.step.${step.id}`)}</span>
            {stopping && step.status === "running" ? (
              <span className="text-ink-3 ml-auto pl-2">{t("chatGen.firstPass.stopping")}…</span>
            ) : step.detail && (
              <span className={`ml-auto truncate pl-2 ${step.status === "failed" ? "text-red-500" : "text-ink-3"}`} title={step.detail}>
                {step.detail}
              </span>
            )}
          </li>
        ))}
      </ul>
      {report.summary && <p className="text-ink border-line mt-2 border-t pt-2">{report.summary}</p>}
      {fineCut && (
        <>
          <div className="text-ink border-line mt-2.5 mb-1.5 border-t pt-2 font-medium">{t("chatGen.firstPass.fineCutTitle")}</div>
          <ul className="flex flex-col gap-1">
            {fineCut.items.map((item) => (
              <li key={item.id} className="flex items-center gap-2">
                <span className="flex size-4 shrink-0 items-center justify-center">{ICON[FINE_ICON[fineStatus(item.status)]]}</span>
                <span className={item.status === "done" || item.status === "running" ? "text-ink-2" : "text-ink-4"}>{editingSkillName(item.id)}</span>
                <span className="text-ink-3 ml-auto pl-2">
                  {(item.status === "not-needed" || item.status === "not-added")
                    ? t("chatGen.firstPass.notAdded")
                    : fineStatus(item.status) === "stopped"
                      ? t("chatGen.firstPass.stopped")
                      : item.count ? t("chatGen.firstPass.added", { n: item.count }) : ""}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
