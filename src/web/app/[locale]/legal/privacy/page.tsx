import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import LegalDocumentView from '../../../../components/legal/LegalDocumentView';
import { LEGAL_LAST_UPDATED, PRIVACY_SECTION_KEYS } from '../../../../components/legal/documents';

type PageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'legal.privacy' });
  return { title: t('title') };
}

export default async function PrivacyPage({ params }: PageProps) {
  const { locale } = await params;
  return (
    <LegalDocumentView
      document="privacy"
      sectionKeys={PRIVACY_SECTION_KEYS}
      lastUpdated={LEGAL_LAST_UPDATED}
      loginHref={`/${locale}/login`}
    />
  );
}
