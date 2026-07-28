/**
 * @flamel-ai/careerplug-api
 *
 * Typed client for the CareerPlug API, generated from the live Swagger 2.0
 * document at https://api.careerplug.com/swagger_doc (converted to OpenAPI 3).
 *
 *   import { CareerPlugAuth, configureCareerPlug, getJobs } from "@flamel-ai/careerplug-api";
 *
 *   configureCareerPlug({
 *     auth: CareerPlugAuth.clientCredentials({
 *       clientId: process.env.CAREERPLUG_CLIENT_ID!,
 *       clientSecret: process.env.CAREERPLUG_CLIENT_SECRET!,
 *     }),
 *   });
 *   const { data } = await getJobs({ query: { per_page: 50 } });
 *
 * The partner job feeds are a separate, unauthenticated surface:
 *
 *   import { fetchFeed } from "@flamel-ai/careerplug-api/feeds";
 *   const { jobs } = await fetchFeed("your-partner-slug", "your_feed_default");
 */

// Generated SDK: operations, models, and zod schemas.
export * from "./generated/index.js";

// Hand-written auth, configuration, errors, and the job-feed reader.
export * from "./auth.js";
export * from "./configure.js";
export * from "./errors.js";
export * from "./feeds.js";
