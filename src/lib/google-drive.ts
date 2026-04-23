/**
 * Google Drive OAuth helpers (separate from Google Calendar).
 * Uses scope drive.file — access only to files created by this app.
 */

import { google } from "googleapis";

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";

const getGoogleConfig = () => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_DRIVE_REDIRECT_URI
    ?? process.env.GOOGLE_REDIRECT_URI?.replace("/google-calendar/", "/drive/")
    ?? "http://127.0.0.1:3000/api/drive/callback";

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Missing Google Drive OAuth configuration");
  }

  return { clientId, clientSecret, redirectUri };
};

export const createDriveOAuthClient = (refreshToken?: string) => {
  const config = getGoogleConfig();
  const client = new google.auth.OAuth2(
    config.clientId,
    config.clientSecret,
    config.redirectUri,
  );

  if (refreshToken) {
    client.setCredentials({ refresh_token: refreshToken });
  }

  return client;
};

export const getDriveAuthorizationUrl = (state = "taskmanager-drive") => {
  const client = createDriveOAuthClient();

  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [DRIVE_SCOPE],
    state,
  });
};

export const exchangeDriveCodeForTokens = async (code: string) => {
  const client = createDriveOAuthClient();
  const { tokens } = await client.getToken(code);
  return tokens;
};

export const getDriveAccessToken = async (refreshToken: string): Promise<string | null> => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) return null;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) return null;
  const data = await res.json();
  return data.access_token ?? null;
};
