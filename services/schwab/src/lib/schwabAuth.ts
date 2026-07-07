// =============================================================================
// Schwab OAuth 2.0 Core
// Pure functions for authorization URL generation, code exchange, and token refresh.
// No side effects beyond HTTP calls — database writes are handled by the caller.
//
// Reference: https://developer.schwab.com/
// Authorization: https://api.schwabapi.com/v1/oauth/authorize
// Token:         https://api.schwabapi.com/v1/oauth/token
// =============================================================================

import {
  SchwabConfig,
  SchwabTokenResponse,
  SchwabErrorCode,
  SchwabServiceError,
} from '../types/schwab.types.js';
import { logger, maskSensitive } from './logger.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Schwab access tokens expire in 30 minutes (1800 seconds). */
export const ACCESS_TOKEN_LIFETIME_SECONDS = 1800;

/** Schwab refresh tokens expire in 7 days. */
export const REFRESH_TOKEN_LIFETIME_SECONDS = 7 * 24 * 60 * 60; // 604800

/** Maximum retry attempts for transient errors. */
const MAX_RETRIES = 3;

/** Base delay for exponential backoff (ms). */
const BASE_BACKOFF_MS = 1000;

// ---------------------------------------------------------------------------
// Authorization URL
// ---------------------------------------------------------------------------

/**
 * Generates the Schwab OAuth 2.0 authorization URL.
 * Redirect the user to this URL to initiate the login flow.
 *
 * @param config - Validated Schwab configuration
 * @returns Full authorization URL with query parameters
 */
export function getAuthorizationUrl(config: SchwabConfig): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.callbackUrl,
    response_type: 'code',
  });

  const url = `${config.authorizationUrl}?${params.toString()}`;

  logger.info('Generated Schwab authorization URL', {
    callbackUrl: config.callbackUrl,
  });

  return url;
}

// ---------------------------------------------------------------------------
// Token Exchange (Authorization Code → Tokens)
// ---------------------------------------------------------------------------

/**
 * Exchanges an authorization code for access and refresh tokens.
 *
 * This is called once after the user completes the Schwab login flow
 * and the callback receives the authorization code.
 *
 * @param code - The authorization code from Schwab's callback
 * @param config - Validated Schwab configuration
 * @returns Token response from Schwab
 * @throws SchwabServiceError on failure
 */
export async function exchangeCodeForTokens(
  code: string,
  config: SchwabConfig
): Promise<SchwabTokenResponse> {
  logger.info('Exchanging authorization code for tokens', {
    codePreview: maskSensitive(code),
  });

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: config.callbackUrl,
  });

  try {
    const response = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${config.basicAuthHeader}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      const errorCode = mapHttpErrorToCode(response.status, errorBody);

      throw new SchwabServiceError(
        errorCode,
        `Token exchange failed: HTTP ${response.status}`,
        {
          httpStatus: response.status,
          context: {
            responseBody: errorBody,
            statusText: response.statusText,
          },
        }
      );
    }

    const data = (await response.json()) as SchwabTokenResponse;

    logger.info('Token exchange successful', {
      tokenType: data.token_type,
      expiresIn: data.expires_in,
      scope: data.scope,
      accessTokenPreview: maskSensitive(data.access_token),
    });

    return data;
  } catch (error) {
    if (error instanceof SchwabServiceError) throw error;

    throw new SchwabServiceError(
      SchwabErrorCode.NETWORK_ERROR,
      'Network error during token exchange',
      { cause: error }
    );
  }
}

// ---------------------------------------------------------------------------
// Token Refresh
// ---------------------------------------------------------------------------

/**
 * Refreshes tokens using a valid refresh token.
 *
 * Schwab issues a NEW refresh_token with each successful refresh.
 * The old refresh_token is immediately invalidated.
 *
 * Implements retry with exponential backoff for transient errors.
 *
 * @param refreshToken - Current valid refresh token
 * @param config - Validated Schwab configuration
 * @returns New token response from Schwab
 * @throws SchwabServiceError on failure after all retries
 */
export async function refreshTokens(
  refreshToken: string,
  config: SchwabConfig
): Promise<SchwabTokenResponse> {
  logger.info('Refreshing tokens', {
    refreshTokenPreview: maskSensitive(refreshToken),
  });

  let lastError: SchwabServiceError | undefined;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const body = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      });

      const response = await fetch(config.tokenUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${config.basicAuthHeader}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        const errorCode = mapHttpErrorToCode(response.status, errorBody);

        // Don't retry on auth errors — they won't resolve
        if (
          errorCode === SchwabErrorCode.AUTH_INVALID_GRANT ||
          errorCode === SchwabErrorCode.AUTH_INVALID_CLIENT
        ) {
          throw new SchwabServiceError(
            errorCode,
            `Token refresh failed (non-retryable): HTTP ${response.status}`,
            {
              httpStatus: response.status,
              context: { responseBody: errorBody, attempt },
            }
          );
        }

        throw new SchwabServiceError(
          SchwabErrorCode.ROTATION_API_ERROR,
          `Token refresh failed: HTTP ${response.status}`,
          {
            httpStatus: response.status,
            context: { responseBody: errorBody, attempt },
          }
        );
      }

      const data = (await response.json()) as SchwabTokenResponse;

      logger.info('Token refresh successful', {
        attempt,
        tokenType: data.token_type,
        expiresIn: data.expires_in,
        accessTokenPreview: maskSensitive(data.access_token),
      });

      return data;
    } catch (error) {
      if (error instanceof SchwabServiceError) {
        // Non-retryable errors: throw immediately
        if (
          error.code === SchwabErrorCode.AUTH_INVALID_GRANT ||
          error.code === SchwabErrorCode.AUTH_INVALID_CLIENT
        ) {
          throw error;
        }
        lastError = error;
      } else {
        lastError = new SchwabServiceError(
          SchwabErrorCode.NETWORK_ERROR,
          'Network error during token refresh',
          { cause: error, context: { attempt } }
        );
      }

      // Exponential backoff: 1s, 2s, 4s
      if (attempt < MAX_RETRIES) {
        const delay = BASE_BACKOFF_MS * Math.pow(2, attempt - 1);
        logger.warn(`Token refresh attempt ${attempt} failed, retrying in ${delay}ms`, {
          attempt,
          maxRetries: MAX_RETRIES,
          errorCode: lastError.code,
        });
        await sleep(delay);
      }
    }
  }

  logger.error('Token refresh failed after all retries', lastError, {
    maxRetries: MAX_RETRIES,
  });

  throw lastError!;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Calculates the absolute expiration timestamp from a relative seconds value.
 *
 * @param expiresInSeconds - Seconds until expiration
 * @returns ISO 8601 timestamp
 */
export function calculateExpiresAt(expiresInSeconds: number): string {
  return new Date(Date.now() + expiresInSeconds * 1000).toISOString();
}

/**
 * Maps HTTP error status and body to a typed error code.
 */
function mapHttpErrorToCode(status: number, body: string): SchwabErrorCode {
  const lowerBody = body.toLowerCase();

  if (status === 401) {
    if (lowerBody.includes('invalid_client')) {
      return SchwabErrorCode.AUTH_INVALID_CLIENT;
    }
    return SchwabErrorCode.AUTH_CODE_EXCHANGE_FAILED;
  }

  if (status === 400) {
    if (lowerBody.includes('invalid_grant')) {
      return SchwabErrorCode.AUTH_INVALID_GRANT;
    }
    return SchwabErrorCode.AUTH_CODE_EXCHANGE_FAILED;
  }

  return SchwabErrorCode.ROTATION_API_ERROR;
}

/**
 * Promise-based sleep utility.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
