'use client';

import { useTranslations } from 'next-intl';

export default function HomeView() {
  const t = useTranslations('home');
  const tNav = useTranslations('nav');

  return (
    <main>
      <h1>{t('title')}</h1>
      <p>{t('description')}</p>
      <nav aria-label={tNav('ariaLabel')}>
        <ul>
          <li>{tNav('home')}</li>
          <li>{tNav('dashboard')}</li>
          <li>{tNav('alerts')}</li>
        </ul>
      </nav>
    </main>
  );
}
