# Omarchy Site Design — Osaka Jade

## Overview

Omarchy presents a Linux desktop through a terminal-inspired visual language: a deep forest-green canvas, warm cream text, muted jade actions, square controls, and a large pixel wordmark. The interface combines the precision of **JetBrains Mono** for body copy and controls with **Geist** for headings. Product screenshots and interactive showcases supply the richness; the surrounding interface stays restrained.

The signature is the **pixel lattice**. The hero and header share a cell geometry derived from an 81-column wordmark, allowing decorative pixels and interface elements to align. The other defining rule is equally explicit: every named corner-radius token, from extra-small through 4XL, resolves to **0px**. Even components whose classes say `rounded-lg` or `rounded-xl` render square.

This specification uses **Osaka Jade**: muted jade `#509475` on forest green `#111c18`, with warm cream `#f7e8b2` primary text and olive-tinted secondary text. Activate it with `data-theme="osaka-jade"` on the theme root. The upstream CSS defaults to Tokyo Night; Osaka Jade is the selected palette for this document. Preserve semantic color roles throughout the interface.

**Key characteristics:**

- Pixel wordmarks and a shared geometric lattice establish the identity.
- Square corners extend across buttons, fields, cards, and portrait imagery.
- Monospace reading and UI text contrast with compact sans-serif headings.
- Thin borders and outline-like shadows separate surfaces.
- Wide screenshot rails coexist with narrower prose columns.
- Theme switching changes the complete palette, including illustration colors and contrast treatments.
- Focus indicators, reduced-motion behavior, and mobile reflow are part of the implementation.

