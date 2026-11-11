import { ArrowLeft, FileText, History, Share2 } from 'lucide-react';
import { useEffect } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow, TableWrap } from '@/components/ui/table';
import { formatMoney } from '@/lib/format';
import { LiveDisclaimer, SimulationBadge } from '@/live/components/SimulationBadge';
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

/**
 * Anonymous assessment history.
 *
 * The list is returned by the PHP API for the current anonymous session only. There is no
 * account and no global list, so a different browser sees a different history.
 */
export function LiveHistoryView() {
  const setView = useAssessmentStore((state) => state.setView);
  const history = useLiveStore((state) => state.history);
  const error = useLiveStore((state) => state.error);
  const sessionLabel = useLiveStore((state) => state.sessionLabel);
  const loadHistory = useLiveStore((state) => state.loadHistory);
  const initSession = useLiveStore((state) => state.initSession);
  const openAssessment = useLiveStore((state) => state.openAssessment);
  const archiveAssessment = useLiveStore((state) => state.archiveAssessment);
  const duplicateAssessment = useLiveStore((state) => state.duplicateAssessment);
  const createShare = useLiveStore((state) => state.createShare);
  const shareUrl = useLiveStore((state) => state.shareUrl);

  useEffect(() => {
    void initSession().then(() => loadHistory());
  }, [initSession, loadHistory]);

  return (
    <div className="grid gap-6">
      <SimulationBadge />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="m-0 text-micro font-bold uppercase tracking-[0.13em] text-accent-strong">
            Anonymous assessment history
          </p>
          <h1 className="m-0 text-[var(--text-title)] font-bold text-heading">Saved QuickRisk Live assessments</h1>
          <p className="m-0 text-small text-muted">
            {sessionLabel === null
              ? 'Your anonymous session is being prepared.'
              : `Session ${sessionLabel} · stored server-side as anonymous technical state.`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => setView('live')}>
            <ArrowLeft aria-hidden="true" className="size-4" />
            Back to the simulator
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void loadHistory()}>
            <History aria-hidden="true" className="size-4" />
            Refresh
          </Button>
        </div>
      </div>

      {error === null ? null : <Alert tone="danger" role="alert">{error}</Alert>}
      {shareUrl === null ? null : (
        <Alert tone="info" title="Share link created">
          <p className="m-0 break-all">{shareUrl}</p>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Assessments in this session</CardTitle>
          <p className="m-0 text-small text-muted">
            Clearing cookies, changing browser or using another device ends access to this history. A share
            link remains valid until it is revoked.
          </p>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="m-0 text-small text-muted">
              No saved assessments yet. Use “Save assessment” in the simulator to create one.
            </p>
          ) : (
            <TableWrap>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>Created (UTC)</TableHeaderCell>
                    <TableHeaderCell>Title / scenario</TableHeaderCell>
                    <TableHeaderCell>Risk</TableHeaderCell>
                    <TableHeaderCell>Multiplier</TableHeaderCell>
                    <TableHeaderCell>Real-Time EAL</TableHeaderCell>
                    <TableHeaderCell>Status</TableHeaderCell>
                    <TableHeaderCell>Actions</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {history.map((entry) => (
                    <TableRow key={entry.publicId}>
                      <TableCell>{formatDate(entry.createdAt)}</TableCell>
                      <TableCell>
                        <span className="font-semibold text-heading">
                          {entry.title === '' ? entry.scenarioName : entry.title}
                        </span>
                        <span className="block text-micro text-muted">
                          {entry.scenarioName} · v{entry.methodologyVersion}
                        </span>
                      </TableCell>
                      <TableCell className="font-semibold">
                        {entry.realTimeRisk} — {entry.riskBand}
                      </TableCell>
                      <TableCell>{entry.socMultiplier.toFixed(2)}x</TableCell>
                      <TableCell>{formatMoney(entry.realTimeEal)}</TableCell>
                      <TableCell>{entry.status}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          <Button size="sm" variant="ghost" onClick={() => void openAssessment(entry.publicId)}>
                            Open
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              void openAssessment(entry.publicId).then(() => setView('live-executive'));
                            }}
                          >
                            <FileText aria-hidden="true" className="size-3.5" />
                            Executive
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              void openAssessment(entry.publicId).then(() => createShare());
                            }}
                          >
                            <Share2 aria-hidden="true" className="size-3.5" />
                            Share
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => void duplicateAssessment(entry.publicId)}
                          >
                            Duplicate
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => void archiveAssessment(entry.publicId)}>
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

      <LiveDisclaimer />
    </div>
  );
}
