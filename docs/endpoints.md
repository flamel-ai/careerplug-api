# Endpoint reference

> Generated from [`specs/openapi.json`](../specs/openapi.json) by `scripts/gen-docs.ts`. Do not edit by hand -- run `pnpm gen-docs`.

Base URL: `https://api.careerplug.com`

There is **no version prefix** in the paths -- it is `/jobs`, not `/v1/jobs`. Every request carries its token as the `access_token` query parameter.

## Operations

### `apps`

#### `POST /apps`

TypeScript: `postApps()`

Add a new applicant to a job

Responses:

- `201` — Add a new applicant to a job

#### `GET /apps`

TypeScript: `getApps()`

Provides the ability to add and access existing applicants

| Parameter | In | Type | Required | Description |
|---|---|---|---|---|
| `page` | query | integer | no | Page of results to fetch. |
| `per_page` | query | integer | no | Number of results to return per page. |
| `account_id` | query | integer | no | Search by account. This parameter is ignored unless your account has access to applicants from other/related accounts. |
| `job_id` | query | integer | no | Search by job. |
| `account_class_ids[]` | query | integer[] | no | Search for applicants by account class. This parameter is ignored unless your account has access to applicants from other/related account classes. |
| `date_field` | query | string | no | Filter by date. **Allowed values:** applied_at, hired_at, last_acted_on_at |
| `start_date` | query | string | no | The start date with which to filter the `date_field`. Returns apps with a timestamp at or after midnight (12:00:00 AM) on the date specified **format:** YYYY-MM-DD |
| `end_date` | query | string | no | The end date with which to filter the `date_field`. Returns apps with a timestamp up to and including 11:59:59PM on the date specified **format:** YYYY-MM-DD |

Responses:

- `200` — Provides the ability to add and access existing applicants

#### `GET /apps/{id}`

TypeScript: `getAppsId()`

Details of a single applicant

| Parameter | In | Type | Required | Description |
|---|---|---|---|---|
| `id` | path | integer | yes | Applicant id. |

Responses:

- `200` — Details of a single applicant

### `brands`

#### `GET /brands`

TypeScript: `getBrands()`

One of the optional job-search parameters

| Parameter | In | Type | Required | Description |
|---|---|---|---|---|
| `page` | query | integer | no | Page of results to fetch. |
| `per_page` | query | integer | no | Number of results to return per page. |
| `aggregate` | query | boolean | no | Show brands from other accounts (if enabled). |
| `account_id` | query | integer | no | Search by account. This parameter is ignored unless your account has access to applicants from other/related accounts. |
| `account_class_ids[]` | query | integer[] | no | Search for Brands by account class. This parameter is ignored unless your account has access to Brands from other/related account classes. |

Responses:

- `200` — One of the optional job-search parameters

### `departments`

#### `GET /departments`

TypeScript: `getDepartments()`

One of the optional job-search parameters

| Parameter | In | Type | Required | Description |
|---|---|---|---|---|
| `page` | query | integer | no | Page of results to fetch. |
| `per_page` | query | integer | no | Number of results to return per page. |
| `aggregate` | query | boolean | no | Show departments from other accounts (if enabled). |
| `account_id` | query | integer | no | Search by account. This parameter is ignored unless your account has access to applicants from other/related accounts. |
| `account_class_ids[]` | query | integer[] | no | Search for Departments by account class. This parameter is ignored unless your account has access to Departments from other/related account classes. |

Responses:

- `200` — One of the optional job-search parameters

### `employments`

#### `GET /employments`

TypeScript: `getEmployments()`

One of the optional job-search parameters

| Parameter | In | Type | Required | Description |
|---|---|---|---|---|
| `page` | query | integer | no | Page of results to fetch. |
| `per_page` | query | integer | no | Number of results to return per page. |
| `aggregate` | query | boolean | no | Show employment types from other accounts (if enabled). |
| `account_id` | query | integer | no | Search by account. This parameter is ignored unless your account has access to applicants from other/related accounts. |
| `account_class_ids[]` | query | integer[] | no | Search for Employments by account class. This parameter is ignored unless your account has access to Employments from other/related account classes. |

Responses:

- `200` — One of the optional job-search parameters

### `jobs`

#### `GET /jobs`

TypeScript: `getJobs()`

Provides access to all publicly visible jobs for the owner's account

