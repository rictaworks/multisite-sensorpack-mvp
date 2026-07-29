'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import ConfirmDialog from '../common/ConfirmDialog';
import { ApiError } from '../../lib/api/apiClient';
import { SITE_NAME_MAX_LENGTH, createSite, deleteSite, fetchSites, type Site } from './api';

/**
 * 拠点(Site)の一覧・作成・削除画面 — openapi.yaml listSites / createSite / deleteSite
 * (Issue #61)。
 *
 * 拠点はデバイス登録(F1)の前提であり、この画面が無いとユーザーは拠点を1件も作れず、
 * 「ログイン → 拠点作成 → デバイス登録」の導線が通しで成立しない。
 *
 * 削除の確認はアプリ内のモーダル(components/common/ConfirmDialog)で行う。ネイティブの
 * confirm() はプロジェクト全体で禁止されている(CLAUDE.md)。
 */

type SitesState =
  | { status: 'loading' }
  // 取得失敗を「0件」と同じ見た目にすると、ユーザーは拠点が消えたと誤解する。
  // 状態として区別し、フォールバックで空配列を見せない(.claude/rules/coding-style.md)。
  | { status: 'ready'; sites: Site[] }
  | { status: 'error' };

export default function SitesView() {
  const t = useTranslations('sites');
  const locale = useLocale();

  const [sitesState, setSitesState] = useState<SitesState>({ status: 'loading' });
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [pendingDeletion, setPendingDeletion] = useState<Site | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchSites()
      .then((sites) => {
        if (!cancelled) setSitesState({ status: 'ready', sites });
      })
      .catch((error: unknown) => {
        console.error('[SitesView] failed to load sites', error);
        if (!cancelled) setSitesState({ status: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const messageForError = useCallback(
    (error: unknown): string => {
      if (!(error instanceof ApiError)) {
        console.error('[SitesView] unexpected error', error);
        return t('errors.network');
      }
      switch (error.code) {
        case 'validation_error':
          return t('errors.validation');
        case 'unauthorized':
          return t('errors.unauthorized');
        case 'forbidden':
          return t('errors.forbidden');
        case 'not_found':
          return t('errors.notFound');
        default:
          return t('errors.network');
      }
    },
    [t]
  );

  const handleCreate = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      const trimmed = name.trim();
      setCreateError(null);
      setNotice(null);

      // 契約(openapi.yaml maxLength: 100)を超える入力は往復する前に手元で弾く。
      // サーバー側も同じ制約を検証しており、こちらは体感を良くするための先出しにすぎない。
      if (trimmed.length === 0) {
        setNameError(t('errors.nameRequired'));
        return;
      }
      if (trimmed.length > SITE_NAME_MAX_LENGTH) {
        setNameError(t('errors.nameTooLong'));
        return;
      }
      setNameError(null);

      setCreating(true);
      try {
        const created = await createSite({ name: trimmed });
        setSitesState((current) =>
          current.status === 'ready'
            ? { status: 'ready', sites: [...current.sites, created] }
            : { status: 'ready', sites: [created] }
        );
        setName('');
        setNotice(t('create.success', { name: created.name }));
      } catch (error) {
        setCreateError(messageForError(error));
      } finally {
        setCreating(false);
      }
    },
    [name, messageForError, t]
  );

  const handleConfirmDeletion = useCallback(async () => {
    if (!pendingDeletion) return;
    const target = pendingDeletion;

    setDeleteError(null);
    setNotice(null);
    setDeleting(true);
    try {
      await deleteSite(target.id);
      setSitesState((current) =>
        current.status === 'ready'
          ? { status: 'ready', sites: current.sites.filter((site) => site.id !== target.id) }
          : current
      );
      setNotice(t('delete.success', { name: target.name }));
      setPendingDeletion(null);
    } catch (error) {
      // 削除できなかった拠点を一覧から消すと「消えたのに残っている」状態になる。
      // 失敗時は一覧に手を触れず、理由だけを伝える。
      setDeleteError(messageForError(error));
      setPendingDeletion(null);
    } finally {
      setDeleting(false);
    }
  }, [pendingDeletion, messageForError, t]);

  return (
    <main>
      <Link href={`/${locale}`}>{t('backToHome')}</Link>
      <p>{t('eyebrow')}</p>
      <h1>{t('title')}</h1>

      <section aria-labelledby="sites-list-heading">
        <h2 id="sites-list-heading">{t('list.heading')}</h2>

        {sitesState.status === 'loading' && <p>{t('list.loading')}</p>}
        {sitesState.status === 'error' && <p role="alert">{t('list.loadError')}</p>}
        {sitesState.status === 'ready' && sitesState.sites.length === 0 && <p>{t('list.empty')}</p>}

        {sitesState.status === 'ready' && sitesState.sites.length > 0 && (
          <ul>
            {sitesState.sites.map((site) => (
              <li key={site.id} data-testid={`site-row-${site.id}`}>
                <span>{site.name}</span>
                <span>{t('list.deviceCount', { count: site.deviceCount })}</span>
                <button
                  type="button"
                  aria-label={t('delete.buttonLabel', { name: site.name })}
                  onClick={() => {
                    setDeleteError(null);
                    setNotice(null);
                    setPendingDeletion(site);
                  }}
                >
                  <i className="fa-solid fa-trash-can" aria-hidden="true" /> {t('delete.button')}
                </button>
              </li>
            ))}
          </ul>
        )}

        {deleteError && <p role="alert">{deleteError}</p>}
      </section>

      <section aria-labelledby="sites-create-heading">
        <h2 id="sites-create-heading">{t('create.heading')}</h2>

        <form onSubmit={handleCreate} noValidate>
          <label htmlFor="site-name">{t('create.nameLabel')}</label>
          <input
            id="site-name"
            type="text"
            value={name}
            maxLength={SITE_NAME_MAX_LENGTH}
            onChange={(event) => setName(event.target.value)}
            placeholder={t('create.namePlaceholder')}
          />
          {/* requirements.md 1.4: 住所入力を促すバリデーションは行わない。 */}
          <span>{t('create.nameHint')}</span>

          {nameError && <p role="alert">{nameError}</p>}
          {createError && <p role="alert">{createError}</p>}

          <button type="submit" disabled={creating}>
            {creating ? t('create.submitting') : t('create.submit')}
          </button>
        </form>
      </section>

      {notice && <p role="status">{notice}</p>}

      {pendingDeletion && (
        <ConfirmDialog
          titleId={`site-delete-confirm-${pendingDeletion.id}`}
          title={t('delete.confirmTitle', { name: pendingDeletion.name })}
          description={t('delete.confirmBody')}
          confirmLabel={deleting ? t('delete.deleting') : t('delete.confirmButton')}
          cancelLabel={t('delete.cancelButton')}
          onConfirm={handleConfirmDeletion}
          onCancel={() => setPendingDeletion(null)}
          destructive
          testId="site-delete-confirm-overlay"
        />
      )}
    </main>
  );
}
