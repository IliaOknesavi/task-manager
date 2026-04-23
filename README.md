# Task Manager

Local project tracker for Codex-driven work with board views, table view, Gantt, progress logs, and Google Calendar sync.

## Local setup

1. Install dependencies with `npm install`.
2. Keep Google Calendar credentials in `.env.local`.
3. Start the app with `npm run dev`.
4. Open `http://127.0.0.1:3000`.
5. Click `Connect Calendar` and complete the Google consent flow.
6. After the callback returns to the app, click `Sync Calendar`.

## Google Calendar

The current OAuth setup uses a Google `web` client and the redirect URI:

`GOOGLE_REDIRECT_URI=http://127.0.0.1:3000/api/google-calendar/callback`

The required local variables are:

```dotenv
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://127.0.0.1:3000/api/google-calendar/callback
```

Do not commit `.env.local` or the downloaded `client_secret` JSON into version control. If the secret is ever exposed outside your machine, rotate the `client_secret` in Google Cloud Console and update `.env.local`.
