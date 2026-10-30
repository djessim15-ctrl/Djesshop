'use client';

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  ArrowDown, ArrowRight, ArrowUpRight, Box, Check, CheckCircle2, ChevronRight,
  CircleHelp, Heart, ImagePlus, Lightbulb, Menu, MessageSquareText, MousePointer2,
  PackageCheck, Palette, PenLine, Send, Sparkles, Trash2, X,
} from 'lucide-react';
import { COLORS, type ColorName } from '@/lib/colors';
import { photoSelectionError, preparePhoto } from '@/lib/photo-client';

const initialForm = { name: '', email: '', description: '', quantity: '1', website: '' };

function Brand({ inverted = false }: { inverted?: boolean }) {
  return (
    <a className={`brand ${inverted ? 'brand-light' : ''}`} href="#accueil" aria-label="Djesshop, retour à l’accueil">
      <span className="brand-symbol" aria-hidden="true">
        <svg width="25" height="27" viewBox="0 0 25 27" fill="none"><path d="M12.5 1.75 22 7v11.9l-9.5 5.35L3 18.9V7l9.5-5.25Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/><path d="M3.2 7.25 12.5 12.8l9.3-5.55M12.5 12.8v11.05" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/></svg>
      </span>
      <span>djesshop<span className="brand-dot">.</span></span>
    </a>
  );
}