| Parameter | In | Type | Required | Description |
|---|---|---|---|---|
| `page` | query | integer | no | Page of results to fetch. |
| `per_page` | query | integer | no | Number of results to return per page. |
| `search` | query | string | no | Search on name or description. |
| `postal_code` | query | string | no | Search by Postal Code (uses postal_code_radius). |
| `postal_code_radius` | query | string | no | Number of miles from postal_code. |
| `employment_id` | query | integer | no | Narrow by employment type. |
| `location_id` | query | integer | no | Narrow by location. |
| `department_id` | query | integer | no | Narrow by department. |
| `brand_id` | query | integer | no | Narrow by brand. |
| `aggregate` | query | boolean | no | Show jobs from other accounts. This parameter is ignored unless your account has the ability/permission to access or other/related accounts. |
| `account_id` | query | integer | no | Search by account. This parameter is ignored unless your account has access to applicants from other/related accounts. |
| `account_class_ids[]` | query | integer[] | no | Search for Jobs by account class. This parameter is ignored unless your account has access to Jobs from other/related account classes. |

Responses:

- `200` — Provides access to all publicly visible jobs for the owner's account

#### `GET /jobs/{id}`

TypeScript: `getJobsId()`

Details of a single job

| Parameter | In | Type | Required | Description |
|---|---|---|---|---|
| `id` | path | integer | yes | Job id. |

Responses:

- `200` — Details of a single job

### `locations`

#### `GET /locations`

TypeScript: `getLocations()`

One of the optional job-search parameters

| Parameter | In | Type | Required | Description |
|---|---|---|---|---|
| `page` | query | integer | no | Page of results to fetch. |
| `per_page` | query | integer | no | Number of results to return per page. |
| `aggregate` | query | boolean | no | Show locations from other accounts (if enabled). |
| `account_id` | query | integer | no | Search by account. This parameter is ignored unless your account has access to applicants from other/related accounts. |
| `account_class_ids[]` | query | integer[] | no | Search for Locations by account class. This parameter is ignored unless your account has access to Locations from other/related account classes. |

Responses:

- `200` — One of the optional job-search parameters

#### `GET /locations/{id}`

TypeScript: `getLocationsId()`

Details of a single Location

| Parameter | In | Type | Required | Description |
|---|---|---|---|---|
| `id` | path | integer | yes | Location ID |

Responses:

- `200` — Details of a single Location

### `users`

#### `GET /users`

TypeScript: `getUsers()`

Access basic user information, including login URLs

| Parameter | In | Type | Required | Description |
|---|---|---|---|---|
| `page` | query | integer | no | Page of results to fetch. |
| `per_page` | query | integer | no | Number of results to return per page. |
| `email` | query | string | no | Find user by email address. |
| `aggregate` | query | boolean | no | Show users from other accounts (if enabled). |
| `account_id` | query | integer | no | Search by account. This parameter is ignored unless your account has access to applicants from other/related accounts. |
| `account_class_ids[]` | query | integer[] | no | Search for Users by account class. This parameter is ignored unless your account has access to Users from other/related account classes. |

Responses:

- `200` — Access basic user information, including login URLs

#### `GET /users/{id}`

TypeScript: `getUsersId()`

Lookup user by ID

| Parameter | In | Type | Required | Description |
|---|---|---|---|---|
| `id` | path | integer | yes | User id. |

Responses:

- `200` — Lookup user by ID

#### `POST /users/reset`

TypeScript: `postUsersReset()`

Reset access tokens for all users

Responses:

- `201` — Reset access tokens for all users

#### `PUT /users/reset/{id}`

TypeScript: `putUsersResetId()`

Reset access token for a single user

| Parameter | In | Type | Required | Description |
|---|---|---|---|---|
| `id` | path | integer | yes | User id. |

Responses:

- `200` — Reset access token for a single user

## Models

### Account

| Field | Type | Description |
|---|---|---|
| `id` | integer | Unique identifier |
| `name` | string | Name of Account |
| `slt_code` | string | SLT Code |

### App

V1_Entities_AppEntity model

