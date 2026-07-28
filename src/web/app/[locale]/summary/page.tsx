import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import SummaryView from '../../../components/summary/SummaryView';

type SummaryPageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: SummaryPageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'summary' });
  return { title: t('title') };
}

export default function SummaryPage() {
  return <SummaryView />;
}
