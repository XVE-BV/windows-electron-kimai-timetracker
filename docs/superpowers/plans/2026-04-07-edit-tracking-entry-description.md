# Edit Tracking Entry Description — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to inline-edit the description of a running timer card in the tray view.

**Architecture:** UI-only change in `TrayView.tsx`. Click the description text on a running timer card to enter edit mode (textarea). Enter/blur saves via existing `kimaiUpdateDescription` IPC. Escape cancels. No backend, IPC, or type changes needed.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4

**Spec:** `docs/superpowers/specs/2026-04-07-edit-tracking-entry-description-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/components/TrayView.tsx` | Modify | Add edit state, save handler, replace static description with click-to-edit textarea |

No other files are touched.

---

### Task 1: Add edit state variables

**Files:**
- Modify: `src/components/TrayView.tsx:57-59`

- [ ] **Step 1: Add state declarations**

After the existing panel state declarations (line 59), add:

```tsx
// Inline description editing
const [editingTimerId, setEditingTimerId] = useState<number | null>(null);
const [editDescription, setEditDescription] = useState('');
```

- [ ] **Step 2: Verify app still compiles**

Run: `npm start` (or check terminal if already running)
Expected: No errors, app renders normally. New state is unused — that's fine.

- [ ] **Step 3: Commit**

```bash
git add src/components/TrayView.tsx
git commit -m "feat: add inline description edit state to TrayView"
```

---

### Task 2: Add save handler

**Files:**
- Modify: `src/components/TrayView.tsx` (after `handleDeleteTimesheet` around line 480)

- [ ] **Step 1: Add the handleSaveDescription function**

Insert after `handleDeleteTimesheet` (around line 480):

```tsx
const handleSaveDescription = async (timesheetId: number, newDescription: string, originalDescription: string) => {
  if (!window.electronAPI) return;
  if (newDescription === originalDescription) {
    setEditingTimerId(null);
    return;
  }
  try {
    await window.electronAPI.kimaiUpdateDescription(timesheetId, newDescription);
    setActiveTimers(prev => prev.map(t =>
      t.timesheetId === timesheetId ? { ...t, description: newDescription } : t
    ));
  } catch (error) {
    console.error('Failed to update description:', error);
    showError('Failed to update description');
  } finally {
    setEditingTimerId(null);
  }
};
```

- [ ] **Step 2: Verify app still compiles**

Run: Check terminal for errors.
Expected: No errors. Function is defined but not yet called.

- [ ] **Step 3: Commit**

```bash
git add src/components/TrayView.tsx
git commit -m "feat: add handleSaveDescription for inline timer editing"
```

---

### Task 3: Replace static description with click-to-edit

**Files:**
- Modify: `src/components/TrayView.tsx:1184-1188`

- [ ] **Step 1: Replace the description display block**

Find this block in the timer card (around lines 1184–1188):

```tsx
                  {timer.description && (
                    <div className="text-xs text-muted-foreground mt-1 ml-4 truncate">
                      {timer.description}
                    </div>
                  )}
```

Replace it with:

```tsx
                  <div className="mt-1 ml-4">
                    {editingTimerId === timer.timesheetId ? (
                      <textarea
                        value={editDescription}
                        onChange={(e) => setEditDescription(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSaveDescription(timer.timesheetId, editDescription, timer.description);
                          } else if (e.key === 'Escape') {
                            setEditingTimerId(null);
                          }
                        }}
                        onBlur={() => handleSaveDescription(timer.timesheetId, editDescription, timer.description)}
                        autoFocus
                        rows={2}
                        className="w-full px-2 py-1 text-xs bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary resize-none"
                        placeholder="What are you working on?"
                      />
                    ) : (
                      <button
                        onClick={() => {
                          setEditingTimerId(timer.timesheetId);
                          setEditDescription(timer.description);
                        }}
                        className="text-xs text-muted-foreground truncate block w-full text-left hover:text-foreground transition-colors"
                      >
                        {timer.description || 'Add description...'}
                      </button>
                    )}
                  </div>
```

- [ ] **Step 2: Verify the feature works end-to-end**

Manual test in the running app:
1. Start a timer with a description → the description shows in the timer card
2. Click the description → it becomes a textarea with the current text
3. Edit the text, press Enter → textarea disappears, new description shows
4. Click description again, press Escape → reverts to original, no API call
5. Click description, edit, click elsewhere (blur) → saves
6. Start a timer with no description → "Add description..." placeholder shows
7. Click the placeholder → empty textarea appears, type something, Enter → saves

Expected: All 7 scenarios work as described.

- [ ] **Step 3: Commit**

```bash
git add src/components/TrayView.tsx
git commit -m "feat: inline click-to-edit description on running timer cards"
```

---

### Task 4: Final verification

- [ ] **Step 1: Test with multiple timers**

1. Start two timers with different descriptions
2. Click description on timer 1 → edit mode
3. Click description on timer 2 → timer 1 saves via blur, timer 2 enters edit mode
4. Both descriptions should be correct after editing

- [ ] **Step 2: Test error handling**

1. Disconnect from the network (or temporarily break the Kimai API URL in settings)
2. Edit a description and press Enter
3. Expect: error toast appears, description reverts

- [ ] **Step 3: Test empty description**

1. Edit a description to empty string, press Enter
2. Expect: saves successfully, placeholder "Add description..." shows again
