'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, Ban, Check, LogOut, RefreshCw, ShieldCheck, Trash2, Unlock } from 'lucide-react';
import { COLORS } from '@/lib/colors';
import AdminNotifications from '@/components/AdminNotifications';

type PrintRequest = { id: string; created_at: string; name: string; email: string; description: string; color: string; quantity: number; ip: string; status: 'new' | 'contacted' };
type BlockedIp = { id: string; ip: string; reason: string; created_at: string };

export default function Admin() {
  const [authenticated, setAuthenticated] = useState(false);
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [requests, setRequests] = useState<PrintRequest[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const refreshVersion = useRef(0);
  const [blocks, setBlocks] = useState<BlockedIp[]>([]);
  const [tab, setTab] = useState<'requests' | 'blocks'>('requests');
  const [ip, setIp] = useState('');
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');
  const [messageSuccess, setMessageSuccess] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async (silent = false) => {
    const version = ++refreshVersion.current;
    try {
      const response = await fetch('/api/admin/data', { cache: 'no-store' });
      if (response.status === 401) { if (version === refreshVersion.current) setAuthenticated(false); return; }
      const data = await response.json();
      if (version !== refreshVersion.current) return;
      if (!response.ok) throw new Error(data.error || 'Impossible de charger les données.');
      setRequests(data.requests || []);
      setPendingCount(data.pendingCount ?? (data.requests || []).filter((item: PrintRequest) => item.status === 'new').length);
      setBlocks(data.blockedIps || []);
      setAuthenticated(true);
    } catch (error) {
      if (!silent && version === refreshVersion.current) setMessage(error instanceof Error ? error.message : 'Une erreur est survenue.');
    } finally { if (version === refreshVersion.current) setChecking(false); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  // Keep the admin's in-site counter current without requiring a reload.
  useEffect(() => {
    if (!authenticated) return;
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh(true); }, 30_000);
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh(true); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [authenticated, refresh]);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage(''); setMessageSuccess(false);
    try {
      const response = await fetch('/api/admin/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Connexion impossible.');
      setPassword('');
      await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Connexion impossible.'); }
    finally { setBusy(false); }
  }

  async function logout() {
    setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/admin/session', { method: 'DELETE' });
      if (!response.ok) throw new Error('Déconnexion impossible. Réessayez.');
      ++refreshVersion.current;
      setAuthenticated(false); setRequests([]); setPendingCount(0); setBlocks([]);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Déconnexion impossible. Réessayez.'); }
    finally { setBusy(false); }
  }

  async function updateBlock(address: string, remove = false, blockReason = '') {
    const text = remove ? `Débloquer l’adresse ${address} ?` : `Bloquer l’adresse ${address} ? Cette personne ne pourra plus accéder au site.`;
    if (!window.confirm(text)) return;
    setBusy(true); setMessage(''); setMessageSuccess(false);
    try {
      const response = await fetch('/api/admin/blocked-ips', { method: remove ? 'DELETE' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ip: address, reason: blockReason }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Action impossible.');
      setIp(''); setReason(''); await refresh(); setMessage(remove ? 'Adresse débloquée.' : 'Adresse bloquée.'); setMessageSuccess(true);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Action impossible.'); }
    finally { setBusy(false); }
  }

  async function updateStatus(item: PrintRequest) {
    setBusy(true); setMessage(''); setMessageSuccess(false);
    try {
      const response = await fetch('/api/admin/requests', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: item.id, status: item.status === 'new' ? 'contacted' : 'new' }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Action impossible.');
      await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Action impossible.'); }
    finally { setBusy(false); }
  }

  async function deleteRequest(item: PrintRequest) {
    if (!window.confirm('Supprimer définitivement cette demande et ses informations personnelles ?')) return;
    setBusy(true); setMessage(''); setMessageSuccess(false);
    try {
      const response = await fetch('/api/admin/requests', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: item.id }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Suppression impossible.');
      await refresh(); setMessage('Demande supprimée.'); setMessageSuccess(true);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Suppression impossible.'); }
    finally { setBusy(false); }
  }

  return <main className="admin-shell">
    <header className="admin-header"><div className="container admin-header-inner"><a href="/" className="brand"><span className="brand-symbol"><svg width="25" height="27" viewBox="0 0 25 27" fill="none" aria-hidden="true"><path d="M12.5 1.75 22 7v11.9l-9.5 5.35L3 18.9V7l9.5-5.25Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/><path d="M3.2 7.25 12.5 12.8l9.3-5.55M12.5 12.8v11.05" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/></svg></span><span>djesshop<span className="brand-dot">.</span></span></a><a href="/" className="admin-back"><ArrowLeft size={15} /> Retour au site</a></div></header>
    {checking ? <div className="container admin-empty">Chargement de l’espace administration…</div> : !authenticated ? <div className="container"><section className="admin-login"><div className="section-kicker"><span>✳</span> ESPACE PRIVÉ</div><h1>Bonjour, l’atelier.</h1><p>Connectez-vous avec votre compte administrateur Supabase pour retrouver vos demandes.</p><form onSubmit={login}><label className="field"><span>Adresse e-mail</span><input type="email" required autoComplete="username" placeholder="vous@exemple.fr" value={email} onChange={(e) => setEmail(e.target.value)} /></label><label className="field"><span>Mot de passe</span><input type="password" required autoComplete="current-password" placeholder="Votre mot de passe" value={password} onChange={(e) => setPassword(e.target.value)} /></label>{message && <p className="admin-message" role="alert">{message}</p>}<button className="button button-primary" disabled={busy} type="submit">{busy ? 'Connexion…' : 'Se connecter'} <ArrowRight size={17} /></button></form></section></div> : <div className="container admin-content">
      <div className="admin-title-row"><div><div className="section-kicker"><span>✳</span> ESPACE ADMINISTRATION</div><h1>Votre atelier.</h1><p>Retrouvez les idées reçues et gérez la protection de votre site.</p></div><button type="button" className="admin-logout" onClick={logout} disabled={busy}><LogOut size={15} /> Déconnexion</button></div>
      <AdminNotifications pendingCount={pendingCount} onViewRequests={() => { setTab('requests'); setMessage(''); window.requestAnimationFrame(() => document.getElementById('admin-requests')?.scrollIntoView({ behavior: 'smooth', block: 'start' })); }} />
      <div className="admin-tabs" role="tablist" aria-label="Administration"><button type="button" role="tab" aria-selected={tab === 'requests'} className={tab === 'requests' ? 'active' : ''} onClick={() => { setTab('requests'); setMessage(''); }}>Demandes ({requests.length})</button><button type="button" role="tab" aria-selected={tab === 'blocks'} className={tab === 'blocks' ? 'active' : ''} onClick={() => { setTab('blocks'); setMessage(''); }}>Adresses bloquées ({blocks.length})</button></div>
      {message && <p className={`admin-message ${messageSuccess ? 'success' : ''}`} role="status">{message}</p>}
      {tab === 'requests' ? <section id="admin-requests" className="admin-panel"><div className="admin-panel-heading"><div><h2>Les idées reçues</h2><p>Les 200 demandes les plus récentes.</p></div><button className="small-button" type="button" onClick={() => void refresh()} disabled={busy}><RefreshCw size={14} /> Actualiser</button></div>{requests.length === 0 ? <p className="admin-empty">Aucune demande pour le moment.<br />Les prochaines belles idées apparaîtront ici.</p> : <div className="request-list">{requests.map((item) => <article className="request-item" key={item.id}><div className="request-item-head"><h3>{item.name}</h3><span className={`status-badge ${item.status === 'contacted' ? 'contacted' : ''}`}>{item.status === 'new' ? 'NOUVELLE' : 'TRAITÉE'}</span><time dateTime={item.created_at}>{new Date(item.created_at).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}</time></div><a className="request-email" href={`mailto:${item.email}`}>{item.email}</a><p className="request-description">{item.description}</p><div className="request-meta"><span><span className="admin-color-dot" style={{ background: COLORS.find((color) => color.name === item.color)?.value || '#999' }} /> {item.color}</span><span>Quantité : {item.quantity}</span><span>IP : {item.ip}</span></div><div className="request-actions"><button className="small-button" type="button" disabled={busy} onClick={() => void updateStatus(item)}><Check size={14} /> {item.status === 'new' ? 'Marquer comme traitée' : 'Marquer comme nouvelle'}</button><button className="small-button danger" type="button" disabled={busy} onClick={() => void updateBlock(item.ip, false, 'Bloquée depuis une demande')}><Ban size={14} /> Bloquer cette IP</button><button className="small-button danger" type="button" disabled={busy} onClick={() => void deleteRequest(item)}><Trash2 size={14} /> Supprimer</button></div></article>)}</div>}</section> : <section className="admin-panel"><div className="admin-panel-heading"><div><h2>Protection du site</h2><p>Les adresses bloquées ne peuvent plus accéder au site ni envoyer de demande.</p></div><ShieldCheck size={22} color="#304fd4" /></div><form className="block-form" onSubmit={(event) => { event.preventDefault(); void updateBlock(ip, false, reason); }}><label className="field"><span>Adresse IPv4 ou IPv6</span><input required placeholder="Ex. 192.0.2.42" value={ip} onChange={(e) => setIp(e.target.value)} /></label><label className="field"><span>Motif (facultatif)</span><input maxLength={200} placeholder="Pourquoi bloquer cette adresse ?" value={reason} onChange={(e) => setReason(e.target.value)} /></label><button className="button button-primary" type="submit" disabled={busy}><Ban size={15} /> Bloquer</button></form>{blocks.length === 0 ? <p className="admin-empty">Aucune adresse bloquée pour le moment.</p> : <div className="block-list">{blocks.map((block) => <div className="block-item" key={block.id}><strong>{block.ip}</strong><span>{block.reason || 'Sans motif'}</span><button className="small-button" type="button" disabled={busy} onClick={() => void updateBlock(block.ip, true)}><Unlock size={14} /> Débloquer</button></div>)}</div>}</section>}
    </div>}
  </main>;
}
