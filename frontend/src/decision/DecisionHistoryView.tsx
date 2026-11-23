/**
 * Decision Lab — saved analyses.
 *
 * The list is scoped to the current anonymous session. Opening an entry replays the stored
 * comparison and Board Risk Pack exactly as saved; nothing is recalculated and no assessment
 * answers are stored or displayed.
 */

import { ArrowLeft, Archive, FileText, History, Printer, Share2, ShieldOff } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  TableWrap,
} from '@/components/ui/table';
import { formatMoney } from '@/lib/format';
import { BranchNote } from '@/components/layout/BranchNote';
import { DECISION_BRANCH_NOTE } from '@/content/dataLifecycle';
import {
  decisionApi,
  DecisionApiError,
  type SavedDecisionSummary,
  type StoredDecision,
} from '@/decision/api/decisionClient';
import { BoardRiskPack } from '@/decision/board/BoardRiskPack';
import { buildStoredBoardReport } from '@/decision/board/storedReport';
import { useLiveStore } from '@/live/state/liveStore';
import { useAssessmentStore } from '@/state/assessmentStore';

const formatDate = (isoTimestamp: string): string => {
  const parsed = new Date(isoTimestamp);
  if (Number.isNaN(parsed.getTime())) {
    return isoTimestamp;
  }

  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(parsed);
};

const errorText = (caught: unknown): string =>
  caught instanceof DecisionApiError || caught instanceof Error
    ? caught.message
    : 'The saved analyses could not be loaded.';

