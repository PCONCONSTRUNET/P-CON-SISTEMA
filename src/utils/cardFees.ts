const roundCurrency = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export const CARD_BASE_FEE_RATE = 0.0499;

export const CARD_INSTALLMENT_SURCHARGE_RATES: Record<number, number> = {
  1: 0,
  2: 0.0964,
  3: 0.1123,
  4: 0.1136,
};

export interface CardPricingBreakdown {
  requestedAmount: number;
  baseFeeAmount: number;
  baseFeeRate: number;
  baseCardAmount: number;
  installmentSurchargeAmount: number;
  installmentSurchargeRate: number;
  installmentAmount: number;
  installments: number;
  totalCustomerAmount: number;
}

export const calculateCardPricing = (amount: number, installments: number): CardPricingBreakdown => {
  const requestedAmount = roundCurrency(Math.max(amount || 0, 0));
  const safeInstallments = [1, 2, 3, 4].includes(installments) ? installments : 1;
  const baseCardAmount = roundCurrency(requestedAmount / (1 - CARD_BASE_FEE_RATE));
  const installmentSurchargeRate = CARD_INSTALLMENT_SURCHARGE_RATES[safeInstallments] || 0;
  const installmentSurchargeAmount = roundCurrency(baseCardAmount * installmentSurchargeRate);
  const totalCustomerAmount = roundCurrency(baseCardAmount + installmentSurchargeAmount);
  const installmentAmount = roundCurrency(totalCustomerAmount / safeInstallments);

  return {
    requestedAmount,
    baseFeeAmount: roundCurrency(baseCardAmount - requestedAmount),
    baseFeeRate: CARD_BASE_FEE_RATE,
    baseCardAmount,
    installmentSurchargeAmount,
    installmentSurchargeRate,
    installmentAmount,
    installments: safeInstallments,
    totalCustomerAmount,
  };
};