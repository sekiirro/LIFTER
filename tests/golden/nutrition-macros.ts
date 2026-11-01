import type {
  NutritionFoodSnapshot,
  NutritionMacroCalculation,
  NutritionMacroInput,
  NutritionMacroUnit,
  NutritionMacroValues,
} from '../../lib/plans/nutrition/macros';

export type NutritionMacroGoldenCase = {
  name: string;
  inputs: NutritionMacroInput[];
  expected: {
    calculations: NutritionMacroCalculation[];
    total: NutritionMacroValues;
  };
};

export type NutritionMacroErrorGoldenCase = {
  name: string;
  input: NutritionMacroInput;
};

function createSnapshot(
  foodVersionId: string,
  basis: NutritionMacroUnit,
  per100: NutritionMacroValues,
  servingEquivalences: Record<string, string> = {},
): NutritionFoodSnapshot {
  return {
    foodVersionId,
    basis,
    per100,
    servingEquivalences,
  };
}

export const nutritionMacroGoldenCases: NutritionMacroGoldenCase[] = [
  {
    name: 'exact hundred-basis quantity preserves every per-100 value',
    inputs: [
      {
        snapshot: createSnapshot('food-hundred-basis', 'g', {
          calories: '250.00',
          protein: '20.00',
          carbs: '30.00',
          fat: '10.00',
        }),
        quantity: { value: '100', unit: 'g' },
      },
    ],
    expected: {
      calculations: [
        {
          basisQuantity: '100',
          macros: {
            calories: '250.0000',
            protein: '20.0000',
            carbs: '30.0000',
            fat: '10.0000',
          },
        },
      ],
      total: {
        calories: '250.0000',
        protein: '20.0000',
        carbs: '30.0000',
        fat: '10.0000',
      },
    },
  },
  {
    name: 'millilitre basis and its declared serving equivalence stay exact',
    inputs: [
      {
        snapshot: createSnapshot(
          'food-millilitre-basis',
          'ml',
          {
            calories: '12.50',
            protein: '2.50',
            carbs: '3.75',
            fat: '1.25',
          },
          { cup: '240.0000' },
        ),
        quantity: { value: '1.5', unit: 'cup' },
      },
    ],
    expected: {
      calculations: [
        {
          basisQuantity: '360',
          macros: {
            calories: '45.0000',
            protein: '9.0000',
            carbs: '13.5000',
            fat: '4.5000',
          },
        },
      ],
      total: {
        calories: '45.0000',
        protein: '9.0000',
        carbs: '13.5000',
        fat: '4.5000',
      },
    },
  },
  {
    name: 'repeating fraction is rounded once at the four-decimal boundary',
    inputs: [
      {
        snapshot: createSnapshot('food-repeating-third', 'g', {
          calories: '1.00',
          protein: '1.00',
          carbs: '1.00',
          fat: '1.00',
        }),
        quantity: { value: '0.333', unit: 'g' },
      },
    ],
    expected: {
      calculations: [
        {
          basisQuantity: '0.333',
          macros: {
            calories: '0.0033',
            protein: '0.0033',
            carbs: '0.0033',
            fat: '0.0033',
          },
        },
      ],
      total: {
        calories: '0.0033',
        protein: '0.0033',
        carbs: '0.0033',
        fat: '0.0033',
      },
    },
  },
  {
    name: 'declared serving equivalence converts the quantity to basis grams',
    inputs: [
      {
        snapshot: createSnapshot(
          'food-declared-serving',
          'g',
          {
            calories: '10.00',
            protein: '2.00',
            carbs: '3.00',
            fat: '1.00',
          },
          { scoop: '30.0000' },
        ),
        quantity: { value: '1.5', unit: 'scoop' },
      },
    ],
    expected: {
      calculations: [
        {
          basisQuantity: '45',
          macros: {
            calories: '4.5000',
            protein: '0.9000',
            carbs: '1.3500',
            fat: '0.4500',
          },
        },
      ],
      total: {
        calories: '4.5000',
        protein: '0.9000',
        carbs: '1.3500',
        fat: '0.4500',
      },
    },
  },
  {
    name: 'half-even ties choose the even fourth decimal in both directions',
    inputs: [
      {
        snapshot: createSnapshot('food-half-even-ties', 'g', {
          calories: '0.01',
          protein: '0.02',
          carbs: '0.03',
          fat: '0.04',
        }),
        quantity: { value: '0.5', unit: 'g' },
      },
    ],
    expected: {
      calculations: [
        {
          basisQuantity: '0.5',
          macros: {
            calories: '0.0000',
            protein: '0.0001',
            carbs: '0.0002',
            fat: '0.0002',
          },
        },
      ],
      total: {
        calories: '0.0000',
        protein: '0.0001',
        carbs: '0.0002',
        fat: '0.0002',
      },
    },
  },
  {
    name: 'half-even ties preserve an even retained digit',
    inputs: [
      {
        snapshot: createSnapshot('food-half-even-even-digit', 'g', {
          calories: '0.05',
          protein: '0.10',
          carbs: '0.15',
          fat: '0.20',
        }),
        quantity: { value: '0.5', unit: 'g' },
      },
    ],
    expected: {
      calculations: [
        {
          basisQuantity: '0.5',
          macros: {
            calories: '0.0002',
            protein: '0.0005',
            carbs: '0.0008',
            fat: '0.0010',
          },
        },
      ],
      total: {
        calories: '0.0002',
        protein: '0.0005',
        carbs: '0.0008',
        fat: '0.0010',
      },
    },
  },
  {
    name: 'four-decimal serving equivalence keeps its exact intermediate product',
    inputs: [
      {
        snapshot: createSnapshot(
          'food-four-decimal-serving',
          'g',
          {
            calories: '10.00',
            protein: '2.00',
            carbs: '3.00',
            fat: '1.00',
          },
          { scoop: '33.3333' },
        ),
        quantity: { value: '1.333', unit: 'scoop' },
      },
    ],
    expected: {
      calculations: [
        {
          basisQuantity: '44.4332889',
          macros: {
            calories: '4.4433',
            protein: '0.8887',
            carbs: '1.3330',
            fat: '0.4443',
          },
        },
      ],
      total: {
        calories: '4.4433',
        protein: '0.8887',
        carbs: '1.3330',
        fat: '0.4443',
      },
    },
  },
  {
    name: 'precision boundary uses exact arithmetic before the final rounding',
    inputs: [
      {
        snapshot: createSnapshot('food-precision-boundary', 'g', {
          calories: '99.99',
          protein: '12.34',
          carbs: '7.89',
          fat: '0.01',
        }),
        quantity: { value: '33.333', unit: 'g' },
      },
    ],
    expected: {
      calculations: [
        {
          basisQuantity: '33.333',
          macros: {
            calories: '33.3297',
            protein: '4.1133',
            carbs: '2.6300',
            fat: '0.0033',
          },
        },
      ],
      total: {
        calories: '33.3297',
        protein: '4.1133',
        carbs: '2.6300',
        fat: '0.0033',
      },
    },
  },
  {
    name: 'aggregate is rounded once rather than summing rounded item values',
    inputs: [
      {
        snapshot: createSnapshot('food-aggregate-half-even', 'g', {
          calories: '0.01',
          protein: '0.02',
          carbs: '0.03',
          fat: '0.04',
        }),
        quantity: { value: '0.5', unit: 'g' },
      },
      {
        snapshot: createSnapshot('food-aggregate-half-even', 'g', {
          calories: '0.01',
          protein: '0.02',
          carbs: '0.03',
          fat: '0.04',
        }),
        quantity: { value: '0.5', unit: 'g' },
      },
    ],
    expected: {
      calculations: [
        {
          basisQuantity: '0.5',
          macros: {
            calories: '0.0000',
            protein: '0.0001',
            carbs: '0.0002',
            fat: '0.0002',
          },
        },
        {
          basisQuantity: '0.5',
          macros: {
            calories: '0.0000',
            protein: '0.0001',
            carbs: '0.0002',
            fat: '0.0002',
          },
        },
      ],
      total: {
        calories: '0.0001',
        protein: '0.0002',
        carbs: '0.0003',
        fat: '0.0004',
      },
    },
  },
  {
    name: 'aggregate half-even parity is independent of item-level ties',
    inputs: [
      {
        snapshot: createSnapshot('food-aggregate-even-digit', 'g', {
          calories: '0.05',
          protein: '0.10',
          carbs: '0.15',
          fat: '0.20',
        }),
        quantity: { value: '0.5', unit: 'g' },
      },
      {
        snapshot: createSnapshot('food-aggregate-even-digit', 'g', {
          calories: '0.05',
          protein: '0.10',
          carbs: '0.15',
          fat: '0.20',
        }),
        quantity: { value: '0.5', unit: 'g' },
      },
    ],
    expected: {
      calculations: [
        {
          basisQuantity: '0.5',
          macros: {
            calories: '0.0002',
            protein: '0.0005',
            carbs: '0.0008',
            fat: '0.0010',
          },
        },
        {
          basisQuantity: '0.5',
          macros: {
            calories: '0.0002',
            protein: '0.0005',
            carbs: '0.0008',
            fat: '0.0010',
          },
        },
      ],
      total: {
        calories: '0.0005',
        protein: '0.0010',
        carbs: '0.0015',
        fat: '0.0020',
      },
    },
  },
  {
    name: 'maximum numeric(12,4) storage value is accepted',
    inputs: [
      {
        snapshot: createSnapshot('food-maximum-storage-value', 'g', {
          calories: '99999999.99',
          protein: '0.00',
          carbs: '0.00',
          fat: '0.00',
        }),
        quantity: { value: '100', unit: 'g' },
      },
    ],
    expected: {
      calculations: [
        {
          basisQuantity: '100',
          macros: {
            calories: '99999999.9900',
            protein: '0.0000',
            carbs: '0.0000',
            fat: '0.0000',
          },
        },
      ],
      total: {
        calories: '99999999.9900',
        protein: '0.0000',
        carbs: '0.0000',
        fat: '0.0000',
      },
    },
  },
];

