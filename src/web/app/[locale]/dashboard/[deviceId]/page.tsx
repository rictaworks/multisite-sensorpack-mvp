import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import DeviceDetailView from '../../../../components/dashboard/DeviceDetailView';

type PageProps = {
  params: Promise<{ locale: string; deviceId: string }>;
};

/**
 * Only rejects malformed ids (routing-level 400/404). A well-formed id that
 * doesn't exist in the data source is still rendered by <DeviceDetailView />,
 * which shows its own localized "not found" message with a way back — see
 * Issue #18 acceptance criteria / .claude/rules/coding-style.md (no silent
 * fallback: the two failure modes are handled explicitly and differently).
 */
function parseDeviceId(raw: string): number {
  const numericId = Number(raw);
  if (!Number.isInteger(numericId) || numericId <= 0) {
    notFound();
  }
  return numericId;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale, deviceId } = await params;
  const t = await getTranslations({ locale, namespace: 'dashboard.overview' });
  return { title: t('deviceLabel', { id: deviceId }) };
}

export default async function DevicePage({ params }: PageProps) {
  const { deviceId } = await params;
  return <DeviceDetailView deviceId={parseDeviceId(deviceId)} />;
}
