import { addDays } from "date-fns";
import { google } from "googleapis";

import type { AppState } from "@/lib/domain";
import { buildCalendarOperations } from "@/lib/domain";

const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";

const getGoogleConfig = () => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Missing Google Calendar OAuth configuration");
  }

  return {
    clientId,
    clientSecret,
    redirectUri,
  };
};

export const createOAuthClient = (refreshToken?: string) => {
  const config = getGoogleConfig();
  const client = new google.auth.OAuth2(
    config.clientId,
    config.clientSecret,
    config.redirectUri,
  );

  if (refreshToken) {
    client.setCredentials({
      refresh_token: refreshToken,
    });
  }

  return client;
};

export const getGoogleAuthorizationUrl = (state = "taskmanager") => {
  const client = createOAuthClient();

  return client.generateAuthUrl({
    access_type: "offline",
    include_granted_scopes: true,
    prompt: "consent",
    scope: [CALENDAR_SCOPE],
    state,
  });
};

export const exchangeCodeForTokens = async (code: string) => {
  const client = createOAuthClient();
  const { tokens } = await client.getToken(code);

  return tokens;
};

export const syncStateToGoogleCalendar = async (state: AppState) => {
  if (!state.googleCalendar.refreshToken) {
    throw new Error("No Google refresh token stored");
  }

  const client = createOAuthClient(state.googleCalendar.refreshToken);
  const calendar = google.calendar({ version: "v3", auth: client });
  const calendarId = state.googleCalendar.calendarId ?? "primary";
  const operations = buildCalendarOperations(state.projects, calendarId);
  const eventIds = new Map<string, string>();

  for (const operation of operations) {
    const body = {
      summary: operation.summary,
      description: operation.description,
      start: {
        date: operation.startDate,
      },
      end: {
        date: addDays(new Date(`${operation.endDate}T00:00:00.000Z`), 1)
          .toISOString()
          .slice(0, 10),
      },
    };

    if (operation.mode === "update" && operation.eventId) {
      // Verify the event still exists before updating — it may have been
      // deleted manually on Google Calendar, which would cause a 404 and
      // create a duplicate on the next insert. Fall back to insert if gone.
      let eventExists = false;
      try {
        await calendar.events.get({ calendarId, eventId: operation.eventId });
        eventExists = true;
      } catch {
        eventExists = false;
      }

      if (eventExists) {
        const response = await calendar.events.update({
          calendarId,
          eventId: operation.eventId,
          requestBody: body,
        });
        if (response.data.id) {
          eventIds.set(operation.projectId, response.data.id);
        }
        continue;
      }
      // Event was deleted — fall through to insert below
    }

    const response = await calendar.events.insert({
      calendarId,
      requestBody: body,
    });

    if (response.data.id) {
      eventIds.set(operation.projectId, response.data.id);
    }
  }

  const lastSyncedAt = new Date().toISOString();

  const nextState: AppState = {
    ...state,
    googleCalendar: {
      ...state.googleCalendar,
      connected: true,
      calendarId,
      lastSyncedAt,
    },
    projects: state.projects.map((project) => ({
      ...project,
      calendarEventId: eventIds.get(project.id) ?? project.calendarEventId,
    })),
  };

  return {
    synced: operations.length,
    lastSyncedAt,
    state: nextState,
  };
};
