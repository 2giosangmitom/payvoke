import { TypedBody, TypedException, TypedParam, TypedRoute } from "@nestia/core";
import { Controller, HttpCode } from "@nestjs/common";
import { CurrentPrincipal } from "../auth/auth.guard.js";
import { httpValue } from "../shared/identity-http.js";
import type {
  AddMember,
  ApiError,
  ChangeMember,
  Id,
  MemberView,
  Principal,
} from "../identity.types.js";
import { ProjectAccessService } from "./project-access.service.js";

@Controller("v1/projects/:projectId/members")
export class IdentityMembershipController {
  constructor(private readonly access: ProjectAccessService) {}

  /**
   * List members of an authorized project.
   * @security bearer
   */
  @TypedRoute.Get()
  @TypedException<ApiError>({ status: 401 })
  @TypedException<ApiError>({ status: 404 })
  async list(
    @CurrentPrincipal() principal: Principal,
    @TypedParam("projectId") projectId: Id,
  ): Promise<MemberView[]> {
    return httpValue(await this.access.members(principal, projectId));
  }

  /**
   * Add an existing account to a project as editor or viewer.
   * @security bearer
   */
  @HttpCode(204)
  @TypedRoute.Post()
  @TypedException<ApiError>({ status: 401 })
  @TypedException<ApiError>({ status: 403 })
  @TypedException<ApiError>({ status: 404 })
  @TypedException<ApiError>({ status: 409 })
  async add(
    @CurrentPrincipal() principal: Principal,
    @TypedParam("projectId") projectId: Id,
    @TypedBody() input: AddMember,
  ): Promise<void> {
    httpValue(
      await this.access.changeMember(principal, projectId, input.accountId, input.role, true),
    );
  }

  /**
   * Change a non-owner membership.
   * @security bearer
   */
  @HttpCode(204)
  @TypedRoute.Patch(":accountId")
  @TypedException<ApiError>({ status: 401 })
  @TypedException<ApiError>({ status: 403 })
  @TypedException<ApiError>({ status: 404 })
  @TypedException<ApiError>({ status: 409 })
  async change(
    @CurrentPrincipal() principal: Principal,
    @TypedParam("projectId") projectId: Id,
    @TypedParam("accountId") accountId: Id,
    @TypedBody() input: ChangeMember,
  ): Promise<void> {
    httpValue(await this.access.changeMember(principal, projectId, accountId, input.role));
  }

  /**
   * Remove a non-owner membership.
   * @security bearer
   */
  @HttpCode(204)
  @TypedRoute.Delete(":accountId")
  @TypedException<ApiError>({ status: 401 })
  @TypedException<ApiError>({ status: 403 })
  @TypedException<ApiError>({ status: 404 })
  @TypedException<ApiError>({ status: 409 })
  async remove(
    @CurrentPrincipal() principal: Principal,
    @TypedParam("projectId") projectId: Id,
    @TypedParam("accountId") accountId: Id,
  ): Promise<void> {
    httpValue(await this.access.changeMember(principal, projectId, accountId, null));
  }
}
