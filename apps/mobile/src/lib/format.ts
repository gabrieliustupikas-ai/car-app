export function formatKm(meters: number, lang = 'lt', digits?: number): string {
  const km = meters / 1000;
  const d = digits ?? (km < 10 ? 1 : 0);
  return new Intl.NumberFormat(lang, { minimumFractionDigits: d, maximumFractionDigits: d }).format(km);
}

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

export function formatInt(n: number, lang = 'lt'): string {
  return new Intl.NumberFormat(lang).format(Math.round(n));
}

export function formatDateTime(ms: number, lang = 'lt'): string {
  return new Intl.DateTimeFormat(lang, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(ms));
}

export function deviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Vilnius';
  } catch {
    return 'Europe/Vilnius';
  }
}
