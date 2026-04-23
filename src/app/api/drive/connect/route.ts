import { getDriveAuthorizationUrl } from "@/lib/google-drive";

export async function GET() {
  try {
    const url = getDriveAuthorizationUrl();
    return Response.redirect(url, 302);
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}
