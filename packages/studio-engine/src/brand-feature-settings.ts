import { brandPreferences } from '@pireel/studio-engine/brand-preferences';
import type { BrandPlaybook } from '@pireel/studio-engine/brand-playbook';

/** Per-capability settings, never a shared style paragraph or an effect-template catalog. */
export const BRAND_PROMPT_FEATURES = ['cover', 'headlines', 'broll', 'graphics', 'sound', 'zoom'] as const;
export type BrandPromptFeature = typeof BRAND_PROMPT_FEATURES[number];
export const BRAND_THEME_FEATURES: readonly BrandPromptFeature[] = ['cover', 'headlines', 'graphics'];
export interface BrandFeatureTheme { background?: string; foreground?: string; accent?: string; font?: string }
export interface BrandFeatureSetting { prompt?: string; theme?: BrandFeatureTheme }
export type BrandFeatureSettings = Partial<Record<BrandPromptFeature, BrandFeatureSetting>>;
type ConfiguredBrand = Pick<BrandPlaybook, 'blocks' | 'preferences' | 'skills' | 'media' | 'settings'>;

/** Discard the retired transition configuration without rejecting existing brand records. */
export function upgradeBrandFeatureSettings<T>(value: T): T {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !Object.hasOwn(value, 'transitions')) return value;
  const { transitions: _retired, ...settings } = value as Record<string, unknown>;
  return settings as T;
}

/** Turning off a capability retains its saved settings but removes them from execution. */
export function activeBrandSetting(brand: ConfiguredBrand, id: BrandPromptFeature): BrandFeatureSetting | undefined {
  return brandPreferences(brand)[id] ? brand.settings?.[id] : undefined;
}
export function brandFeaturePrompt(brand: ConfiguredBrand, id: BrandPromptFeature): string | null {
  const setting = activeBrandSetting(brand, id);
  if (!setting) return null;
  const theme = setting.theme;
  const tokens = theme ? Object.entries(theme).filter(([, value]) => value).map(([key, value]) => `${key}: ${value}`).join('; ') : '';
  return [tokens ? `Use this feature's configured theme: ${tokens}.` : '', setting.prompt?.trim()].filter(Boolean).join('\n') || null;
}

export function validateBrandFeatureSettings(value: unknown): void {
  const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
  const fail = (path: string): never => { throw new Error(`Invalid brand field settings${path ? `.${path}` : ''}`); };
  if (!record(value)) fail('');
  for (const [id, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!(BRAND_PROMPT_FEATURES as readonly string[]).includes(id) || !record(raw)) fail(id);
    const config = raw as Record<string, unknown>;
    if (Object.keys(config).some(key => !['prompt', 'theme'].includes(key))) fail(id);
    if (config.prompt !== undefined && (typeof config.prompt !== 'string' || config.prompt.length > 4000)) fail(`${id}.prompt (at most 4000 characters)`);
    if (config.theme !== undefined) {
      if (!BRAND_THEME_FEATURES.includes(id as BrandPromptFeature) || !record(config.theme)) fail(`${id}.theme`);
      for (const [key, token] of Object.entries(config.theme as Record<string, unknown>)) {
        if (key === 'font') { if (typeof token !== 'string' || !token.trim() || token.length > 80) fail(`${id}.theme.font`); }
        else if (!['background', 'foreground', 'accent'].includes(key) || typeof token !== 'string' || !/^#[0-9a-f]{6}$/i.test(token)) fail(`${id}.theme.${key}`);
      }
    }
  }
}
