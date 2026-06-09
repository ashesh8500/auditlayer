/** Client-safe Instagram Business Login OAuth URL builder. */

const INSTAGRAM_APP_ID = process.env.NEXT_PUBLIC_FACEBOOK_APP_ID;
const REDIRECT_URI = `${process.env.NEXT_PUBLIC_SITE_URL}/api/auth/instagram/callback`;

/** Build the Instagram Business Login OAuth URL. */
export function buildInstagramAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: INSTAGRAM_APP_ID!,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: "instagram_business_basic",
    state,
  });
  return `https://www.instagram.com/oauth/authorize?${params}`;
}