Sources: [shared styles](https://github.com/omacom/omarchy-site/blob/master/src/styles.css), [site header](https://github.com/omacom/omarchy-site/blob/master/src/components/SiteHeader.tsx).

### Scope and notation

Extracted from the current `master` source on 2026-10-22. This describes the Osaka Jade palette and shared site implementation, not the Omarchy operating system UI or archived HTML styling. Sources are linked by section; `master` links can change. No browser-rendered visual audit was performed.

Names such as `{colors.canvas}` are documentation aliases introduced here, not token names exported by the project. The tables map them to actual CSS variables. Pixel conversions assume a 16px root size. Recommendations are explicitly distinguished from source measurements.

## Colors

### Selected palette: Osaka Jade

| Documentation token | Source variable | Value | Role |
|---|---|---|---|
| `{colors.canvas}` | `--t-bg` | `#111c18` | Page background |
| `{colors.canvas-deep}` | `--t-bg-deep` | `#0c1512` | Recessed media and code backgrounds |
| `{colors.surface}` | `--t-surface` | `#1a2a22` | Cards, popovers, outline-button fill |
| `{colors.surface-raised}` | `--t-surface-2` | `#23372b` | Hover states, secondary controls, inline code |
| `{colors.hairline}` | `--t-border-subtle` | `#23372b` | Quiet dividers and table borders |
| `{colors.border-strong}` | `--t-border-strong` | `#53685b` | Input and outline-button edges |
| `{colors.ink}` | `--t-text` | `#f7e8b2` | Primary text |
| `{colors.body}` | `--t-text-secondary` | `#c1c497` | Descriptions and reading text |
| `{colors.muted}` | `--t-text-muted` | `#969978` | Captions, metadata, placeholders |
| `{colors.primary}` | `--t-brand` | `#509475` | Primary actions, focus outlines, accents |
| `{colors.primary-soft}` | `--t-brand-soft` | `#5094751f` | Translucent accent tint, approximately 12% opacity |
| `{colors.on-primary}` | `--t-brand-ink` | `#0c0e10` | Text on filled primary controls |
| `{colors.selection}` | `--t-selection` | `#32473b` | Selected text background |

### Supporting accents

These auxiliary colors are shared upstream constants named `tn-*`; Osaka Jade does not override them. They are not Osaka Jade’s core palette or evidence of six independent semantic status systems. Use the jade theme roles above for ordinary surfaces and actions.

| Source token | Exact value |
|---|---|
| `--color-tn-blue` | `oklch(0.719 0.132 264.2)` |
| `--color-tn-purple` | `oklch(0.751 0.134 299.5)` |
| `--color-tn-cyan` | `oklch(0.82 0.105 235.7)` |
| `--color-tn-orange` | `oklch(0.787 0.137 50.6)` |
| `--color-tn-red` | `oklch(0.723 0.159 10.3)` |
| `--color-tn-yellow` | `oklch(0.784 0.106 75.4)` |

The destructive role explicitly uses the red value. Focus rings use the current theme's brand color.

### Pixel-field colors

The hero has its own tonal ramp: background `#090f0d`, dim `#1e372c`, mid `#35614d`, lit `#509475`, hover `#84b49e`, and crest `#bcd6cb`. These are `--t-field-*` variables, separate from ordinary content surfaces. Do not flatten this ramp into a single green.

### Theme behavior

Osaka Jade supplies the complete dark palette through `[data-theme='osaka-jade']`, including `color-scheme: dark`. Use the selected theme's values for every surface, border, text role, selection state, and pixel-field shade.

The header has specialized rendering colors:

| Source variable | Osaka Jade value |
|---|---|
| `--t-hdr-text` | `#fff7bf` |
| `--t-hdr-text-2` | `#cad3a4` |
| `--t-hdr-brand` | `#59a382` |
| `--t-hdr-ink` | `#151d1d` |
| `--t-hdr-surface-2` | `#2c4638` |
| `--t-hdr-surface` | `#23382e` |

The scrollbar thumb is `rgb(255 255 255 / 0.14)`. One upstream exception remains: `.dark-scope` pins the explore galaxy to Tokyo Night values even when Osaka Jade is selected. Preserve that exception for an exact reproduction; overriding it with Osaka Jade would be an intentional adaptation.

Source for all color values and theme mappings: [shared palette definitions](https://github.com/omacom/omarchy-site/blob/master/src/styles.css).

## Typography

### Font families

**JetBrains Mono Variable** is the default font for `html`, `body`, and the app. It gives descriptions, navigation, controls, commands, and metadata their terminal character. **Geist Variable** is assigned to headings `h1`–`h6`; table headers also explicitly use it. The source loads Geist weights 100–900 and JetBrains Mono weights 100–800, including mono italics. This is not a two-weight-only system.

### Hierarchy

| Documentation token | Family | Size | Weight | Line height / spacing | Use |
|---|---|---|---|---|---|
| `{typography.section}` | Geist | 24px; 28px from 640px | 600 | Tight tracking | Homepage section titles |
| `{typography.prose-heading}` | Geist | 20px | 600 | `-0.01em` tracking | Prose h2 |
| `{typography.prose-subheading}` | Geist | 16.8px | 600 | `-0.01em` tracking | Prose h3 |
| `{typography.body}` | JetBrains Mono | 15px | Inherited regular | 1.65 in prose | Reading text |
| `{typography.description}` | JetBrains Mono | 15px | Inherited regular | 1.625 | Section descriptions |
| `{typography.page-label}` | Geist when rendered as h1 | 12px; 14px from 640px | 500 | Uppercase, `0.18em` tracking | Subtitle beneath page wordmark |
| `{typography.card-title}` | Geist | 14px | 500 | Tailwind `text-sm` | Theme-card title |
| `{typography.ui}` | JetBrains Mono | 14px | 500 | Tailwind `text-sm` | Default button |
| `{typography.caption}` | JetBrains Mono | 12–13px | Inherited regular | Context-dependent | Author labels and figure captions |
| `{typography.code}` | JetBrains Mono | 13px | Inherited regular | Inherits prose rhythm | Block code |
| `{typography.command}` | JetBrains Mono | 11px; 14px from 640px | Inherited regular | Wraps on mobile | Copyable installation command |
| `{typography.input}` | JetBrains Mono | 16px | Inherited regular | Tailwind `text-base` | Search field |

The hero wordmark is graphic lettering tied to a pixel grid, not a large instance of the body font. `PageHeading` can also render its subtitle as a paragraph, in which case the default mono family applies.

### Principles

- Use the sans-serif heading family to separate titles from the mono texture of content.
- Keep reading text compact without compressing line height.
- Reserve widely tracked uppercase text for labels; do not apply it to paragraphs.
- Use actual graphic wordmarks where brand lettering is required.
- If fonts are unavailable, the declared fallbacks are `sans-serif` and `monospace`; exact metrics require the bundled fonts.

Sources: [styles and prose](https://github.com/omacom/omarchy-site/blob/master/src/styles.css), [SectionHeading](https://github.com/omacom/omarchy-site/blob/master/src/components/SectionHeading.tsx), [PageHeading](https://github.com/omacom/omarchy-site/blob/master/src/components/PageHeading.tsx), [ThemeCard](https://github.com/omacom/omarchy-site/blob/master/src/components/ThemeCard.tsx).

## Layout

### Spacing system

The components use Tailwind spacing utilities rather than a separate named spacing scale. The following aliases summarize recurring measurements; they are an extracted working scale, not additional project variables.

| Token | Value | Observed use |
|---|---|---|
| `{spacing.xs}` | 4px | Command-row gap |
| `{spacing.sm}` | 8px | Description top margin, default button icon gap |
| `{spacing.md}` | 12px | Small-button horizontal padding, search icon inset |
| `{spacing.lg}` | 16px | Card padding, mobile container inset |
| `{spacing.xl}` | 24px | Wider container inset, mobile section-action top margin |
| `{spacing.xxl}` | 32px | Page-header bottom spacing on mobile |
| `{spacing.3xl}` | 40px | Page-header bottom spacing from 640px |

Intermediate values such as 6px and 10px also occur. Avoid claiming an exclusive 8px grid.

### Containers and rails

- Header shell: `max-w-6xl` (72rem / 1152px), with 16px horizontal padding increasing to 24px at 640px.
- Full-bleed rail content alignment: maximum 69rem / 1104px; minimum gutters of 16px, increasing to 24px at 640px.
- Prose measure: `--measure: 48rem` / 768px. Individual prose elements are constrained and centered so structural grids can remain wider.
- Section descriptions: normally `max-w-xl` / 576px, with a roomier `max-w-2xl` / 672px option.
- Sticky header height: `3.5rem + env(safe-area-inset-top, 0px)`; anchor scroll offsets use the same variable.

### Whitespace philosophy

Reading and controls are compact, while imagery is allowed more width. Section headings align with their rails even when the rail extends across the viewport. This alignment, repeated borders, and controlled text measures create order without placing every paragraph inside a card.

The homepage starts with a viewport-height hero, then moves through introduction, video, installation, and product/community showcases. Hero actions stack on phones and become a row at 640px. Installation cards become two columns at 768px; the introduction becomes an asymmetric two-column layout at 1024px. Section padding grows from 48px to 96–112px in wider layouts. Sources: [homepage composition](https://github.com/omacom/omarchy-site/blob/master/src/astro/pages/HomePage.tsx), [responsive card rail](https://github.com/omacom/omarchy-site/blob/master/src/components/CardRail.tsx).

### Responsive strategy

| Width | Verified behavior |
|---|---|
| Below 640px | Navigation collapses into a mobile menu; section actions move below content; installation command uses 11px type and wraps at spaces |
| 640px and above | Desktop navigation appears; section actions sit beside headings; gutters become 24px; section headings grow to 28px; command uses 14px type and a single line |
| 1024px and above | Selected header glyphs and controls use pixel-cell-derived dimensions |

These are observed component breakpoints, not a claim that every layout changes at the same widths. Header and body account for device safe areas. Rail focus outlines are inset to avoid clipping.

### Images

Theme cards use 16:9 desktop screenshots with `object-cover` and a 1200 × 675 intrinsic size. Prose images retain their aspect ratio with `max-width: 100%` and automatic height. Team portraits use square crops with `object-fit: cover`. Images receive a subtle inset outline where the `img-outlined` utility is applied.

Sources: [shared geometry and responsive CSS](https://github.com/omacom/omarchy-site/blob/master/src/styles.css), [SiteHeader](https://github.com/omacom/omarchy-site/blob/master/src/components/SiteHeader.tsx), [SectionHeading](https://github.com/omacom/omarchy-site/blob/master/src/components/SectionHeading.tsx), [InstallCommand](https://github.com/omacom/omarchy-site/blob/master/src/components/InstallCommand.tsx), [ThemeCard](https://github.com/omacom/omarchy-site/blob/master/src/components/ThemeCard.tsx).

## Elevation & Depth

| Treatment | Osaka Jade value | Use |
|---|---|---|
| Resting elevation | `0 0 0 1px oklch(1 0 0 / 0.07)` | Cards and command blocks |
| Hover elevation | `0 0 0 1px oklch(1 0 0 / 0.13)` | Interactive elevated surfaces |
| Image outline | `1px solid rgb(255 255 255 / 0.1)`, offset `-1px` | Screenshot edge definition |
| Focus outline | `2px solid var(--t-brand)`, offset `2px` | Keyboard interaction |

Osaka Jade elevation is effectively an outline, without a floating drop shadow. Use the theme’s resting and hover rings to separate surfaces; do not import the shallow drop shadows used by upstream light themes.

The shared stacking scale is navigation 100, dropdown 200, modal 300, tooltip 400. The mobile navigation uses a darkened backdrop and blur. Decorative hero effects belong to a dedicated field rather than a generic gradient applied to every surface.

Source: [shared elevation and stacking tokens](https://github.com/omacom/omarchy-site/blob/master/src/styles.css), [mobile navigation](https://github.com/omacom/omarchy-site/blob/master/src/components/SiteHeader.tsx).

## Shapes

| Token | Value | Use |
|---|---|---|
| `{rounded.square}` | 0px | All named radius tokens from `--radius-xs` to `--radius-4xl` |
| `{border.hairline}` | 1px | Input edges, dividers, image outlines |
| `{border.emphasis}` | 2px | Focus outlines, prose blockquote left edge |

Square geometry is structural. Preserve it when adapting component libraries: a library class containing `rounded` must not silently restore rounded corners. Portraits in the inspected team styles are square rather than automatically circular.

Source: [radius overrides and portrait styles](https://github.com/omacom/omarchy-site/blob/master/src/styles.css).

## Components

### Buttons

**`button-primary`** — main action

- Theme brand fill and on-brand label; 500 weight; square corners.
- Default: 40px height, 16px horizontal padding, 14px text, 8px gap, 20px icons.
- Hover mixes the brand color with 14% white in OKLCH.
- Active state scales to 0.96; transitions last 150ms with ease-out.

**`button-outline`** — secondary action

- Strong border, surface fill, primary text; hover and expanded states use the second surface.

**`button-secondary`** / **`button-ghost`**

- Secondary has a second-surface fill; ghost begins without an explicit fill and acquires that surface on hover or expansion.

**`button-destructive`** / **`button-link`**

- Destructive uses red text on a 10% red fill, increasing to 20% on hover.
- Link uses brand text and a hover underline.

Sizes: XS 32px / 12px text; SM 36px / 14px; default 40px / 14px; LG 44px / 15px. Icon-only sizes follow the same heights. Disabled controls use 50% opacity and suppress pointer events. Do not assume every native control has a 44px visual box; expanded hit regions are added in some components.

Source: [button variants](https://github.com/omacom/omarchy-site/blob/master/src/components/ui/button.tsx).

### Cards & containers

**`theme-card`** — screenshot-led product record

- Square surface with resting/hover elevation and clipped overflow.
- 16:9 screenshot above a 16px-padded body.
- 14px medium Geist title; 12px muted mono author; 6px internal gap.
- Title link stretches across the card. Keyboard focus draws a 2px inset brand outline.

**`prose-code-block`**

- Deep canvas, theme elevation, `1em 1.25em` padding, horizontal overflow, 13px mono code.

**`prose-table`**

- Collapsed 1px subtle borders, 14px text, `0.5em 0.75em` cell padding.
- Header cells use surface fill and 600-weight sans-serif text.

Sources: [ThemeCard](https://github.com/omacom/omarchy-site/blob/master/src/components/ThemeCard.tsx), [prose components](https://github.com/omacom/omarchy-site/blob/master/src/styles.css).

### Inputs

**`search-field`**

- 40px high; square; strong 1px border; deep canvas fill.
- 16px input text with muted placeholder, a 20px magnifier inset 12px from the left, and 40px left text padding.
- Right padding is 12px normally or 40px when a trailing control is present.
- Uses an accessible label and a 2px brand focus outline.

Source: [SearchField](https://github.com/omacom/omarchy-site/blob/master/src/components/SearchField.tsx).

### Navigation & headings

**`site-header`**

- Compact 56px base bar with navigation, brand glyph, theme/language utilities, and action controls.
- Mobile menu appears beneath the bar on a near-opaque canvas with a bottom rule and backdrop blur.
- Hero navigation includes a separate blend layer; preserve this specialized contrast behavior if reproducing the hero.

**`section-heading`**

- Flex row with wrapping, 16px gap, title and optional description on the left, action on the right.
- Mobile repeats the action below the section rather than squeezing it beside the title.

**`page-heading`**

- Graphic wordmark above a centered uppercase accent subtitle, followed by 32px / 40px bottom space.

Sources: [SiteHeader](https://github.com/omacom/omarchy-site/blob/master/src/components/SiteHeader.tsx), [SectionHeading](https://github.com/omacom/omarchy-site/blob/master/src/components/SectionHeading.tsx), [PageHeading](https://github.com/omacom/omarchy-site/blob/master/src/components/PageHeading.tsx).

### Signature components

**`theme-picker`** — interactive palette preview

- Overlapping parallelogram previews give the theme selector a distinctive shape within the otherwise rectangular interface.
- Arrow keys move through the deck; Enter selects; Escape dismisses.
- Touch swipes exceeding 44px advance the deck.
- Treat this as a palette-preview interaction, rather than replacing it with unrelated decorative cards.

Source: [ThemePicker](https://github.com/omacom/omarchy-site/blob/master/src/components/ThemePicker.tsx).

**`pixel-field`** — identity geometry

- Shared cell width: `min((100cqw - 48px) * 0.88, 896px) / 81`.
- Cell height: width multiplied by `50 / 51`.
- Field colors progress from dim pixels to bright hover and crest values.

**`install-command`** — copyable terminal instruction

- Deep canvas with thin elevation ring; jade `$` prompt; selectable command; copy icon on the right.
- Copy feedback swaps the icon for a brand-colored check for 1500ms.
- Uses a 300ms spring swap with zero bounce; reduced motion removes the animated swap.
- The 32px copy button extends its hit region by 8px on all sides. On mobile the command wraps instead of widening the page.

**`typed-caret`** — terminal cursor

- Brand-colored block, `0.1em` wide and `1em` high; 1.06-second stepped blink.
- Stops blinking during typing and is hidden when reduced motion is requested.

Sources: [pixel geometry and caret](https://github.com/omacom/omarchy-site/blob/master/src/styles.css), [InstallCommand](https://github.com/omacom/omarchy-site/blob/master/src/components/InstallCommand.tsx).

## Motion & Interaction

Ordinary interaction is quick and restrained: 150ms ease-out transitions for buttons, card elevation, and link underlines. Prose links keep their underline at rest, changing its color toward the brand on hover. Smooth anchor scrolling becomes immediate with reduced motion. Theme changes use a `.no-transitions` override to prevent independently tweening component colors.

Recommended adaptation rule: retain clear static states before adding hero effects. Copy feedback, focus, selected states, and content readability must remain understandable when animation is disabled.

Sources: [interaction styles](https://github.com/omacom/omarchy-site/blob/master/src/styles.css), [button states](https://github.com/omacom/omarchy-site/blob/master/src/components/ui/button.tsx).

## Do's and Don'ts

### Do

- Keep corners square, including library components with misleading rounded utility names.
- Route surfaces, text, focus, and actions through theme roles.
- Pair JetBrains Mono content with Geist headings.
- Align wide rails with section titles and constrain prose separately.
- Use real desktop imagery with restrained outlines and consistent aspect ratios.
- Preserve visible keyboard focus, selectable commands, and reduced-motion behavior.
- Treat the pixel wordmark and its cell geometry as the signature visual element.

### Don't

- Do not turn the system into pill buttons, rounded cards, or circular portraits by default.
- Do not substitute Tokyo Night’s bright lime and lavender for Osaka Jade’s muted jade and warm cream.
- Do not put heavy floating shadows on Osaka Jade cards.
- Do not replace every mono paragraph with a generic sans-serif body font.
- Do not stretch a long terminal command beyond the mobile viewport.
- Do not invent pricing cards, commerce widgets, or status meanings and describe them as extracted components.
- Do not copy legacy page styles without checking the shared implementation.

These are adaptation guidelines derived from the source patterns above, not additional claims about components that were not inspected.
