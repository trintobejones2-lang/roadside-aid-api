export type RequestUser = {
  userId: string;
  role: string;
  canRequestHelp: boolean;
  canVolunteer: boolean;
  isAdmin?: boolean;
  fraudFlagCount: number;
  isBlocked: boolean;
};
