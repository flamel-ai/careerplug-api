# Partner job feeds

A completely separate surface from the OAuth API, and for most integrations the only one you need. It involves no OAuth application, no token, and no credentials of any kind.

```
https://feed.careerplug.com/partner_feeds/<partner_slug>/<feed_name>.xml
```

Feeds are configured in the CareerPlug UI under **Toolkit → Integrations → Job Feeds**.

```ts
import { fetchFeed } from "@flamel-ai/careerplug-api/feeds";

const { jobs, lastModified } = await fetchFeed("your-slug", "your_feed_default");
```

## Properties

All verified against the live host.

- **No authentication.** A plain `GET` returns the jobs.
- **Static XML on S3 + CloudFront.** Not dynamically rendered.
- **`Content-Type` is `binary/octet-stream`**, not `application/xml`. Never branch on content type when reading these.
- **`Last-Modified`** tracks a periodic regeneration. Treat a feed as a poll-and-diff source.
- **You cannot enumerate feeds.** Bucket listing is off, so a directory path and a nonexistent feed both return `403`. You must know the exact feed name; ask your partnerships contact.

## Schema varies per destination

This is the part that surprises people. CareerPlug generates a **different schema per destination**, and the feed name is the contract. Two feeds over the same jobs carry different fields:

| Field | `*_default` | `*_jobget` |
|---|:---:|:---:|
| `id`, `url`, `title`, `company`, `date`, `state`, `country`, `description` | ✅ | ✅ |
| `city` | ✅ | — |
| `postalcode` | ✅ | — |
| `category`, `jobtype`, `experience`, `salary` | ✅ | — |
| `location` (formatted string) | — | ✅ |
| `latitude`, `longitude` | — | ✅ |

The `_jobget` variant is shaped for JobGet's ingestion spec. **Do not contort your parser around whichever variant happens to exist** — ask CareerPlug's TechAM to publish a variant carrying the fields you need.

`parseFeedXml` treats every field except `id` as optional and preserves unrecognized elements in `job.extra`, so a variant nobody has seen yet degrades instead of throwing.

## Field notes

- `<description>` is CDATA-wrapped **HTML** (`<strong>`, `<ul>`, `<li>`, `<br>`). Sanitize before rendering.
- `<url>` points at the **account subdomain** (`https://<account>.careerplug.com/j/<code>`), not `app.careerplug.com`.
- `<date>` is `YYYY-MM-DD HH:MM:SS UTC`, which `new Date()` will not parse. `FeedJob.postedAt` is the parsed form.

## Polling

Send `If-Modified-Since` and let the CDN answer `304` when nothing changed:

```ts
let lastSeen: Date | undefined;

async function poll() {
  const result = await fetchFeed("your-slug", "your_feed_default", {
    ifModifiedSince: lastSeen,
  });
  if (result.notModified) return;
  lastSeen = result.lastModified;
  await ingest(result.jobs);
}
```
