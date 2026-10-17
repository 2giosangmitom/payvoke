import { Type } from "typebox";

export const UserViewSchema = Type.Object({
  id: Type.String({ format: "uuid" }),
  displayName: Type.Union([Type.String(), Type.Null()]),
  avatarUrl: Type.Union([Type.String(), Type.Null()]),
  status: Type.Union([Type.Literal("active"), Type.Literal("suspended")]),
});

export const ProfileUpdateSchema = Type.Object({
  displayName: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
  avatarUrl: Type.Optional(
    Type.Union([Type.String({ format: "uri", maxLength: 2048 }), Type.Null()]),
  ),
});

export const ApiErrorSchema = Type.Object({
  code: Type.String(),
  message: Type.String(),
});
