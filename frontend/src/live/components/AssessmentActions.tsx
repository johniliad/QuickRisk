import { Copy, FileText, History, Save, Share2, ShieldOff } from 'lucide-react';
import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { USER_RECORDED_EXPLANATION } from '@/live/content/liveIntegrity';

/**
 * Persistence and reporting actions.
 *
 * Saving, sharing and the executive view are always explicit user actions; nothing is
 * published or stored while the user is moving controls.
 */
export function AssessmentActions({
  title,
  onTitleChange,
  onSave,
  onUpdate,
  onShare,
  onRevokeShare,
  onExecutive,
  onHistory,
  shareUrl,
  publicId,
  hasActiveShare,
  saveStatus,
  busy,
  message,
  error,
  sessionLabel,
}: {
  title: string;
  onTitleChange: (title: string) => void;
  onSave: () => void;
  onUpdate: () => void;
  onShare: () => void;
  onRevokeShare: () => void;
  onExecutive: () => void;
  onHistory: () => void;
  shareUrl: string | null;
  publicId: string | null;
  hasActiveShare: boolean;
  saveStatus: 'saved' | 'edited' | 'unsaved';
  busy: boolean;
  message: string | null;
  error: string | null;
  sessionLabel: string | null;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (shareUrl === null) {
      return;
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Save, share and report</CardTitle>
        <p className="m-0 text-small text-muted">
          {sessionLabel === null
            ? 'Your anonymous session is being prepared.'
            : `Anonymous session: ${sessionLabel}. This is not an account: clearing cookies ends access to this history.`}
        </p>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="grid gap-1">
          <label className="text-micro font-semibold uppercase tracking-[0.08em] text-muted" htmlFor="live-title">
            Assessment title
          </label>
          <input
            id="live-title"
            className="min-h-9 w-full max-w-md rounded-control border border-border bg-paper px-3 text-small"
            value={title}
            maxLength={160}
            onChange={(event) => onTitleChange(event.target.value)}
            placeholder="e.g. Ransomware rehearsal — finance"
          />
        </div>

        <p className="m-0 text-small text-muted" role="status">
          {saveStatus === 'saved'
            ? 'Saved. The stored assessment matches the current simulation.'
            : saveStatus === 'edited'
              ? 'Unsaved changes. The stored assessment and any share link still describe the last saved state.'
              : 'Not saved. Saving is an explicit action; nothing is stored while you move the controls.'}
        </p>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={onSave} disabled={busy}>
            <Save aria-hidden="true" className="size-4" />
            Save assessment
          </Button>
          <Button size="sm" variant="secondary" onClick={onUpdate} disabled={busy || publicId === null || saveStatus === 'saved'}>
            Update saved assessment
          </Button>
          <Button size="sm" variant="secondary" onClick={onShare} disabled={busy || publicId === null || saveStatus !== 'saved'}>
            <Share2 aria-hidden="true" className="size-4" />
            Share assessment
          </Button>
          <Button size="sm" variant="ghost" onClick={onExecutive} disabled={publicId === null}>
            <FileText aria-hidden="true" className="size-4" />
            Executive view
          </Button>
          <Button size="sm" variant="ghost" onClick={onHistory}>
            <History aria-hidden="true" className="size-4" />
            Assessment history
          </Button>
        </div>

        {shareUrl === null && !hasActiveShare ? null : (
          <div className="grid gap-2 rounded-control border border-accent-strong/30 bg-accent-soft p-3">
            <p className="m-0 text-small font-semibold text-heading">
              {shareUrl === null
                ? 'An active read-only link exists for this saved assessment'
                : 'Read-only user-recorded data link created'}
            </p>
            {shareUrl === null ? (
              <p className="m-0 text-small text-muted">
                For security, the existing URL cannot be shown again. You can revoke it here, or
                create a replacement link.
              </p>
            ) : (
              <p className="m-0 break-all text-small text-ink">{shareUrl}</p>
            )}
            <p className="m-0 text-micro text-muted">{USER_RECORDED_EXPLANATION}</p>
            <div className="flex flex-wrap gap-2">
              {shareUrl === null ? null : (
                <Button size="sm" variant="secondary" onClick={copy}>
                  <Copy aria-hidden="true" className="size-4" />
                  {copied ? 'Copied' : 'Copy link'}
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={onRevokeShare} disabled={busy}>
                <ShieldOff aria-hidden="true" className="size-4" />
                Revoke share link
              </Button>
            </div>
          </div>
        )}

        {message === null ? null : <Alert tone="info" role="status">{message}</Alert>}
        {error === null ? null : <Alert tone="danger" role="alert">{error}</Alert>}
      </CardContent>
    </Card>
  );
}
