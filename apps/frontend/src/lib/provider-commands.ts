import type { paths } from "./schema";

export type ProviderApplication =
  paths["/v1/provider/applications"]["get"]["responses"][200]["content"]["application/json"][number];
export type CommandRevision = NonNullable<
  paths["/v1/provider/applications/{applicationId}/commands"]["get"]["responses"][200]["content"]["application/json"]
>;
export type SlashCommand = CommandRevision["commands"][number];
export type CommandInvocation =
  paths["/v1/conversations/{id}/command-invocations"]["get"]["responses"][200]["content"]["application/json"][number];
export type CommandSource =
  paths["/v1/conversations/{id}/commands"]["get"]["responses"][200]["content"]["application/json"][number];
export function apiFailure(error?: { message: string }) {
  return new Error(error?.message ?? "The service is unavailable. Please try again.");
}
export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "The request failed. Please try again.";
}
export function isActiveInvocation(invocation: Pick<CommandInvocation, "state">) {
  return invocation.state === "queued" || invocation.state === "running";
}
export function commandFields(
  command: SlashCommand,
  values: Record<string, string>,
  maxChars?: number,
) {
  const input = Object.fromEntries(
    Object.keys(command.inputSchema.properties)
      .filter((name) => command.inputSchema.required.includes(name) || !!values[name])
      .map((name) => [name, values[name] ?? ""]),
  );
  if (new TextEncoder().encode(JSON.stringify(input)).length > 32768)
    throw new Error("Keep the complete input under 32 KiB.");
  if (
    maxChars !== undefined &&
    Object.values(input).reduce((total, value) => total + value.length, 0) > maxChars
  )
    throw new Error(
      `The pinned manifest allows up to ${maxChars.toLocaleString()} input characters in total.`,
    );
  return input;
}
