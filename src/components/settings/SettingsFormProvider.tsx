import React, { createContext, useContext } from 'react';
import { useSettingsForm, type SettingsForm } from './useSettingsForm';

const SettingsFormContext = createContext<SettingsForm | null>(null);

/**
 * Holds the Settings form above the layout's Settings page. Changing the layout swaps the page (Classic,
 * Timeline and Portfolio each have their own), but what you typed and haven't saved stays. Leaving Settings
 * still drops unsaved edits, as before.
 */
export const SettingsFormProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const form = useSettingsForm();
  return <SettingsFormContext.Provider value={form}>{children}</SettingsFormContext.Provider>;
};

/** The Settings form, from the SettingsFormProvider around the page. */
export function useSharedSettingsForm(): SettingsForm {
  const form = useContext(SettingsFormContext);
  if (!form) throw new Error('useSharedSettingsForm needs a SettingsFormProvider around the Settings page');
  return form;
}
