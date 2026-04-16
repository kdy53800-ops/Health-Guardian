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

## 3. Naver Callback URL

Register the app callback URL in Naver Developers:

- `https://<your-vercel-domain>/api/naver-callback`

If you also test locally, add your local callback URL only when needed.

## 4. Vercel Environment Variables

Set these in the Vercel project:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NAVER_CLIENT_ID`
- `NAVER_CLIENT_SECRET`

See [.env.example](C:/Users/user/Desktop/Health%20Guardian/.env.example).

## 5. Current App Behavior

After successful Naver login:

- The API exchanges the Naver code for an access token
- The API fetches the user profile from `https://openapi.naver.com/v1/nid/me`
- The app mirrors the user into local storage for current UI compatibility
- The API upserts the user into `public.profiles`

Fields currently synced:

- `name`
- `email`
- `gender`
- `birthday`
- `birthyear`
- `phone`
- `avatar_url`
- `oauth_provider_id`

## 6. Notes

- `public.profiles.id` still references `auth.users(id)`, so the callback uses the Supabase service role key to create or reuse an auth user before syncing the profile row.
- If `SUPABASE_SERVICE_ROLE_KEY` is missing, Naver login can still complete in the browser, but Supabase profile sync will be skipped.

## 7. Next Recommended Work

After login works end-to-end:

1. Move dashboard and records from local storage to Supabase tables
2. Read admin user info from `profiles`
3. Add future `inbody_records` table separately
