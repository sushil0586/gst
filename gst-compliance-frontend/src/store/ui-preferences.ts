export type UiPreferencesState = {
  sidebarCollapsed: boolean;
  density: "compact" | "comfortable";
};

export const defaultUiPreferences: UiPreferencesState = {
  sidebarCollapsed: false,
  density: "compact",
};
