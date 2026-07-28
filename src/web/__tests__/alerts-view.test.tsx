import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import AlertsView from '../components/alerts/AlertsView';
import ja from '../locales/ja.json';
import en from '../locales/en.json';

function renderAlertsView(locale: 'ja' | 'en', messages: typeof ja | typeof en) {
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <AlertsView />
    </NextIntlClientProvider>
  );
}

/** Matches a tab button's accessible name regardless of punctuation/spacing
 * around the count, since that differs per locale (e.g. "未対応（2）" vs "Open (2)"). */
function tabButtonName(label: string, count: number): RegExp {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`${escapedLabel}.*${count}`);
}

describe('AlertsView (Issue #20, requirements.md F8)', () => {
  it('renders the translated heading and shows open alerts by default, with severity and type shown', async () => {
    renderAlertsView('ja', ja);

    expect(await screen.findByRole('heading', { name: ja.alerts.title })).toBeInTheDocument();

    // Seed data has 2 open alerts: an upper_breach/warning on device1 and an
    // offline/critical on device2.
    expect(
      await screen.findByText(
        ja.alerts.messages.upperBreach.title.replace('{device}', ja.alerts.stubDevices.device1)
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText(ja.alerts.messages.offline.title.replace('{device}', ja.alerts.stubDevices.device2))
    ).toBeInTheDocument();

    expect(screen.getAllByText(ja.alerts.severity.warning).length).toBeGreaterThan(0);
    expect(screen.getByText(ja.alerts.severity.critical)).toBeInTheDocument();
    expect(screen.getByText(ja.alerts.type.upperBreach)).toBeInTheDocument();
    expect(screen.getByText(ja.alerts.type.offline)).toBeInTheDocument();

    // Two open alerts seeded -> two Ack buttons visible on the default tab.
    expect(await screen.findAllByRole('button', { name: ja.alerts.ackButton })).toHaveLength(2);

    // Tab counts reflect the seeded fixture: 2 open, 1 acknowledged, 1 closed.
    expect(screen.getByRole('button', { name: tabButtonName(ja.alerts.tabs.open, 2) })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: tabButtonName(ja.alerts.tabs.acknowledged, 1) })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: tabButtonName(ja.alerts.tabs.closed, 1) })
    ).toBeInTheDocument();
  });

  it('switches the visible list when a different tab is selected, and never offers a manual close/resolve action', async () => {
    renderAlertsView('ja', ja);

    await screen.findAllByRole('button', { name: ja.alerts.ackButton });

    fireEvent.click(screen.getByRole('button', { name: tabButtonName(ja.alerts.tabs.closed, 1) }));

    // The one seeded closed alert (lower_breach/info on device1) should now show.
    expect(
      await screen.findByText(
        ja.alerts.messages.lowerBreach.title.replace('{device}', ja.alerts.stubDevices.device1)
      )
    ).toBeInTheDocument();

    // Acknowledging is only ever offered for 'open' alerts: closed items must
    // not expose any action button, since close/resolve can only happen
    // automatically (requirements.md F8.2 — verifies the acceptance
    // criterion that the UI itself communicates this).
    expect(screen.queryByRole('button', { name: ja.alerts.ackButton })).not.toBeInTheDocument();
  });

  it('lets the user acknowledge an open alert, which moves it out of the open tab and updates the badge', async () => {
    renderAlertsView('ja', ja);

    const ackButtons = await screen.findAllByRole('button', { name: ja.alerts.ackButton });
    expect(ackButtons).toHaveLength(2);

    expect(screen.getByRole('status')).toHaveAccessibleName(
      ja.alerts.badgeAriaLabel.replace('{count}', '2')
    );

    fireEvent.click(ackButtons[0]);

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: ja.alerts.ackButton })).toHaveLength(1);
    });

    expect(
      screen.getByRole('button', { name: tabButtonName(ja.alerts.tabs.open, 1) })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: tabButtonName(ja.alerts.tabs.acknowledged, 2) })
    ).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveAccessibleName(
      ja.alerts.badgeAriaLabel.replace('{count}', '1')
    );
  });

  it('shows the empty-tab message once every open alert has been acknowledged', async () => {
    renderAlertsView('ja', ja);

    let ackButtons = await screen.findAllByRole('button', { name: ja.alerts.ackButton });
    fireEvent.click(ackButtons[0]);
    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: ja.alerts.ackButton })).toHaveLength(1);
    });

    ackButtons = screen.getAllByRole('button', { name: ja.alerts.ackButton });
    fireEvent.click(ackButtons[0]);

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: ja.alerts.ackButton })).not.toBeInTheDocument();
    });
    expect(screen.getByText(ja.alerts.emptyState)).toBeInTheDocument();
  });

  it('always shows the footer note explaining that resolution only happens automatically', async () => {
    renderAlertsView('ja', ja);

    await screen.findAllByRole('button', { name: ja.alerts.ackButton });
    expect(screen.getByText(ja.alerts.footerNote)).toBeInTheDocument();
  });

  it('switches every visible string when rendered with the English locale (i18n switch mechanism)', async () => {
    renderAlertsView('en', en);

    expect(await screen.findByRole('heading', { name: en.alerts.title })).toBeInTheDocument();
    expect(screen.queryByText(ja.alerts.title)).not.toBeInTheDocument();
    expect(await screen.findAllByRole('button', { name: en.alerts.ackButton })).toHaveLength(2);
  });
});
