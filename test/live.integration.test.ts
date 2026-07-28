/**
 * Live round-trip against real CareerPlug hosts.
 *
 * Every test self-skips when its inputs are absent, so this suite is green on a
 * fresh clone with no credentials. Run with `pnpm test:integration`.
 *
 *   CAREERPLUG_CLIENT_ID / CAREERPLUG_CLIENT_SECRET  -> OAuth tests
 *   CAREERPLUG_PARTNER_SLUG / CAREERPLUG_FEED_NAME   -> job-feed tests
 *
 * No credential is ever hard-coded here. The spec tests need nothing at all --
 * `/swagger_doc` is public -- so they always run and are the real guard against
 * upstream drift.
 */
import { describe, expect, it } from "vitest";

import { CareerPlugAuth, GLOBAL_PARTNER_API_SCOPE } from "../src/auth.js";
import { fetchFeed } from "../src/feeds.js";
import { ROOT_SPEC_URL } from "../scripts/spec-sources.js";

const clientId = process.env.CAREERPLUG_CLIENT_ID;
const clientSecret = process.env.CAREERPLUG_CLIENT_SECRET;
const partnerSlug = process.env.CAREERPLUG_PARTNER_SLUG;
const feedName = process.env.CAREERPLUG_FEED_NAME;

const hasOAuth = Boolean(clientId && clientSecret);
const hasFeed = Boolean(partnerSlug && feedName);

describe("live spec endpoint (no credentials required)", () => {
  it("still serves a Swagger 2.0 document at the grape-swagger path", async () => {
    const res = await fetch(ROOT_SPEC_URL, { headers: { Accept: "application/json" } });
    expect(res.ok).toBe(true);
    const spec = await res.json();
    expect(spec.swagger).toBe("2.0");
    expect(spec.info.title).toBe("CareerPlug API Integration Documentation");
  });

  it("matches the vendored copy's path set (fails loudly on upstream drift)", async () => {
    const live = await (await fetch(ROOT_SPEC_URL)).json();
    const vendored = (await import("../specs/swagger_doc.json", { with: { type: "json" } })).default;
    expect(Object.keys(live.paths).sort()).toEqual(
      Object.keys((vendored as { paths: object }).paths).sort(),
    );
  });
});

describe.skipIf(!hasOAuth)("OAuth (requires CAREERPLUG_CLIENT_ID/SECRET)", () => {
  it("mints a 48-hour client_credentials token", async () => {
    const auth = CareerPlugAuth.clientCredentials({
      clientId: clientId!,
      clientSecret: clientSecret!,
    });
    const token = await auth.getAccessToken();
    expect(token).toBeTruthy();

    const info = await auth.introspect();
    expect(info.scope).toContain(GLOBAL_PARTNER_API_SCOPE);
    // client_credentials tokens carry no resource owner. This is the property
    // we suspect makes the v1 endpoints reject them -- assert it so we notice
    // if CareerPlug ever changes it.
    expect(info.resource_owner_id ?? null).toBeNull();
  });

  it("documents the current v1 authorization behavior", async () => {
    const auth = CareerPlugAuth.clientCredentials({
      clientId: clientId!,
      clientSecret: clientSecret!,
    });
    const token = await auth.getAccessToken();
    const res = await fetch(
      `https://api.careerplug.com/jobs?access_token=${encodeURIComponent(token)}`,
    );

    if (res.ok) {
      // If this passes, the known limitation has been resolved -- update the
      // README and docs/authentication.md.
      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
      return;
    }

    // Otherwise assert the documented failure precisely, so a DIFFERENT failure
    // (a real regression, or a changed contract) does not hide behind it.
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(String(body.error)).toContain("WineBouncer");
  });
});

describe.skipIf(!hasFeed)("job feeds (requires CAREERPLUG_PARTNER_SLUG/FEED_NAME)", () => {
  it("fetches and parses a live feed with no credentials", async () => {
    const result = await fetchFeed(partnerSlug!, feedName!);
    expect(result.notModified).toBe(false);
    expect(Array.isArray(result.jobs)).toBe(true);
    for (const job of result.jobs) {
      expect(job.id).toBeTruthy();
    }
  });

  it("honors If-Modified-Since with a 304", async () => {
    const first = await fetchFeed(partnerSlug!, feedName!);
    if (!first.lastModified) return; // no Last-Modified header; nothing to assert
    const second = await fetchFeed(partnerSlug!, feedName!, {
      ifModifiedSince: first.lastModified,
    });
    expect(second.notModified).toBe(true);
  });
});
