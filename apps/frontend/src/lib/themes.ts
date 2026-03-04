export interface KortixTheme {
  id: string;
  name: string;
  /** Hex color for the accent dot in the theme picker */
  accentColor: string;
  description: string;
}

export const DEFAULT_THEME_ID = 'graphite';

export const THEMES: KortixTheme[] = [
  {
    id: 'graphite',
    name: 'Classic',
    accentColor: '#A09080',
    description: 'Warm parchment, low-contrast, timeless',
  },
  {
    id: 'solstice',
    name: 'Honey',
    accentColor: '#C4922A',
    description: 'Amber-dipped warmth, golden undertones',
  },
  {
    id: 'sandstorm',
    name: 'Caramel',
    accentColor: '#A0622A',
    description: 'Rich toasted brown, deep and grounded',
  },
  {
    id: 'fossil',
    name: 'Linen',
    accentColor: '#9B8878',
    description: 'Soft cool-grey stone, hushed and refined',
  },
  {
    id: 'meridian',
    name: 'Tzatziki',
    accentColor: '#5E967A',
    description: 'Cool dill-herb green on cream, fresh and bright',
  },
];

export function getThemeById(id: string): KortixTheme | undefined {
  return THEMES.find((t) => t.id === id);
}

/** Returns the CSS class name for a theme, or undefined for the default theme */
export function getThemeClassName(id: string): string | undefined {
  if (id === DEFAULT_THEME_ID) return undefined;
  return `theme-${id}`;
}

/** Returns all non-default theme class names (for cleanup) */
export function getAllThemeClassNames(): string[] {
  return THEMES.filter((t) => t.id !== DEFAULT_THEME_ID).map(
    (t) => `theme-${t.id}`
  );
}
