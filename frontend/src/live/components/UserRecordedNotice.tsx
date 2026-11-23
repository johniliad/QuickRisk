import { Alert } from '@/components/ui/alert';
import {
  USER_RECORDED_EXPLANATION,
  USER_RECORDED_LABEL,
} from '@/live/content/liveIntegrity';

/** The mandatory saved/shared-value integrity disclosure. */
export function UserRecordedNotice() {
  return (
    <Alert tone="warning" title={USER_RECORDED_LABEL}>
      <p className="m-0">{USER_RECORDED_EXPLANATION}</p>
    </Alert>
  );
}
