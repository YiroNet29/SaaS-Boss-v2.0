import React, { lazy, Suspense, useState, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { TopNav } from './TopNav';
import { BottomNav } from './BottomNav';
import { Header } from './Header';
import { OfflineIndicator } from './OfflineIndicator';
import { JobStoppedBanner } from './JobStoppedBanner';
import { DemoModeBanner } from '../common/DemoModeBanner';
import { CommandPaletteModal } from '../common/CommandPaletteModal';
import { QuickAddFAB } from '../common/QuickAddFAB';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useTheme } from '../../context/ThemeContext';
import { hasTopBar } from '../../utils/layouts';

// Views
import { DashboardView } from '../dashboard/DashboardView';
import { TimelineDashboard } from '../dashboard/TimelineDashboard';
import { PortfolioDashboard } from '../dashboard/PortfolioDashboard';

// Modals
import { QuickAddServiceModal } from '../services/QuickAddServiceModal';

import { Product, ServiceLink, ImportantDate } from '../../types';

// Pages and dialogs other than the Dashboard load separately, so the first screen appears sooner on a
// slow phone connection. Once it's up, the rest downloads in the background (preloadTheRest), so every
// page and dialog still opens later without a connection.
const LOADERS = {
  ProductListView: () => import('../products/ProductListView'),
  ProductDetailView: () => import('../products/ProductDetailView'),
  ServiceListView: () => import('../services/ServiceListView'),
  DatesListView: () => import('../dates/DatesListView'),
  SettingsView: () => import('../settings/SettingsView'),
  MoneyView: () => import('../money/MoneyView'),
  ReceiptsView: () => import('../receipts/ReceiptsView'),
  ProductModal: () => import('../products/ProductModal'),
  CloneProductModal: () => import('../products/CloneProductModal'),
  ServiceModal: () => import('../services/ServiceModal'),
  DuplicateToProductsModal: () => import('../services/DuplicateToProductsModal'),
  BulkEditModal: () => import('../services/BulkEditModal'),
  DateModal: () => import('../dates/DateModal'),
  SnoozeModal: () => import('../dates/SnoozeModal'),
  TemplatePickerModal: () => import('../templates/TemplatePickerModal'),
  ImportExportModal: () => import('../impexp/ImportExportModal'),
  OnboardingModal: () => import('../onboarding/OnboardingModal'),
  NewWorkspaceModal: () => import('./NewWorkspaceModal'),
};
const ProductListView = lazy(() => LOADERS.ProductListView().then((m) => ({ default: m.ProductListView })));
const ProductDetailView = lazy(() => LOADERS.ProductDetailView().then((m) => ({ default: m.ProductDetailView })));
const ServiceListView = lazy(() => LOADERS.ServiceListView().then((m) => ({ default: m.ServiceListView })));
const DatesListView = lazy(() => LOADERS.DatesListView().then((m) => ({ default: m.DatesListView })));
const SettingsView = lazy(() => LOADERS.SettingsView().then((m) => ({ default: m.SettingsView })));
const MoneyView = lazy(() => LOADERS.MoneyView().then((m) => ({ default: m.MoneyView })));
const ReceiptsView = lazy(() => LOADERS.ReceiptsView().then((m) => ({ default: m.ReceiptsView })));
const ProductModal = lazy(() => LOADERS.ProductModal().then((m) => ({ default: m.ProductModal })));
const CloneProductModal = lazy(() => LOADERS.CloneProductModal().then((m) => ({ default: m.CloneProductModal })));
const ServiceModal = lazy(() => LOADERS.ServiceModal().then((m) => ({ default: m.ServiceModal })));
const DuplicateToProductsModal = lazy(() => LOADERS.DuplicateToProductsModal().then((m) => ({ default: m.DuplicateToProductsModal })));
const BulkEditModal = lazy(() => LOADERS.BulkEditModal().then((m) => ({ default: m.BulkEditModal })));
const DateModal = lazy(() => LOADERS.DateModal().then((m) => ({ default: m.DateModal })));
const SnoozeModal = lazy(() => LOADERS.SnoozeModal().then((m) => ({ default: m.SnoozeModal })));
const TemplatePickerModal = lazy(() => LOADERS.TemplatePickerModal().then((m) => ({ default: m.TemplatePickerModal })));
const ImportExportModal = lazy(() => LOADERS.ImportExportModal().then((m) => ({ default: m.ImportExportModal })));
const OnboardingModal = lazy(() => LOADERS.OnboardingModal().then((m) => ({ default: m.OnboardingModal })));
const NewWorkspaceModal = lazy(() => LOADERS.NewWorkspaceModal().then((m) => ({ default: m.NewWorkspaceModal })));

