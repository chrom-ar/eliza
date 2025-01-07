export interface SwapIntent {
  amount?: string;
  sourceToken?: string;
  destinationToken?: string | string[];
  deadline?: number;
  status?: 'pending' | 'confirmed' | 'canceled';
}

export interface TransferIntent {
  amount?: string;
  token?: string;
  recipientAddress?: string;
  recipientChain?: string;
  deadline?: number;
  status?: 'pending' | 'confirmed' | 'canceled';
}
