import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "~/lib/api";
import { apiFailure, errorMessage } from "~/lib/provider-commands";
import { Button } from "~/components/ui/button";
import { Choice, ErrorState } from "./shared";

export function GatewayBinding({
  accountId,
  source,
  onChange,
  disabled,
}: {
  accountId: string;
  source: string;
  onChange: (source: string) => void;
  disabled: boolean;
}) {
  const [applicationId, setApplicationId] = useState("");
  const [error, setError] = useState("");
  const applications = useQuery({
    queryKey: ["provider", accountId, "applications"],
    queryFn: async ({ signal }) => {
      const result = await api.GET("/v1/provider/applications", { signal });
      if (!result.data) throw apiFailure(result.error);
      return result.data;
    },
  });
  const revision = useQuery({
    queryKey: ["provider", accountId, "commands", applicationId],
    enabled: !!applicationId,
    staleTime: 0,
    queryFn: async ({ signal }) => {
      const result = await api.GET("/v1/provider/applications/{applicationId}/commands", {
        params: { path: { applicationId } },
        signal,
      });
      if (result.error || !result.response.ok) throw apiFailure(result.error);
      return result.data ?? null;
    },
  });
  function pin() {
    setError("");
    try {
      if (!revision.data) return;
      const value = source.trim()
        ? JSON.parse(source)
        : {
            name: applications.data?.find((app) => app.id === applicationId)?.name ?? "",
            description: "",
            variants: [{ id: "default", model: "", description: "" }],
            pricing: { kind: "fixed", amountMinor: "0", currency: "test-credit" },
            limits: { inputChars: 8000, outputTokens: 2048, timeoutSeconds: 30 },
            dataPolicy: { destinations: [], retention: "", terms: "" },
          };
      if (!value || Array.isArray(value) || typeof value !== "object")
        throw new Error("The manifest must be a JSON object.");
      const {
        endpoint: _endpoint,
        actions: _actions,
        schemaVersion: _schemaVersion,
        runtime: _runtime,
        gateway: _gateway,
        ...common
      } = value;
      onChange(
        JSON.stringify(
          {
            ...common,
            schemaVersion: 2,
            gateway: { applicationId, commandRevisionId: revision.data.id },
            runtime: {
              protocol: "provider-gateway-v1",
              streaming: false,
              cancellation: false,
              startDeduplication: true,
              statusRecovery: true,
            },
          },
          null,
          2,
        ),
      );
    } catch (error) {
      setError(errorMessage(error));
    }
  }
  return (
    <div className="gateway-binding">
      <h3>Gateway command binding</h3>
      <p className="market-caption">
        Optional: use a Gateway v2 manifest instead of an HTTP endpoint. Pin an immutable revision,
        then complete the description, model and data disclosures in JSON.
      </p>
      {applications.error ? (
        <ErrorState
          message={applications.error.message}
          retry={() => void applications.refetch()}
        />
      ) : (
        <Choice
          label="Bind application"
          value={applicationId}
          options={[
            { value: "", label: "Select an application" },
            ...(applications.data ?? []).map((app) => ({ value: app.id, label: app.name })),
          ]}
          disabled={disabled || applications.isPending}
          onChange={setApplicationId}
        />
      )}
      {applicationId &&
        (revision.error ? (
          <p role="alert" className="market-form-error">
            {revision.error.message}
          </p>
        ) : revision.isPending ? (
          <p role="status" className="market-caption">
            Loading command revision…
          </p>
        ) : revision.data ? (
          <>
            <p className="market-caption market-mono">Revision {revision.data.id}</p>
            <p className="market-caption">
              {revision.data.commands.map((command) => `/${command.name}`).join(", ") ||
                "No commands"}
            </p>
            <Button
              type="button"
              variant="outline"
              disabled={disabled || !revision.data.commands.length}
              onClick={pin}
            >
              Pin this command revision
            </Button>
          </>
        ) : (
          <p className="market-caption">Register commands from your provider SDK first.</p>
        ))}
      {error && (
        <p role="alert" className="market-form-error">
          {error}
        </p>
      )}
    </div>
  );
}
