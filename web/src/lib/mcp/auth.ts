type VerifiedUser = { id: string };

type TokenClaims = {
  client_id?: unknown;
  scope?: unknown;
  exp?: unknown;
};

function decodeClaims(token: string): TokenClaims {
  try {
    const payload = token.split(".")[1];
    if (!payload) return {};
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as TokenClaims;
  } catch {
    return {};
  }
}

export async function authenticateSupabaseToken(
  token: string,
  getVerifiedUser: (token: string) => Promise<VerifiedUser | null>,
) {
  const user = await getVerifiedUser(token);
  if (!user) return null;

  const claims = decodeClaims(token);
  return {
    userId: user.id,
    clientId: typeof claims.client_id === "string" ? claims.client_id : undefined,
    scopes:
      typeof claims.scope === "string"
        ? claims.scope.split(/\s+/).filter(Boolean)
        : [],
    expiresAt: typeof claims.exp === "number" ? claims.exp : undefined,
  };
}
