import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, Eye, EyeOff, ImagePlus, Plus, Save, Trash2 } from 'lucide-react';
import { Alert, Badge, Button, Card, ErrorState, LoadingBlock, Page, PageHeader } from '../../components/ui';
import { Checkbox, Field, FormGrid, Input, Textarea } from '../../components/form';
import { Dropzone, SecureImage, uploadFile } from '../../components/files';
import { useConfirm } from '../../components/overlay';
import { useToast } from '../../components/toast';
import { api, errorMessage } from '../../lib/api';
import { useApi } from '../../lib/hooks';
import { useSession } from '../../lib/session';
import { contrastRatio } from '../site/site-lib';

interface SiteConfig {
  published: boolean; brandName: string; logoFileId: string | null; bannerFileId: string | null; primaryColor: string; accentColor: string;
  heroTitle: string | null; heroSubtitle: string | null; about: string | null; faq: { question: string; answer: string }[]; terms: string | null; privacy: string | null;
  whatsapp: string | null; phone: string | null; email: string | null; citiesServed: string[]; featuredModelIds: string[]; seoTitle: string | null; seoDescription: string | null;
  slug: string; previewPath: string; subdomain: string;
}
interface ModelOpt { id: string; name: string; make: { name: string }; publicVisible?: boolean }

