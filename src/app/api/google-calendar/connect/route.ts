import { getGoogleAuthorizationUrl } from "@/lib/google-calendar";

export async function GET() {
  try {
    const url = getGoogleAuthorizationUrl();
    return Response.redirect(url, 302);
  } catch (error) {
    return Response.json(
      {
        error: (error as Error).message,
      },
      { status: 500 },
    );
  }
}
