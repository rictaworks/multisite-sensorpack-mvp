import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import HomeView from '../components/HomeView';
import ja from '../locales/ja.json';
import en from '../locales/en.json';

describe('HomeView', () => {
  it('renders the translated title, description and nav in Japanese', () => {
    render(
      <NextIntlClientProvider locale="ja" messages={ja}>
        <HomeView />
      </NextIntlClientProvider>
    );

    expect(screen.getByRole('heading', { name: ja.home.title })).toBeInTheDocument();
    expect(screen.getByText(ja.home.description)).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: ja.nav.ariaLabel })).toBeInTheDocument();
    expect(screen.getByText(ja.nav.dashboard)).toBeInTheDocument();
  });

  it('switches every visible string when rendered with the English locale (i18n switch mechanism)', () => {
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <HomeView />
      </NextIntlClientProvider>
    );

    expect(screen.getByRole('heading', { name: en.home.title })).toBeInTheDocument();
    expect(screen.queryByText(ja.home.title)).not.toBeInTheDocument();
  });
});
