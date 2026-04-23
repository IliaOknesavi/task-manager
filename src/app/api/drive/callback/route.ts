import { exchangeDriveCodeForTokens } from "@/lib/google-drive";
import { saveGoogleDriveTokens } from "@/lib/storage";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");

  if (!code) {
    return Response.redirect(new URL("/?drive=missing-code", request.url), 302);
  }

  try {
    const tokens = await exchangeDriveCodeForTokens(code);

    if (!tokens.refresh_token) {
      return Response.redirect(
        new URL("/?drive=missing-refresh-token", request.url),
        302,
      );
    }

    await saveGoogleDriveTokens({ refreshToken: tokens.refresh_token });

    return Response.redirect(new URL("/?drive=connected", request.url), 302);
  } catch {
    return Response.redirect(new URL("/?drive=error", request.url), 302);
  }
}
