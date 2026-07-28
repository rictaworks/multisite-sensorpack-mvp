'use client';

import { useEffect, useRef } from 'react';
import styles from './control.module.css';

type ConfirmDialogProps = {
  titleId: string;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * Custom in-app confirmation UI used in place of the native `confirm()`.
 * `.claude/CLAUDE.md` and Issue #21 both prohibit `alert()`/`confirm()`/`prompt()`;
 * every "are you sure?" interaction in this screen must go through this
 * component (or an equivalent app-level modal) instead.
 */
export default function ConfirmDialog({
  titleId,
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
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
      data-testid="control-confirm-overlay"
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
            className={styles.confirmConfirmButton}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
