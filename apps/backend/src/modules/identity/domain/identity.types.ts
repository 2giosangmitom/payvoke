export interface UserView {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
  status: "active" | "suspended";
}

export interface ProfileUpdate {
  displayName?: string;
  avatarUrl?: string | null;
}

export interface Principal {
  accountId: string;
}
