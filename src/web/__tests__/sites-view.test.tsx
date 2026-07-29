import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import ja from '../locales/ja.json';
import { ApiError } from '../lib/api/apiClient';
import SitesView from '../components/sites/SitesView';

/**
 * Issue #61: 拠点(Site)の作成・削除画面。
 *
 * 拠点はデバイス登録(F1)の前提であり、この画面が無いとユーザーは拠点を1件も作れない。
 * 削除の確認はネイティブの confirm() ではなくアプリ内モーダルで行う
 * (CLAUDE.md / .claude/rules/coding-style.md)。
 */
jest.mock('../components/sites/api', () => ({
  __esModule: true,
  SITE_NAME_MAX_LENGTH: 100,
  fetchSites: jest.fn(),
  createSite: jest.fn(),
  deleteSite: jest.fn(),
}));

import { createSite, deleteSite, fetchSites } from '../components/sites/api';

const mockedFetchSites = fetchSites as jest.Mock;
const mockedCreateSite = createSite as jest.Mock;
const mockedDeleteSite = deleteSite as jest.Mock;

function site(id: number, name: string, deviceCount = 0) {
  return {
    id,
    name,
    deviceCount,
    onlineDeviceCount: 0,
    openAlertCount: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

function renderView() {
  return render(
    <NextIntlClientProvider locale="ja" messages={ja}>
      <SitesView />
    </NextIntlClientProvider>
  );
}

describe('SitesView', () => {
  let confirmSpy: jest.SpyInstance;

  beforeEach(() => {
    mockedFetchSites.mockReset();
    mockedCreateSite.mockReset();
    mockedDeleteSite.mockReset();
    mockedFetchSites.mockResolvedValue([]);
    // CLAUDE.md はネイティブの confirm() を全面的に禁止している。
    // 呼ばれたら分かるようにスパイを張る(戻り値を返さないので、誤って使えばテストが落ちる)。
    confirmSpy = jest.spyOn(window, 'confirm').mockImplementation(() => {
      throw new Error('native confirm() is forbidden — use the in-app ConfirmDialog');
    });
  });

  afterEach(() => {
    confirmSpy.mockRestore();
  });

  describe('一覧', () => {
    it('自分の拠点を機器台数つきで表示する', async () => {
      mockedFetchSites.mockResolvedValue([site(1, '倉庫A', 2), site(2, '実家')]);

      renderView();

      expect(await screen.findByText('倉庫A')).toBeInTheDocument();
      expect(screen.getByText('実家')).toBeInTheDocument();
      expect(screen.getByText(ja.sites.list.deviceCount.replace('{count}', '2'))).toBeInTheDocument();
    });

    it('拠点が0件のときは、最初の拠点を作るよう促す(エラー表示にしない)', async () => {
      mockedFetchSites.mockResolvedValue([]);

      renderView();

      expect(await screen.findByText(ja.sites.list.empty)).toBeInTheDocument();
      expect(screen.queryByText(ja.sites.list.loadError)).not.toBeInTheDocument();
    });

    // 取得に失敗したときに「拠点0件」と区別がつかない表示をすると、
    // ユーザーが自分の拠点を消えたと誤解する(フォールバック禁止)。
    it('取得に失敗したらエラーを表示し、0件の案内とは区別する', async () => {
      mockedFetchSites.mockRejectedValue(new ApiError(0, 'network_error', 'network_error'));

      renderView();

      expect(await screen.findByRole('alert')).toHaveTextContent(ja.sites.list.loadError);
      expect(screen.queryByText(ja.sites.list.empty)).not.toBeInTheDocument();
    });
  });

  describe('作成', () => {
    it('入力した名前で拠点を作成し、一覧に反映して完了を伝える', async () => {
      mockedFetchSites.mockResolvedValue([]);
      mockedCreateSite.mockResolvedValue(site(1, '倉庫A'));

      renderView();
      await screen.findByText(ja.sites.list.empty);

      fireEvent.change(screen.getByLabelText(ja.sites.create.nameLabel), {
        target: { value: '倉庫A' },
      });
      fireEvent.click(screen.getByRole('button', { name: ja.sites.create.submit }));

      await waitFor(() => expect(mockedCreateSite).toHaveBeenCalledWith({ name: '倉庫A' }));
      expect(await screen.findByText('倉庫A')).toBeInTheDocument();
      expect(screen.getByText(ja.sites.create.success.replace('{name}', '倉庫A'))).toBeInTheDocument();
    });

    it('作成後は入力欄を空に戻す(同じ名前の拠点を二重作成しにくくする)', async () => {
      mockedCreateSite.mockResolvedValue(site(1, '倉庫A'));

      renderView();
      const input = await screen.findByLabelText(ja.sites.create.nameLabel);
      fireEvent.change(input, { target: { value: '倉庫A' } });
      fireEvent.click(screen.getByRole('button', { name: ja.sites.create.submit }));

      await waitFor(() => expect(input).toHaveValue(''));
    });

    it('名前が空の場合はAPIを呼ばずにエラーを表示する', async () => {
      renderView();
      await screen.findByText(ja.sites.list.empty);

      fireEvent.click(screen.getByRole('button', { name: ja.sites.create.submit }));

      expect(await screen.findByText(ja.sites.errors.nameRequired)).toBeInTheDocument();
      expect(mockedCreateSite).not.toHaveBeenCalled();
    });

    it('空白のみの名前もAPIを呼ばずに拒否する', async () => {
      renderView();
      const input = await screen.findByLabelText(ja.sites.create.nameLabel);
      fireEvent.change(input, { target: { value: '   ' } });

      fireEvent.click(screen.getByRole('button', { name: ja.sites.create.submit }));

      expect(await screen.findByText(ja.sites.errors.nameRequired)).toBeInTheDocument();
      expect(mockedCreateSite).not.toHaveBeenCalled();
    });

    // 契約(openapi.yaml maxLength: 100)を超える入力は、往復する前に手元で気付ける。
    it('101文字以上の名前はAPIを呼ばずにエラーを表示する', async () => {
      renderView();
      const input = await screen.findByLabelText(ja.sites.create.nameLabel);
      fireEvent.change(input, { target: { value: 'あ'.repeat(101) } });

      fireEvent.click(screen.getByRole('button', { name: ja.sites.create.submit }));

      expect(await screen.findByText(ja.sites.errors.nameTooLong)).toBeInTheDocument();
      expect(mockedCreateSite).not.toHaveBeenCalled();
    });

    it('サーバー側が400を返した場合は入力内容の確認を促す', async () => {
      mockedCreateSite.mockRejectedValue(new ApiError(400, 'validation_error', 'invalid'));

      renderView();
      const input = await screen.findByLabelText(ja.sites.create.nameLabel);
      fireEvent.change(input, { target: { value: '倉庫A' } });
      fireEvent.click(screen.getByRole('button', { name: ja.sites.create.submit }));

      expect(await screen.findByText(ja.sites.errors.validation)).toBeInTheDocument();
    });

    it('セッション切れ(401)はログインを促す', async () => {
      mockedCreateSite.mockRejectedValue(new ApiError(401, 'unauthorized', 'no session'));

      renderView();
      const input = await screen.findByLabelText(ja.sites.create.nameLabel);
      fireEvent.change(input, { target: { value: '倉庫A' } });
      fireEvent.click(screen.getByRole('button', { name: ja.sites.create.submit }));

      expect(await screen.findByText(ja.sites.errors.unauthorized)).toBeInTheDocument();
    });
  });

  describe('削除', () => {
    beforeEach(() => {
      mockedFetchSites.mockResolvedValue([site(1, '倉庫A')]);
    });

    async function openDeleteConfirmation() {
      renderView();
      await screen.findByText('倉庫A');
      fireEvent.click(
        screen.getByRole('button', { name: ja.sites.delete.buttonLabel.replace('{name}', '倉庫A') })
      );
      return screen.getByRole('alertdialog');
    }

    it('削除ボタンを押しただけでは削除せず、アプリ内の確認モーダルを表示する', async () => {
      const dialog = await openDeleteConfirmation();

      expect(dialog).toHaveTextContent(ja.sites.delete.confirmTitle.replace('{name}', '倉庫A'));
      expect(mockedDeleteSite).not.toHaveBeenCalled();
      expect(confirmSpy).not.toHaveBeenCalled();
    });

    it('確認モーダルでやめるを選ぶと削除しない', async () => {
      const dialog = await openDeleteConfirmation();

      fireEvent.click(within(dialog).getByRole('button', { name: ja.sites.delete.cancelButton }));

      await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
      expect(mockedDeleteSite).not.toHaveBeenCalled();
      expect(screen.getByText('倉庫A')).toBeInTheDocument();
    });

    it('確認モーダルで削除するを選ぶと削除し、一覧から消えて完了を伝える', async () => {
      mockedDeleteSite.mockResolvedValue(undefined);
      const dialog = await openDeleteConfirmation();

      fireEvent.click(within(dialog).getByRole('button', { name: ja.sites.delete.confirmButton }));

      await waitFor(() => expect(mockedDeleteSite).toHaveBeenCalledWith(1));
      await waitFor(() => expect(screen.queryByText('倉庫A')).not.toBeInTheDocument());
      expect(screen.getByText(ja.sites.delete.success.replace('{name}', '倉庫A'))).toBeInTheDocument();
    });

    it('他ユーザーの拠点(403)は権限エラーを表示し、一覧から消さない', async () => {
      mockedDeleteSite.mockRejectedValue(new ApiError(403, 'forbidden', 'forbidden'));
      const dialog = await openDeleteConfirmation();

      fireEvent.click(within(dialog).getByRole('button', { name: ja.sites.delete.confirmButton }));

      expect(await screen.findByText(ja.sites.errors.forbidden)).toBeInTheDocument();
      expect(screen.getByText('倉庫A')).toBeInTheDocument();
    });

    it('既に削除済み(404)の場合はその旨を伝える', async () => {
      mockedDeleteSite.mockRejectedValue(new ApiError(404, 'not_found', 'not found'));
      const dialog = await openDeleteConfirmation();

      fireEvent.click(within(dialog).getByRole('button', { name: ja.sites.delete.confirmButton }));

      expect(await screen.findByText(ja.sites.errors.notFound)).toBeInTheDocument();
    });
  });
});