export function DecisionHistoryView() {
  const setView = useAssessmentStore((state) => state.setView);
  const initSession = useLiveStore((state) => state.initSession);
  const sessionLabel = useLiveStore((state) => state.sessionLabel);

  const [records, setRecords] = useState<readonly SavedDecisionSummary[]>([]);
  const [selected, setSelected] = useState<StoredDecision | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const csrfToken = await initSession();
      if (csrfToken === null) {
        throw new Error('The anonymous session could not be prepared.');
      }
      setRecords(await decisionApi.list(csrfToken));
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy(false);
    }
  }, [initSession]);

  useEffect(() => {
    void load();
  }, [load]);

  const open = useCallback(
    async (publicId: string) => {
      setBusy(true);
      setError(null);
      setMessage(null);
      setShareUrl(null);
      try {
        const csrfToken = await initSession();
        if (csrfToken === null) {
          throw new Error('The anonymous session could not be prepared.');
        }
        setSelected(await decisionApi.get(publicId, csrfToken));
      } catch (caught) {
        setError(errorText(caught));
      } finally {
        setBusy(false);
      }
    },
    [initSession],
  );

  const archive = useCallback(
    async (publicId: string) => {
      if (!globalThis.confirm('Archive this saved analysis? Its share link will stop working.')) {
        return;
      }
      setBusy(true);
      setError(null);
      try {
        const csrfToken = await initSession();
        if (csrfToken === null) {
          throw new Error('The anonymous session could not be prepared.');
        }
        await decisionApi.archive(publicId, csrfToken);
        setRecords((current) => current.filter((entry) => entry.publicId !== publicId));
        setSelected((current) => (current?.publicId === publicId ? null : current));
        setShareUrl(null);
        setMessage('Saved analysis archived. Existing share links no longer work.');
      } catch (caught) {
        setError(errorText(caught));
      } finally {
        setBusy(false);
      }
    },
    [initSession],
  );

  const share = useCallback(
    async (publicId: string) => {
      setBusy(true);
      setError(null);
      try {
        const csrfToken = await initSession();
        if (csrfToken === null) {
          throw new Error('The anonymous session could not be prepared.');
        }
        const created = await decisionApi.createShare(publicId, csrfToken);
        setShareUrl(created.shareUrl);
        setSelected((current) =>
          current?.publicId === publicId ? { ...current, hasActiveShare: true } : current,
        );
        setRecords((current) =>
          current.map((entry) =>
            entry.publicId === publicId ? { ...entry, hasActiveShare: true } : entry,
          ),
        );
        setMessage('Read-only Board Risk Pack link created.');
      } catch (caught) {
        setError(errorText(caught));
      } finally {
        setBusy(false);
      }
    },
    [initSession],
  );

  const revoke = useCallback(async () => {
    const publicId = selected?.publicId;
    if (publicId === undefined) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const csrfToken = await initSession();
      if (csrfToken === null) {
        throw new Error('The anonymous session could not be prepared.');
      }
      await decisionApi.revokeShare(publicId, csrfToken);
      setShareUrl(null);
      setSelected((current) =>
        current?.publicId === publicId ? { ...current, hasActiveShare: false } : current,
      );
      setRecords((current) =>
        current.map((entry) =>
          entry.publicId === publicId ? { ...entry, hasActiveShare: false } : entry,
        ),
      );
      setMessage('Board Risk Pack link revoked.');
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy(false);
    }
  }, [initSession, selected]);

  const report = useMemo(
    () => (selected === null ? null : buildStoredBoardReport(selected)),
    [selected],
  );

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="m-0 text-micro font-bold uppercase tracking-[0.13em] text-accent-strong">
            Decision Lab history
          </p>
          <h1 className="m-0 text-[var(--text-title)] font-bold text-heading">Saved decision analyses</h1>
          <p className="m-0 text-small text-muted">
            {sessionLabel === null
              ? 'Your anonymous session is being prepared.'
              : `Session ${sessionLabel} · saved analyses are technical state in this browser session only.`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => setView('decision-lab')}>
            <ArrowLeft aria-hidden="true" className="size-4" />
            Start a new analysis
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void load()} disabled={busy}>
            <History aria-hidden="true" className="size-4" />
            Refresh
          </Button>
        </div>
      </div>

      <BranchNote>{DECISION_BRANCH_NOTE}</BranchNote>

      {error === null ? null : <Alert tone="danger" role="alert">{error}</Alert>}
      {message === null ? null : <Alert tone="info" role="status">{message}</Alert>}
      {shareUrl === null ? null : (
        <Alert tone="info" title="Read-only Board Risk Pack link">
          <p className="m-0 break-all">{shareUrl}</p>
        </Alert>
      )}
      {shareUrl === null && selected?.hasActiveShare === true ? (
        <Alert tone="info" title="An active share link exists">
          <p className="m-0">
            The existing link cannot be displayed again, but it can be revoked from the controls
            above.
          </p>
        </Alert>
      ) : null}

      {selected === null ? (
        <Card>
          <CardHeader>
            <CardTitle>Analyses in this session</CardTitle>
            <p className="m-0 text-small text-muted">
              A saved analysis is a snapshot of the comparison and the report basis used at the time.
              It does not contain your assessment answers and cannot be recalculated here. Clearing cookies
              ends access to this list.
            </p>
          </CardHeader>
          <CardContent>
            {records.length === 0 ? (
              <p className="m-0 text-small text-muted">
                No saved Decision Lab analyses yet. Calculate a comparison, then use “Save decision
                analysis”.
              </p>
            ) : (
              <TableWrap>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHeaderCell>Created (UTC)</TableHeaderCell>
                      <TableHeaderCell>Title</TableHeaderCell>
                      <TableHeaderCell>Baseline EAL</TableHeaderCell>
                      <TableHeaderCell>Residual EAL</TableHeaderCell>
                      <TableHeaderCell>Investment</TableHeaderCell>
                      <TableHeaderCell>Status</TableHeaderCell>
                      <TableHeaderCell>Actions</TableHeaderCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {records.map((entry) => (
                      <TableRow key={entry.publicId}>
                        <TableCell>{formatDate(entry.createdAt)}</TableCell>
                        <TableCell>
                          <span className="font-semibold text-heading">{entry.title}</span>
                          <span className="block text-micro text-muted">
                            Methodology {entry.decisionMethodologyVersion}
                          </span>
                        </TableCell>
                        <TableCell>{formatMoney(entry.baselineEal)}</TableCell>
                        <TableCell>{formatMoney(entry.treatedEal)}</TableCell>
                        <TableCell>{formatMoney(entry.initialInvestment)}</TableCell>
                        <TableCell>
                          {entry.appetiteStatus} · {entry.status}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => void open(entry.publicId)}
                              disabled={busy}
                            >
                              <FileText aria-hidden="true" className="size-3.5" />
                              Open
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => void share(entry.publicId)}
                              disabled={busy}
                            >
                              <Share2 aria-hidden="true" className="size-3.5" />
                              Share
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => void archive(entry.publicId)}
                              disabled={busy}
                            >
                              <Archive aria-hidden="true" className="size-3.5" />
                              Archive
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableWrap>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">

          <div className="qk-no-print flex flex-wrap items-center justify-between gap-2">
            <Button size="sm" variant="secondary" onClick={() => setSelected(null)}>
              <ArrowLeft aria-hidden="true" className="size-4" />
              Back to saved analyses
            </Button>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => void share(selected.publicId)} disabled={busy}>
                <Share2 aria-hidden="true" className="size-4" />
                Share
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void revoke()}
                disabled={busy || (shareUrl === null && selected.hasActiveShare !== true)}
              >
                <ShieldOff aria-hidden="true" className="size-4" />
                Revoke link
              </Button>
              <Button size="sm" onClick={() => globalThis.print()} disabled={report === null}>
                <Printer aria-hidden="true" className="size-4" />
                Print / save as PDF
              </Button>
            </div>
          </div>

          <Alert tone="info" title="Saved snapshot">
            <p className="m-0">
              Created {formatDate(selected.createdAt)} · QuickRisk model {selected.quickriskModelId}{' '}
              {selected.quickriskModelVersion} · Decision Lab methodology {selected.decisionMethodologyVersion}.
              This report is replayed from the stored values; it is not a fresh calculation.
            </p>
          </Alert>

          {report === null ? (
            <Alert tone="warning" title="Stored report incomplete">
              <p className="m-0">
                This record does not contain a stored comparison, so the Board Risk Pack cannot be shown.
                Start a new analysis to produce a complete report.
              </p>
            </Alert>
          ) : (
            <BoardRiskPack report={report} readOnly />
          )}
        </div>
      )}
    </div>
  );
}

