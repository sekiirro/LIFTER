export type CatalogShowcaseHrefParams = {
  kind: 'exercise' | 'food';
  state: 'ready' | 'loading' | 'empty' | 'noResults' | 'error';
  view: 'list' | 'editor';
  role: 'po' | 'trainer';
  reps: 'fixed' | 'range';
  scope: 'global' | 'workspace';
  coachingWork: boolean;
};

export function buildCatalogShowcaseHref(
  query: CatalogShowcaseHrefParams,
  sampleBrand: boolean,
): string {
  const params = new URLSearchParams({
    kind: query.kind,
    state: query.state,
    view: query.view,
    role: query.role,
    reps: query.reps,
    scope: query.scope,
    coachingWork: String(query.coachingWork),
  });
  if (sampleBrand) params.set('brand', 'sample');
  return `/showcase/catalog?${params.toString()}`;
}
