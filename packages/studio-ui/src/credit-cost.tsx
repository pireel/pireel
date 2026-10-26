import { t } from './i18n';

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
