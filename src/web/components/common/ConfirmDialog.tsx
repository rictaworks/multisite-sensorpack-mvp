'use client';

import { useEffect, useRef } from 'react';
import styles from './ConfirmDialog.module.css';

type ConfirmDialogProps = {
  titleId: string;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** 取り消せない操作(拠点の削除など)では確認ボタンを警告色にする。 */
  destructive?: boolean;
  /** テストから特定するための識別子。画面ごとに指定する。 */
  testId?: string;
};

/**
 * Custom in-app confirmation UI used in place of the native `confirm()`.
 * CLAUDE.md and Issue #21 both prohibit `alert()`/`confirm()`/`prompt()`;
 * every "are you sure?" interaction must go through this component.
 *
 * Originally written for the manual-control screen (Issue #21); moved to
 * components/common/ when the site-management screen needed the same
 * confirmation for deletion (Issue #61) rather than growing a second modal.
 */
export default function ConfirmDialog({
  titleId,
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  destructive = false,
  testId = 'confirm-overlay',
}: ConfirmDialogProps) {
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    confirmButtonRef.current?.focus();
  }, []);

  return (
    <div
      className={styles.confirmOverlay}
      role="presentation"
      onClick={onCancel}
      data-testid={testId}
    >
      <div
        className={styles.confirmDialog}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <p id={titleId} className={styles.confirmTitle}>
          {title}
        </p>
        <p className={styles.confirmDescription}>{description}</p>
        <div className={styles.confirmActions}>
          <button type="button" className={styles.confirmCancelButton} onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            ref={confirmButtonRef}
            className={destructive ? styles.confirmDestructiveButton : styles.confirmConfirmButton}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
