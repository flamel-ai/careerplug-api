/**
 * CareerPlug partner job feeds -- a completely separate surface from the OAuth
 * API, and the one most integrations actually need.
 *
 *   https://feed.careerplug.com/partner_feeds/<partnerSlug>/<feedName>.xml
 *
 * Properties worth knowing, all verified against the live host:
 *
 *   - NO authentication. A plain GET returns the jobs. The OAuth application is
 *     not involved at all.
 *   - Served as static XML from S3 + CloudFront. Directory paths return 403
 *     because bucket listing is off, so you must know the exact feed name --
 *     there is no index to enumerate.
 *   - `Content-Type` is `binary/octet-stream`, NOT `application/xml`. Never
 *     branch on content type when reading these.
 *   - `Last-Modified` tracks a periodic regeneration, so treat a feed as a
 *     poll-and-diff source and send `If-Modified-Since`.
 *
 * CareerPlug generates a DIFFERENT SCHEMA PER DESTINATION, and the feed name is
 * the contract. A `_default` feed and a `_jobget` feed of the same jobs carry
 * different fields (`_jobget` drops postalcode/category/jobtype/experience/
 * salary and adds latitude/longitude/location). This parser therefore treats
 * every field except `id` as optional and preserves unknown fields in `extra`,
 * so a variant we have not seen degrades instead of throwing.
 */
import { XMLParser, XMLValidator } from "fast-xml-parser";

import { CareerPlugError } from "./errors.js";

export const FEED_BASE_URL = "https://feed.careerplug.com";

/** Builds a feed URL from a partner slug and feed name. */
export function buildFeedUrl(
  partnerSlug: string,
  feedName: string,
  options?: { baseUrl?: string },
): string {
  const name = feedName.endsWith(".xml") ? feedName : `${feedName}.xml`;
  return `${options?.baseUrl ?? FEED_BASE_URL}/partner_feeds/${partnerSlug}/${name}`;
}

/**
 * One `<job>` from a feed. Only `id` is guaranteed; everything else depends on
 * which schema variant the feed was generated for.
 */
export interface FeedJob {
  id: string;
  /** Apply URL. Points at the ACCOUNT subdomain, not app.careerplug.com. */
  url?: string;
  title?: string;
  company?: string;
  /** Upstream format: `YYYY-MM-DD HH:MM:SS UTC`. */
  date?: string;
  /** Parsed form of {@link date}, or undefined if it did not parse. */
  postedAt?: Date;
  city?: string;
  state?: string;
  country?: string;
  postalcode?: string;
  /** HTML, CDATA-wrapped upstream (`<strong>`, `<ul>`, `<br>`). */
  description?: string;
  category?: string;
  jobtype?: string;
  experience?: string;
  salary?: string;
  /** Present on geocoded variants (e.g. `_jobget`). */
  location?: string;
  latitude?: string;
  longitude?: string;
  /** Any element this interface does not name, preserved verbatim. */
  extra: Record<string, string>;
}

export interface FeedResult {
  jobs: FeedJob[];
  /** `Last-Modified` as sent by CloudFront, if present. */
  lastModified?: Date;
  /** True when a conditional request returned 304. `jobs` will be empty. */
  notModified: boolean;
  url: string;
}

const KNOWN_FIELDS = new Set([
  "id", "url", "title", "company", "date", "city", "state", "country",
  "postalcode", "description", "category", "jobtype", "experience", "salary",
  "location", "latitude", "longitude",
]);

/** Upstream dates look like `2026-07-27 16:21:40 UTC`, which `Date` won't take. */
function parseFeedDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const iso = value.trim().replace(" UTC", "Z").replace(" ", "T");
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

const asString = (value: unknown): string | undefined => {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return undefined;
};

/**
 * Parses feed XML into jobs. Exported separately from {@link fetchFeed} so you
 * can parse a feed you fetched or cached yourself.
 */