| Field | Type | Description |
|---|---|---|
| `id` | integer | Unique identifier |
| `account` | [Account](#account) | CareerPlug Account |
| `job` | [SimpleAccount](#simpleaccount) | Job |
| `app` | [Applicant](#applicant) | Information about the applicant |
| `location` | [Location](#location) | Information about the applicants work location |
| `hiring_step` | [SimpleEntity](#simpleentity) | Name of hiring step (blank/null means New) |
| `hiring_status` | string | Current hiring status |
| `prescreen_questions` | [Prescreen](#prescreen) | Applicant response to a prescreen question |
| `applied_at` | string | Date applied |
| `last_updated` | string | Date of last update to applicant record |
| `hired_at` | string | Date hired |
| `start_date` | string | Start Date |
| `source_name` | string | Source name |
| `last_acted_on_at` | string | Date of last action taken on applicant |

### Applicant

| Field | Type | Description |
|---|---|---|
| `email` | string | Email address |
| `firstname` | string | First name |
| `lastname` | string | Last name |
| `phone` | string | Phone number |
| `address` | string | Street address |
| `city` | string | City |
| `state` | string | State/Province |
| `postal_code` | string | ZIP/Postal Code |
| `country` | string | Country |
| `recent_title` | string | Recent job title |
| `recent_employer` | string | Recent employer |
| `pay_type` | string | Pay type |
| `pay_rate` | string | Pay rate |
| `employment_type` | string | Employment type |

### InboundApp

V1_Entities_InboundAppEntity model

| Field | Type | Description |
|---|---|---|
| `job_id` | integer | Job ID |
| `app` | [InboundApplicant](#inboundapplicant) | Information about the applicant |
| `prescreen_answers` | [PrescreenAnswer](#prescreenanswer)[] | Answers to prescreen_questions specified on the job as an array |

### InboundApplicant

| Field | Type | Description |
|---|---|---|
| `email` | string | Email address |
| `firstname` | string | First name |
| `lastname` | string | Last name |
| `phone` | string | Phone number |
| `address` | string | Street address |
| `city` | string | City |
| `state` | string | State/Province |
| `postal_code` | string | ZIP/Postal Code |
| `country` | string | Country |
| `source_id` | integer | Source ID |
| `recent_title` | string | Recent job title |
| `recent_employer` | string | Recent employer |
| `resume` | [Resume](#resume) | Resume: either text or file is required-- not both |
| `cover_letter` | string | Cover Letter |

### Job

V1_Entities_JobEntity model

| Field | Type | Description |
|---|---|---|
| `id` | integer | Unique identifier |
| `name` | string | Job name |
| `description` | string | Job description |
| `status` | string | Current status |
| `city` | string | City |
| `state` | string | State/Province |
| `postal_code` | string | ZIP/Postal Code |
| `country` | string | Country |
| `employment` | [SimpleEntity](#simpleentity) | Employment Type |
| `job_template_name` | string | Job template name (if created from a template) |
| `code` | string | Job code |
| `created_at` | string | Post date |
| `updated_at` | string | Last updated |
| `location` | [Location](#location) | Job location |
| `department` | [SimpleEntity](#simpleentity) | Job department |
| `prescreen_questions` | object | Prescreen question information (used for creating applicants) |
| `brand` | [SimpleEntity](#simpleentity) | Brand for job |
| `owner` | [UserRef](#userref) | Hiring manager |
| `account` | [Account](#account) | CareerPlug Account |

### Location

V1_Entities_LocationEntity model

| Field | Type | Description |
|---|---|---|
| `id` | string | Location Id |
| `name` | string | Location Name |
| `city` | string | City |
| `state` | string | State |
| `zip code` | string | Zipcode Wire name contains a space: `zip code`. |
| `street` | string | Street Address |
| `country` | string | Country |
| `number` | string | Location Number |
| `account` | [Account](#account) | Account |

### Prescreen

| Field | Type | Description |
|---|---|---|
| `id` | string | ID from job/prescreen_questions/id |
| `name` | string | Name of prescreen question |
| `answer` | string | Applicant response to prescreen question |

### PrescreenAnswer

| Field | Type | Description |
|---|---|---|
| `id` | string | ID from job/prescreen_questions/id |
| `value` | string | Either entered value or specific job/prescreen_questions/options/value |

### Resume

| Field | Type | Description |
|---|---|---|
| `text` | string | Plain-text resume |
| `file` | [ResumeFile](#resumefile) | File upload |

### ResumeFile

| Field | Type | Description |
|---|---|---|
| `name` | string | File name |
| `data` | string | Base64-encoded file content |
| `content_type` | string | MIME-Type of uploaded file |

### SimpleAccount

V1_Entities_SimpleAccountEntity model

| Field | Type | Description |
|---|---|---|
| `id` | integer | Unique identifier |
| `name` | string | Name of entity |
| `account` | [Account](#account) | CareerPlug Account |

### SimpleEntity

| Field | Type | Description |
|---|---|---|
| `id` | integer | Unique identifier |
| `name` | string | Name of entity |

### User

V1_Entities_UserEntity model

| Field | Type | Description |
|---|---|---|
| `id` | integer | Unique identifier |
| `email` | string | Email address |
| `firstname` | string | First name |
| `lastname` | string | Last name |
| `description` | string | Description |
| `title` | string | Position title |
| `role` | string | Role |
| `phone` | string | Phone number |
| `login_url` | string | Single-sign-on login URL |
| `account` | [Account](#account) | CareerPlug Account |

### UserRef

| Field | Type | Description |
|---|---|---|
| `id` | string | — |
| `firstname` | string | — |
| `lastname` | string | — |
| `email` | string | — |

### postApps

Add a new applicant to a job

| Field | Type | Description |
|---|---|---|
| `body` | [InboundApp](#inboundapp) | — |

