export type HelpRequestStatus =
  | 'pending'
  | 'claimed'
  | 'en_route'
  | 'arrived'
  | 'completed'
  | 'canceled';

export const STATUS_FLOW: Record<HelpRequestStatus, HelpRequestStatus[]> = {
  pending: ['claimed', 'canceled'],
  claimed: ['en_route', 'canceled'],
  en_route: ['arrived', 'canceled'],
  arrived: ['completed'],
  completed: [],
  canceled: [],
};

export function canTransition(from: HelpRequestStatus, to: HelpRequestStatus) {
  return STATUS_FLOW[from]?.includes(to) ?? false;
}
