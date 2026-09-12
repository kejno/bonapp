export const priceTransformer = {
  to: (v: number) => v,
  from: (v: string) => parseFloat(v),
};
