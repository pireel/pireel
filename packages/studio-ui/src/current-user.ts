"use client";

export interface CurrentUser {
  user_id: string;
  auth_method: "api_key" | "session" | "anon";
  email: string | null;
  name: string | null;
  role?: string;
  balance?: number;
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
  const request = fetch("/api/me")
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

  const request = fetch("/api/me/balance")
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
