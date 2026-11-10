import { t } from './i18n';
import { CreditsShort, offerCredits, type CreditGate } from './current-user';

/** What one generation costs: an exact price, an estimate, a starting price (more may follow), a range, or a ceiling. */
export type CreditCost =
  | { credits: number; kind?: 'exact' | 'about' | 'from' | 'upTo' }
  | { min: number; max: number };

export function creditCostText(cost: CreditCost): string {
  if ('min' in cost) return cost.min === cost.max ? creditCostText({ credits: cost.min }) : t('common.creditsRange', { min: cost.min, max: cost.max });
  if (cost.kind === 'about') return t('common.creditsAbout', { n: cost.credits });
  if (cost.kind === 'from') return t('common.creditsFrom', { n: cost.credits });
  if (cost.kind === 'upTo') return t('common.creditsUpTo', { n: cost.credits });
  return t(cost.credits === 1 ? 'common.creditOne' : 'common.credits', { n: cost.credits });
}

/** The cost inside a generate button, after its label; nothing until the price is known. */
export function ButtonCreditCost({ cost }: { cost: CreditCost | null | undefined }) {
  if (!cost) return null;
  return <span className="font-normal tabular-nums opacity-70">· {creditCostText(cost)}</span>;
}

/** Beside a generate button the balance cannot pay for: how far short, and the plans. Nothing otherwise. */
export function CreditShortNote({ gate, className = '' }: { gate: CreditGate; className?: string }) {
  if (!gate.short) return null;
  return <p role="status" className={`text-ink-3 text-xs ${className}`}>
    {t('workbench.creditsShortLine', { need: gate.need ?? 0, balance: gate.balance ?? 0 })}
    <button type="button" className="text-ink ml-2 underline" onClick={() => void gate.offer()}>{t('workbench.memberOnlyPlans')}</button>
  </p>;
}

/** A 402 answer as the error a generation throws; `offerCreditsFor` turns it into the plans dialog. */
export function creditsShortError(message = t('chatGen.notEnoughCreditsTop')): CreditsShort {
  return new CreditsShort(message);
}

/** After a failed generation: a credit shortfall opens the plans dialog. True when it was one. */
export function offerCreditsFor(error: unknown): boolean {
  if (!(error instanceof CreditsShort)) return false;
  void offerCredits();
  return true;
}
