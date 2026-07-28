'use client';

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBell } from '@fortawesome/free-solid-svg-icons';
import { useTranslations } from 'next-intl';
import styles from './AlertBadge.module.css';

type AlertBadgeProps = {
  /** Count of currently 'open' (unacknowledged) alerts. */
  openCount: number;
};

/**
 * In-app notification badge (requirements.md F8.3: notifications are in-app
 * only, no email). Icon is Font Awesome per /CLAUDE.md ("アイコンはFont
 * Awesomeのみを使用する。絵文字は一切使用しない").
 */
export default function AlertBadge({ openCount }: AlertBadgeProps) {
  const t = useTranslations('alerts');
  const hasOpenAlerts = openCount > 0;

  return (
    <span
      className={styles.badgeWrapper}
      role="status"
      aria-label={hasOpenAlerts ? t('badgeAriaLabel', { count: openCount }) : undefined}
    >
      <FontAwesomeIcon icon={faBell} className={styles.bellIcon} aria-hidden="true" />
      {hasOpenAlerts && <span className={styles.countBubble}>{openCount}</span>}
    </span>
  );
}
