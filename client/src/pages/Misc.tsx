import { CalendarClock, ChartNoAxesCombined, ClipboardCheck, Users } from 'lucide-react';
import { ArchArt, Tilet } from '@/components/Art';
import { ButtonLink } from '@/components/ui';

export function NotFound() {
  return (
    <div className="container-page grid min-h-[60dvh] place-items-center py-16 text-center">
      <div><div className="mx-auto mb-6 w-32"><ArchArt kind="hair" className="aspect-[4/5] w-full overflow-hidden rounded-arch" /></div>
        <h1 className="text-5xl">Page not found</h1><p className="mx-auto mt-3 max-w-sm text-ink-soft">The link may be old or mistyped. Let’s get you back to finding a salon.</p>
        <div className="mt-6 flex justify-center gap-3"><ButtonLink to="/">Go home</ButtonLink><ButtonLink to="/salons" variant="outline">Find a salon</ButtonLink></div></div>
    </div>
  );
}
export function Unauthorized() {
  return (
    <div className="container-page grid min-h-[60dvh] place-items-center py-16 text-center">
      <div><h1 className="text-5xl">This area isn’t for your account</h1><p className="mx-auto mt-3 max-w-md text-ink-soft">You’re signed in, but your account type doesn’t include this page. If you think that’s a mistake, contact the platform team.</p>
        <div className="mt-6"><ButtonLink to="/">Back to Belle Ethiopia</ButtonLink></div></div>
    </div>
  );
}

const perks = [
  { i: CalendarClock, t: 'A diary that fills itself', b: 'Clients book the hours you open, for the services you offer, with the stylist they pick. No double-bookings, ever.' },
  { i: Users, t: 'Your team, your rules', b: 'Set shifts, breaks and days off per person. Assign services to the people who do them.' },
  { i: ClipboardCheck, t: 'Approve or auto-confirm', b: 'Confirm every request yourself, or let bookings through instantly. Set your own cancellation window.' },
  { i: ChartNoAxesCombined, t: 'Numbers you can trust', b: 'Booked value and money actually collected are reported separately. Export to CSV any time.' },
];
export function ForSalons() {
  return (
    <>
      <section className="container-page grid items-center gap-10 py-16 lg:grid-cols-[1.2fr_0.8fr]">
        <div><h1 className="max-w-[16ch] text-5xl sm:text-6xl">Fewer phone calls. A fuller diary.</h1>
          <p className="mt-6 max-w-[54ch] text-lg text-ink-soft">Belle Ethiopia gives your salon an online booking page and a simple dashboard to run it. Clients see real openings in birr; you stay in control of who, when and how.</p>
          <div className="mt-8 flex flex-wrap gap-3"><ButtonLink to="/register?type=owner" size="lg">List your salon</ButtonLink><ButtonLink to="/login" size="lg" variant="outline">Owner sign in</ButtonLink></div>
          <p className="mt-4 text-sm text-ink-soft">New salons are reviewed before they appear to customers.</p></div>
        <div className="mx-auto w-full max-w-xs"><ArchArt kind="hair" seed={5} className="aspect-[4/5] w-full overflow-hidden rounded-arch shadow-lift" /></div>
      </section>
      <Tilet />
      <section className="container-page py-16"><ul className="grid gap-x-10 gap-y-10 sm:grid-cols-2">{perks.map((p) => <li key={p.t} className="flex gap-5"><p.i className="mt-1 h-7 w-7 shrink-0 text-burgundy" aria-hidden /><div><h2 className="text-2xl">{p.t}</h2><p className="mt-2 text-[15px] text-ink-soft">{p.b}</p></div></li>)}</ul></section>
    </>
  );
}
