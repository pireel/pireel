"use client";
import { useEffect, useState } from "react";
import { confirm } from "@pireel/ui/confirm";
import { editorRequest } from '@pireel/studio-ui/host-request';
import { studioLocale, t } from './i18n';
import type { CreditCost } from './credit-cost';

export interface CurrentUser {
  user_id: string;
  auth_method: "api_key" | "session" | "anon";
  email: string | null;
  name: string | null;
  role?: string;
  balance?: number;
  /** False when the host sells plans and this account is not a paying member; absent elsewhere (everything open). */
  member?: boolean;
  /** The largest video this account may export or download (short side, px); absent = no limit. */
  export_max_res?: number;
  /** Where upgrading starts: a path on the host below the language (absent: its plans page). */
  upgrade_path?: string;
}

export interface CurrentUserBalance {
  user_id: string;
  balance: number;
  buckets: {
    paid: number;
    subscription: number;
    subscription_period_end: string | null;
  };
  unit: "token";
}

let cached: CurrentUser | null | undefined;
let pending: Promise<CurrentUser | null> | null = null;
let balancePending: Promise<CurrentUserBalance | null> | null = null;
let generation = 0;

/**
 * One browser session has one current user. Share both the completed value and
 * the in-flight request so sibling consumers and Strict Mode effect probes do
 * not fan out identical `/api/me` reads.
 */
export function loadCurrentUser(): Promise<CurrentUser | null> {
  if (cached !== undefined) return Promise.resolve(cached);
  if (pending) return pending;

  const requestGeneration = generation;
  const request = editorRequest("/api/me")
    .then(async (response) => {
      if (!response.ok && response.status !== 401)
        throw new Error(`Current user request failed: ${response.status}`);
      const value = response.ok
        ? ((await response.json()) as CurrentUser)
        : null;
      if (generation === requestGeneration) cached = value;
      return value;
    })
    .finally(() => {
      if (pending === request) pending = null;
    });
  pending = request;
  return request;
}

/**
 * Balance is mutable, so only share the in-flight read. Once it settles, the
 * next poll or post-charge refresh must reach the backend for a fresh value.
 */
export function loadCurrentUserBalance(): Promise<CurrentUserBalance | null> {
  if (balancePending) return balancePending;

  const request = editorRequest("/api/me/balance")
    .then(async (response) =>
      response.ok
        ? ((await response.json()) as CurrentUserBalance)
        : null,
    )
    .finally(() => {
      if (balancePending === request) balancePending = null;
    });
  balancePending = request;
  return request;
}

/** Clear after an authentication boundary changes (for example, sign-out). */
export function invalidateCurrentUser(): void {
  generation += 1;
  cached = undefined;
  pending = null;
  balancePending = null;
}

/** Whether member-only features are open for this account: closed only when the host says it is not a member. */
export function useMemberFeatures(): boolean {
  const [member, setMember] = useState(() => cached?.member !== false);
  useEffect(() => {
    let alive = true;
    void loadCurrentUser().then((user) => { if (alive) setMember(user?.member !== false); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  return member;
}

const exportCapOf = (user: CurrentUser | null | undefined) => typeof user?.export_max_res === 'number' && user.export_max_res > 0 ? user.export_max_res : null;

/** The account's export limit (short side, px), or null when it has none or nobody is signed in. */
export async function exportResolutionCap(): Promise<number | null> {
  return exportCapOf(await loadCurrentUser().catch(() => null));
}

/** The account's export limit for a page to mark the sizes above it; null while unknown or unlimited. */
export function useExportResolutionCap(): number | null {
  const [cap, setCap] = useState(() => exportCapOf(cached));
  useEffect(() => {
    let alive = true;
    void loadCurrentUser().then((user) => { if (alive) setCap(exportCapOf(user)); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  return cap;
}

/** Where upgrading starts for this account: the host's own path, else its plans page. */
function upgradeUrl() {
  const path = cached?.upgrade_path;
  return `/${studioLocale()}${typeof path === 'string' && path.startsWith('/') && !path.startsWith('//') ? path : '/pricing'}`;
}

/** A member-only feature was chosen by a non-member: say so, and offer the upgrade. `body` says what
 *  the plan brings for this feature (the plain membership line otherwise). */
export async function offerMembership(feature: string, body?: string): Promise<void> {
  const go = await confirm({ title: t('workbench.memberOnlyTitle', { feature }), description: body ?? t('workbench.memberOnlyBody'), confirmLabel: t(cached?.upgrade_path ? 'workbench.memberOnlyUpgrade' : 'workbench.memberOnlyPlans') });
  if (go) window.open(upgradeUrl(), '_blank', 'noopener');
}

/** The account has fewer credits than a generation needs (HTTP 402): the page offers the plans. */
export class CreditsShort extends Error {}

export interface CreditGate {
  /** The balance is known and below what the generation needs. */
  short: boolean;
  need: number | null;
  balance: number | null;
  /** The plans dialog, with the numbers when they are known. */
  offer(): Promise<void>;
}

/**
 * Whether the account can pay for a generation of `cost`, so the click opens the plans dialog
 * instead of starting; nothing is shown before the click. The balance is
 * read again whenever `refresh` changes (pass the busy flag: it is read after every run). Never
 * short where the host does not sell credits (no balance) or while the price is unknown.
 */
export function useCreditGate(cost: CreditCost | null | undefined, refresh?: unknown): CreditGate {
  const [balance, setBalance] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    void loadCurrentUserBalance().then((value) => { if (alive) setBalance(value ? value.balance : null); }).catch(() => {});
    return () => { alive = false; };
  }, [refresh]);
  const need = cost ? ('min' in cost ? cost.min : cost.credits) : null;
  return { short: need !== null && balance !== null && need > balance, need, balance, offer: () => offerCredits(need ?? undefined, balance ?? undefined) };
}

/** A generation needs more credits than the account has: say how many, and offer the plans page. */
export async function offerCredits(need?: number, balance?: number): Promise<void> {
  const known = need !== undefined && balance !== undefined;
  const go = await confirm({
    title: t('workbench.creditsShortTitle'),
    description: known ? t('workbench.creditsShortBody', { need, balance }) : t('workbench.creditsShortBodyPlain'),
    confirmLabel: t('workbench.memberOnlyPlans'),
  });
  if (go) window.open(`/${studioLocale()}/pricing`, '_blank', 'noopener');
}
