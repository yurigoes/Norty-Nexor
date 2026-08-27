import { useMemo, useState } from 'react';
import { Download, FileSpreadsheet, FileText, FolderOpen, Lock, Upload } from 'lucide-react';
import { useAuthenticated } from '../../app/SessionContext';
import {
  DOCUMENT_CATEGORY_LABEL, documents, registerDownload, uploadDocument,
} from '../../services/communication';
import type { DocumentFile } from '../../data/types';
import {
  Badge, Button, Card, DataTable, EmptyState, Input, Modal, PageHeader, SearchInput, Select,
  Switch, useToast, type Column,
} from '../../components/ui';
import { CellStack, FilterBar } from '../../components/PageBits';
import { fileSize, number } from '../../lib/format';
import { formatDate } from '../../lib/date';

const CATEGORIES = Object.entries(DOCUMENT_CATEGORY_LABEL).map(([value, label]) => ({ value, label }));

export function DocumentsPage() {
  const { user, condominium, can, dataVersion } = useAuthenticated();
  const toast = useToast();
  const canManage = can('documents.manage');

  const [term, setTerm] = useState('');
  const [category, setCategory] = useState('');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [name, setName] = useState('');
  const [newCategory, setNewCategory] = useState('administrativo');
  const [restricted, setRestricted] = useState(false);

  const all = useMemo(() => documents(condominium.id), [condominium.id, dataVersion]);

  const rows = useMemo(() => {
    const q = term.trim().toLowerCase();
    return all.filter((d) => (!q || d.name.toLowerCase().includes(q)) && (!category || d.category === category));
  }, [all, term, category]);

  const grouped = useMemo(() => {
    const map = new Map<string, number>();
    all.forEach((d) => map.set(d.category, (map.get(d.category) ?? 0) + 1));
    return map;
  }, [all]);

  const columns: Column<DocumentFile>[] = [
    {
      key: 'name',
      header: 'Documento',
      render: (d) => (
        <span className="nx-row nx-gap-3">
          <span className={`nx-doc-icon nx-doc-icon--${d.format}`}>
            {d.format === 'xlsx' ? <FileSpreadsheet size={16} /> : <FileText size={16} />}
          </span>
          <CellStack
            title={<span className="nx-row nx-gap-2">{d.name}{d.restricted && <Lock size={12} className="nx-text-subtle" />}</span>}
            meta={`${d.format.toUpperCase()} · ${fileSize(d.sizeKb)}`}
          />
        </span>
      ),
    },
    { key: 'category', header: 'Categoria', hideOnMobile: true, render: (d) => <Badge tone="neutral" size="sm">{DOCUMENT_CATEGORY_LABEL[d.category]}</Badge> },
    { key: 'uploaded', header: 'Publicado', hideOnMobile: true, render: (d) => <CellStack title={formatDate(d.uploadedAt.slice(0, 10))} meta={d.uploadedBy} /> },
    { key: 'downloads', header: 'Downloads', hideOnMobile: true, align: 'right', render: (d) => <span className="nx-nums">{number(d.downloads)}</span> },
    {
      key: 'actions',
      header: '',
      align: 'right',
      width: '120px',
      render: (d) => (
        <Button
          variant="ghost"
          size="sm"
          icon={<Download size={15} />}
          onClick={() => { registerDownload(d.id); toast.info('Download simulado', `${d.name} seria baixado nesta ação.`); }}
        >
          Baixar
        </Button>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        icon={<FolderOpen size={22} />}
        title="Documentos"
        subtitle="Convenção, regimento, atas, contratos e balancetes"
        actions={canManage ? <Button variant="primary" icon={<Upload size={17} />} onClick={() => setUploadOpen(true)}>Enviar documento</Button> : undefined}
      />

      <div className="nx-doc-cats">
        <button className={`nx-doc-cat ${!category ? 'is-active' : ''}`} onClick={() => setCategory('')}>
          <span>Todos</span>
          <strong>{all.length}</strong>
        </button>
        {CATEGORIES.map((c) => (
          <button key={c.value} className={`nx-doc-cat ${category === c.value ? 'is-active' : ''}`} onClick={() => setCategory(c.value)}>
            <span>{c.label}</span>
            <strong>{grouped.get(c.value) ?? 0}</strong>
          </button>
        ))}
      </div>

      <Card padding="none">
        <FilterBar>
          <SearchInput value={term} onChange={setTerm} placeholder="Buscar documento..." />
        </FilterBar>
        <DataTable
          columns={columns}
          rows={rows}
          keyOf={(d) => d.id}
          empty={<EmptyState icon={<FolderOpen size={24} />} title="Nenhum documento encontrado" description="Ajuste os filtros ou envie um novo documento." />}
          mobileCard={(d) => (
            <div className="nx-row nx-gap-3">
              <span className={`nx-doc-icon nx-doc-icon--${d.format}`}>
                {d.format === 'xlsx' ? <FileSpreadsheet size={16} /> : <FileText size={16} />}
              </span>
              <div className="nx-stack nx-grow nx-gap-1">
                <span className="nx-medium">{d.name}</span>
                <span className="nx-text-xs nx-text-subtle">{DOCUMENT_CATEGORY_LABEL[d.category]} · {fileSize(d.sizeKb)}</span>
              </div>
              <Button variant="ghost" size="sm" icon={<Download size={16} />} onClick={() => registerDownload(d.id)} aria-label="Baixar" />
            </div>
          )}
        />
      </Card>

      <Modal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        title="Enviar documento"
        subtitle="Disponível imediatamente na biblioteca do condomínio"
        footer={
          <>
            <Button variant="ghost" onClick={() => setUploadOpen(false)}>Cancelar</Button>
            <Button
              variant="primary"
              disabled={name.trim().length < 3}
              onClick={() => {
                uploadDocument({
                  condominiumId: condominium.id,
                  name: name.trim(),
                  category: newCategory as DocumentFile['category'],
                  sizeKb: 1240,
                  format: 'pdf',
                  uploadedBy: user.name,
                  restricted,
                });
                setUploadOpen(false);
                setName('');
                toast.success('Documento publicado', 'Já está disponível para consulta.');
              }}
            >
              Publicar
            </Button>
          </>
        }
      >
        <div className="nx-stack nx-gap-4">
          <Input label="Nome do documento" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Ata da Assembleia Geral 2026" autoFocus />
          <Select label="Categoria" options={CATEGORIES} value={newCategory} onChange={(e) => setNewCategory(e.target.value)} />
          <div className="nx-upload"><Upload size={20} /><span>Arraste o arquivo ou clique para selecionar (upload simulado no MVP)</span></div>
          <Switch checked={restricted} onChange={setRestricted} label="Documento restrito" description="Visível apenas para síndico e administração." />
        </div>
      </Modal>
    </>
  );
}
