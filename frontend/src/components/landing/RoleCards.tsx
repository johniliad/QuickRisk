import { ArrowRight, Briefcase, ShieldCheck, Target } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LANDING_ROLES, type LandingRoleKey } from '@/content/landingJourney';

/**
 * Who the tool is for.
 *
 * The same baseline is read by three audiences and the output each one needs is
 * different. Naming the audience and the artefact it produces lets a visitor decide in
 * seconds whether QuickRisk is the right instrument, instead of inferring it from a
 * feature list.
 */
const roleIcons: Record<LandingRoleKey, typeof Briefcase> = {
  board: Briefcase,
  ciso: ShieldCheck,
  'risk-manager': Target,
};

export function RoleCards() {
  return (
    <section aria-labelledby="roles-heading" className="mt-10 grid gap-4">
      <h2 id="roles-heading" className="m-0 text-title font-bold text-heading">
        Who is this for?
      </h2>
      <p className="m-0 max-w-[48rem] text-muted">
        One assessment, three readers. Each one gets a different artefact from the same baseline.
      </p>
      <div className="grid gap-4 md:grid-cols-3">
        {LANDING_ROLES.map((role) => {
          const Icon = roleIcons[role.key];

          return (
            <Card key={role.key} className="h-full">
              <CardHeader>
                <Icon aria-hidden="true" className="size-6 text-accent-strong" />
                <CardTitle>{role.title}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 text-small">
                <p className="m-0 text-muted">{role.summary}</p>
                <ul className="m-0 grid gap-1 pl-4 text-micro text-muted">
                  {role.outputs.map((output) => (
                    <li key={output}>{output}</li>
                  ))}
                </ul>
                <p className="m-0 flex items-center gap-1 text-micro font-semibold text-accent-strong">
                  <ArrowRight aria-hidden="true" className="size-3" />
                  {role.producedBy}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}