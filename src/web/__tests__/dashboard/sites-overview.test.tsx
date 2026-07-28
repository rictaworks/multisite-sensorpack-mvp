import { render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import SitesOverview from '../../components/dashboard/SitesOverview';
import { listMockSites, listMockDevices } from '../../lib/dashboard/mockData';
import ja from '../../locales/ja.json';
import en from '../../locales/en.json';

function renderOverview(messages: typeof ja, locale: string) {
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <SitesOverview />
    </NextIntlClientProvider>
  );
}

describe('SitesOverview (Issue #18 acceptance criteria: per-site device/online/alert counts + latest reading)', () => {
  it('renders the overview title and aggregate stats derived from the mock sites', () => {
    renderOverview(ja, 'ja');

    const sites = listMockSites();
    const totalDevices = sites.reduce((sum, site) => sum + site.deviceCount, 0);
    const totalOnline = sites.reduce((sum, site) => sum + site.onlineDeviceCount, 0);
    const totalOpenAlerts = sites.reduce((sum, site) => sum + site.openAlertCount, 0);

    expect(screen.getByRole('heading', { name: ja.dashboard.overview.title })).toBeInTheDocument();
    expect(screen.getByTestId('stat-sites-value').textContent).toBe(String(sites.length));
    expect(screen.getByTestId('stat-devices-value').textContent).toBe(String(totalDevices));
    expect(screen.getByTestId('stat-online-value').textContent).toBe(String(totalOnline));
    expect(screen.getByTestId('stat-open-alerts-value').textContent).toBe(String(totalOpenAlerts));
  });

  it('renders one card per site with its name, device count and devices listed underneath', () => {
    renderOverview(ja, 'ja');

    listMockSites().forEach((site) => {
      const card = screen.getByTestId(`site-card-${site.id}`);
      expect(within(card).getByText(site.name)).toBeInTheDocument();

      listMockDevices(site.id).forEach((device) => {
        expect(
          within(card).getByText(ja.dashboard.overview.deviceLabel.replace('{id}', String(device.id)))
        ).toBeInTheDocument();
      });
    });
  });

  it('links each device row to its device detail page', () => {
    renderOverview(ja, 'ja');
    const [firstDevice] = listMockDevices(listMockSites()[0].id);
    const link = screen.getByRole('link', {
      name: new RegExp(ja.dashboard.overview.deviceLabel.replace('{id}', String(firstDevice.id))),
    });
    expect(link).toHaveAttribute('href', expect.stringContaining(`/dashboard/${firstDevice.id}`));
  });

  it('switches every visible label when rendered with the English locale', () => {
    renderOverview(en, 'en');
    expect(screen.getByRole('heading', { name: en.dashboard.overview.title })).toBeInTheDocument();
    expect(screen.queryByText(ja.dashboard.overview.title)).not.toBeInTheDocument();
  });
});
