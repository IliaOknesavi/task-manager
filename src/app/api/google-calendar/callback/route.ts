import { exchangeCodeForTokens } from "@/lib/google-calendar";
import { saveGoogleCalendarTokens } from "@/lib/storage";

function appUrl(path: string): string {
  const base = process.env.GOOGLE_REDIRECT_URI
    ? new URL(process.env.GOOGLE_REDIRECT_URI).origin
    : null;
  if (base) return `${base}${path}`;
  return `http://127.0.0.1:3000${path}`;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");

  if (!code) {
    return Response.redirect(appUrl("/?calendar=missing-code"), 302);
  }

  try {
    const tokens = await exchangeCodeForTokens(code);

    if (!tokens.refresh_token) {
      return Response.redirect(appUrl("/?calendar=missing-refresh-token"), 302);
    }

    await saveGoogleCalendarTokens({
      refreshToken: tokens.refresh_token,
      lastSyncedAt: undefined,
    });

    return Response.redirect(appUrl("/?calendar=connected"), 302);
  } catch {
    return Response.redirect(appUrl("/?calendar=error"), 302);
  }
}
