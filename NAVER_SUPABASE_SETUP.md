# Naver + Supabase Setup

## 1. Supabase SQL

Run [supabase/setup.sql](C:/Users/user/Desktop/Health%20Guardian/supabase/setup.sql) in the Supabase SQL Editor first.

## 2. Naver Developers

Create a Naver Login application and prepare:

- `Client ID`
- `Client Secret`
- Service URL
- Callback URL

Recommended callback URL:

- `https://<your-project>.supabase.co/auth/v1/callback`

If you also test locally, add your local callback URL only when needed.

## 3. Supabase Auth Provider

In Supabase:

1. Open `Authentication`
2. Open `Providers`
3. Add a custom OIDC provider for Naver

Recommended values:

- Provider ID: `custom:naver`
- Issuer: `https://nid.naver.com`
- Client ID: `<Naver Client ID>`
- Client Secret: `<Naver Client Secret>`

Request the scopes needed for your service and admin visibility:

- `openid`
- `name`
- `email`
- `gender`
- `birthday`
- `birthyear`
- `mobile`

## 4. Supabase Redirect URLs

In Supabase URL configuration, allow:

- `https://<your-vercel-domain>/index.html`
- `https://<your-vercel-domain>/`
- `http://localhost:3000/index.html`

Use only the domains you actually need.

## 5. Vercel Environment Variables

Set these in the Vercel project:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_NAVER_PROVIDER`

Recommended value:

- `SUPABASE_NAVER_PROVIDER=custom:naver`

See [.env.example](C:/Users/user/Desktop/Health%20Guardian/.env.example).

## 6. Current App Behavior

After successful Naver login:

- Supabase session is created
- The app mirrors the user into local storage for current UI compatibility
- The app upserts the user into `public.profiles`

Fields currently synced:

- `name`
- `email`
- `gender`
- `birthday`
- `birthyear`
- `phone`
- `avatar_url`
- `oauth_provider_id`

## 7. Next Recommended Work

After login works end-to-end:

1. Move dashboard and records from local storage to Supabase tables
2. Read admin user info from `profiles`
3. Add future `inbody_records` table separately
