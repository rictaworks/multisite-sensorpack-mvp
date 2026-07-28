import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import SitesOverview from '../../../components/dashboard/SitesOverview';

type PageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'dashboard.overview' });
  return { title: t('title') };
}

export default function DashboardPage() {
  return <SitesOverview />;
}
