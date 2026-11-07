import { flagLines, flaggedNewestFirst, VERIFICATION_LABELS } from "@/lib/data/exchange-rates/series";
import type { RateObservation } from "@/lib/data/exchange-rates/quality";
import { formatDate } from "@/lib/format";

/**
 * Every observation Nidex questioned, with the values exactly as the CBN published them,
 * why it was questioned, and what was done about it. Nothing here is corrected.
 */
export function FlaggedRecords({ observations }: { observations: RateObservation[] }) {
  const flagged = flaggedNewestFirst(observations);

  return (
    <details className="rounded-xl border border-line bg-surface">
      <summary className="cursor-pointer px-5 py-4 text-[15px] font-semibold">
        Flagged records ({flagged.length})
      </summary>
      <div className="flex flex-col gap-4 border-t border-line p-5">
        <p className="text-sm leading-relaxed text-muted">
          These published values failed one of Nidex&apos;s checks. They are shown here exactly as the CBN
          published them, never corrected or deleted. Suspicious values are hidden from the chart unless
          you choose to show them; invalid ones are left off the chart.
        </p>
        {flagged.length === 0 ? (
          <p className="text-[15px] text-muted">No observations are flagged for this currency.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-line text-[13px] font-medium text-muted">
                  <th scope="col" className="py-2 pr-4">Date</th>
                  <th scope="col" className="py-2 pr-4">As published (buy / mid / sell)</th>
                  <th scope="col" className="py-2 pr-4">What was found</th>
                  <th scope="col" className="py-2 pr-4">Treatment</th>
                  <th scope="col" className="py-2">Outside check</th>
                </tr>
              </thead>
              <tbody>
                {flagged.map((o) => {
                  const lines = flagLines(o);
                  const invalid = lines.some((l) => l.status === "invalid");
                  return (
                    <tr key={o.date} className="border-b border-line align-top last:border-b-0">
                      <td className="whitespace-nowrap py-3 pr-4">{formatDate(o.date)}</td>
                      <td className="whitespace-nowrap py-3 pr-4 font-mono text-xs tabular-nums">
                        {o.raw.buy} / {o.raw.mid} / {o.raw.sell}
                      </td>
                      <td className="py-3 pr-4">
                        <ul className="flex flex-col gap-1.5">
                          {lines.map((l) => (
                            <li key={l.label} className="leading-snug">
                              <span className="font-medium">{l.label}</span>{" "}
                              <span className="text-xs text-muted">({l.status})</span>: {l.message}
                            </li>
                          ))}
                        </ul>
                      </td>
                      <td className="py-3 pr-4 text-muted">
                        {invalid ? "Left off the chart" : "Hidden unless flagged values are shown"}
                      </td>
                      <td className="py-3 text-muted">
                        {VERIFICATION_LABELS[o.verification]}
                        {o.verificationNote && (
                          <span className="mt-1 block text-xs leading-snug">{o.verificationNote}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </details>
  );
}