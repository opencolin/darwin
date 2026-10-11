/**
 * Page wrapper: the ledger masthead (wordmark, desk/phone links, session) above the page body.
 */

import React from 'react';
import { Link, useLocation } from 'react-router';
import { useSession } from 'modelence/client';
import LoadingSpinner from '@/client/components/LoadingSpinner';
import { Seo, type SeoProps } from '@/client/components/Seo';
import { Wordmark } from '@/client/components/darwin/Bits';
import { cn } from '@/client/lib/utils';

interface PageProps {
  children?: React.ReactNode;
  isLoading?: boolean;
  className?: string;
  /** Per-page <head> overrides (title, description, OG image, etc). */
  seo?: SeoProps;
}

function NavLink({ to, children }: { to: string; children: React.ReactNode }) {
  const { pathname } = useLocation();
  const active = pathname === to;
  return (
    <Link to={to} className={cn('tag -mb-px border-b-2 py-1 transition-colors hover:text-ink', active ? 'border-tide text-ink' : 'border-transparent')}>
      {children}
    </Link>
  );
}

function Header() {
  const { user } = useSession();

  return (
    <header className="border-b border-line-strong bg-paper">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 md:px-8">
        <div className="flex items-center gap-6">
          <Link to="/" aria-label="Darwin home">
            <Wordmark className="text-[22px]" />
          </Link>
          <nav className="hidden items-center gap-4 sm:flex">
            <NavLink to="/">desk</NavLink>
            <NavLink to="/m">phone</NavLink>
          </nav>
        </div>
        {user ? (
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs text-ink-2">{user.handle}</span>
            <Link to="/logout" className="tag rounded-xs border border-line-strong px-2 py-1.5 transition-colors hover:bg-surface-2">
              log out
            </Link>
          </div>
        ) : (
          <Link to="/login" className="tag rounded-xs border border-line-strong px-2 py-1.5 transition-colors hover:bg-surface-2">
            sign in
          </Link>
        )}
      </div>
    </header>
  );
}

function PageWrapper({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-dvh max-w-full flex-col overflow-x-hidden bg-paper text-ink">{children}</div>;
}

function PageBody({ children, className, isLoading = false }: PageProps) {
  return (
    <div className="flex w-full min-h-0 flex-1">
      <main className={cn('mx-auto flex w-full max-w-6xl flex-1 flex-col space-y-6 overflow-x-hidden px-4 py-6 md:px-8', className)}>
        {isLoading ? (
          <div className="flex h-full w-full items-center justify-center">
            <LoadingSpinner />
          </div>
        ) : (
          children
        )}
      </main>
    </div>
  );
}

export default function Page({ children, className, isLoading = false, seo }: PageProps) {
  return (
    <PageWrapper>
      <Seo {...seo} />
      <Header />
      <PageBody className={className} isLoading={isLoading}>{children}</PageBody>
    </PageWrapper>
  );
}
