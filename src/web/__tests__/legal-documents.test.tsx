import { render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import LegalDocumentView from '../components/legal/LegalDocumentView';
import {
  LEGAL_LAST_UPDATED,
  PRIVACY_SECTION_KEYS,
  TERMS_SECTION_KEYS,
} from '../components/legal/documents';
import { locales } from '../i18n/config';
import ja from '../locales/ja.json';
import en from '../locales/en.json';

/**
 * Issue #70（`.claude/CC.md` CC03 利用規約 / CC04 プライバシーポリシー / CC08 Cookie）。
 *
 * 本文そのものは法務監修の対象であり、テストで文言を固定しても意味が薄い。ここでは
 * 「必要な節が抜けていないこと」「監修前である旨が読む人に伝わること」「7言語すべてで
 * 表示できること」と、実装と矛盾する記述に後から変わっていないかを検証する。
 */
function renderDocument(
  document: 'terms' | 'privacy',
  messages: Record<string, unknown> = ja,
  locale = 'ja'
) {
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <LegalDocumentView
        document={document}
        sectionKeys={document === 'terms' ? TERMS_SECTION_KEYS : PRIVACY_SECTION_KEYS}
        lastUpdated={LEGAL_LAST_UPDATED}
        loginHref={`/${locale}/login`}
      />
    </NextIntlClientProvider>
  );
}

describe('利用規約・プライバシーポリシー', () => {
  describe('利用規約 (CC03)', () => {
    it('見出しと最終更新日を表示する', () => {
      renderDocument('terms');

      expect(screen.getByRole('heading', { level: 1, name: ja.legal.terms.title })).toBeInTheDocument();
      expect(
        screen.getByText(ja.legal.lastUpdated.replace('{date}', LEGAL_LAST_UPDATED))
      ).toBeInTheDocument();
    });

    it('必要な節がすべて表示される', () => {
      renderDocument('terms');

      TERMS_SECTION_KEYS.forEach((key) => {
        const title = (ja.legal.terms as Record<string, string>)[`${key}Title`];
        expect(screen.getByRole('heading', { level: 2, name: title })).toBeInTheDocument();
      });
    });

    // センサー監視サービスとして、これを書かないまま公開するわけにはいかない。
    it('人命・身体・財産の保護を唯一の手段として使わないよう明記している', () => {
      renderDocument('terms');

      expect(screen.getByText(ja.legal.terms.disclaimerBody)).toHaveTextContent('人命');
      expect(screen.getByText(ja.legal.terms.disclaimerBody)).toHaveTextContent('唯一の手段');
    });

    it('ログイン画面へ戻るリンクがある', () => {
      renderDocument('terms');

      expect(screen.getByRole('link', { name: ja.legal.backToLogin })).toHaveAttribute(
        'href',
        '/ja/login'
      );
    });
  });

  describe('プライバシーポリシー (CC04/CC08)', () => {
    it('必要な節がすべて表示される', () => {
      renderDocument('privacy');

      PRIVACY_SECTION_KEYS.forEach((key) => {
        const title = (ja.legal.privacy as Record<string, string>)[`${key}Title`];
        expect(screen.getByRole('heading', { level: 2, name: title })).toBeInTheDocument();
      });
    });

    // requirements.md 1.4 / app/models/user.rb: google_subのみ保持する設計。
    // 実装が変わってポリシーだけ残ると、事実と異なる説明を掲げることになる。
    it('メールアドレス・氏名を保存しないことを明記している', () => {
      renderDocument('privacy');

      const body = screen.getByText(ja.legal.privacy.notCollectedBody);
      expect(body).toHaveTextContent('メールアドレス');
      expect(body).toHaveTextContent('保存しません');
    });

    // DailySummaryService#build_payload が送るのは統計値とアラート種別のみ。
    it('AIサービスへ識別子・拠点名・機器情報を送らないことを明記している', () => {
      renderDocument('privacy');

      const body = screen.getByText(ja.legal.privacy.thirdPartyBody);
      expect(body).toHaveTextContent('送信しません');
    });

    // CC08: Cookieの利用目的を明示する。
    it('Cookieの利用目的（ログイン状態の維持）と、広告・分析に使わないことを明記している', () => {
      renderDocument('privacy');

      const body = screen.getByText(ja.legal.privacy.cookiesBody);
      expect(body).toHaveTextContent('ログイン状態を維持');
      expect(body).toHaveTextContent('広告');
    });

    // RawDataPurgeJob::RAW_RETENTION = 14.days と一致していること。
    it('生データの保存期間（14日）を明記している', () => {
      renderDocument('privacy');

      expect(screen.getByText(ja.legal.privacy.retentionBody)).toHaveTextContent('14日');
    });
  });

  describe('監修前であることの明示', () => {
    it.each(['terms', 'privacy'] as const)('%s に監修前のドラフトである旨を表示する', (document) => {
      renderDocument(document);

      expect(screen.getByRole('note')).toHaveTextContent(ja.legal.draftNotice);
    });
  });

  describe('多言語対応 (.claude/rules/i18n.md)', () => {
    it('7言語すべてのロケールに規約・ポリシーの全キーがある', () => {
      const requiredKeys = [
        ...TERMS_SECTION_KEYS.flatMap((key) => [`terms.${key}Title`, `terms.${key}Body`]),
        ...PRIVACY_SECTION_KEYS.flatMap((key) => [`privacy.${key}Title`, `privacy.${key}Body`]),
        'draftNotice',
        'lastUpdated',
        'backToLogin',
        'termsLink',
        'privacyLink',
      ];

      locales.forEach((locale) => {
        const messages = require(`../locales/${locale}.json`) as { legal: Record<string, unknown> };
        requiredKeys.forEach((dottedKey) => {
          const value = dottedKey
            .split('.')
            .reduce<unknown>((acc, part) => (acc as Record<string, unknown>)?.[part], messages.legal);
          expect(typeof value).toBe('string');
          expect(String(value).trim().length).toBeGreaterThan(0);
        });
      });
    });

    it('英語ロケールでも文書を表示できる', () => {
      renderDocument('terms', en, 'en');

      expect(screen.getByRole('heading', { level: 1, name: en.legal.terms.title })).toBeInTheDocument();
      expect(screen.queryByText(ja.legal.terms.title)).not.toBeInTheDocument();
    });
  });

  describe('節の構造', () => {
    it('各節が見出しと本文の組で構成されている', () => {
      renderDocument('privacy');

      PRIVACY_SECTION_KEYS.forEach((key) => {
        const section = screen.getByRole('region', {
          name: (ja.legal.privacy as Record<string, string>)[`${key}Title`],
        });
        expect(
          within(section).getByText((ja.legal.privacy as Record<string, string>)[`${key}Body`])
        ).toBeInTheDocument();
      });
    });
  });
});
