import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import ControlView from '../../components/control/ControlView';
import { ApiError } from '../../lib/api/apiClient';
import en from '../../locales/en.json';
import ja from '../../locales/ja.json';

/**
 * F5 運用ツール画面。実API（`GET /devices` ほか・`POST /devices/{id}/commands`・
 * `PUT /devices/{id}/automation-rule`）へ結線している。
 *
 * かつては components/control/mockControlApi.ts が pending → delivered → done の遷移を
 * タイマーで擬似再現しており、テストもその擬似遷移を検証していた。実際の遷移はデバイスの
 * ACK待ち（ピギーバック方式）であり画面から進むものではないため、モックごと撤去した。
 * ここでは「発行できること」「発行後はサーバーの現在値で組み直すこと」を検証する。
 */
jest.mock('../../components/control/controlApi', () => ({
  __esModule: true,
  fetchControlDevices: jest.fn(),
  dispatchCommand: jest.fn(),
  updateAutomationRule: jest.fn(),
}));

import {
  dispatchCommand,
  fetchControlDevices,
  updateAutomationRule,
} from '../../components/control/controlApi';

const mockedFetch = fetchControlDevices as jest.Mock;
const mockedDispatch = dispatchCommand as jest.Mock;
const mockedUpdateAutomation = updateAutomationRule as jest.Mock;

function device(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    siteName: 'Warehouse A',
    status: 'online',
    ledOn: false,
    fanOn: false,
    automationRule: { fanOnTempAlert: true, ledOnAlert: true, manualOverrideUntil: null },
    commands: [],
    ...overrides,
  };
}

function renderControlView(messages: typeof en = en, locale = 'en') {
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <ControlView />
    </NextIntlClientProvider>
  );
}

function deviceLabel(messages: typeof en, id: number): string {
  return messages.dashboard.overview.deviceLabel.replace('{id}', String(id));
}

describe('ControlView', () => {
  beforeEach(() => {
    mockedFetch.mockReset();
    mockedDispatch.mockReset();
    mockedUpdateAutomation.mockReset();
    mockedFetch.mockResolvedValue([device(), device({ id: 2, siteName: 'Home', status: 'offline' })]);
    mockedDispatch.mockResolvedValue({ id: 10, status: 'pending' });
    mockedUpdateAutomation.mockResolvedValue({ fanOnTempAlert: false, ledOnAlert: true, manualOverrideUntil: null });
  });

  it('取得したデバイスごとにカードを描画し、オフライン機器には警告を出す', async () => {
    renderControlView();

    const onlineCard = await screen.findByRole('region', { name: deviceLabel(en, 1) });
    const offlineCard = screen.getByRole('region', { name: deviceLabel(en, 2) });

    expect(within(onlineCard).getAllByRole('switch')).toHaveLength(2);
    expect(within(offlineCard).getByRole('status')).toHaveTextContent(en.control.offlineWarning);
  });

  it('トグル→確認でコマンドを発行し、その後サーバーの現在値で組み直す', async () => {
    renderControlView();

    const onlineCard = await screen.findByRole('region', { name: deviceLabel(en, 1) });
    const ledSwitch = within(onlineCard).getByRole('switch', {
      name: en.control.actuatorToggleAriaLabel.replace('{actuator}', en.control.actuator.led),
    });
    expect(ledSwitch).toHaveAttribute('aria-checked', 'false');

    fireEvent.click(ledSwitch);
    // 確認前は発行しない（誤操作をそのまま機器に送らない）。
    expect(mockedDispatch).not.toHaveBeenCalled();

    mockedFetch.mockResolvedValue([device({ ledOn: true }), device({ id: 2, siteName: 'Home', status: 'offline' })]);
    fireEvent.click(screen.getByRole('button', { name: en.control.confirm.confirmButton }));

    await waitFor(() => expect(mockedDispatch).toHaveBeenCalledWith(1, 'LED_ON'));
    // 画面側で先回りして状態を作らず、取得し直した結果が反映される。
    await waitFor(() => expect(ledSwitch).toHaveAttribute('aria-checked', 'true'));
  });

  it('確認をやめた場合はコマンドを発行しない', async () => {
    renderControlView();

    const onlineCard = await screen.findByRole('region', { name: deviceLabel(en, 1) });
    fireEvent.click(
      within(onlineCard).getByRole('switch', {
        name: en.control.actuatorToggleAriaLabel.replace('{actuator}', en.control.actuator.led),
      })
    );
    fireEvent.click(screen.getByRole('button', { name: en.control.confirm.cancelButton }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(mockedDispatch).not.toHaveBeenCalled();
  });

  // 送れていないのにトグルだけ切り替わると「送った」と誤解する。
  it('発行に失敗した場合は理由を表示し、状態を切り替えない', async () => {
    mockedDispatch.mockRejectedValue(new ApiError(0, 'network_error', 'network_error'));
    renderControlView(ja, 'ja');

    const card = await screen.findByRole('region', { name: deviceLabel(ja, 1) });
    const ledSwitch = within(card).getByRole('switch', {
      name: ja.control.actuatorToggleAriaLabel.replace('{actuator}', ja.control.actuator.led),
    });
    fireEvent.click(ledSwitch);
    fireEvent.click(screen.getByRole('button', { name: ja.control.confirm.confirmButton }));

    expect(await screen.findByText(ja.control.errors.dispatchFailed)).toBeInTheDocument();
    expect(ledSwitch).toHaveAttribute('aria-checked', 'false');
  });

  it('自動運転の設定変更をAPIへ送る', async () => {
    renderControlView();

    const card = await screen.findByRole('region', { name: deviceLabel(en, 1) });
    const fanRule = within(card).getByRole('checkbox', { name: new RegExp(en.control.automation.fanOnTempAlert) });

    fireEvent.click(fanRule);

    await waitFor(() => expect(mockedUpdateAutomation).toHaveBeenCalledWith(1, { fanOnTempAlert: false }));
  });

  it('自動運転の設定変更に失敗した場合は理由を表示する', async () => {
    mockedUpdateAutomation.mockRejectedValue(new ApiError(403, 'forbidden', 'forbidden'));
    renderControlView(ja, 'ja');

    const card = await screen.findByRole('region', { name: deviceLabel(ja, 1) });
    fireEvent.click(within(card).getByRole('checkbox', { name: new RegExp(ja.control.automation.fanOnTempAlert) }));

    expect(await screen.findByText(ja.control.errors.automationFailed)).toBeInTheDocument();
  });

  it('取得中は読み込み中を表示する', () => {
    mockedFetch.mockReturnValue(new Promise(() => {}));

    renderControlView(ja, 'ja');

    expect(screen.getByText(ja.control.loading)).toBeInTheDocument();
  });

  // 取得失敗を「機器0台」と同じ見た目にすると、機器が消えたと誤解する。
  it('取得に失敗したらエラーを表示し、0台の案内とは区別する', async () => {
    mockedFetch.mockRejectedValue(new ApiError(0, 'network_error', 'network_error'));

    renderControlView(ja, 'ja');

    expect(await screen.findByRole('alert')).toHaveTextContent(ja.control.errors.loadFailed);
    expect(screen.queryByText(ja.control.noDevices)).not.toBeInTheDocument();
  });

  it('機器が0台のときは0台の案内を表示する(エラーにしない)', async () => {
    mockedFetch.mockResolvedValue([]);

    renderControlView(ja, 'ja');

    expect(await screen.findByText(ja.control.noDevices)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
