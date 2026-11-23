import React, { useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { historyEntries, historyTime, settingsSections } from '../../../utils/settingsPages';
import { DOT, Page, PageHead, Section, btnSmall } from '../kit';
import { useSharedSettingsForm } from '../../settings/SettingsFormProvider';
import { useSecurityEvents } from '../../settings/useSecurityEvents';
import { TelegramSettingsCard } from '../../settings/TelegramSettingsCard';
import { StatusCard } from '../../settings/StatusCard';
import { SecuritySettingsCard } from '../../settings/SecuritySettingsCard';
import { AppLockSettings } from '../../settings/AppLockSettings';
import {
  AccountRow,
  DemoResetFields,
  EmailTimingFields,
  LeadDayFields,
  LookFields,
  MoneyFields,
  RateStaleBadge,
  SaveBar,
  SavedBadge,
  TestSend,
  VaultField,
  WorkspaceFields,
} from '../../settings/SettingsKit';

const FORM_ID = 'settings-form-timeline';
const ID = 'tl';
const HISTORY_ROWS = 15;

/**
 * Timeline layout: Settings. A menu of sections on the left (a row of chips on phones) that scrolls to
 * each card; the cards in order; security events and workspace changes together in one History list.
 */
export const SettingsPage: React.FC = () => {
  const f = useSharedSettingsForm();
  const sections = settingsSections(f.isDemoMode);
  const idsKey = sections.map((s) => s.id).join(' ');
  const [active, setActive] = useState(sections[0].id);

  // Light up the menu entry of the card in view.
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const obs = new IntersectionObserver(
      (entries) => {
        const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (top) setActive(top.target.id);
      },
      { rootMargin: '0px 0px -65% 0px' }
    );
    for (const id of idsKey.split(' ')) {
      const el = document.getElementById(id);
      if (el) obs.observe(el);
    }
    return () => obs.disconnect();
  }, [idsKey]);

  // Scroll to the card and move focus there, so the keyboard carries on from it.
  const go = (id: string) => {
    setActive(id);
    const el = document.getElementById(id);
    if (!el) return;
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' });
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
    el.focus({ preventScroll: true });
  };

  // History: the security log (when the app lock is on, as on Classic) and the workspace audit log.
  const security = useSecurityEvents(f.lockEnabled);
  const [showAll, setShowAll] = useState(false);
  const history = useMemo(
    () => historyEntries(f.lockEnabled ? (security.rows ?? []) : [], f.auditLogs, 100),
    [f.lockEnabled, security.rows, f.auditLogs]
  );
  const now = new Date();
  const hasAccount = !f.isDemoMode && !!f.user;

  return (
    <Page>
      <PageHead
        eyebrow="Settings"
        title="Settings"
        sub="Name, money, reminders, Telegram, look and security. The look applies at once; the rest saves with the button."
        stats={f.savedSuccess ? <SavedBadge f={f} /> : undefined}
      />

      <div className="space-y-4 md:space-y-0 md:grid md:grid-cols-[12rem_minmax(0,1fr)] md:gap-8 md:items-start">
        <nav aria-label="Settings sections" className="min-w-0 md:sticky md:top-2">
          <ul className="flex md:flex-col gap-2 md:gap-1 overflow-x-auto md:overflow-visible pb-1 md:pb-0">
            {sections.map((s) => {
              const on = active === s.id;
              return (
                <li key={s.id} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => go(s.id)}
                    aria-current={on ? 'true' : undefined}
                    className={`md:w-full text-left whitespace-nowrap min-h-[36px] px-3.5 rounded-full md:rounded-xl border text-sm transition-colors ${
                      on
                        ? 'bg-slate-900 border-slate-700 text-slate-100 font-semibold'
                        : 'border-slate-800 md:border-transparent text-slate-300 hover:text-slate-100 hover:bg-slate-900/60'
                    }`}
                  >
                    {s.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="min-w-0 space-y-4">
          <form id={FORM_ID} onSubmit={f.handleSave} className="space-y-4">
            <Section id="settings-workspace" title="Workspace" padded className="scroll-mt-4">
              <div className="space-y-4">
                <WorkspaceFields f={f} idPrefix={ID} />
                <VaultField f={f} idPrefix={ID} />
              </div>
            </Section>

            <Section id="settings-money" title="Money & rate" right={<RateStaleBadge f={f} />} padded className="scroll-mt-4">
              <MoneyFields f={f} idPrefix={ID} />
            </Section>

            <Section id="settings-reminders" title="Reminders" padded className="scroll-mt-4">
              <LeadDayFields f={f} idPrefix={ID} />
            </Section>

            <TelegramSettingsCard telegramEnabled={f.telegramEnabled} setTelegramEnabled={f.setTelegramEnabled} />

            <Section id="settings-email" title="Email & timing" padded className="scroll-mt-4">
              <div className="space-y-5">
                <EmailTimingFields f={f} idPrefix={ID} />
                <div className="pt-4 border-t border-slate-800">
                  <TestSend f={f} />
                </div>
              </div>
            </Section>

            <Section id="settings-look" title="Look" padded className="scroll-mt-4">
              <LookFields f={f} />
            </Section>
          </form>

          {/* Outside the settings form: these cards have their own forms. */}
          <div id="settings-security" className="scroll-mt-4 space-y-4">
            {hasAccount && (
              <Section title="Account & security" padded>
                <AccountRow f={f} />
              </Section>
            )}
            <SecuritySettingsCard confirmSensitive={f.confirmSensitive} onSecurityEvent={f.onSecurityEvent}>
              {f.lockEnabled && <AppLockSettings />}
            </SecuritySettingsCard>
          </div>

          {!f.isDemoMode && (
            <div id="settings-status" className="scroll-mt-4">
              <StatusCard />
            </div>
          )}

          <Section
            id="settings-history"
            title="History"
            className="scroll-mt-4"
            right={
              <>
                <span className="text-sm text-slate-400">{f.auditLogs.length} recent events</span>
                {f.lockEnabled && (
                  <button
                    type="button"
                    onClick={security.load}
                    className="p-2 rounded-full text-slate-400 hover:text-slate-200"
                    aria-label="Refresh security activity"
                    title="Refresh"
                  >
                    <RefreshCw className="w-4 h-4" aria-hidden="true" />
                  </button>
                )}
              </>
            }
          >
            <p className="px-5 pt-4 text-sm text-slate-400">Security events and changes, newest first.</p>
            {history.length === 0 ? (
              <p className="px-5 py-4 text-sm text-slate-400">{f.lockEnabled && security.rows === null ? 'Loading…' : 'No history yet.'}</p>
            ) : (
              <ol className="px-5 py-3">
                {history.slice(0, showAll ? history.length : HISTORY_ROWS).map((e) => (
                  <li key={e.id} className="grid grid-cols-[5.75rem_0.625rem_minmax(0,1fr)] sm:grid-cols-[7rem_0.625rem_minmax(0,1fr)] gap-x-3 items-start py-1.5">
                    <time dateTime={e.at} className="text-xs text-slate-400 text-right pt-0.5">
                      {historyTime(e.at, now)}
                    </time>
                    <span className={`mt-1.5 w-2.5 h-2.5 rounded-full ${DOT[e.tone]}`} aria-hidden="true" />
                    <span className="text-sm min-w-0 break-words">
                      {e.icon && <span aria-hidden="true">{e.icon} </span>}
                      <span className={`font-semibold ${e.tone === 'warn' ? 'text-amber-700 dark:text-amber-400' : 'text-slate-200'} ${e.icon ? '' : 'capitalize'}`}>
                        {e.label}
                      </span>
                      {e.details && <span className="text-slate-300">{e.icon ? ' · ' : ' '}{e.details}</span>}
                      {e.viaTelegram && <span className="text-slate-400"> (via Telegram)</span>}
                    </span>
                  </li>
                ))}
              </ol>
            )}
            {history.length > HISTORY_ROWS && (
              <div className="px-5 pb-4">
                <button type="button" onClick={() => setShowAll((v) => !v)} aria-expanded={showAll} className={btnSmall}>
                  {showAll ? 'Show fewer' : `Show all ${history.length}`}
                </button>
              </div>
            )}
          </Section>

          {f.isDemoMode && (
            <Section id="settings-demo" title="Restore the demo data" padded className="scroll-mt-4">
              <DemoResetFields f={f} />
            </Section>
          )}

          <SaveBar f={f} formId={FORM_ID} />
        </div>
      </div>
    </Page>
  );
};
