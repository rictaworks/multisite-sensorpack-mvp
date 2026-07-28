import { createNavigation } from 'next-intl/navigation';
import { routing } from './routing';

/**
 * Locale-aware Link/router, so dashboard screens can navigate between the
 * site overview and device detail routes without hand-rolling the `/{locale}`
 * prefix (see next-intl's routing integration, already the project's chosen
 * i18n library per .claude/rules/architecture.md: don't reinvent the wheel).
 */
export const { Link, redirect, usePathname, useRouter } = createNavigation(routing);