export function parseFeedXml(xml: string): FeedJob[] {
  const parser = new XMLParser({
    ignoreAttributes: true,
    trimValues: true,
    // Descriptions are CDATA-wrapped HTML; keep them as raw strings rather than
    // letting the parser try to interpret the markup inside.
    parseTagValue: false,
    processEntities: true,
  });

  // fast-xml-parser is lenient by default and will happily return a partial
  // object for truncated XML -- a real risk here, since these feeds are fetched
  // over the network and a truncated body would otherwise look like "fewer jobs
  // today" rather than an error. Validate first.
  const validation = XMLValidator.validate(xml);
  if (validation !== true) {
    throw new CareerPlugError(
      `Job feed XML is malformed: ${validation.err.msg} (line ${validation.err.line})`,
    );
  }

  let parsed: unknown;
  try {
    parsed = parser.parse(xml);
  } catch (cause) {
    throw new CareerPlugError("Failed to parse job feed XML", { cause });
  }

  const root = (parsed as { jobs?: { job?: unknown } })?.jobs;
  if (!root) return [];

  const rawJobs = Array.isArray(root.job) ? root.job : root.job === undefined ? [] : [root.job];

  return rawJobs.map((raw): FeedJob => {
    const record = (raw ?? {}) as Record<string, unknown>;
    const extra: Record<string, string> = {};
    for (const [key, value] of Object.entries(record)) {
      if (KNOWN_FIELDS.has(key)) continue;
      const str = asString(value);
      if (str !== undefined) extra[key] = str;
    }
    const date = asString(record.date);
    return {
      id: asString(record.id) ?? "",
      url: asString(record.url),
      title: asString(record.title),
      company: asString(record.company),
      date,
      postedAt: parseFeedDate(date),
      city: asString(record.city),
      state: asString(record.state),
      country: asString(record.country),
      postalcode: asString(record.postalcode),
      description: asString(record.description),
      category: asString(record.category),
      jobtype: asString(record.jobtype),
      experience: asString(record.experience),
      salary: asString(record.salary),
      location: asString(record.location),
      latitude: asString(record.latitude),
      longitude: asString(record.longitude),
      extra,
    };
  });
}

export interface FetchFeedOptions {
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
  /**
   * Send `If-Modified-Since`. When the feed is unchanged the server answers 304
   * and the result has `notModified: true` and no jobs -- the cheap way to poll.
   */
  ifModifiedSince?: Date;
  signal?: AbortSignal;
}

/**
 * Fetches and parses a partner feed. Requires no credentials.
 *
 *   const { jobs } = await fetchFeed("flamel", "flamel_test_default");
 */
export async function fetchFeed(
  partnerSlug: string,
  feedName: string,
  options: FetchFeedOptions = {},
): Promise<FeedResult> {
  const url = buildFeedUrl(partnerSlug, feedName, options);
  const doFetch = options.fetch ?? globalThis.fetch;

  const headers: Record<string, string> = {};
  if (options.ifModifiedSince) {
    headers["If-Modified-Since"] = options.ifModifiedSince.toUTCString();
  }

  const res = await doFetch(url, { headers, signal: options.signal });

  if (res.status === 304) {
    return { jobs: [], notModified: true, url };
  }
  if (res.status === 403) {
    // The bucket returns 403 (not 404) for both a missing object and a
    // directory path, because listing is disabled. Say what that actually means.
    throw new CareerPlugError(
      `Feed not accessible: ${url} (HTTP 403). The feed bucket returns 403 for a ` +
        `nonexistent feed as well as for directory paths, so check the exact feed name -- ` +
        `there is no way to list available feeds.`,
      { status: 403 },
    );
  }
  if (!res.ok) {
    throw new CareerPlugError(`Failed to fetch feed ${url}: HTTP ${res.status}`, {
      status: res.status,
    });
  }

  const xml = await res.text();
  const lastModifiedHeader = res.headers.get("last-modified");
  const lastModified = lastModifiedHeader ? new Date(lastModifiedHeader) : undefined;

  return {
    jobs: parseFeedXml(xml),
    lastModified: lastModified && !Number.isNaN(lastModified.getTime()) ? lastModified : undefined,
    notModified: false,
    url,
  };
}
