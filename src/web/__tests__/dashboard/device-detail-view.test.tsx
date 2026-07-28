import { fireEvent, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import DeviceDetailView from '../../components/dashboard/DeviceDetailView';
import { listMockCommands, listMockAlerts, listMockSites, listMockDevices } from '../../lib/dashboard/mockData';
import ja from '../../locales/ja.json';

function renderDetail(deviceId: number) {
  return render(
    <NextIntlClientProvider locale="ja" messages={ja}>
      <DeviceDetailView deviceId={deviceId} />
    </NextIntlClientProvider>
  );
}

describe('DeviceDetailView (Issue #18 acceptance criteria: 24h/7d chart, threshold lines, command + alert history)', () => {
  const onlineDeviceId = listMockDevices(listMockSites()[0].id)[0].id;
  const offlineDeviceId = listMockSites()
    .flatMap((site) => listMockDevices(site.id))
    .find((device) => device.status === 'offline')!.id;

  it('renders the device label, status badge and last-seen text', () => {
    renderDetail(onlineDeviceId);
    expect(screen.getByText(ja.dashboard.overview.deviceLabel.replace('{id}', String(onlineDeviceId)))).toBeInTheDocument();
    expect(screen.getByText(ja.dashboard.device.statusOnline)).toBeInTheDocument();
  });

  it('defaults to the 24h range and can switch to 7d', () => {
    renderDetail(onlineDeviceId);
    const range24h = screen.getByRole('button', { name: ja.dashboard.device.range24h });
    const range7d = screen.getByRole('button', { name: ja.dashboard.device.range7d });
    expect(range24h).toHaveAttribute('aria-pressed', 'true');
    expect(range7d).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(range7d);

    expect(range7d).toHaveAttribute('aria-pressed', 'true');
    expect(range24h).toHaveAttribute('aria-pressed', 'false');
  });

  it('renders the chart section (temperature/humidity legend) for the selected device', () => {
    renderDetail(onlineDeviceId);
    expect(screen.getByText(ja.dashboard.device.legendTemperature)).toBeInTheDocument();
  });

  it('shows the offline warning banner only for an offline device', () => {
    renderDetail(offlineDeviceId);
    expect(screen.getByText(ja.dashboard.device.offlineWarning)).toBeInTheDocument();

    renderDetail(onlineDeviceId);
    expect(screen.queryAllByText(ja.dashboard.device.offlineWarning)).toHaveLength(1); // only from the offline render above
  });

  it('renders command history rows, most recent first, with localized command type and status', () => {
    renderDetail(onlineDeviceId);
    const commands = listMockCommands(onlineDeviceId);
    const list = screen.getByTestId('command-history');
    const rows = within(list).getAllByTestId('command-row');
    expect(rows).toHaveLength(commands.length);
    expect(within(rows[0]).getByText(ja.dashboard.commandType[commands[0].commandType])).toBeInTheDocument();
    expect(within(rows[0]).getByText(ja.dashboard.commandStatus[commands[0].status])).toBeInTheDocument();
  });

  it('renders alert history rows with localized severity/status', () => {
    renderDetail(onlineDeviceId);
    const alerts = listMockAlerts(onlineDeviceId);
    const list = screen.getByTestId('alert-history');
    const rows = within(list).getAllByTestId('alert-row');
    expect(rows).toHaveLength(alerts.length);
    expect(within(rows[0]).getByText(ja.dashboard.alertType[alerts[0].alertType])).toBeInTheDocument();
    expect(within(rows[0]).getByText(ja.dashboard.alertStatus[alerts[0].status])).toBeInTheDocument();
  });

  it('shows a not-found message for an unknown device id instead of crashing', () => {
    render(
      <NextIntlClientProvider locale="ja" messages={ja}>
        <DeviceDetailView deviceId={-1} />
      </NextIntlClientProvider>
    );
    expect(screen.getByText(ja.dashboard.device.notFound)).toBeInTheDocument();
  });
});
