/**
 * Site (拠点) API client — openapi.yaml `listSites` / `createSite` / `deleteSite`.
 *
 * 拠点はデバイス登録(F1)の前提となるため、この3操作が揃って初めて
 * 「ログイン → 拠点作成 → デバイス登録」の導線が通しで成立する(Issue #61)。
 *
 * Request/response shapes come from the generated OpenAPI types rather than being
 * re-declared here (src/shared/contracts/CONTRACT.md「Next.js（Web）」)。
 * 通信の作法・エラー分類は lib/api/apiClient.ts に集約している。
 */
import { requestJson, requestNoContent } from '../../lib/api/apiClient';
import type { components, paths } from '../../../shared/contracts/types/api';

export type Site = components['schemas']['Site'];
export type SiteCreateRequest = components['schemas']['SiteCreateRequest'];

/**
 * 拠点名の最大長。openapi.yaml components.schemas.Site.name の maxLength と一致させる
 * (Rails側は app/models/site.rb の NAME_MAX_LENGTH で同じ制約を検証する)。
 * 画面側の検証は往復を省くための先出しであり、サーバー側の検証を置き換えるものではない。
 */
export const SITE_NAME_MAX_LENGTH = 100;

type ListSitesResponse = paths['/sites']['get']['responses']['200']['content']['application/json'];

/**
 * Fetches the caller's own sites. Requires an authenticated session (Issue #17);
 * an expired/missing session surfaces as a 401 ApiError for the caller to handle.
 */
export async function fetchSites(fetchImpl: typeof fetch = fetch): Promise<Site[]> {
  const body = await requestJson<ListSitesResponse>({
    path: '/sites',
    method: 'GET',
    context: 'sites/api#fetchSites',
    fetchImpl,
  });
  return body.sites;
}

/**
 * Creates a site. The owner is derived from the session server-side — it is never
 * sent from the browser (.claude/OWASP10.md A01).
 */
export async function createSite(
  input: SiteCreateRequest,
  fetchImpl: typeof fetch = fetch
): Promise<Site> {
  return requestJson<Site>({
    path: '/sites',
    method: 'POST',
    body: { name: input.name },
    context: 'sites/api#createSite',
    fetchImpl,
  });
}

/** Soft-deletes a site and its devices (openapi.yaml deleteSite). Responds 204. */
export async function deleteSite(siteId: number, fetchImpl: typeof fetch = fetch): Promise<void> {
  await requestNoContent({
    path: `/sites/${siteId}`,
    method: 'DELETE',
    context: 'sites/api#deleteSite',
    fetchImpl,
  });
}
