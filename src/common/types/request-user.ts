export type RequestUser = {
  userId: string;
  role: string;
  canRequestHelp?: boolean;
  canVolunteer?: boolean;
};
