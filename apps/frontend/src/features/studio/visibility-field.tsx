import { RadioGroup, RadioGroupItem } from "@/src/components/ui/radio-group";

type Visibility = "PUBLIC" | "PRIVATE";

/** Public/private store visibility, shared by the create form and app settings. */
export function VisibilityField({
  value,
  onChange,
  descriptions,
}: {
  value: Visibility;
  onChange: (value: Visibility) => void;
  descriptions: Record<Visibility, string>;
}) {
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-2 text-sm font-medium">Store visibility</legend>
      <RadioGroup
        value={value}
        onValueChange={(next) => onChange(next as Visibility)}
        className="grid gap-2 sm:grid-cols-2"
      >
        {(["PUBLIC", "PRIVATE"] as const).map((option) => (
          <label
            key={option}
            className="flex cursor-pointer items-start gap-3 border border-border bg-background-deep p-4 transition-colors hover:border-border-strong has-data-checked:border-primary has-data-checked:bg-primary-soft"
          >
            <RadioGroupItem value={option} className="mt-0.5" />
            <span className="grid gap-1">
              <strong className="text-sm font-semibold">
                {option === "PUBLIC" ? "Public" : "Private"}
              </strong>
              <small className="text-xs leading-relaxed text-muted-foreground">
                {descriptions[option]}
              </small>
            </span>
          </label>
        ))}
      </RadioGroup>
    </fieldset>
  );
}
