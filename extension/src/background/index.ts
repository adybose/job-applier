import { browser } from 'wxt/browser';

export function startBackground(): void {
  // Spec 08 R-UI-1: clicking the icon opens the side panel for the current tab.
  void browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
}
