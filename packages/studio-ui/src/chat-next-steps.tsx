import { t } from "@pireel/studio-ui/i18n";

/**
 * Next steps at the end of the latest reply, as the agent offers them: <next>…</next> lines closing its
 * reply, each a request in the user's own words. A tap writes it into the message box, to send as it is
 * or with more said.
 */

const NEXT_TAG = /<next>([\s\S]*?)<\/next>/g;

/** A reply's text without its next-step lines (an unfinished one while streaming included), and those steps. */
export function splitNextSteps(text: string): { body: string; steps: string[] } {
  const steps = [...text.matchAll(NEXT_TAG)].map((match) => match[1]!.trim()).filter(Boolean);
  const body = text.replace(NEXT_TAG, "").replace(/<next>[\s\S]*$|<(?:n(?:e(?:x(?:t)?)?)?)?$/, "").trimEnd();
  return { body, steps };
}

export function NextSteps({ steps, onPick }: { steps: readonly string[]; onPick: (request: string) => void }) {
  if (!steps.length) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-ink-3 text-[11px]">{t("chatGen.nextSteps")}</span>
      {steps.map((step) => (
        <button
          key={step}
          type="button"
          onClick={() => onPick(step)}
          className="border-line text-ink-2 hover:bg-panel-2 hover:text-ink w-fit max-w-full rounded-lg border px-2.5 py-1.5 text-left text-[12.5px] leading-snug transition-colors"
        >
          {step}
        </button>
      ))}
    </div>
  );
}
