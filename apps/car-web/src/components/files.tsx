/* Envio e listagem de arquivos protegidos. O download passa sempre pela API. */
import { useEffect, useRef, useState } from 'react';
import { Download, FileText, Paperclip, Trash2, Upload } from 'lucide-react';
import type { FileRef } from '@nortycar/shared';
import { API_ORIGIN, api, errorMessage, saveBlob } from '../lib/api';
import { useApi } from '../lib/hooks';
import { bytes, date } from '../lib/format';
import { Button, EmptyState, LoadingBlock } from './ui';
import { useToast } from './toast';
import { useConfirm } from './overlay';

export async function uploadFile(file: File, meta: { entityType: string; entityId?: string; category?: string; description?: string; expiresAt?: string; customerVisible?: boolean }): Promise<FileRef> {
  const form = new FormData();
  form.append('file', file);
  for (const [k, v] of Object.entries(meta)) if (v !== undefined && v !== '') form.append(k, String(v));
  return api.upload<FileRef>('/files', form);
}

export function Dropzone({ onFiles, accept = 'image/jpeg,image/png,image/webp,application/pdf', multiple = true, label = 'Arraste arquivos ou clique para escolher', capture }: {
  onFiles: (files: File[]) => void; accept?: string; multiple?: boolean; label?: string; capture?: 'environment';
}) {
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  return (
    <div
      className="nc-dropzone"
      data-drag={drag}
      role="button"
      tabIndex={0}
      onClick={() => input.current?.click()}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); onFiles(Array.from(e.dataTransfer.files)); }}
    >
      <Upload size={20} aria-hidden style={{ margin: '0 auto 6px' }} />
      <div className="small">{label}</div>
      <div className="xsmall subtle">JPG, PNG, WebP ou PDF · até 15 MB</div>
      <input ref={input} type="file" hidden accept={accept} multiple={multiple} capture={capture}
        onChange={(e) => { onFiles(Array.from(e.target.files ?? [])); e.target.value = ''; }} />
    </div>
  );
}

/** Imagem protegida: pede um link temporário assinado e exibe. */
export function SecureImage({ fileId, alt, style }: { fileId: string; alt: string; style?: React.CSSProperties }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    api.get<{ url: string }>(`/files/${fileId}/url`).then((r) => alive && setSrc(`${API_ORIGIN}${r.url}`)).catch(() => null);
    return () => { alive = false; };
  }, [fileId]);
  return src ? <img src={src} alt={alt} style={style} loading="lazy" /> : <span className="nc-skeleton" style={{ display: 'block', width: '100%', height: '100%' }} aria-label={alt} />;
}

export async function downloadFile(file: { id: string; name: string }): Promise<void> {
  const { blob } = await api.download(`/files/${file.id}/download`);
  saveBlob(blob, file.name);
}

export function Attachments({ entityType, entityId, canWrite, categories, title = 'Documentos' }: {
  entityType: string; entityId: string; canWrite: boolean; categories?: { value: string; label: string }[]; title?: string;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const { data, loading, error, reload } = useApi(() => api.get<FileRef[]>('/files', { entityType, entityId }), [entityType, entityId]);
  const [category, setCategory] = useState(categories?.[0]?.value ?? '');
  const [expiresAt, setExpiresAt] = useState('');
  const [busy, setBusy] = useState(false);

  const send = async (files: File[]) => {
    setBusy(true);
    try {
      for (const f of files) await uploadFile(f, { entityType, entityId, category: category || undefined, expiresAt: expiresAt || undefined });
      toast.success(files.length > 1 ? `${files.length} arquivos enviados` : 'Arquivo enviado');
      reload();
    } catch (e) {
      toast.error('Falha no envio', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <div className="row-between"><span className="nc-section-title">{title}</span></div>
      {canWrite && (
        <div className="stack-sm">
          {categories && (
            <div className="row">
              <select className="nc-select" style={{ maxWidth: 240 }} value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Tipo de documento">
                {categories.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
              <label className="row small muted">Vence em <input type="date" className="nc-input" style={{ width: 170 }} value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} /></label>
            </div>
          )}
          {busy ? <LoadingBlock /> : <Dropzone onFiles={send} />}
        </div>
      )}
      {loading && !data ? <LoadingBlock /> : error ? <div className="text-danger small">{error}</div> : !data?.length ? (
        <EmptyState icon={Paperclip} title="Nenhum documento anexado" />
      ) : (
        <ul className="nc-list nc-card">
          {data.map((f) => (
            <li key={f.id}>
              <FileText size={18} className="muted" aria-hidden />
              <div className="grow">
                <div className="strong ellipsis">{f.name}</div>
                <div className="xsmall muted">
                  {[categories?.find((c) => c.value === f.category)?.label ?? f.category, bytes(f.size), `enviado em ${date(f.createdAt)}`, f.expiresAt ? `vence em ${date(f.expiresAt)}` : null].filter(Boolean).join(' · ')}
                </div>
              </div>
              <Button size="sm" variant="ghost" icon={Download} aria-label={`Baixar ${f.name}`} onClick={() => downloadFile(f).catch((e) => toast.error(errorMessage(e)))} />
              {canWrite && entityType !== 'Inspection' && (
                <Button size="sm" variant="ghost" icon={Trash2} aria-label={`Remover ${f.name}`} onClick={async () => {
                  const r = await confirm({ title: 'Remover documento', message: `"${f.name}" deixa de aparecer na lista. O registro permanece na auditoria.`, requireReason: true, confirmLabel: 'Remover' });
                  if (!r.confirmed) return;
                  await api.del(`/files/${f.id}`, { reason: r.reason }).then(() => { toast.success('Documento removido'); reload(); }).catch((e) => toast.error(errorMessage(e)));
                }} />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
