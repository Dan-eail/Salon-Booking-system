import { Facebook, Instagram, Mail, Phone, Send } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useMeta } from '@/hooks/queries';
import { Logo, Tilet } from '@/components/Art';

const col = 'space-y-2.5 text-[15px]';
const a = 'text-ivory/75 hover:text-ivory';
export function Footer() {
  const { data } = useMeta();
  const c = data?.contact;
  return (
    <footer className="mt-24 bg-plum text-ivory">
      <Tilet />
      <div className="container-page grid gap-10 py-14 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <Logo light />
          <p className="mt-4 max-w-xs text-[15px] leading-relaxed text-ivory/75">Book hair and nail salons across Addis Ababa. Prices in birr, real openings, no phone tag.</p>
          <div className="mt-5 flex gap-2">
            {[{ I: Instagram, l: 'Instagram' }, { I: Facebook, l: 'Facebook' }, { I: Send, l: 'Telegram' }].map(({ I, l }) => (
              <a key={l} href="#" onClick={(e) => e.preventDefault()} aria-label={`${l} (link to be added)`} className="grid h-10 w-10 place-items-center rounded-full border border-ivory/25 text-ivory/80 hover:bg-ivory/10"><I className="h-4 w-4" /></a>
            ))}
          </div>
        </div>
        <nav aria-label="For customers"><h2 className="mb-3 font-sans text-sm font-semibold text-gold">For customers</h2>
          <ul className={col}><li><Link className={a} to="/salons">Find a salon</Link></li><li><Link className={a} to="/#how">How booking works</Link></li><li><Link className={a} to="/login">Sign in</Link></li><li><Link className={a} to="/register">Create an account</Link></li></ul></nav>
        <nav aria-label="For salons"><h2 className="mb-3 font-sans text-sm font-semibold text-gold">For salons</h2>
          <ul className={col}><li><Link className={a} to="/for-salons">List your salon</Link></li><li><Link className={a} to="/register?type=owner">Owner sign-up</Link></li><li><Link className={a} to="/salon">Salon dashboard</Link></li></ul></nav>
        {(c?.phone || c?.email) && <div><h2 className="mb-3 font-sans text-sm font-semibold text-gold">Contact</h2>
          <ul className={col}>{c.phone && <li><a className={`${a} flex items-center gap-2`} href={`tel:${c.phone}`}><Phone className="h-4 w-4" aria-hidden />{c.phone}</a></li>}{c.email && <li><a className={`${a} flex items-center gap-2`} href={`mailto:${c.email}`}><Mail className="h-4 w-4" aria-hidden />{c.email}</a></li>}</ul></div>}
      </div>
      <div className="border-t border-ivory/15 py-5 text-center text-[13px] text-ivory/60">© {new Date().getFullYear()} Belle Ethiopia (working name). All prices in Ethiopian birr (ETB).</div>
    </footer>
  );
}
