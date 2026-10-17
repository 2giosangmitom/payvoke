import type { tags } from "typia";

export type Id = string & tags.Format<"uuid">;
export type Email = string & tags.Format<"email"> & tags.MaxLength<254>;
export type MemberRole = "owner" | "editor" | "viewer";
export type EditableRole = "editor" | "viewer";
export type ChallengePurpose = "email-login" | "email-link" | "wallet-login" | "wallet-link";

export interface EmailRequest {
  email: Email;
}
export interface EmailVerification {
  challengeId: Id;
  token: string & tags.Pattern<"^[0-9]{6,10}$">;
}
export interface WalletRequest {
  address: string & tags.Pattern<"^0x[0-9a-fA-F]{40}$">;
  chainId: 43113;
}
export interface WalletVerification {
  challengeId: Id;
  signature: string & tags.Pattern<"^0x[0-9a-fA-F]{130}$">;
}
export interface ChallengeView {
  challengeId: Id;
  expiresAt: string & tags.Format<"date-time">;
  message: string | null;
}
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  tokenType: "bearer";
  user: UserView;
}
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
export interface IdentityView {
  id: Id;
  method: "email" | "wallet";
  identifier: string;
}
export interface SessionView {
  id: Id;
  current: boolean;
  createdAt: string & tags.Format<"date-time">;
  expiresAt: string & tags.Format<"date-time">;
}
export interface MemberView {
  accountId: Id;
  role: MemberRole;
}
export interface AddMember {
  accountId: Id;
  role: EditableRole;
}
export interface ChangeMember {
  role: EditableRole;
}
export interface ApiError {
  code: string;
  message: string;
}
export interface Principal {
  accountId: string;
  subjectId: string;
  sessionId: string;
  authenticatedAt: Date;
}