export const nutritionMacroErrorGoldenCases: NutritionMacroErrorGoldenCase[] = [
  {
    name: 'undefined unit conversion is rejected',
    input: {
      snapshot: createSnapshot('food-undefined-unit', 'g', {
        calories: '10.00',
        protein: '2.00',
        carbs: '3.00',
        fat: '1.00',
      }),
      quantity: { value: '1', unit: 'ml' },
    },
  },
  {
    name: 'quantity precision beyond three decimals is rejected',
    input: {
      snapshot: createSnapshot('food-invalid-quantity-scale', 'g', {
        calories: '10.00',
        protein: '2.00',
        carbs: '3.00',
        fat: '1.00',
      }),
      quantity: { value: '0.0001', unit: 'g' },
    },
  },
  {
    name: 'serving equivalence precision beyond four decimals is rejected',
    input: {
      snapshot: createSnapshot(
        'food-invalid-serving-scale',
        'g',
        {
          calories: '10.00',
          protein: '2.00',
          carbs: '3.00',
          fat: '1.00',
        },
        { scoop: '30.00000' },
      ),
      quantity: { value: '1', unit: 'scoop' },
    },
  },
  {
    name: 'negative per-100 nutrient is rejected',
    input: {
      snapshot: createSnapshot('food-negative-nutrient', 'g', {
        calories: '10.00',
        protein: '-2.00',
        carbs: '3.00',
        fat: '1.00',
      }),
      quantity: { value: '1', unit: 'g' },
    },
  },
  {
    name: 'a value beyond numeric(12,4) is rejected',
    input: {
      snapshot: createSnapshot('food-overflowing-value', 'g', {
        calories: '99999999.99',
        protein: '0.00',
        carbs: '0.00',
        fat: '0.00',
      }),
      quantity: { value: '100.001', unit: 'g' },
    },
  },
];
