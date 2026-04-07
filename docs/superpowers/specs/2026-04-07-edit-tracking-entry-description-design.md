# Edit Description on Running Timer Card

**Date:** 2026-04-07
**Status:** Draft
**Branch:** `edit-tracking-entry`

## Summary

Allow users to edit the description of a running timer directly from the timer card in the tray view, using an inline click-to-edit pattern.

## Motivation

After the multi-timer feature was shipped, users can run multiple concurrent timers. However, there's no way to edit a timer's description after it starts — you'd have to stop it, go to Kimai's web UI, edit it, then restart. This is disruptive. Users should be able to fix a typo or add context without interrupting their tracking session.

## Scope

- **In scope:** Editing the description text on a running timer card
- **Out of scope:** Editing project, activity, customer, or Jira ticket on a running timer

## Design

### Interaction

1. **Display mode (default):** The description line in each timer card is clickable. If no description exists, a faint "Add description..." placeholder is shown and is also clickable.
2. **Edit mode:** Clicking the description replaces it with a `<textarea>` pre-filled with the current description. The textarea is auto-focused.
3. **Save:** On **Enter** (without Shift) or **blur**, the new description is persisted via the existing `kimaiUpdateDescription` IPC channel, which updates both Kimai (with tracking prefix) and the local ActiveTimer store.
4. **Cancel:** On **Escape**, the textarea reverts to the original text and exits edit mode.
5. **Error:** If the API call fails, the existing error toast is shown and the description reverts.

### State Changes (TrayView.tsx only)

Two new state variables:

- `editingTimerId: number | null` — which timer card is in edit mode (`null` = none)
- `editDescription: string` — the current textarea value while editing

### Data Flow

```
User clicks description
  → editingTimerId = timer.timesheetId
  → editDescription = timer.description

User types
  → editDescription updates locally

User presses Enter / blurs
  → call kimaiUpdateDescription(timesheetId, editDescription)
  → on success: update activeTimers state with new description, editingTimerId = null
  → on failure: show error toast, revert editDescription, editingTimerId = null

User presses Escape
  → editingTimerId = null (no API call)
```

### Backend

**No changes required.** The existing infrastructure handles everything:

- `IPC_CHANNELS.KIMAI_UPDATE_DESCRIPTION` — validates input, adds tracking prefix, calls Kimai PATCH, updates local store
- `updateActiveTimer()` in store — already supports partial updates
- `kimaiUpdateDescription()` in preload — already exposed to renderer

### UI Details

- The textarea should match the existing description text styling (text-xs, text-muted-foreground) so the transition feels seamless.
- Textarea height: 2 rows, resizable vertically if needed.
- Only one timer can be in edit mode at a time. Clicking a different timer's description triggers blur → save on the current one, then opens the new one.
- The clickable description area should have a subtle hover indicator (e.g., slight background change or underline) to hint at editability.

### Edge Cases

- **Empty description:** Allowed. User can clear their description entirely.
- **Multiple timers:** Only one editable at a time; switching saves the previous via blur.
- **Timer stops while editing:** The timer card unmounts. No save needed — whatever was on Kimai already is fine.
- **Rapid edits:** Each save is independent. No debouncing needed since saves are triggered by explicit user action (Enter/blur), not on every keystroke.
- **Network failure:** Show error toast, revert to previous description in UI.

## Files Changed

| File | Change |
|------|--------|
| `src/components/TrayView.tsx` | Add `editingTimerId` and `editDescription` state. Add `handleSaveDescription` function. Replace static description line in timer card with click-to-edit textarea. |

No changes to: `types.ts`, `preload.ts`, `index.ts`, `store.ts`, `kimai.ts`.
