/**
 * Shared props for the docked transform forms.
 *
 * A form is normally an apply-on-submit panel (opened from the Data ribbon). The
 * pipeline step builder reuses the same forms in "capture mode": when `onCapture`
 * is provided, the form validates and hands back the step it would have applied —
 * `{ action_type, action_details }`, the same pair a change-log row stores — instead
 * of previewing it against the current project.
 */
import type { PanelProps } from "../workspace/featureRegistry";

export interface CaptureStep {
  action_type: string;
  action_details: Record<string, unknown>;
}

export interface TransformFormProps extends PanelProps {
  /** When set, capture the built step instead of applying it (pipeline builder). */
  onCapture?: (step: CaptureStep) => void;
}

/** A transform payload: the operation plus its op-specific params bag. */
export type CapturablePayload = Record<string, unknown> & { operation_type: string };

/**
 * Hand a validated payload to the pipeline builder instead of applying it.
 *
 * Every transform form ends its submit handler the same way, so each one calls
 * this once the payload is built:
 *
 * ```ts
 * if (captureStep(onCapture, payload)) return;
 * ```
 *
 * @returns true when the step was captured and the form must stop; false in
 *   normal apply-on-submit mode, where the caller previews the payload as usual.
 */
export const captureStep = (
  onCapture: ((step: CaptureStep) => void) | undefined,
  payload: CapturablePayload,
): boolean => {
  if (!onCapture) return false;
  onCapture({ action_type: payload.operation_type, action_details: payload });
  return true;
};
