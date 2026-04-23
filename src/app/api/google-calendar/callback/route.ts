import { exchangeCodeForTokens } from "@/lib/google-calendar";
import { saveGoogleCalendarTokens } from "@/lib/storage";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");

  if (!code) {
    return Response.redirect(new URL("/?calendar=missing-code", request.url), 302);
  }

  try {
    const tokens = await exchangeCodeForTokens(code);

    if (!tokens.refresh_token) {
      return Response.redirect(
        new URL("/?calendar=missing-refresh-token", request.url),
        302,
      );
    }

    await saveGoogleCalendarTokens({
      refreshToken: tokens.refresh_token,
      lastSyncedAt: undefined,
    });

    return Response.redirect(new URL("/?calendar=connected", request.url), 302);
  } catch {
    return Response.redirect(new URL("/?calendar=error", request.url), 302);
  }
}
