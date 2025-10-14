export type SortOption = 'similarity' | 'recent';

export interface FilterOptions {
  sameDomainOnly: boolean;
}

export interface PopupPreferences {
  sortBy: SortOption;
  filters: FilterOptions;
}

export const DEFAULT_PREFERENCES: PopupPreferences = {
  sortBy: 'similarity',
  filters: {
    sameDomainOnly: false,
  },
};
