import { existsSync } from 'node:fs';
import { expect, it, vi, beforeEach } from 'vitest';
import { isValidElement, type ReactNode, type ReactElement } from 'react';
const mocks = vi.hoisted(() => ({ profile: vi.fn(), checkout: vi.fn(), portal: vi.fn() }));
vi.mock('@/lib/auth', () => ({ getProfile: mocks.profile }));
vi.mock('@/lib/actions/billing', () => ({ startCheckout: mocks.checkout, openBillingPortal: mocks.portal }));
vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error(`redirect:${url}`); } }));
beforeEach(() => vi.clearAllMocks());
function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...elements(node.props.children as ReactNode)];
}
it('provides the missing pricing route', () => {
  expect(existsSync('src/app/pricing/page.tsx')).toBe(true);
});
it('keeps each plan through sign-in and shows billing forms only when signed in', async () => {
  const { default: Page } = await import('./page');
  mocks.profile.mockResolvedValue(null);
  const anonymous = elements(await Page({ searchParams: Promise.resolve({ plan: 'pro' }) }));
  expect(anonymous.filter(e => e.type === 'a').map(e => e.props.href)).toContain('/login?next=%2Fpricing%3Fplan%3Dpro');
  expect(anonymous.filter(e => e.type === 'form')).toHaveLength(0);
  mocks.profile.mockResolvedValue({ plan: 'free' });
  const signedIn = elements(await Page({ searchParams: Promise.resolve({ plan: 'pro' }) }));
  expect(signedIn.filter(e => e.type === 'form')).toHaveLength(2);
  expect(mocks.checkout).not.toHaveBeenCalled();
});
it('rechecks auth on submit and resumes the selected plan after an expired session', async () => {
  const { checkoutPlan } = await import('./actions');
  mocks.profile.mockResolvedValue(null);
  await expect(checkoutPlan('starter')).rejects.toThrow('redirect:/login?next=%2Fpricing%3Fplan%3Dstarter');
  expect(mocks.checkout).not.toHaveBeenCalled();
  mocks.profile.mockResolvedValue({ plan: 'free' });
  await checkoutPlan('pro');
  expect(mocks.checkout).toHaveBeenCalledWith('pro');
});
