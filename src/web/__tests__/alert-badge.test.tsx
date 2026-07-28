import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import AlertBadge from '../components/alerts/AlertBadge';
import ja from '../locales/ja.json';

function renderBadge(openCount: number) {
  return render(
    <NextIntlClientProvider locale="ja" messages={ja}>
      <AlertBadge openCount={openCount} />
    </NextIntlClientProvider>
  );
}

describe('AlertBadge (in-app notification badge, requirements.md F8.3)', () => {
  it('shows no count and no announcement when there are no open alerts', () => {
    renderBadge(0);

    const badge = screen.getByRole('status');
    expect(badge).not.toHaveAccessibleName();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('shows the open-alert count and an accessible label when there are open alerts', () => {
    renderBadge(3);

    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveAccessibleName(
      ja.alerts.badgeAriaLabel.replace('{count}', '3')
    );
  });
});
