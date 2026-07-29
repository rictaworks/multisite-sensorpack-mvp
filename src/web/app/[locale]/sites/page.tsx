import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import SitesView from '../../../components/sites/SitesView';

type PageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'sites' });
  return { title: t('title') };
}

export default function SitesPage() {
  return <SitesView />;
}
