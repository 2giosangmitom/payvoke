import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from "@nestjs/common";
import type { FastifyReply } from "fastify";
import type { ApiError } from "../identity.types.js";

@Catch(HttpException)
export class IdentityExceptionFilter implements ExceptionFilter<HttpException> {
  catch(exception: HttpException, host: ArgumentsHost): void {
    const response = exception.getResponse();
    const status = exception.getStatus();
    const body: ApiError =
      typeof response === "object" &&
      response !== null &&
      "code" in response &&
      typeof response.code === "string" &&
      "message" in response &&
      typeof response.message === "string"
        ? { code: response.code, message: response.message }
        : {
            code: status === 400 ? "INVALID_REQUEST" : `HTTP_${status}`,
            message: status === 400 ? "Invalid request." : exception.message,
          };
    void host.switchToHttp().getResponse<FastifyReply>().status(status).send(body);
  }
}
