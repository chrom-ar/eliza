export interface SwapIntent {
  amount?: string;
  sourceToken?: string;
  sourceChain?: string;
  destinationToken?: string | string[];
  destinationChain?: string;
  deadline?: number;
}
