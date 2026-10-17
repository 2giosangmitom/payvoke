import type { tags } from "typia";

export type Id = string & tags.Format<"uuid">;

export interface UserView {
  id: Id;
  displayName: string | null;
  avatarUrl: string | null;
  status: "active" | "suspended";
}

export interface ProfileUpdate {
  displayName?: string & tags.MinLength<1> & tags.MaxLength<100>;
  avatarUrl?: (string & tags.Format<"uri"> & tags.MaxLength<2048>) | null;
}

export interface ApiError {
  code: string;
  message: string;
}

export interface Principal {
  accountId: string;
}
