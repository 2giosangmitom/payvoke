import { Slider as SliderPrimitive } from "@base-ui/react/slider";
import { cn } from "cn";

type SliderProps = SliderPrimitive.Root.Props & {
  /** Accessible name for the thumb(s); Base UI puts it on the hidden range input. */
  thumbLabel?: string;
  getAriaValueText?: SliderPrimitive.Thumb.Props["getAriaValueText"];
  /** "line" is a hairline progress bar whose thumb appears on hover or focus. */
  size?: "default" | "line";
};

function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  thumbLabel,
  getAriaValueText,
  size = "default",
  ...props
}: SliderProps) {
  const line = size === "line";
  const _values = Array.isArray(value)
    ? value
    : Array.isArray(defaultValue)
      ? defaultValue
      : [min, max];

  return (
    <SliderPrimitive.Root
      className={cn("data-horizontal:w-full data-vertical:h-full", className)}
      data-slot="slider"
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      thumbAlignment="edge"
      {...props}
    >
      <SliderPrimitive.Control className="group/slider relative flex w-full touch-none items-center py-1.5 select-none data-disabled:opacity-50 data-vertical:h-full data-vertical:min-h-40 data-vertical:w-auto data-vertical:flex-col">
        <SliderPrimitive.Track
          data-slot="slider-track"
          className={cn(
            "relative grow overflow-hidden bg-border select-none data-horizontal:w-full data-vertical:h-full data-vertical:w-1",
            line
              ? "transition-[height] data-horizontal:h-0.5 group-hover/slider:data-horizontal:h-1"
              : "data-horizontal:h-1",
          )}
        >
          <SliderPrimitive.Indicator
            data-slot="slider-range"
            className="bg-primary select-none data-horizontal:h-full data-vertical:w-full"
          />
        </SliderPrimitive.Track>
        {Array.from({ length: _values.length }, (_, index) => (
          <SliderPrimitive.Thumb
            data-slot="slider-thumb"
            key={index}
            getAriaLabel={thumbLabel ? () => thumbLabel : undefined}
            getAriaValueText={getAriaValueText}
            className={cn(
              "relative block size-3 shrink-0 border border-primary bg-background transition-[scale,box-shadow,opacity] select-none after:absolute after:-inset-2 group-hover/slider:scale-110 focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-hidden active:scale-125 disabled:pointer-events-none disabled:opacity-50",
              line &&
                "size-2.5 bg-primary opacity-0 group-hover/slider:opacity-100 focus-visible:opacity-100 active:opacity-100",
            )}
          />
        ))}
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  );
}

export { Slider };
