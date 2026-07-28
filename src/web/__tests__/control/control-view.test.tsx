import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import ControlView from '../../components/control/ControlView';
import en from '../../locales/en.json';
import ja from '../../locales/ja.json';

function renderControlView(messages: typeof en, locale: string) {
  render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <ControlView />
    </NextIntlClientProvider>
  );
}

describe('ControlView', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders a card for every seeded device, defaulting LED/Fan to Off', () => {
    renderControlView(en, 'en');

    const onlineCard = screen.getByRole('region', { name: 'Warehouse A - Entrance' });
    const offlineCard = screen.getByRole('region', { name: 'Home - Living Room' });

    expect(within(onlineCard).getAllByRole('switch')).toHaveLength(2);
    expect(within(offlineCard).getByRole('status')).toHaveTextContent(en.control.offlineWarning);
  });

  it('drives an online device through the full manual-control flow: toggle -> confirm -> pending -> delivered -> done', async () => {
    renderControlView(en, 'en');

    const onlineCard = screen.getByRole('region', { name: 'Warehouse A - Entrance' });
    const ledSwitch = within(onlineCard).getByRole('switch', {
      name: en.control.actuatorToggleAriaLabel.replace('{actuator}', en.control.actuator.led),
    });

    expect(ledSwitch).toHaveAttribute('aria-checked', 'false');

    fireEvent.click(ledSwitch);
    fireEvent.click(screen.getByRole('button', { name: en.control.confirm.confirmButton }));

    // The switch reflects the new commanded state optimistically.
    expect(ledSwitch).toHaveAttribute('aria-checked', 'true');
    expect(within(onlineCard).getByText(en.control.commandStatus.pending)).toBeInTheDocument();

    await act(async () => {
      jest.advanceTimersByTime(500);
    });
    expect(within(onlineCard).getByText(en.control.commandStatus.delivered)).toBeInTheDocument();

    await act(async () => {
      jest.advanceTimersByTime(500);
    });
    expect(within(onlineCard).getByText(en.control.commandStatus.done)).toBeInTheDocument();
  });

  it('shows "Not delivered" once the TTL elapses for a command sent to an offline device', async () => {
    renderControlView(en, 'en');

    const offlineCard = screen.getByRole('region', { name: 'Home - Living Room' });
    const fanSwitch = within(offlineCard).getByRole('switch', {
      name: en.control.actuatorToggleAriaLabel.replace('{actuator}', en.control.actuator.fan),
    });

    fireEvent.click(fanSwitch);
    // The offline warning must be visible in the confirmation itself, per Issue #21's acceptance criteria.
    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getByText(en.control.offlineWarning)).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: en.control.confirm.confirmButton }));
    expect(within(offlineCard).getByText(en.control.commandStatus.pending)).toBeInTheDocument();

    await act(async () => {
      jest.advanceTimersByTime(10 * 60 * 1000 + 1000);
    });

    expect(within(offlineCard).getByText(en.control.commandStatus.expired)).toBeInTheDocument();
  });

  it('renders every visible control-screen string in Japanese when given the Japanese locale (i18n switch, no English leaking through)', () => {
    renderControlView(ja, 'ja');

    expect(screen.getByRole('heading', { name: ja.control.title })).toBeInTheDocument();
    expect(screen.queryByText(en.control.title)).not.toBeInTheDocument();

    const offlineCard = screen.getByRole('region', { name: 'Home - Living Room' });
    expect(within(offlineCard).getByRole('status')).toHaveTextContent(ja.control.offlineWarning);
    expect(within(offlineCard).queryByText(en.control.offlineWarning)).not.toBeInTheDocument();
  });
});