export default function Landing() {
  const [selectedColor, setSelectedColor] = useState<ColorName>('Bleu');
  const [form, setForm] = useState(initialForm);
  const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState('');
  const [photoError, setPhotoError] = useState('');
  const photoInput = useRef<HTMLInputElement>(null);
  const isDemo = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

  useEffect(() => {
    if (!photo) { setPhotoPreview(''); return; }
    const url = URL.createObjectURL(photo);
    setPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  function choosePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const error = photoSelectionError(file);
    if (status === 'error') { setStatus('idle'); setMessage(''); }
    setPhotoError(error || '');
    setPhoto(error ? null : file);
    if (error) event.target.value = '';
  }

  function removePhoto() {
    setPhoto(null); setPhotoError('');
    if (status === 'error') { setStatus('idle'); setMessage(''); }
    if (photoInput.current) photoInput.current.value = '';
  }

  function chooseColor(color: ColorName) {
    setSelectedColor(color);
    document.getElementById('projet')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (photoError) { setStatus('error'); setMessage('Vérifiez la photo ou continuez sans photo.'); return; }
    setStatus('sending');
    setMessage('');
    try {
      const payload = { ...form, color: selectedColor, quantity: Number(form.quantity) };
      let body: BodyInit;
      let headers: HeadersInit | undefined;
      if (photo) {
        const image = await preparePhoto(photo);
        const data = new FormData();
        for (const [key, value] of Object.entries(payload)) data.append(key, String(value));
        data.append('photo', image, image.type === 'image/webp' ? 'photo.webp' : 'photo.jpg');
        body = data;
      } else {
        headers = { 'Content-Type': 'application/json' };
        body = JSON.stringify(payload);
      }
      const result = await fetch('/api/requests', { method: 'POST', headers, body });
      const data = await result.json().catch(() => ({}));
      if (!result.ok) throw new Error(data.error || 'Une erreur est survenue. Réessayez plus tard.');
      setStatus('success');
      setMessage(data.demo
        ? 'Ceci est un envoi de démonstration : aucune demande n’a été transmise.'
        : 'Votre demande a bien été envoyée. Nous reviendrons vers vous par e-mail pour discuter de votre projet.');
      setForm(initialForm);
      removePhoto();
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Une erreur est survenue. Réessayez plus tard.');
    }
  }

  const closeMenu = () => setMenuOpen(false);

  return (
    <main id="accueil">
      <div className="announcement"><span aria-hidden="true">✳</span> VOS IDÉES MÉRITENT DE PRENDRE VIE <span aria-hidden="true">✳</span></div>
      <header className="site-header">
        <div className="container header-inner">
          <Brand />
          <nav className={`main-nav ${menuOpen ? 'nav-open' : ''}`} aria-label="Navigation principale">
            <a href="#concept" onClick={closeMenu}>Le concept</a>
            <a href="#inspirations" onClick={closeMenu}>Inspirations</a>
            <a href="#couleurs" onClick={closeMenu}>Nos couleurs</a>
            <a className="mobile-nav-cta" href="#projet" onClick={closeMenu}>Parlons de votre projet <ArrowUpRight size={16} /></a>
          </nav>
          <a href="#projet" className="header-cta">Parlons de votre projet <ArrowUpRight size={16} strokeWidth={2} /></a>
          <button className="menu-button" type="button" onClick={() => setMenuOpen(!menuOpen)} aria-expanded={menuOpen} aria-label={menuOpen ? 'Fermer le menu' : 'Ouvrir le menu'}>{menuOpen ? <X size={23} /> : <Menu size={23} />}</button>
        </div>
      </header>

      <section className="hero" aria-labelledby="hero-title">
        <div className="container hero-grid">
          <div className="hero-copy">
            <div className="eyebrow"><span className="eyebrow-star">✳</span> LE STUDIO D’IMPRESSION 3D SUR MESURE</div>
            <h1 id="hero-title">Vos idées<br />prennent <em>forme<span className="blue-period">.</span></em></h1>
            <p className="hero-description">Fidgets, objets malins ou petits cadeaux : imaginez une création qui vous plaît, choisissez sa couleur et donnez-lui vie en 3D.</p>
            <div className="hero-actions">
              <a className="button button-primary" href="#projet">J’ai une idée <ArrowUpRight size={18} /></a>
              <a className="text-link" href="#concept"><span className="play-circle"><ArrowDown size={15} /></span> Comment ça marche ?</a>
            </div>
            <div className="hero-palette">
              <div className="mini-swatches" aria-label="Choisir une couleur pour mon projet">
                {COLORS.map((color) => <button key={color.name} type="button" style={{ backgroundColor: color.value }} aria-label={`Choisir ${color.name}`} onClick={() => chooseColor(color.name)} />)}
              </div>
              <div><strong>7 couleurs,</strong> mille possibilités <span>✳</span></div>
            </div>
          </div>
          <div className="hero-visual">
            <div className="hero-image-wrap">
              <img className="hero-image" src="/images/fidget-hero.webp" alt="Fidget spinner, support de téléphone et pot à crayons personnalisé imprimés en 3D" />
              <div className="image-tag"><span className="tag-icon"><Sparkles size={17} /></span><span>DES IDÉES<br /><strong>QUI PRENNENT VIE</strong></span></div>
              <div className="hero-image-caption"><span>Imaginé par vous.<br /><strong>Imprimé pour vous.</strong></span><ArrowUpRight size={19} /></div>
            </div>
            <div className="round-stamp" aria-label="Créé pour vous"><span>CRÉÉ POUR VOUS</span><Sparkles size={25} strokeWidth={1.5} /><span>AVEC ♡</span></div>
            <div className="hero-index"><span>L’ATELIER DJESSHOP</span><span>LA CRÉATIVITÉ N’A PAS DE LIMITES</span></div>
          </div>
        </div>
        <div className="container hero-note"><span><span className="note-spark">✳</span> LE SUR-MESURE, EN TOUTE SIMPLICITÉ</span><span>UN PETIT OBJET PEUT PORTER UNE GRANDE IDÉE <ArrowDown size={13} /></span></div>
      </section>

      <div className="value-strip" aria-label="Nos engagements">
        <div className="container value-strip-inner">
          <div><Box size={19} /><span>100% sur mesure</span></div><span className="value-divider" />
          <div><Palette size={19} /><span>7 jolies couleurs</span></div><span className="value-divider" />
          <div><Heart size={19} /><span>Imprimé avec soin</span></div><span className="value-divider" />
          <div><MessageSquareText size={19} /><span>Un échange humain</span></div>
        </div>
      </div>

      <section id="concept" className="section process-section">
        <div className="container">
          <div className="section-heading process-heading">
            <div><div className="section-kicker"><span>✳</span> COMMENT ÇA MARCHE ?</div><h2>De l’idée à l’objet,<br /><em>c’est tout simple.</em></h2></div>
            <p>Pas besoin d’être un expert en 3D.<br />Il suffit d’avoir une idée, on s’occupe du reste !</p>
          </div>
          <div className="steps-grid">
            <article className="step-card">
              <div className="step-top"><span>01</span><span className="step-icon icon-blue"><PenLine size={24} strokeWidth={1.5} /></span></div>
              <h3>Racontez-nous votre idée</h3><p>Un fidget, un objet pratique, un cadeau personnalisé… Décrivez-nous ce que vous imaginez.</p><span className="step-bottom">VOTRE IMAGINATION <ArrowRight size={15} /></span>
            </article>
            <article className="step-card">
              <div className="step-top"><span>02</span><span className="step-icon icon-yellow"><Palette size={24} strokeWidth={1.5} /></span></div>
              <h3>Choisissez votre couleur</h3><p>Parmi nos 7 couleurs, trouvez celle qui donnera tout son caractère à votre création.</p><span className="step-bottom">VOTRE TOUCHE PERSO <ArrowRight size={15} /></span>
            </article>
            <article className="step-card">
              <div className="step-top"><span>03</span><span className="step-icon icon-pink"><PackageCheck size={24} strokeWidth={1.5} /></span></div>
              <h3>On lui donne vie !</h3><p>Nous étudions votre demande et revenons vers vous avec un devis adapté à votre projet.</p><span className="step-bottom">NOTRE SAVOIR-FAIRE <ArrowRight size={15} /></span>
            </article>
          </div>
        </div>
      </section>

      <section id="inspirations" className="inspiration-section">
        <div className="container inspiration-grid">
          <div className="inspiration-image"><img src="/images/fidget-inspirations.webp" alt="Fidgets, support de téléphone et range-câble imprimés en 3D" loading="lazy" /><div className="inspiration-label"><Sparkles size={17} /> PLACE À L’IMAGINATION</div></div>
          <div className="inspiration-copy">
            <div className="section-kicker"><span>✳</span> PENSÉ PAR VOUS, CRÉÉ POUR VOUS</div>
            <h2>Une idée ?<br /><em>Tout commence là.</em></h2>
            <p>Un fidget à manipuler, un support de téléphone ou un rangement astucieux : des objets utiles et originaux, à personnaliser selon vos envies.</p>
            <div className="idea-tags"><span>Fidgets</span><span>Objets utiles</span><span>Cadeaux personnalisés</span><span>Et bien plus encore ✳</span></div>
            <a className="inline-link" href="#projet">Donner vie à mon idée <ArrowUpRight size={17} /></a>
          </div>
        </div>
      </section>

      <section id="couleurs" className="colors-section">
        <div className="container colors-inner">
          <div><div className="section-kicker"><span>✳</span> À CHACUN SA COULEUR</div><h2>La vôtre sera<br /><em>de quelle couleur ?</em></h2><p>Une palette de 7 couleurs pour une création qui vous ressemble vraiment.</p></div>
          <div className="color-showcase">
            {COLORS.map((color) => <button key={color.name} type="button" className="showcase-swatch" onClick={() => chooseColor(color.name)} aria-label={`Choisir ${color.name} pour mon projet`}><span style={{ background: color.value }} /><strong>{color.name}</strong></button>)}
          </div>
        </div>
      </section>

      <section id="projet" className="project-section">
        <div className="container project-grid">
          <div className="project-intro">
            <div className="section-kicker"><span>✳</span> À VOUS DE JOUER</div>
            <h2>Alors, on crée<br /><em>quelque chose ?</em></h2>
            <p>Les plus belles créations commencent souvent par une simple idée. Racontez-nous la vôtre, on a hâte de la découvrir.</p>
            <div className="project-image"><img src="/images/feature-print.webp" alt="Pot à crayons bleu imprimé en 3D, personnalisé avec le prénom Léo" loading="lazy" /><div className="project-image-note"><span>✳</span> De votre imagination<br /><strong>à la réalité.</strong></div></div>
            <div className="project-reassurance"><span className="reassurance-icon"><Heart size={17} /></span><span><strong>Une question, une idée folle ?</strong><br />On est là pour en parler.</span></div>
          </div>
          <div className="form-card">
            {status === 'success' ? (
              <div className="success-state" role="status"><span className="success-icon"><CheckCircle2 size={34} /></span><div className="section-kicker"><span>✳</span> {isDemo ? 'APERÇU DE L’ENVOI' : 'DEMANDE ENVOYÉE'}</div><h3>{isDemo ? 'Voilà comment ça marche !' : 'Votre idée est entre de bonnes mains !'}</h3><p>{message}</p><button type="button" className="button button-primary" onClick={() => { setStatus('idle'); setMessage(''); }}>Créer un autre projet <ArrowRight size={18} /></button></div>
            ) : (
              <>
                <div className="form-heading"><div><span className="form-overline">VOTRE PROJET COMMENCE ICI</span><h3>Parlez-nous de votre idée<span>.</span></h3><p>Quelques détails suffisent pour commencer.</p></div><span className="form-sparkle">✳</span></div>
                {isDemo && <div className="demo-notice"><CircleHelp size={16} /> Mode aperçu : les demandes ne sont pas transmises.</div>}
                <form onSubmit={submit}>
                  <div className="field-row">
                    <label className="field"><span>Votre prénom ou nom <b>*</b></span><input required minLength={2} maxLength={100} placeholder="Comment vous appelez-vous ?" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoComplete="name" /></label>
                    <label className="field"><span>Votre adresse e-mail <b>*</b></span><input required type="email" maxLength={254} placeholder="vous@exemple.fr" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="email" /></label>
                  </div>
                  <label className="field description-field"><span>Votre idée, en quelques mots <b>*</b></span><textarea required minLength={10} maxLength={3000} placeholder="Fidget, accessoire de bureau, objet pratique… Décrivez votre idée et ses dimensions !" rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /><small>{form.description.length} / 3 000</small></label>
                  <div className="photo-field">
                    <div className="photo-heading"><span id="photo-label">Une photo pour illustrer votre idée ?</span><span>FACULTATIF</span></div>
                    <p id="photo-hint">Un exemple, un objet ou un croquis peut nous aider. JPG, PNG ou WebP · 25 Mo max.</p>
                    <label className="photo-picker">
                      <input ref={photoInput} type="file" accept="image/jpeg,image/png,image/webp" aria-labelledby="photo-label" aria-describedby={photoError ? 'photo-hint photo-error' : 'photo-hint'} disabled={status === 'sending'} onChange={choosePhoto} />
                      {photoPreview && photo ? <img src={photoPreview} alt="" className="photo-preview" /> : <span className="photo-picker-icon"><ImagePlus size={20} /></span>}
                      <span className="photo-picker-copy"><strong>{photo ? 'Changer la photo' : 'Ajouter une photo'}</strong><small>{photo ? photo.name : 'Depuis votre appareil'}</small></span>
                      <ArrowUpRight className="photo-picker-arrow" size={16} />
                    </label>
                    {photoError && <p className="photo-error" id="photo-error" role="alert">{photoError}</p>}
                    {(photo || photoError) && <button type="button" className="photo-remove" onClick={removePhoto} disabled={status === 'sending'}><Trash2 size={13} /> {photo ? 'Retirer la photo' : 'Continuer sans photo'}</button>}
                  </div>
                  <fieldset className="color-fieldset"><legend>Choisissez votre couleur <b>*</b></legend><div className="color-options">{COLORS.map((color) => <label className={`color-option ${selectedColor === color.name ? 'is-selected' : ''}`} key={color.name}><input type="radio" name="color" value={color.name} checked={selectedColor === color.name} onChange={() => setSelectedColor(color.name)} /><span className="color-dot" style={{ backgroundColor: color.value }}>{selectedColor === color.name && <Check size={14} strokeWidth={2.8} />}</span><span>{color.name}</span></label>)}</div></fieldset>
                  <label className="field quantity-field"><span>Quantité souhaitée <b>*</b></span><input type="number" min={1} max={1000} required value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></label>
                  <label className="honeypot" aria-hidden="true">Site web<input name="website" tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} /></label>
                  {status === 'error' && <p className="form-error" role="alert">{message}</p>}
                  <button className="button button-primary form-submit" type="submit" disabled={status === 'sending'}>{status === 'sending' ? 'Envoi en cours…' : 'Envoyer ma demande'} <ArrowUpRight size={18} /></button>
                  <p className="form-privacy">En envoyant votre demande, vous acceptez que vos informations et votre éventuelle photo soient utilisées pour vous répondre. La photo reste privée ; votre adresse IP peut être conservée pour protéger le site.</p>
                </form>
              </>
            )}
          </div>
        </div>
      </section>

      <section className="closing-banner"><div className="container closing-inner"><div><span>✳ &nbsp; VOTRE IMAGINATION EST LA SEULE LIMITE</span><h2>Une idée, ça change tout<span>.</span></h2></div><a href="#projet" className="button closing-button">On en parle ? <ArrowUpRight size={18} /></a></div></section>
      <footer className="footer"><div className="container footer-main"><div className="footer-brand"><Brand inverted /><p>Les belles idées méritent<br />de prendre forme.</p><span>IMAGINÉ PAR VOUS, IMPRIMÉ POUR VOUS ✳</span></div><div className="footer-links"><div><strong>EXPLORER</strong><a href="#concept">Le concept</a><a href="#inspirations">Inspirations</a><a href="#couleurs">Nos couleurs</a></div><div><strong>ON SE LANCE ?</strong><a href="#projet">Parler de mon projet</a><a href="/admin">Espace administration</a></div></div></div><div className="container footer-bottom"><span>© {new Date().getFullYear()} djesshop. Tous droits réservés.</span><span>Fait pour les idées qui ne tiennent pas en place ✳</span></div></footer>
    </main>
  );
}
