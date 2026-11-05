import React, { useState, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { BottomNav } from './BottomNav';
import { Header } from './Header';
import { OfflineIndicator } from './OfflineIndicator';
import { DemoModeBanner } from '../common/DemoModeBanner';
import { CommandPaletteModal } from '../common/CommandPaletteModal';
import { AndroidInstallGuideModal } from '../common/AndroidInstallGuideModal';
import { QuickAddFAB } from '../common/QuickAddFAB';
import { useWorkspace } from '../../context/WorkspaceContext';

// Views
import { DashboardView } from '../dashboard/DashboardView';
import { ProductListView } from '../products/ProductListView';
import { ProductDetailView } from '../products/ProductDetailView';
import { ServiceListView } from '../services/ServiceListView';
import { DatesListView } from '../dates/DatesListView';
import { SettingsView } from '../settings/SettingsView';

// Modals
import { ProductModal } from '../products/ProductModal';
import { CloneProductModal } from '../products/CloneProductModal';
import { ServiceModal } from '../services/ServiceModal';
import { QuickAddServiceModal } from '../services/QuickAddServiceModal';
import { DuplicateToProductsModal } from '../services/DuplicateToProductsModal';
import { BulkEditModal } from '../services/BulkEditModal';
import { DateModal } from '../dates/DateModal';
import { SnoozeModal } from '../dates/SnoozeModal';
import { TemplatePickerModal } from '../templates/TemplatePickerModal';
import { TelegramSimulatorModal } from '../reminders/TelegramSimulatorModal';
import { VaultSyncModal } from '../vault/VaultSyncModal';
import { ImportExportModal } from '../impexp/ImportExportModal';
import { OnboardingModal } from '../onboarding/OnboardingModal';

import { Product, ServiceLink, ImportantDate } from '../../types';

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
    isDemoMode,
  } = useWorkspace();

  // Navigation State
  const [currentTab, setCurrentTab] = useState<string>('dashboard');
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Modals State
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isAndroidGuideOpen, setIsAndroidGuideOpen] = useState(false);

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
  // Demo: the bot simulator. Live workspace: the real Telegram setup in Settings.
  const openTelegram = () => {
    if (isDemoMode) setIsTelegramModalOpen(true);
    else setCurrentTab('settings');
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
  const [isTelegramModalOpen, setIsTelegramModalOpen] = useState(false);
  const [isVaultModalOpen, setIsVaultModalOpen] = useState(false);
  const [isImportExportOpen, setIsImportExportOpen] = useState(false);
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);

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

  const handleQuickAdd = () => {
    window.dispatchEvent(new CustomEvent('open-quick-add'));
  };

  const handleSelectTab = (tab: string) => {
    setCurrentTab(tab);
    setSelectedProductId(null);
  };

  const handleSelectProduct = (pId: string) => {
    setSelectedProductId(pId);
    setCurrentTab('products');
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-950 text-slate-100 font-sans antialiased">
      {/* Desktop Sidebar */}
      <Sidebar
        currentTab={currentTab}
        onSelectTab={handleSelectTab}
        onOpenVaultModal={() => setIsVaultModalOpen(true)}
        onOpenTelegramModal={openTelegram}
        onOpenImportExport={() => setIsImportExportOpen(true)}
        onOpenAndroidGuide={() => setIsAndroidGuideOpen(true)}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        onNewWorkspace={() => setIsOnboardingOpen(true)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
        {/* Demo Mode Notice Banner */}
        <DemoModeBanner />

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
          onOpenVaultModal={() => setIsVaultModalOpen(true)}
          onOpenTelegramModal={openTelegram}
          onOpenAndroidGuide={() => setIsAndroidGuideOpen(true)}
          onNavigateToServices={(q) => {
            setSearchQuery(q);
            setCurrentTab('services');
          }}
          onSelectService={(s) => {
            setServiceToEdit(s);
            setIsServiceModalOpen(true);
          }}
        />

        {/* Scrollable Viewport */}
        <main className="flex-1 overflow-y-auto px-4 py-5 max-w-7xl mx-auto w-full">
          {currentTab === 'dashboard' && (
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
              onOpenVaultModal={() => setIsVaultModalOpen(true)}
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
                onOpenVaultModal={() => setIsVaultModalOpen(true)}
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

          {currentTab === 'settings' && (
            <SettingsView
              onOpenTelegramModal={openTelegram}
              onOpenVaultModal={() => setIsVaultModalOpen(true)}
            />
          )}
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
        onOpenVaultModal={() => setIsVaultModalOpen(true)}
        onOpenTelegramModal={openTelegram}
        onOpenImportExport={() => setIsImportExportOpen(true)}
        onOpenAndroidGuide={() => setIsAndroidGuideOpen(true)}
      />

      {/* Android Studio & Standalone App Testing Guide */}
      <AndroidInstallGuideModal
        isOpen={isAndroidGuideOpen}
        onClose={() => setIsAndroidGuideOpen(false)}
      />

      {/* Modals Container */}
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
        onOpenVaultModal={() => setIsVaultModalOpen(true)}
      />

      <DuplicateToProductsModal
        isOpen={isDuplicateModalOpen}
        onClose={() => {
          setIsDuplicateModalOpen(false);
          setServiceToDuplicate(null);
        }}
        service={serviceToDuplicate}
        onDuplicate={(sId, targetIds) => duplicateServiceToProducts(sId, targetIds)}
      />

      <BulkEditModal
        isOpen={isBulkEditModalOpen}
        onClose={() => {
          setIsBulkEditModalOpen(false);
          setBulkEditServiceIds([]);
        }}
        selectedServiceIds={bulkEditServiceIds}
        onApplyBulkEdit={(ids: string[], updates: Partial<ServiceLink>) => bulkUpdateServices(ids, updates)}
      />

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
        onOpenVaultModal={() => setIsVaultModalOpen(true)}
      />

      <SnoozeModal
        isOpen={isSnoozeModalOpen}
        onClose={() => {
          setIsSnoozeModalOpen(false);
          setDateToSnooze(null);
        }}
        dateItem={dateToSnooze}
        onSnooze={(id, days) => snoozeImportantDate(id, days)}
      />

      <TemplatePickerModal
        isOpen={isTemplatePickerOpen}
        onClose={() => setIsTemplatePickerOpen(false)}
        onSelectTemplate={(tplId, name, desc) => {
          const newId = createProductFromTemplate(tplId, name, desc);
          handleSelectProduct(newId);
        }}
      />

      <TelegramSimulatorModal
        isOpen={isTelegramModalOpen}
        onClose={() => setIsTelegramModalOpen(false)}
      />

      <VaultSyncModal
        isOpen={isVaultModalOpen}
        onClose={() => setIsVaultModalOpen(false)}
      />

      <ImportExportModal
        isOpen={isImportExportOpen}
        onClose={() => setIsImportExportOpen(false)}
      />

      <OnboardingModal
        isOpen={isOnboardingOpen}
        onClose={() => setIsOnboardingOpen(false)}
        onFinish={() => setCurrentTab('products')}
      />
    </div>
  );
};
