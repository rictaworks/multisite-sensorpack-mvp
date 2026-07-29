'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';

/**
 * 利用規約・プライバシーポリシーの共通レンダラー（Issue #70, `.claude/CC.md` CC03/CC04）。
 *
 * 2つの文書は「見出し＋節（小見出し＋本文）の並び」という同じ構造なので、
 * 描画はここに1つだけ持ち、各文書は節のキー一覧だけを渡す（DRY）。
 *
 * 本文はすべて next-intl のロケールファイルから引く。法務文書は翻訳の対象であり、
 * ソースへの直書きは `.claude/rules/coding-style.md` で禁止されている。
 */

export type LegalSectionKey = string;

type LegalDocumentViewProps = {
  /** ロケールの `legal` 配下の名前空間。'terms' または 'privacy'。 */
  document: 'terms' | 'privacy';
  /** 節のキー。`{key}Title` / `{key}Body` の2つのメッセージを引く。 */
  sectionKeys: readonly LegalSectionKey[];
  /**
   * 最終更新日（YYYY-MM-DD）。レンダー中に現在時刻を読むと純粋でなくなるため、
   * 文書の改訂日を定数として受け取る（表示が日々変わってしまうのも誤り）。
   */
  lastUpdated: string;
  /** ログイン画面へ戻るためのロケール付きパス。 */
  loginHref: string;
};

export default function LegalDocumentView({
  document,
  sectionKeys,
  lastUpdated,
  loginHref,
}: LegalDocumentViewProps) {
  const t = useTranslations('legal');
  const tDocument = useTranslations(`legal.${document}`);

  return (
    <main>
      <Link href={loginHref}>{t('backToLogin')}</Link>

      <h1>{tDocument('title')}</h1>
      <p>{t('lastUpdated', { date: lastUpdated })}</p>

      {/* 監修前であることを本文より先に明示する。読んだ人が正式版と誤解しないように。 */}
      <p role="note">{t('draftNotice')}</p>

      <p>{tDocument('intro')}</p>

      {sectionKeys.map((key) => (
        <section key={key} aria-labelledby={`legal-${document}-${key}`}>
          <h2 id={`legal-${document}-${key}`}>{tDocument(`${key}Title`)}</h2>
          <p>{tDocument(`${key}Body`)}</p>
        </section>
      ))}
    </main>
  );
}
