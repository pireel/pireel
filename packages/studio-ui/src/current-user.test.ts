import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  invalidateCurrentUser,
  loadCurrentUser,
  loadCurrentUserBalance,
} from "./current-user";

describe("loadCurrentUser", () => {
  beforeEach(() => invalidateCurrentUser());
  afterEach(() => {
    invalidateCurrentUser();
    vi.unstubAllGlobals();
  });

  it("coalesces four concurrent consumers into one /api/me request", async () => {
    let resolveResponse!: (response: Response) => void;
    const response = new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    });
    const fetchMock = vi.fn(() => response);
    vi.stubGlobal("fetch", fetchMock);

    const loads = [
      loadCurrentUser(),
      loadCurrentUser(),
      loadCurrentUser(),
      loadCurrentUser(),
    ];
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith("/api/me");

    resolveResponse(
      Response.json({
        user_id: "user-1",
        auth_method: "session",
        email: "user@example.com",
        name: "User",
        role: "admin",
      }),
    );
    const users = await Promise.all(loads);
    expect(users.every((user) => user?.user_id === "user-1")).toBe(true);

    await loadCurrentUser();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("clears a failed in-flight request so a later consumer can retry", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(
        Response.json({
          user_id: "user-1",
          auth_method: "session",
          email: null,
          name: null,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(loadCurrentUser()).rejects.toThrow("offline");
    await expect(loadCurrentUser()).resolves.toMatchObject({
      user_id: "user-1",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not cache a response that crossed an authentication boundary", async () => {
    let resolveOld!: (response: Response) => void;
    const oldResponse = new Promise<Response>((resolve) => {
      resolveOld = resolve;
    });
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => oldResponse)
      .mockResolvedValueOnce(
        Response.json({
          user_id: "user-new",
          auth_method: "session",
          email: null,
          name: null,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const oldLoad = loadCurrentUser();
    invalidateCurrentUser();
    resolveOld(
      Response.json({
        user_id: "user-old",
        auth_method: "session",
        email: null,
        name: null,
      }),
    );
    await oldLoad;

    await expect(loadCurrentUser()).resolves.toMatchObject({
      user_id: "user-new",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("loadCurrentUserBalance", () => {
  beforeEach(() => invalidateCurrentUser());
  afterEach(() => {
    invalidateCurrentUser();
    vi.unstubAllGlobals();
  });

  it("coalesces concurrent balance reads but does not cache a settled value", async () => {
    let resolveResponse!: (response: Response) => void;
    const response = new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    });
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => response)
      .mockResolvedValueOnce(
        Response.json({
          user_id: "user-1",
          balance: 90,
          buckets: {
            paid: 90,
            subscription: 0,
            subscription_period_end: null,
          },
          unit: "token",
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const first = loadCurrentUserBalance();
    const strictModeReplay = loadCurrentUserBalance();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith("/api/me/balance");

    resolveResponse(
      Response.json({
        user_id: "user-1",
        balance: 100,
        buckets: {
          paid: 100,
          subscription: 0,
          subscription_period_end: null,
        },
        unit: "token",
      }),
    );
    await expect(Promise.all([first, strictModeReplay])).resolves.toEqual([
      expect.objectContaining({ balance: 100 }),
      expect.objectContaining({ balance: 100 }),
    ]);

    await expect(loadCurrentUserBalance()).resolves.toMatchObject({
      balance: 90,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("clears a failed balance read so the next refresh can retry", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(
        Response.json({
          user_id: "user-1",
          balance: 100,
          buckets: {
            paid: 100,
            subscription: 0,
            subscription_period_end: null,
          },
          unit: "token",
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(loadCurrentUserBalance()).rejects.toThrow("offline");
    await expect(loadCurrentUserBalance()).resolves.toMatchObject({
      balance: 100,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
