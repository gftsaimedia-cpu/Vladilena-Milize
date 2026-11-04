// 'long' = "HĐLĐ từ 3 tháng", 'short' = "Dưới 3 tháng": the label the web form writes into staff.contract.
export type ContractTerm = 'long' | 'short';

export const CONTRACT_TERM_TEXT: Record<ContractTerm, string> = {
  long: 'HĐLĐ từ 3 tháng',
  short: 'Dưới 3 tháng'
};

// Any value other than 'long' / 'short' (NULL, '', a date text...) is no label: trainees (tts) count as short,
// every other type (nv, ctv, unknown) as long.
export function resolveContractTerm(label: unknown, employeeType: string | null | undefined): ContractTerm {
  if (label === 'long' || label === 'short') return label;
  return typeof employeeType === 'string' && employeeType.toLowerCase() === 'tts' ? 'short' : 'long';
}

// A contract of 3 months or more always pays insurance; a shorter one only when the insured flag is set and not 0.
export function isInsured(term: ContractTerm, insuredTag: number | null): boolean {
  return term === 'long' || (insuredTag !== null && insuredTag !== 0);
}
