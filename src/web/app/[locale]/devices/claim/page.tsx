import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import DeviceClaimView from '../../../../components/claim/DeviceClaimView';

type PageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'deviceClaim' });
  return { title: t('title') };
}

export default function DeviceClaimPage() {
  return <DeviceClaimView />;
}
