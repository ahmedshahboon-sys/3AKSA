import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from './icons';
import type { Gender } from './data';

export function Logo({ size = 52 }: { size?: number }) {
  return (
    <span className="brand-logo-wrap" style={{ width: size, height: size }}>
      <img className="brand-logo brand-logo-main" src={`${import.meta.env.BASE_URL}icons/logo-main-128.png`} width={size} height={size} alt="3AKSA" />
      <img className="brand-logo brand-logo-pink" src={`${import.meta.env.BASE_URL}icons/logo-pink-128.png`} width={size} height={size} alt="" aria-hidden="true" />
    </span>
  );
}

export function Header() {
  return (
    <header className="topbar">
      <Link className="brand-lockup link-reset" to="/">
        <Logo size={44} />
        <div>
          <strong>3AKSA</strong>
          <span>عكسة</span>
        </div>
      </Link>
      <Link className="icon-button" to="/notifications" aria-label="الإشعارات">
        <Icon name="bell" />
        <span className="notification-dot" />
      </Link>
    </header>
  );
}

export function SectionTitle({ title, action, actionTo }: { title: string; action?: string; actionTo?: string }) {
  return (
    <div className="section-title">
      <h2>{title}</h2>
      {action && actionTo ? <Link className="text-button link-reset" to={actionTo}>{action}</Link> : action ? <button type="button" className="text-button">{action}</button> : null}
    </div>
  );
}

export function Avatar({ name, online = true, gender }: { name: string; online?: boolean; gender?: Gender }) {
  return (
    <div className={`avatar ${gender ? `avatar-${gender}` : ''}`} aria-label={name}>
      <span>{name.slice(0, 1)}</span>
      {online ? <i className="presence-dot" aria-label="متصل" /> : null}
    </div>
  );
}

export function ScreenHeader({ title, eyebrow, backTo, trailing }: { title: string; eyebrow?: string; backTo?: string; trailing?: ReactNode }) {
  return (
    <div className="screen-heading">
      <div className="heading-with-back">
        {backTo ? <Link className="icon-button compact" to={backTo} aria-label="رجوع"><Icon name="back" /></Link> : null}
        <div>{eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}<h1>{title}</h1></div>
      </div>
      {trailing}
    </div>
  );
}

export function StatusCard({ title, body, icon = 'info' }: { title: string; body: string; icon?: 'info' | 'offline' | 'empty' | 'error' }) {
  return (
    <section className={`state-card state-${icon}`}>
      <span className="state-icon">{icon === 'offline' ? '↯' : icon === 'error' ? '!' : icon === 'empty' ? '…' : 'i'}</span>
      <div><b>{title}</b><p>{body}</p></div>
    </section>
  );
}

export function V1GuardNote() {
  return <p className="v1-note">V1: نص · تسجيلات صوتية · ملصقات · تفاعلات · هدايا. بدون صور أو مكالمات صوت/فيديو.</p>;
}
