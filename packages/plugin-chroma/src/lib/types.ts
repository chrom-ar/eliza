export type SwapIntent = {
  amount?: string;
  sourceToken?: string;
  destinationToken?: string[];
  deadline?: number;
  status?: 'pending' | 'confirmed' | 'canceled';
}