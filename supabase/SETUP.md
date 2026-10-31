# Guitar Lessons portal: setup (about 15 minutes)

The website code is already in this repo. These steps connect it to your Supabase project
(`ltjegtsprbvbkmxczftg`) and to Vercel. Do them in order.

## 1. Create the database (Supabase)
1. Supabase dashboard -> **SQL Editor** -> **New query**.
2. Open `supabase/migrations/001_portal.sql`, copy everything, paste, press **Run**. It should say "Success".
3. New query again. Copy everything from `supabase/seed.sql`, paste, **Run**. This adds Michael Delgado and Lesson 1.

## 2. Lock down sign-ups and set the links (Supabase)
1. **Authentication -> Sign In / Providers -> Email**: turn **off** "Allow new users to sign up". Students join only by your invitation. Set the minimum password length to 8.
2. **Authentication -> URL Configuration**:
   - Site URL: `https://chrisbetancourt.vercel.app`
   - Redirect URLs: add `https://chrisbetancourt.vercel.app/lessons/`
3. Check **Storage**: a private bucket named `submissions` now exists (created by the SQL). Under Storage settings the global file size limit must be at least 50 MB.

## 3. Create YOUR teacher login (Supabase)
1. **Authentication -> Users -> Add user -> Create new user**: your email (`chrisbetancourt56@gmail.com`), a strong password, tick "Auto Confirm User".
2. **SQL Editor**, run exactly:
   ```sql
   update public.profiles set role = 'teacher', full_name = 'Chris Betancourt'
   where email = 'chrisbetancourt56@gmail.com';
   ```
   This is the ONLY way to become a teacher. Nobody can do it from the website.

## 4. Add the secret key to Vercel (this is what lets you send invitations)
1. Supabase -> **Project Settings -> API Keys**. Copy the **secret** key (starts with `sb_secret_`). If invitations later fail with that key, use the **legacy `service_role`** key from the "Legacy API keys" tab instead.
2. Vercel -> your `chris-betancourt-site` project -> **Settings -> Environment Variables** -> add:
   - Name: `SUPABASE_SERVICE_ROLE_KEY`  Value: the key  (tick Production, Preview)
3. Redeploy (Deployments -> latest -> Redeploy). Never paste this key into chat or into any file in the repo.

## 5. Use it
- Go to `https://chrisbetancourt.vercel.app/lessons/` and sign in.
- **Add your next student:** Dashboard -> *Add student* -> name and email -> *Send invitation*. They get an email, set a password, and land on their own dashboard.
- **Invite Michael:** open Michael Delgado -> *Edit details* -> add his email -> *Send invitation*.
- **Create the next lesson:** open a student -> *New lesson*. Save a draft, then *Publish to student*. Use "Start from an existing lesson" to reuse content.
- **Review videos:** the dashboard lists videos waiting. Open one, press *Watch video*, then leave feedback.
- **Students upload:** on any exercise, *Choose a video to upload* (MP4 or MOV, up to 50 MB).

## 6. Check privacy yourself (5 minutes)
1. Invite two test students (use two email addresses you control) and publish a different lesson to each.
2. Sign in as student A. Copy the address of one of their lessons.
3. Sign out, sign in as student B, and paste student A's address. You should see "Page not found".
4. As teacher, write a private note on a lesson. Sign in as that student: the note must not appear anywhere.

## Limits and costs
- **Supabase free plan:** 1 GB of storage (roughly 20 videos at 50 MB), 50 MB max per file, and projects **pause after about a week with no activity** (open the dashboard and press Restore). Auth emails from the free built-in sender are limited to a few per hour. If you invite many students at once, add your own email sender (Supabase -> Authentication -> SMTP) or invite a few at a time.
- **Pro plan** (about $25/month) lifts those limits. If you upgrade, raise the video limit in three places: `file_size_limit` of the `submissions` bucket, the size check on `public.submissions`, and `MAX_VIDEO_MB` in `lessons/config.js`.
- iPhone videos recorded as HEVC play in Safari but not always in Chrome. Students can set Settings -> Camera -> Formats -> "Most Compatible".

## Keeping it safe
- The long key in `lessons/config.js` is a *publishable* key. It is meant to be public. The database rules, not that key, protect student data.
- Videos are private. They play only through links that expire in 10 minutes and are created when someone presses *Watch video*.
- To remove a student's access: Supabase -> Authentication -> Users -> delete the user.

## Tests (developer notes)
- `supabase/tests/run_local_tests.sh`: database privacy tests (72 checks) on a throwaway Postgres.
- `supabase/tests/e2e/run_e2e.sh`: browser tests of the real app against a real PostgREST + Postgres, with local stand-ins for Supabase login and file storage.
