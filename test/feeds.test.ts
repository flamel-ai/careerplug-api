import { describe, expect, it, vi } from "vitest";

import { buildFeedUrl, fetchFeed, parseFeedXml } from "../src/feeds.js";
import { CareerPlugError } from "../src/errors.js";

/** A `_default`-variant feed, matching the real upstream shape. */
const DEFAULT_FEED = `<?xml version="1.0" encoding="UTF-8"?>
<jobs>
<job>
  <id><![CDATA[185619423]]></id>
  <url><![CDATA[https://avoss-demo.careerplug.com/j/032igv3]]></url>
  <title><![CDATA[Housecleaner]]></title>
  <company><![CDATA[I Be Location A]]></company>
  <date><![CDATA[2026-07-27 16:21:40 UTC]]></date>
  <city><![CDATA[las vegas]]></city>
  <state><![CDATA[IL]]></state>
  <country><![CDATA[US]]></country>
  <postalcode><![CDATA[61726]]></postalcode>
  <description><![CDATA[<strong>Overview:</strong><br>Some <ul><li>markup</li></ul>]]></description>
  <category><![CDATA[Cleaning]]></category>
  <jobtype><![CDATA[Full Time]]></jobtype>
</job>
</jobs>`;

/** A `_jobget`-variant feed: different fields for the same jobs. */
const JOBGET_FEED = `<?xml version="1.0" encoding="UTF-8"?>
<jobs>
<job>
  <id><![CDATA[185619423]]></id>
  <title><![CDATA[Housecleaner]]></title>
  <location><![CDATA[Las Vegas, IL]]></location>
  <latitude><![CDATA[40.4842]]></latitude>
  <longitude><![CDATA[-88.9937]]></longitude>
  <somethingNew><![CDATA[surprise]]></somethingNew>
</job>
</jobs>`;

describe("buildFeedUrl", () => {
  it("builds the partner_feeds path and adds the .xml suffix", () => {
    expect(buildFeedUrl("flamel", "flamel_test_default")).toBe(
      "https://feed.careerplug.com/partner_feeds/flamel/flamel_test_default.xml",
    );
  });

  it("does not double-append .xml", () => {
    expect(buildFeedUrl("flamel", "flamel_test_default.xml")).toBe(
      "https://feed.careerplug.com/partner_feeds/flamel/flamel_test_default.xml",
    );
  });
});

describe("parseFeedXml", () => {
  it("parses the _default variant, including CDATA-wrapped HTML", () => {
    const [job] = parseFeedXml(DEFAULT_FEED);
    expect(job).toBeDefined();
    expect(job!.id).toBe("185619423");
    expect(job!.title).toBe("Housecleaner");
    expect(job!.postalcode).toBe("61726");
    expect(job!.description).toContain("<strong>Overview:</strong>");
    expect(job!.description).toContain("<li>markup</li>");
  });

  it("parses the upstream `YYYY-MM-DD HH:MM:SS UTC` date into a Date", () => {
    const [job] = parseFeedXml(DEFAULT_FEED);
    expect(job!.postedAt?.toISOString()).toBe("2026-07-27T16:21:40.000Z");
  });

  it("handles the _jobget variant, whose fields differ from _default", () => {
    const [job] = parseFeedXml(JOBGET_FEED);
    expect(job!.latitude).toBe("40.4842");
    expect(job!.location).toBe("Las Vegas, IL");
    // Fields absent from this variant must be undefined, not throw.
    expect(job!.postalcode).toBeUndefined();
    expect(job!.salary).toBeUndefined();
  });

  it("preserves unrecognized fields in `extra` so new variants degrade safely", () => {
    const [job] = parseFeedXml(JOBGET_FEED);
    expect(job!.extra).toEqual({ somethingNew: "surprise" });
  });

  it("returns an empty array for a feed with no jobs", () => {
    expect(parseFeedXml('<?xml version="1.0"?><jobs></jobs>')).toEqual([]);
  });

  it("handles a single <job> not wrapped in an array", () => {
    expect(parseFeedXml(JOBGET_FEED)).toHaveLength(1);
  });

  it("throws a CareerPlugError on malformed XML", () => {
    expect(() => parseFeedXml("<jobs><job><id>1</id>")).toThrow(CareerPlugError);
  });
});

describe("fetchFeed", () => {
  it("sends no credentials -- the feed surface is unauthenticated", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(init?.headers).toEqual({});
      return new Response(DEFAULT_FEED, { status: 200 });
    });
    await fetchFeed("flamel", "flamel_test_default", {
      fetch: fetchMock as unknown as typeof globalThis.fetch,
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("surfaces Last-Modified for poll-and-diff use", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(DEFAULT_FEED, {
          status: 200,
          headers: { "last-modified": "Tue, 28 Jul 2026 10:52:04 GMT" },
        }),
    );
    const result = await fetchFeed("flamel", "f", {
      fetch: fetchMock as unknown as typeof globalThis.fetch,
    });
    expect(result.lastModified?.toISOString()).toBe("2026-07-28T10:52:04.000Z");
  });

  it("sends If-Modified-Since and reports 304 without jobs", async () => {
    const fetchMock = vi.fn(async (_url: unknown, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>)["If-Modified-Since"]).toBe(
        "Mon, 27 Jul 2026 00:00:00 GMT",
      );
      return new Response(null, { status: 304 });
    });
    const result = await fetchFeed("flamel", "f", {
      fetch: fetchMock as unknown as typeof globalThis.fetch,
      ifModifiedSince: new Date("2026-07-27T00:00:00Z"),
    });
    expect(result.notModified).toBe(true);
    expect(result.jobs).toEqual([]);
  });

  it("explains that a 403 means a bad feed name, since listing is disabled", async () => {
    const fetchMock = vi.fn(async () => new Response("", { status: 403 }));
    await expect(
      fetchFeed("flamel", "nope", { fetch: fetchMock as unknown as typeof globalThis.fetch }),
    ).rejects.toThrow(/no way to list available feeds/);
  });
});
