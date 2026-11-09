# Premium UI v4 (branch `claude/premium-ui-v4`)

A design-system pass on top of the existing app. `main` is unchanged.

- **Tokens** (`src/index.css`, "THEME v4"): 4/8px spacing scale, 6/8/12/16 radii, motion durations + easing, neutral palette with one restrained indigo accent, light + dark, hairline borders, calm shadows. Inter + JetBrains Mono.
- **Motion** (framer-motion): page transitions, animated modal / drawer / toasts, spring drawer, respects `prefers-reduced-motion`.
- **Loading**: `Skeleton`, `SkeletonRows`, `SkeletonCards`; the boot screen is a skeleton app shell instead of a text line.
- **DataTable** (`src/components/DataTable.tsx`, TanStack Table v8): sort, search, resize, show/hide columns, row selection, pagination, CSV export, layout remembered per table. Used on Deadline radar, Appeals, Underpayments, Bulk history.
- **Forms**: react-hook-form + zod with inline validation (pilot: Admin → Scorecard rules).
- **Already in the app**: ⌘K command palette, collapsible sidebar, breadcrumbs, dark/light, toasts, slide-over drawers, kanban (dnd-kit), charts (Recharts), notification center, undo (bulk), role-based UI.
- **Quiet navigation**: underline tabs, soft active state in sidebar and hub strip.

## Preview
Branch deploy: enable `claude/premium-ui-v4` in Netlify → Build & deploy → Branches. URL: `https://claude-premium-ui-v4--<site>.netlify.app`.
