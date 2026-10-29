import { deriveBrand, parseHex, type BrandVariants } from '../design/color';

/** Data/token boundary only; this does not define Client Portal behavior. */
export type PortalBrandContract = {
  workspaceName: string;
  color: `#${string}`;
  tokens: BrandVariants;
};

export function createPortalBrandContract(input: {
  workspaceName: string;
  color: string;
}): PortalBrandContract {
  const workspaceName = input.workspaceName.trim();
  const color = parseHex(input.color);
  if (!workspaceName) throw new TypeError('Workspace name is required');
  if (!color || !/^#[\da-f]{6}$/i.test(input.color)) {
    throw new TypeError('Brand color must use #RRGGBB format');
  }
  return {
    workspaceName,
    color,
    tokens: deriveBrand(color),
  };
}
