/**
 * Shared props for the docked transform forms.
 *
 * A form is normally an apply-on-submit panel (opened from the Data ribbon). The
 * pipeline step builder reuses the same forms in "capture mode": when `onCapture`
 * is provided, the form validates and hands back the step it would have applied —
 * `{ action_type, action_details }`, the same pair a change-log row stores — instead
 * of previewing it against the current project.
 */
export interface CaptureStep {
  action_type: string;
  action_details: Record<string, unknown>;
}

export interface TransformFormProps {
  projectId: string;
  onClose: () => void;
  /** When set, capture the built step instead of applying it (pipeline builder). */
  onCapture?: (step: CaptureStep) => void;
}