let preloaded = false;
function preloadTheRest() {
  if (preloaded) return;
  preloaded = true;
  for (const load of Object.values(LOADERS)) load().catch(() => { preloaded = false; });
}

/** If a part of the app couldn't be downloaded (offline before it was fetched), say so instead of crashing. */
class LoadBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="m-4 p-4 rounded-2xl bg-slate-900 border border-amber-500/40 text-sm text-slate-200">
        This part of StackTrack hasn't downloaded yet, and there's no connection.{' '}
        <button type="button" className="underline font-semibold" onClick={() => window.location.reload()}>
          Reload
        </button>{' '}
        once you're back online.
      </div>
    );
  }
}

const TAB_KEY = 'stacktrack_current_tab';
const TABS = ['dashboard', 'products', 'services', 'dates', 'money', 'receipts', 'settings'];

/** Shown for the moment a page's code is still downloading. */
const PageLoading = () => (
  <div role="status" className="py-16 text-center text-sm text-slate-400">
    Loading…
  </div>
);

export const AppLayout: React.FC = () => {
  const {
    addProduct,
    updateProduct,
    cloneProduct,
    createProductFromTemplate,
    addServiceLink,
    updateServiceLink,
    duplicateServiceToProducts,
    bulkUpdateServices,
    addImportantDate,
    updateImportantDate,
    snoozeImportantDate,
    services,
  } = useWorkspace();
  // Classic: the sidebar. Timeline and Portfolio: a bar across the top (wider screens), each with its own Dashboard.
  const { layout } = useTheme();
  const topBar = hasTopBar(layout);

  // Navigation State
  // The page you're on survives the app lock (which removes the app from the screen while locked).
  // Only the page name is kept, for this browser tab.
  const [currentTab, setCurrentTab] = useState<string>(() => {
    try {
      const saved = sessionStorage.getItem(TAB_KEY);
      return saved && TABS.includes(saved) ? saved : 'dashboard';
    } catch {
      return 'dashboard';
    }
  });
  useEffect(() => {
    try {
      sessionStorage.setItem(TAB_KEY, currentTab);
    } catch {
      /* storage unavailable: nothing to remember */
    }
  }, [currentTab]);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Modals State
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);

  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [productToEdit, setProductToEdit] = useState<Product | null>(null);

  const [isCloneModalOpen, setIsCloneModalOpen] = useState(false);
  const [productToClone, setProductToClone] = useState<Product | null>(null);

  const [isServiceModalOpen, setIsServiceModalOpen] = useState(false);
  const [serviceToEdit, setServiceToEdit] = useState<ServiceLink | null>(null);
  const [serviceDefaultProductId, setServiceDefaultProductId] = useState<string | undefined>(undefined);
  const [serviceDraft, setServiceDraft] = useState<Partial<ServiceLink> | null>(null);
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [quickAddProductId, setQuickAddProductId] = useState<string | undefined>(undefined);
  // Telegram is set up in Settings (in demo mode the card there explains it).
  /** Settings, scrolled to the Telegram section. */
  const openTelegram = () => {
    setCurrentTab('settings');
    setSelectedProductId(null);
    let tries = 0;
    const scroll = () => {
      const el = document.getElementById('telegram-settings');
      if (el) el.scrollIntoView({ block: 'start' });
      else if (++tries < 20) setTimeout(scroll, 50);
    };
    setTimeout(scroll, 0);
  };
  const openQuickAddService = (productId?: string) => {
    setQuickAddProductId(productId);
    setIsQuickAddOpen(true);
  };

  const [isDuplicateModalOpen, setIsDuplicateModalOpen] = useState(false);
  const [serviceToDuplicate, setServiceToDuplicate] = useState<ServiceLink | null>(null);

  const [isBulkEditModalOpen, setIsBulkEditModalOpen] = useState(false);
  const [bulkEditServiceIds, setBulkEditServiceIds] = useState<string[]>([]);

  const [isDateModalOpen, setIsDateModalOpen] = useState(false);
  const [dateToEdit, setDateToEdit] = useState<ImportantDate | null>(null);
  const [dateDefaultProductId, setDateDefaultProductId] = useState<string | undefined>(undefined);

  const [isSnoozeModalOpen, setIsSnoozeModalOpen] = useState(false);
  const [dateToSnooze, setDateToSnooze] = useState<ImportantDate | null>(null);

  const [isTemplatePickerOpen, setIsTemplatePickerOpen] = useState(false);
  const [isImportExportOpen, setIsImportExportOpen] = useState(false);
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const [isNewWorkspaceOpen, setIsNewWorkspaceOpen] = useState(false);

  // Once the first screen is up, fetch the other pages and dialogs in the background (see LOADERS).
  useEffect(() => {
    const t = setTimeout(preloadTheRest, 1000);
    window.addEventListener('online', preloadTheRest);
    return () => {
      clearTimeout(t);
      window.removeEventListener('online', preloadTheRest);
    };
  }, []);

  // Global keyboard shortcut (Ctrl+K / Cmd+K) to toggle Command Palette & listen to open events
  useEffect(() => {
    const handleOpenCmd = () => setIsCommandPaletteOpen(true);
    window.addEventListener('open-command-palette', handleOpenCmd);

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Industry standard Ctrl+K or Cmd+K
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);

    return () => {
      window.removeEventListener('open-command-palette', handleOpenCmd);
      window.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, []);

  // Deep links such as /?tab=receipts (the Telegram bot's "Edit in app" button).
  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get('tab');
    if (tab && TABS.includes(tab)) {
      setCurrentTab(tab);
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, []);

  const handleQuickAdd = () => {
    window.dispatchEvent(new CustomEvent('open-quick-add'));
  };

  const handleSelectTab = (tab: string) => {
    if (tab === 'telegram') return openTelegram();
    setCurrentTab(tab);
    setSelectedProductId(null);
  };

  const handleSelectProduct = (pId: string) => {
    setSelectedProductId(pId);
    setCurrentTab('products');
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-950 text-slate-100 font-sans antialiased">
      {/* Desktop Sidebar (Classic layout) */}
      {!topBar && (
        <Sidebar
          currentTab={currentTab}
          onSelectTab={handleSelectTab}
          onOpenTelegramModal={openTelegram}
          onOpenImportExport={() => setIsImportExportOpen(true)}
          onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
          onNewWorkspace={() => setIsNewWorkspaceOpen(true)}
        />
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
        {/* Menu across the top (Timeline and Portfolio layouts, wider screens) */}
        {topBar && (
          <TopNav
            currentTab={currentTab}
            onSelectTab={handleSelectTab}
            onOpenTelegramModal={openTelegram}
            onOpenImportExport={() => setIsImportExportOpen(true)}
            onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
            onNewWorkspace={() => setIsNewWorkspaceOpen(true)}
            onAddService={() => openQuickAddService(selectedProductId || undefined)}
          />
        )}

        {/* Demo Mode Notice Banner */}
        <DemoModeBanner />

        {/* The search bar: always on phones; with a top bar (Timeline, Portfolio) it replaces this on wider screens */}
        <div className={topBar ? 'md:hidden' : 'contents'}>
        <Header
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
          onQuickAddProduct={() => {
            setProductToEdit(null);
            setIsProductModalOpen(true);
          }}
          onQuickAddService={() => {
            openQuickAddService(selectedProductId || undefined);
          }}
          onOpenTelegramModal={openTelegram}
          onNavigateToServices={(q) => {
            setSearchQuery(q);
            setCurrentTab('services');
          }}
          onSelectService={(s) => {
            setServiceToEdit(s);
            setIsServiceModalOpen(true);
          }}
        />
        </div>

        {/* Scrollable Viewport */}
        <main className={`flex-1 overflow-y-auto px-4 py-5 max-w-7xl mx-auto w-full ${topBar ? 'md:px-8 md:py-9' : ''}`}>
          <JobStoppedBanner onOpenSettings={() => handleSelectTab('settings')} />
          <LoadBoundary>
          <Suspense fallback={<PageLoading />}>
          {currentTab === 'dashboard' && layout === 'portfolio' && (
            <PortfolioDashboard
              onSelectTab={handleSelectTab}
              onOpenProductModal={() => {
                setProductToEdit(null);
                setIsProductModalOpen(true);
              }}
              onOpenTemplatePicker={() => setIsTemplatePickerOpen(true)}
              onSelectProduct={handleSelectProduct}
              onOpenServiceModal={() => {
                openQuickAddService(selectedProductId || undefined);
              }}
              onAddServiceTo={(pId) => openQuickAddService(pId)}
              onEditService={(s) => {
                setServiceToEdit(s);
                setIsServiceModalOpen(true);
              }}
            />
          )}

          {currentTab === 'dashboard' && layout === 'timeline' && (
            <TimelineDashboard
              onSelectTab={handleSelectTab}
              onOpenProductModal={() => {
                setProductToEdit(null);
                setIsProductModalOpen(true);
              }}
              onOpenTemplatePicker={() => setIsTemplatePickerOpen(true)}
              onSelectProduct={handleSelectProduct}
              onOpenServiceModal={() => {
                openQuickAddService(selectedProductId || undefined);
              }}
              onEditService={(s) => {
                setServiceToEdit(s);
                setIsServiceModalOpen(true);
              }}
            />
          )}

          {currentTab === 'dashboard' && !topBar && (
            <DashboardView
              onSelectTab={handleSelectTab}
              onOpenProductModal={() => {
                setProductToEdit(null);
                setIsProductModalOpen(true);
              }}
              onOpenTemplatePicker={() => setIsTemplatePickerOpen(true)}
              onSelectProduct={handleSelectProduct}
              onOpenServiceModal={() => {
                openQuickAddService(selectedProductId || undefined);
              }}
              onEditService={(s) => {
                setServiceToEdit(s);
                setIsServiceModalOpen(true);
              }}
            />
          )}

          {currentTab === 'products' && (
            selectedProductId ? (
              <ProductDetailView
                productId={selectedProductId}
                onBack={() => setSelectedProductId(null)}
                onEditProduct={(p) => {
                  setProductToEdit(p);
                  setIsProductModalOpen(true);
                }}
                onCloneProduct={(p) => {
                  setProductToClone(p);
                  setIsCloneModalOpen(true);
                }}
                onAddService={(pId) => {
                  openQuickAddService(pId);
                }}
                onEditService={(s) => {
                  setServiceToEdit(s);
                  setIsServiceModalOpen(true);
                }}
                onAddDate={(pId) => {
                  setDateToEdit(null);
                  setDateDefaultProductId(pId);
                  setIsDateModalOpen(true);
                }}
              />
            ) : (
              <ProductListView
                onSelectProduct={handleSelectProduct}
                onOpenCreateModal={() => {
                  setProductToEdit(null);
                  setIsProductModalOpen(true);
                }}
                onOpenTemplatePicker={() => setIsTemplatePickerOpen(true)}
                onEditProduct={(p) => {
                  setProductToEdit(p);
                  setIsProductModalOpen(true);
                }}
                onCloneProduct={(p) => {
                  setProductToClone(p);
                  setIsCloneModalOpen(true);
                }}
              />
            )
          )}

          {currentTab === 'services' && (
            <ServiceListView
              initialSearch={searchQuery}
              onAddService={() => {
                openQuickAddService(selectedProductId || undefined);
              }}
              onEditService={(s) => {
                setServiceToEdit(s);
                setIsServiceModalOpen(true);
              }}
              onDuplicateService={(s) => {
                setServiceToDuplicate(s);
                setIsDuplicateModalOpen(true);
              }}
              onOpenBulkEdit={(ids) => {
                setBulkEditServiceIds(ids);
                setIsBulkEditModalOpen(true);
              }}
            />
          )}

          {currentTab === 'dates' && (
            <DatesListView
              onAddDate={() => {
                setDateToEdit(null);
                setDateDefaultProductId(selectedProductId || undefined);
                setIsDateModalOpen(true);
              }}
              onEditDate={(d) => {
                setDateToEdit(d);
                setIsDateModalOpen(true);
              }}
              onOpenSnooze={(d) => {
                setDateToSnooze(d);
                setIsSnoozeModalOpen(true);
              }}
            />
          )}

          {currentTab === 'money' && <MoneyView onOpenReceipts={() => setCurrentTab('receipts')} />}
          {currentTab === 'receipts' && <ReceiptsView />}

          {currentTab === 'settings' && (
            <SettingsView />
          )}
          </Suspense>
          </LoadBoundary>
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <BottomNav
        currentTab={currentTab}
        onSelectTab={handleSelectTab}
        onQuickAdd={handleQuickAdd}
      />

      {/* Floating Action Button (FAB) with Speed-Dial Quick Add Menu */}
      <QuickAddFAB
        onAddService={() => {
          openQuickAddService(selectedProductId || undefined);
        }}
        onAddDate={() => {
          setDateToEdit(null);
          setDateDefaultProductId(selectedProductId || undefined);
          setIsDateModalOpen(true);
        }}
        onAddProduct={() => {
          setProductToEdit(null);
          setIsProductModalOpen(true);
        }}
        onStampTemplate={() => setIsTemplatePickerOpen(true)}
      />

      {/* Offline Alert Indicator */}
      <OfflineIndicator />

      {/* Universal Command Palette (Cmd+K) */}
      <CommandPaletteModal
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onSelectTab={handleSelectTab}
        onSelectProduct={handleSelectProduct}
        onOpenProductModal={() => {
          setProductToEdit(null);
          setIsProductModalOpen(true);
        }}
        onOpenServiceModal={() => {
          openQuickAddService(selectedProductId || undefined);
        }}
        onOpenDateModal={() => {
          setDateToEdit(null);
          setIsDateModalOpen(true);
        }}
        onOpenTelegramModal={openTelegram}
        onOpenImportExport={() => setIsImportExportOpen(true)}
      />

      {/* Modals Container */}
      <LoadBoundary>
      <Suspense fallback={null}>
      {isProductModalOpen && (
        <ProductModal
          isOpen={isProductModalOpen}
          onClose={() => {
            setIsProductModalOpen(false);
            setProductToEdit(null);
          }}
          initialProduct={productToEdit}
          onSubmit={(data) => {
            if (productToEdit) {
              updateProduct(productToEdit.id, data);
            } else {
              const newId = addProduct(data);
              handleSelectProduct(newId);
            }
          }}
        />
      )}

      {isCloneModalOpen && (
        <CloneProductModal
          isOpen={isCloneModalOpen}
          onClose={() => {
            setIsCloneModalOpen(false);
            setProductToClone(null);
          }}
          product={productToClone}
          serviceCount={services.filter((s) => s.productId === productToClone?.id).length}
          onClone={(srcId, newName) => {
            const newId = cloneProduct(srcId, newName);
            handleSelectProduct(newId);
          }}
        />
      )}

      <QuickAddServiceModal
        isOpen={isQuickAddOpen}
        onClose={() => setIsQuickAddOpen(false)}
        defaultProductId={quickAddProductId}
        onMoreOptions={(draft) => {
          setIsQuickAddOpen(false);
          setServiceToEdit(null);
          setServiceDraft(draft);
          setServiceDefaultProductId(draft.productId || quickAddProductId);
          setIsServiceModalOpen(true);
        }}
      />

      {isServiceModalOpen && (
        <ServiceModal
          isOpen={isServiceModalOpen}
          onClose={() => {
            setIsServiceModalOpen(false);
            setServiceToEdit(null);
            setServiceDraft(null);
          }}
          initialService={serviceToEdit}
          defaultProductId={serviceDefaultProductId}
          draft={serviceDraft}
          onSubmit={(data) => {
            if (serviceToEdit) {
              updateServiceLink(serviceToEdit.id, data);
            } else {
              addServiceLink(data);
            }
          }}
        />
      )}

      {isDuplicateModalOpen && (
        <DuplicateToProductsModal
          isOpen={isDuplicateModalOpen}
          onClose={() => {
            setIsDuplicateModalOpen(false);
            setServiceToDuplicate(null);
          }}
          service={serviceToDuplicate}
          onDuplicate={(sId, targetIds) => duplicateServiceToProducts(sId, targetIds)}
        />
      )}

      {isBulkEditModalOpen && (
        <BulkEditModal
          isOpen={isBulkEditModalOpen}
          onClose={() => {
            setIsBulkEditModalOpen(false);
            setBulkEditServiceIds([]);
          }}
          selectedServiceIds={bulkEditServiceIds}
          onApplyBulkEdit={(ids: string[], updates: Partial<ServiceLink>) => bulkUpdateServices(ids, updates)}
        />
      )}

      {isDateModalOpen && (
        <DateModal
          isOpen={isDateModalOpen}
          onClose={() => {
            setIsDateModalOpen(false);
            setDateToEdit(null);
          }}
          initialDate={dateToEdit}
          defaultProductId={dateDefaultProductId}
          onSubmit={(data) => {
            if (dateToEdit) {
              updateImportantDate(dateToEdit.id, data);
            } else {
              addImportantDate(data);
            }
          }}
        />
      )}

      {isSnoozeModalOpen && (
        <SnoozeModal
          isOpen={isSnoozeModalOpen}
          onClose={() => {
            setIsSnoozeModalOpen(false);
            setDateToSnooze(null);
          }}
          dateItem={dateToSnooze}
          onSnooze={(id, days) => snoozeImportantDate(id, days)}
        />
      )}

      {isTemplatePickerOpen && (
        <TemplatePickerModal
          isOpen={isTemplatePickerOpen}
          onClose={() => setIsTemplatePickerOpen(false)}
          onSelectTemplate={(tplId, name, desc) => {
            const newId = createProductFromTemplate(tplId, name, desc);
            handleSelectProduct(newId);
          }}
        />
      )}

      {isImportExportOpen && (
        <ImportExportModal
          isOpen={isImportExportOpen}
          onClose={() => setIsImportExportOpen(false)}
        />
      )}

      {isNewWorkspaceOpen && (
        <NewWorkspaceModal
          onClose={() => setIsNewWorkspaceOpen(false)}
          onCreated={() => {
            // The new workspace is now the current one: set up its currency, reminders and first product.
            setIsNewWorkspaceOpen(false);
            setCurrentTab('dashboard');
            setIsOnboardingOpen(true);
          }}
        />
      )}

      {isOnboardingOpen && (
        <OnboardingModal
          isOpen={isOnboardingOpen}
          onClose={() => setIsOnboardingOpen(false)}
          onFinish={() => setCurrentTab('products')}
        />
      )}
      </Suspense>
      </LoadBoundary>
    </div>
  );
};
