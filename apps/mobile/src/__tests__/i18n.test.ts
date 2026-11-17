import { describe, expect, it } from '@jest/globals';
import en from '../i18n/locales/en';
import lt from '../i18n/locales/lt';
import lv from '../i18n/locales/lv';
import et from '../i18n/locales/et';
import pl from '../i18n/locales/pl';

function keys(obj: object, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) => (typeof v === 'object' && v ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`]));
}

describe('translations', () => {
  const enKeys = keys(en).sort();
  it('Lithuanian (default) is complete', () => {
    expect(keys(lt).sort()).toEqual(enKeys);
  });
  it('partial locales only contain known keys', () => {
    for (const loc of [lv, et, pl]) for (const k of keys(loc)) expect(enKeys).toContain(k);
  });
  it('keeps interpolation placeholders in Lithuanian', () => {
    const flat = (o: object) => Object.fromEntries(keys(o).map((k) => [k, k.split('.').reduce<any>((a, p) => a[p], o)]));
    const e = flat(en), l = flat(lt);
    for (const k of enKeys) {
      const vars = (s: string) => (s.match(/{{\w+}}/g) ?? []).sort();
      expect([k, vars(l[k])]).toEqual([k, vars(e[k])]);
    }
  });
});
