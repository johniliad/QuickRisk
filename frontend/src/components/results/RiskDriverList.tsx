import { Table, TableHead, TableBody, TableCell, TableHeaderCell, TableRow, TableWrap } from '@/components/ui/table';
import type { ScenarioResult } from '@/domain/results';
import { formatDriverValue } from '@/lib/format';

/**
 * Modelled-component list for one scenario.
 *
 * Shows the modelled intermediate values with their units, so an executive or analyst
 * can see why the result looks the way it does. All values originate from the server. These
 * are components of the modelled expected annual loss, not a sensitivity analysis.
 */
export function RiskDriverList({ scenario, symbol }: { scenario: ScenarioResult; symbol: string }) {
  return (
    <TableWrap>
      <Table>
        <caption className="mb-2 text-left text-small text-muted">
          Modelled intermediate values for {scenario.shortLabel}. These are simulated averages, not fixed inputs.
        </caption>
        <TableHead>
          <TableRow>
            <TableHeaderCell>Modelled component</TableHeaderCell>
            <TableHeaderCell>Modelled value</TableHeaderCell>
            <TableHeaderCell>Meaning</TableHeaderCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {scenario.drivers.map((driver) => (
            <TableRow key={driver.code}>
              <TableCell className="font-semibold">{driver.label}</TableCell>
              <TableCell>{formatDriverValue(driver.value, driver.unit, symbol)}</TableCell>
              <TableCell className="text-muted">{driver.detail}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableWrap>
  );
}
