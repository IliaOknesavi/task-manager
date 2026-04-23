import { exchangeDriveCodeForTokens } from "@/lib/google-drive";
import { saveGoogleDriveTokens } from "@/lib/storage";

function appUrl(path: string): string {
  const base = process.env.GOOGLE_DRIVE_REDIRECT_URI
    ? new URL(process.env.GOOGLE_DRIVE_REDIRECT_URI).origin
    : null;
  if (base) return `${base}${path}`;
  // fallback for local dev
  return `http://127.0.0.1:3000${path}`;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");

  if (!code) {
    return Response.redirect(appUrl("/?drive=missing-code"), 302);
  }

  try {
    const tokens = await exchangeDriveCodeForTokens(code);

    if (!tokens.refresh_token) {
      return Response.redirect(appUrl("/?drive=missing-refresh-token"), 302);
    }

    await saveGoogleDriveTokens({ refreshToken: tokens.refresh_token });

    return Response.redirect(appUrl("/?drive=connected"), 302);
  } catch {
    return Response.redirect(appUrl("/?drive=error"), 302);
  }
}
