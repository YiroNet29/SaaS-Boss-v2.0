import React, { useMemo } from 'react';
import { useWorkspace } from '../../../context/WorkspaceContext';
import { paidByAppInMonth } from '../../../utils/budgets';
import { formatCurrency } from '../../../utils/formatters';
import { FALLBACK_ETB_PER_USD } from '../../../utils/fx';
import { appBudgetRows } from '../../../utils/settingsPages';
import { Bar, Page, PageHead, Section, linkCls } from '../kit';
import { useSettingsForm } from '../../settings/useSettingsForm';
import { TelegramSettingsCard } from '../../settings/TelegramSettingsCard';
import { StatusCard } from '../../settings/StatusCard';
import { SecuritySettingsCard } from '../../settings/SecuritySettingsCard';
import { AppLockSettings } from '../../settings/AppLockSettings';
import { SecurityActivity } from '../../settings/SecurityActivity';
import {
  AccountRow,
  AuditLogList,
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

const FORM_ID = 'settings-form-portfolio';
const ID = 'pf';
const usd = (n: number) => formatCurrency(Math.round(n * 100) / 100, 'USD');

/**
 * Portfolio layout: Settings. Tiles in a grid, then each app's monthly budget against this month, then
 * the workspace audit log and Save. `onSelectProduct` (optional) turns on each app's "Edit app" link.
 */
export const SettingsPage: React.FC<{ onSelectProduct?: (productId: string) => void }> = ({ onSelectProduct }) => {
  const f = useSettingsForm();
  const { products, services, payments } = useWorkspace();
  const rate = f.currentWorkspace.exchangeRates?.ETB_per_USD || FALLBACK_ETB_PER_USD;
  const month = new Date().toLocaleDateString('en-CA').slice(0, 7);
  const budgets = useMemo(
    () => appBudgetRows(products, paidByAppInMonth(payments, services, month, rate)),
    [products, payments, services, month, rate]
  );
  const hasAccount = !f.isDemoMode && !!f.user;
  const cols = onSelectProduct ? 'sm:grid-cols-[minmax(0,1fr)_8rem_minmax(0,16rem)_6rem]' : 'sm:grid-cols-[minmax(0,1fr)_8rem_minmax(0,16rem)]';

  return (
    <Page>
      <PageHead
        eyebrow="Settings"
        title="Settings"
        sub="Grouped in tiles. The look applies at once; the rest saves with the button."
        stats={f.savedSuccess ? <SavedBadge f={f} /> : undefined}
      />

      <form id={FORM_ID} onSubmit={f.handleSave} className="grid gap-4 lg:grid-cols-2 items-start">
        <Section id="settings-workspace" title="Workspace & money" right={<RateStaleBadge f={f} />} padded>
          <div className="space-y-5">
            <WorkspaceFields f={f} idPrefix={ID} />
            <MoneyFields f={f} idPrefix={ID} />
            <VaultField f={f} idPrefix={ID} />
          </div>
        </Section>

        <Section id="settings-reminders" title="Reminders & email" padded>
          <div className="space-y-5">
            <LeadDayFields f={f} idPrefix={ID} />
            <div className="pt-4 border-t border-slate-800">
              <EmailTimingFields f={f} idPrefix={ID} />
            </div>
            <TestSend f={f} />
          </div>
        </Section>

        <TelegramSettingsCard telegramEnabled={f.telegramEnabled} setTelegramEnabled={f.setTelegramEnabled} />

        <Section id="settings-look" title="Look" padded>
          <LookFields f={f} />
        </Section>
      </form>

      {/* Outside the settings form: these tiles have their own forms. */}
      <div className="grid gap-4 lg:grid-cols-2 items-start">
        <div id="settings-security" className="space-y-4 min-w-0">
          {hasAccount && (
            <Section title="Account & security" padded>
              <AccountRow f={f} />
            </Section>
          )}
          <SecuritySettingsCard confirmSensitive={f.confirmSensitive} onSecurityEvent={f.onSecurityEvent}>
            {f.lockEnabled && <AppLockSettings />}
            {f.lockEnabled && <SecurityActivity />}
          </SecuritySettingsCard>
        </div>
        {!f.isDemoMode && (
          <div className="min-w-0">
            <StatusCard />
          </div>
        )}
      </div>

      <Section id="settings-apps" title="Per app" right={<span className="text-sm text-slate-400">Each app's own monthly budget, set on its page</span>}>
        {budgets.length === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-400">No apps yet.</p>
        ) : (
          <ul>
            <li className={`hidden sm:grid ${cols} gap-x-4 px-5 py-2.5 bg-slate-800/40 border-b border-slate-800 text-xs text-slate-400`} aria-hidden="true">
              <span>App</span>
              <span>Monthly budget</span>
              <span>This month</span>
            </li>
            {budgets.map(({ product, spent, use, line }) => (
              <li key={product.id} className={`grid grid-cols-[minmax(0,1fr)_auto] ${cols} gap-x-4 gap-y-2 items-center px-5 py-3 border-b border-slate-800 last:border-b-0`}>
                <span className="text-sm font-semibold text-slate-100 truncate">{product.name}</span>
                <span className="text-sm text-slate-200 tabular-nums text-right sm:text-left">
                  <span className="sm:hidden text-slate-400">Budget </span>
                  {use ? usd(use.budget) : 'Not set'}
                </span>
                <span className="col-span-2 sm:col-span-1 min-w-0">
                  {use ? (
                    <Bar
                      pct={line.width}
                      tone={line.tone === 'none' ? 'accent' : line.tone}
                      caption={line.text}
                      label={`${product.name}: ${use.percent}% of its monthly budget paid`}
                    />
                  ) : (
                    <span className="text-sm text-slate-400">{spent > 0 ? `${usd(spent)} paid this month` : 'Nothing paid this month'}</span>
                  )}
                </span>
                {onSelectProduct && (
                  <span className="col-span-2 sm:col-span-1 sm:text-right">
                    <button type="button" onClick={() => onSelectProduct(product.id)} className={linkCls}>
                      Edit app<span className="sr-only"> {product.name}</span>
                    </button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section id="settings-audit" title="Workspace Audit Log" right={<span className="text-sm text-slate-400">{f.auditLogs.length} recent events</span>}>
        <AuditLogList logs={f.auditLogs} />
      </Section>

      {f.isDemoMode && (
        <Section id="settings-demo" title="Restore the demo data" padded>
          <DemoResetFields f={f} />
        </Section>
      )}

      <SaveBar f={f} formId={FORM_ID} />
    </Page>
  );
};
