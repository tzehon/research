import { createHash } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

export class HttpError extends Error {
  constructor(public status: number, message: string, options?: ErrorOptions) { super(message, options); }
}

export interface Identity { id: string; issuer: string; subject: string }
export interface AuthSettings { issuer: string; audience: string; clientId: string; scope: string }

// OpenAI's legacy `user` field accepts at most 64 characters. Keep the existing
// 69-character identity/key owner unchanged; use a separate opaque upstream ID.
export function providerUserId(identity: Identity): string {
  return createHash('sha256').update(identity.id).digest('hex');
}

export function verifier(settings: AuthSettings, keys?: JWTVerifyGetKey) {
  const issuer = new URL(settings.issuer);
  if (issuer.protocol !== 'https:' || issuer.username || issuer.password || issuer.search || issuer.hash) {
    throw new Error('OIDC issuer must be an HTTPS URL without credentials, query, or fragment');
  }
  const jwks = keys ?? createRemoteJWKSet(new URL('.well-known/jwks.json', issuer), {
    timeoutDuration: 5000, cooldownDuration: 30000, cacheMaxAge: 600000,
  });
  return async (header: string | undefined): Promise<Identity> => {
    const match = /^Bearer ([A-Za-z0-9_.-]+)$/.exec(header ?? '');
    if (!match) throw new HttpError(401, 'A gateway OAuth access token is required');
    let claims;
    try {
      ({ payload: claims } = await jwtVerify(match[1], jwks, {
        issuer: settings.issuer, audience: settings.audience, algorithms: ['RS256'],
        requiredClaims: ['iss', 'aud', 'sub', 'exp', 'iat'], clockTolerance: 5,
      }));
    } catch {
      throw new HttpError(401, 'Invalid or expired gateway access token');
    }
    if (claims.azp !== settings.clientId || typeof claims.sub !== 'string' ||
        !claims.sub || claims.sub.endsWith('@clients')) {
      throw new HttpError(403, 'A user token from the configured OAuth client is required');
    }
    const scopes = typeof claims.scope === 'string' ? claims.scope.split(' ') : [];
    if (!scopes.includes(settings.scope)) throw new HttpError(403, 'Required gateway scope is missing');
    return {
      id: 'oidc-' + createHash('sha256').update(JSON.stringify([settings.issuer, claims.sub])).digest('hex'),
      issuer: settings.issuer, subject: claims.sub,
    };
  };
}
