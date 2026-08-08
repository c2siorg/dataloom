# DataLoom

A web tool for wrangling tabular datasets. A User uploads a file into a Project,
applies Transformations to it, and can save, undo, or replay that work.

## Language

### Core

**Project**:
One uploaded dataset together with the history of work done to it, owned by a User.
_Avoid_: Dataset, file, workspace

**Transformation**:
A single change to a Project's data, expressed as an Operation plus its Action Details.
_Avoid_: Edit, mutation, op

**Operation**:
The kind of a Transformation — `filter`, `groupby`, `castDataType`. Every Operation
has one entry in the transformation registry, which owns its behaviour and its rules.
_Avoid_: Action type (that is the field name, not the concept), command

**Action Details**:
The parameters of one Transformation, stored verbatim so it can be replayed later
without consulting anything else.
_Avoid_: Params, payload, args

**Change Log**:
A Project's ordered record of every Transformation applied to it. It is the source
of truth for save, undo, and Checkpoint replay — the data file is derived from it.
_Avoid_: History (that is the UI's name for the panel), audit log

**Checkpoint**:
A save point marking the set of Transformations applied to a Project up to a moment.
_Avoid_: Snapshot, version, commit

### Inspection

**Quality Assessment**:
One scored appraisal of a Project's current data, listing the Issues found and the
fixes suggested for them. It is computed on demand and never stored.
_Avoid_: Quality report (Report is the document), audit, scan

**Report**:
The document a User downloads to hand a Project to someone else, assembled from
the Sections they choose. There is exactly one kind, and it is a PDF.
_Avoid_: Export (that is the data file), summary, dossier

**Section**:
One self-contained part of a Report — dataset overview, column profiles, quality,
provenance. The User chooses which Sections a Report carries.
_Avoid_: Block, chapter, panel

### Reuse

**Pipeline**:
A named, ordered sequence of Steps owned by a User and detached from any Project,
which the User replays onto a Project of their choosing.
_Avoid_: Recipe, macro, workflow, template

**Step**:
One replayable unit of a Pipeline, holding an Operation and its Action Details —
the same pair a Change Log entry holds.
_Avoid_: Stage, node, task

**Reusable Operation**:
An Operation whose meaning survives being moved to another Project, because it
addresses data by name rather than by position. Only these may become Steps.
_Avoid_: Portable, generic, safe

**Run**:
One application of a Pipeline to a Project. It appears in the Change Log as the
Transformations it produced, grouped together and undone together.
_Avoid_: Execution, invocation, job

**Compatibility Check**:
A dry run of a draft's Steps against a Project, reporting the first Step that
fails. It asks whether the Steps *can* run, never whether they *should*.
_Avoid_: Validation, eligibility, lint