export function SiteAdminPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const { session } = useSession();
  const site = useApi(() => api.get<SiteConfig>('/site'), []);
  const models = useApi(() => api.get<ModelOpt[] | { items: ModelOpt[] }>('/catalog/models').catch(() => [] as ModelOpt[]), []);
  const [d, setD] = useState<SiteConfig | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (site.data) setD({ ...site.data, faq: Array.isArray(site.data.faq) ? site.data.faq : [], citiesServed: site.data.citiesServed ?? [], featuredModelIds: site.data.featuredModelIds ?? [] }); }, [site.data]);
  if (site.loading && !d) return <LoadingBlock />;
  if (site.error || !d) return <ErrorState message={site.error ?? 'Sem dados'} onRetry={site.reload} />;
  const modelList = Array.isArray(models.data) ? models.data : models.data?.items ?? [];
  const set = <K extends keyof SiteConfig>(k: K, v: SiteConfig[K]) => setD({ ...d, [k]: v });
  const nn = (v: string | null) => (v && v.trim() ? v.trim() : null);
  const contrast = contrastRatio(d.primaryColor, '#ffffff');

  const save = async () => {
    setBusy(true);
    try {
      await api.put('/site', {
        brandName: d.brandName, logoFileId: d.logoFileId, bannerFileId: d.bannerFileId, primaryColor: d.primaryColor, accentColor: d.accentColor,
        heroTitle: nn(d.heroTitle), heroSubtitle: nn(d.heroSubtitle), about: nn(d.about), faq: d.faq.filter((f) => f.question.trim() && f.answer.trim()),
        terms: nn(d.terms), privacy: nn(d.privacy), whatsapp: nn(d.whatsapp), phone: nn(d.phone), email: nn(d.email),
        citiesServed: d.citiesServed.filter(Boolean), featuredModelIds: d.featuredModelIds, seoTitle: nn(d.seoTitle), seoDescription: nn(d.seoDescription),
      });
      toast.success('Site salvo');
      site.reload();
    } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  };
  const publish = async (on: boolean) => {
    const r = await confirm({ title: on ? 'Publicar site' : 'Tirar o site do ar', message: on ? `O site fica acessível em ${d.subdomain} e nos domínios ativos.` : 'Visitantes passam a ver "site indisponível". Os pedidos já recebidos continuam aqui.', tone: on ? 'primary' : 'danger', confirmLabel: on ? 'Publicar' : 'Despublicar' });
    if (!r.confirmed) return;
    api.post('/site/publish', { published: on }).then(() => { toast.success(on ? 'Site publicado' : 'Site despublicado'); site.reload(); }).catch((e) => toast.error(errorMessage(e)));
  };
  const upload = async (file: File, field: 'logoFileId' | 'bannerFileId') => {
    if (!session?.context.organizationId) return;
    try {
      const ref = await uploadFile(file, { entityType: 'SiteConfig', entityId: session.context.organizationId, category: field === 'logoFileId' ? 'logo' : 'banner' });
      set(field, ref.id);
      toast.success('Imagem enviada', 'Salve para aplicar.');
    } catch (e) { toast.error(errorMessage(e)); }
  };

  return (
    <Page>
      <PageHeader title="Site público" description="Identidade, conteúdo e publicação do site de locação da empresa."
        actions={<>
          <Link className="nc-btn nc-btn--secondary" to={d.previewPath} target="_blank"><ExternalLink aria-hidden /> Pré-visualizar</Link>
          {d.published ? <Button icon={EyeOff} onClick={() => publish(false)}>Despublicar</Button> : <Button icon={Eye} onClick={() => publish(true)}>Publicar</Button>}
          <Button variant="primary" icon={Save} loading={busy} onClick={save}>Salvar</Button>
        </>} />
      <Alert tone={d.published ? 'success' : 'neutral'} title={d.published ? 'Site publicado' : 'Site não publicado'}>
        Endereço Norty: <span className="mono">{d.subdomain}</span>. Domínios próprios em <Link to="/admin/dominios">Domínios</Link>. A pré-visualização só mostra o site publicado.
      </Alert>
      <div className="grid-2">
        <Card title="Identidade">
          <div className="stack">
            <Field label="Nome da marca" required><Input value={d.brandName} onChange={(e) => set('brandName', e.target.value)} /></Field>
            <div className="grid-2">
              <ImageSlot label="Logotipo" fileId={d.logoFileId} onFile={(f) => upload(f, 'logoFileId')} onClear={() => set('logoFileId', null)} />
              <ImageSlot label="Banner da página inicial" fileId={d.bannerFileId} onFile={(f) => upload(f, 'bannerFileId')} onClear={() => set('bannerFileId', null)} />
            </div>
            <div className="grid-2">
              <Field label="Cor principal" hint="Botões e destaques."><Input type="color" value={d.primaryColor} onChange={(e) => set('primaryColor', e.target.value)} /></Field>
              <Field label="Cor de acento"><Input type="color" value={d.accentColor} onChange={(e) => set('accentColor', e.target.value)} /></Field>
            </div>
            {contrast < 3 && contrastRatio(d.primaryColor, '#101828') < 4.5 && <Alert tone="warning">Contraste baixo: texto sobre esta cor pode ficar difícil de ler. Prefira um tom mais escuro ou mais claro.</Alert>}
            <span className="row small"><span style={{ width: 28, height: 28, borderRadius: 6, background: d.primaryColor, display: 'inline-block', border: '1px solid var(--border-default)' }} aria-hidden /> Texto sobre a cor principal: contraste {contrast.toFixed(1)}:1 com branco</span>
          </div>
        </Card>
        <Card title="Contato">
          <FormGrid>
            <Field label="WhatsApp comercial" className="span-6" hint="Com DDD. Gera o link wa.me."><Input value={d.whatsapp ?? ''} onChange={(e) => set('whatsapp', e.target.value)} /></Field>
            <Field label="Telefone" className="span-6"><Input value={d.phone ?? ''} onChange={(e) => set('phone', e.target.value)} /></Field>
            <Field label="E-mail" className="span-12"><Input type="email" value={d.email ?? ''} onChange={(e) => set('email', e.target.value)} /></Field>
            <Field label="Cidades atendidas" className="span-12" hint="Separe por vírgula."><Input value={d.citiesServed.join(', ')} onChange={(e) => set('citiesServed', e.target.value.split(',').map((s) => s.trim()))} /></Field>
          </FormGrid>
        </Card>
        <Card title="Página inicial e SEO">
          <div className="stack">
            <Field label="Título principal"><Input value={d.heroTitle ?? ''} onChange={(e) => set('heroTitle', e.target.value)} maxLength={120} /></Field>
            <Field label="Subtítulo"><Textarea value={d.heroSubtitle ?? ''} onChange={(e) => set('heroSubtitle', e.target.value)} rows={2} maxLength={300} /></Field>
            <Field label="Título para buscadores" hint={`${(d.seoTitle ?? '').length}/70`}><Input value={d.seoTitle ?? ''} onChange={(e) => set('seoTitle', e.target.value)} maxLength={70} /></Field>
            <Field label="Descrição para buscadores" hint={`${(d.seoDescription ?? '').length}/170`}><Textarea value={d.seoDescription ?? ''} onChange={(e) => set('seoDescription', e.target.value)} rows={2} maxLength={170} /></Field>
          </div>
        </Card>
        <Card title="Modelos em destaque" subtitle="Até 12. Sem seleção, o site mostra os modelos com frota publicada.">
          {modelList.length ? (
            <div className="grid-2" style={{ gap: 6 }}>
              {modelList.map((m) => (
                <Checkbox key={m.id} label={`${m.make.name} ${m.name}`} checked={d.featuredModelIds.includes(m.id)}
                  onChange={(e) => set('featuredModelIds', e.target.checked ? [...d.featuredModelIds, m.id].slice(0, 12) : d.featuredModelIds.filter((x) => x !== m.id))} />
              ))}
            </div>
          ) : <span className="small muted">Nenhum modelo no catálogo.</span>}
        </Card>
      </div>
      <Card title="Institucional">
        <Field label="Sobre a empresa"><Textarea value={d.about ?? ''} onChange={(e) => set('about', e.target.value)} rows={5} /></Field>
      </Card>
      <Card title="Perguntas frequentes" actions={<Button size="sm" icon={Plus} onClick={() => set('faq', [...d.faq, { question: '', answer: '' }])}>Adicionar</Button>}>
        <div className="stack">
          {!d.faq.length && <span className="small muted">Nenhuma pergunta cadastrada.</span>}
          {d.faq.map((f, i) => (
            <div key={i} className="nc-card" style={{ padding: 12 }}>
              <div className="row-between"><Badge>Pergunta {i + 1}</Badge><Button size="sm" variant="ghost" icon={Trash2} aria-label="Remover pergunta" onClick={() => set('faq', d.faq.filter((_, j) => j !== i))} /></div>
              <Field label="Pergunta"><Input value={f.question} onChange={(e) => set('faq', d.faq.map((x, j) => (j === i ? { ...x, question: e.target.value } : x)))} /></Field>
              <Field label="Resposta"><Textarea value={f.answer} onChange={(e) => set('faq', d.faq.map((x, j) => (j === i ? { ...x, answer: e.target.value } : x)))} rows={3} /></Field>
            </div>
          ))}
        </div>
      </Card>
      <div className="grid-2">
        <Card title="Termos de locação"><Textarea value={d.terms ?? ''} onChange={(e) => set('terms', e.target.value)} rows={10} aria-label="Termos de locação" /></Card>
        <Card title="Privacidade e LGPD" subtitle="Explique quais dados são coletados no site e para quê."><Textarea value={d.privacy ?? ''} onChange={(e) => set('privacy', e.target.value)} rows={10} aria-label="Política de privacidade" /></Card>
      </div>
    </Page>
  );
}

function ImageSlot({ label, fileId, onFile, onClear }: { label: string; fileId: string | null; onFile: (f: File) => void; onClear: () => void }) {
  return (
    <div className="stack-sm">
      <span className="nc-label">{label}</span>
      {fileId ? (
        <div className="nc-thumb" style={{ aspectRatio: '16 / 9' }}>
          <SecureImage fileId={fileId} alt={label} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          <Button size="sm" variant="secondary" icon={Trash2} aria-label={`Remover ${label}`} onClick={onClear} style={{ position: 'absolute', top: 6, right: 6 }} />
        </div>
      ) : <Dropzone multiple={false} accept="image/jpeg,image/png,image/webp" label="Enviar imagem" onFiles={(files) => files[0] && onFile(files[0])} />}
      <span className="xsmall subtle row" style={{ gap: 4 }}><ImagePlus size={12} aria-hidden /> JPG, PNG ou WebP</span>
    </div>
  );
}
