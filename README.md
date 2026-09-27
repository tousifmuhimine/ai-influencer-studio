# AI Identity Studio

Next.js studio for managing AI influencer identities, provider credentials, model catalogs, and image generations.

## Local development

1. Copy `.env.example` to `.env`.
2. Fill in the Supabase and provider values you use.
3. Run `npm install`.
4. Run `npm run dev`.

The app is available at `http://localhost:4173`.

## Deploying to Vercel

Import this repository into Vercel and set the project root to the repository root. Vercel detects Next.js automatically. Add environment variables in **Project Settings > Environment Variables** for the environments where they are needed:

- `APP_SECRET`: a long random value used to sign sessions and encrypt saved provider keys.
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`: server-only; never expose it with a `NEXT_PUBLIC_` prefix.
- Provider keys such as `OPENAI_API_KEY`, `STABILITY_API_KEY`, and `HF_TOKEN`.

Run `npm run setup:supabase` locally once against the target Supabase project before deploying. Do not add `.env` to Git or paste its values into source files.

The Settings screen never returns a complete saved key to the browser. It shows only a masked value and lets an authenticated user replace or remove an app-managed key. Keys configured in local `.env` or Vercel project settings are deployment-managed and cannot be changed by a website request; update those in the relevant environment settings and redeploy. A key entered through the website is encrypted with `APP_SECRET`, so that path requires durable database storage before production use.

## Important Vercel limitation

The current app stores its primary database and uploaded/generated media under `.studio-data/`. Vercel serverless functions use ephemeral filesystems, so this data is not a durable production store and may disappear between deployments or function instances.

Before using this as a multi-user production app, migrate:

- app state, jobs, custom models, favorites, and encrypted credentials to Supabase tables;
- reference images and generated media to Supabase Storage or another object store;
- background generation work to a durable queue or a provider webhook/job system.

The signed session cookie itself can run on Vercel, provided `APP_SECRET` is configured.

## Security

If a secret has ever been committed, shared, or exposed, rotate it at its provider immediately. The Supabase service-role key, database password, and model-provider keys are credentials and must remain server-side.