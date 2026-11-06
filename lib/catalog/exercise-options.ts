export function exerciseOptions(data: unknown, locale: 'ar' | 'en') {
  if (!Array.isArray(data)) return [];
  return data.flatMap((value) => {
    if (!value || typeof value !== 'object') return [];
    const row = value as Record<string, unknown>;
    if (
      typeof row.result_id !== 'string' ||
      !row.result_payload ||
      typeof row.result_payload !== 'object'
    )
      return [];
    const payload = row.result_payload as Record<string, unknown>;
    const names =
      payload.names && typeof payload.names === 'object'
        ? (payload.names as Record<string, unknown>)
        : {};
    const localizedPayloadName =
      payload[locale === 'ar' ? 'name_ar' : 'name_en'];
    const fallbackPayloadName =
      payload[locale === 'ar' ? 'name_en' : 'name_ar'];
    const name =
      typeof localizedPayloadName === 'string' && localizedPayloadName.trim()
        ? localizedPayloadName
        : names[locale];
    const fallback =
      typeof fallbackPayloadName === 'string' && fallbackPayloadName.trim()
        ? fallbackPayloadName
        : names[locale === 'ar' ? 'en' : 'ar'];
    const label =
      typeof name === 'string' && name.trim()
        ? name
        : typeof fallback === 'string' && fallback.trim()
          ? fallback
          : null;
    if (!label) return [];
    return [{ id: row.result_id, label }];
  });
}
