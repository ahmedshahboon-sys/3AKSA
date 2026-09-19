import type { ReactNode } from 'react';
import type { UserCosmetics } from '@3aksa/api-client';
import { Link } from 'react-router-dom';
import { Icon } from './icons';
import type { Gender } from './data';
import { api } from './runtime';

export function Logo({ size = 52 }: { size?: number }) {
  return (
    <span className="brand-logo-wrap" style={{ width: size, height: size }}>
      <img className="brand-logo brand-logo-main" src={`${import.meta.env.BASE_URL}icons/logo-main-512.png`} width={size} height={size} alt="3AKSA" />
      <img className="brand-logo brand-logo-pink" src={`${import.meta.env.BASE_URL}icons/logo-pink-512.png`} width={size} height={size} alt="" aria-hidden="true" />
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

export function Avatar({
  name,online=true,gender,cosmetics
}:{name:string;online?:boolean;gender?:Gender;cosmetics?:UserCosmetics}){
  const frame=cosmetics?.frameCode?api.storeAssetUrl(cosmetics.frameCode):null;
  const badge=cosmetics?.badgeCode?api.storeAssetUrl(cosmetics.badgeCode):null;
  return (
    <span className="avatar-stack" aria-label={name}>
      <span className={`avatar ${gender?`avatar-${gender}`:''}`}>
        <span>{name.slice(0,1)}</span>
        {frame?<img className="avatar-frame" src={frame} alt="" aria-hidden="true"/>:null}
        {online?<i className="presence-dot" aria-label="متصل"/>:null}
      </span>
      {badge?<img className="avatar-badge" src={badge} alt={cosmetics?.badgeName||'شارة'}/>:cosmetics?.badgeName?<small className="avatar-badge-text">{cosmetics.badgeName}</small>:null}
    </span>
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
