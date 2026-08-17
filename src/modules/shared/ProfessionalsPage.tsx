import { useMemo, useState } from 'react';
import {
  BadgeCheck, Clock3, Hammer, MapPin, MessageSquareQuote, Phone, Plus, Search, Star,
  ThumbsUp, Wrench, Zap,
} from 'lucide-react';
import { useAuthenticated } from '../../app/SessionContext';
import {
  CATEGORY_LABEL, CATEGORY_ORDER, REQUEST_STATUS_LABEL, addReview, categoryCounts,
  createProfessional, createServiceRequest, filterProfessionals, professionalById,
  professionals as allActive, requestTone, reviewsOf, serviceRequests,
  serviceRequestsOfUnit, toggleRecommendation, type ProfessionalSort,
} from '../../services/professionals';
import { unitLabel } from '../../services/directory';
import type { ProfessionalCategory } from '../../data/types';
import {
  Avatar, Badge, Button, Card, Drawer, EmptyState, Input, Modal, PageHeader, SearchInput,
  Select, StatCard, Tabs, Textarea, useToast,
} from '../../components/ui';
import { FilterBar, InfoRow } from '../../components/PageBits';
import { currency } from '../../lib/format';
import { formatDate, timeAgo } from '../../lib/date';
import './professionals.css';

const SORT_OPTIONS: { value: ProfessionalSort; label: string }[] = [
  { value: 'relevancia', label: 'Mais relevantes' },
  { value: 'nota', label: 'Melhor avaliados' },
  { value: 'trabalhos', label: 'Mais chamados no condomínio' },
  { value: 'preco', label: 'Menor preço inicial' },
];

/** Estrelas preenchidas conforme a nota — meia estrela vira estrela cheia esmaecida. */
function Stars({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <span className="nx-stars" aria-label={`Nota ${rating.toFixed(1)} de 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={size}
          className={i <= Math.round(rating) ? 'is-on' : ''}
          fill={i <= Math.round(rating) ? 'currentColor' : 'none'}
        />
      ))}
    </span>
  );
}

/**
 * Catálogo de profissionais recomendados, compartilhado entre a área do
 * morador (`/app/profissionais`) e a gestão (`/gestao/profissionais`).
 * O morador pede orçamento e avalia; a gestão indica e acompanha.
 */
export function ProfessionalsPage({ subtitle }: { subtitle: string }) {
  const { user, condominium, can, dataVersion } = useAuthenticated();
  const toast = useToast();
  const canManage = can('professionals.manage');
  const unitId = user.unitId;

  const [tab, setTab] = useState('catalogo');
  const [term, setTerm] = useState('');
  const [category, setCategory] = useState<ProfessionalCategory | ''>('');
  const [onlyRecommended, setOnlyRecommended] = useState(false);
  const [onlyEmergency, setOnlyEmergency] = useState(false);
  const [sort, setSort] = useState<ProfessionalSort>('relevancia');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Pedido de orçamento
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [service, setService] = useState('');
  const [description, setDescription] = useState('');
  const [preferredDate, setPreferredDate] = useState('');

  // Avaliação
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewService, setReviewService] = useState('');
  const [reviewComment, setReviewComment] = useState('');

  // Indicação (gestão)
  const [formOpen, setFormOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCompany, setNewCompany] = useState('');
  const [newCategory, setNewCategory] = useState<ProfessionalCategory>('eletrica');
  const [newSpecialties, setNewSpecialties] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newBio, setNewBio] = useState('');
  const [newPrice, setNewPrice] = useState('');

  const counts = useMemo(() => categoryCounts(condominium.id), [condominium.id, dataVersion]);
  const catalog = useMemo(
    () => allActive(condominium.id),
    [condominium.id, dataVersion],
  );
  const list = useMemo(
    () => filterProfessionals(condominium.id, { term, category, onlyRecommended, onlyEmergency, sort }).slice(0, 60),
    [condominium.id, term, category, onlyRecommended, onlyEmergency, sort, dataVersion],
  );

  const myRequests = useMemo(
    () => (unitId ? serviceRequestsOfUnit(unitId) : serviceRequests(condominium.id).slice(0, 80)),
    [unitId, condominium.id, dataVersion],
  );

  const selected = useMemo(
    () => (selectedId ? professionalById(selectedId) ?? null : null),
    [selectedId, dataVersion],
  );
  const selectedReviews = useMemo(
    () => (selectedId ? reviewsOf(selectedId).slice(0, 8) : []),
    [selectedId, dataVersion],
  );

  const recommendedCount = catalog.filter((p) => p.recommendedByCondo).length;
  const avgRating = catalog.length
    ? catalog.reduce((sum, p) => sum + p.rating, 0) / catalog.length
    : 0;

  const submitQuote = () => {
    if (!selected) return;
    if (!unitId) { toast.error('Somente moradores podem pedir orçamento'); return; }
    if (service.trim().length < 4) { toast.error('Descreva o serviço desejado'); return; }
    createServiceRequest({
      condominiumId: condominium.id,
      professionalId: selected.id,
      unitId,
      residentName: user.name,
      service: service.trim(),
      description: description.trim() || service.trim(),
      preferredDate: preferredDate || undefined,
    });
    setQuoteOpen(false);
    setSelectedId(null);
    setService(''); setDescription(''); setPreferredDate('');
    toast.success('Pedido enviado', `${selected.name} vai responder — ${selected.responseTime.toLowerCase()}.`);
  };

  const submitReview = () => {
    if (!selected || !unitId) return;
    if (reviewComment.trim().length < 5) { toast.error('Escreva um comentário sobre o atendimento'); return; }
    addReview({
      professionalId: selected.id,
      condominiumId: condominium.id,
      unitId,
      authorName: user.name,
      rating: reviewRating,
      service: reviewService.trim() || selected.specialties[0],
      comment: reviewComment.trim(),
    });
    setReviewOpen(false);
    setReviewComment(''); setReviewService(''); setReviewRating(5);
    toast.success('Avaliação publicada', 'Obrigado por ajudar os vizinhos a escolherem melhor.');
  };

  const submitProfessional = () => {
    if (newName.trim().length < 3) { toast.error('Informe o nome do profissional'); return; }
    if (newPhone.trim().length < 8) { toast.error('Informe um telefone de contato'); return; }
    const created = createProfessional({
      condominiumId: condominium.id,
      name: newName.trim(),
      company: newCompany.trim() || undefined,
      category: newCategory,
      specialties: newSpecialties.trim()
        ? newSpecialties.split(',').map((s) => s.trim()).filter(Boolean)
        : [CATEGORY_LABEL[newCategory]],
      phone: newPhone.trim(),
      email: newEmail.trim() || undefined,
      bio: newBio.trim() || `Profissional de ${CATEGORY_LABEL[newCategory].toLowerCase()} indicado pela administração.`,
      serviceArea: 'Bairro e adjacências',
      priceFrom: newPrice ? Number(newPrice) : undefined,
      emergency: false,
      recommendedByCondo: true,
      actorName: user.name,
      actorRole: user.role,
    });
    setFormOpen(false);
    setNewName(''); setNewCompany(''); setNewSpecialties(''); setNewPhone(''); setNewEmail('');
    setNewBio(''); setNewPrice('');
    toast.success('Profissional indicado', `${created.name} já aparece para os moradores.`);
  };

  const toggleRecommend = () => {
    if (!selected) return;
    const next = toggleRecommendation(selected.id, user.name, user.role);
    toast.success(
      next?.recommendedByCondo ? 'Indicação registrada' : 'Indicação removida',
      `${selected.name} · ${CATEGORY_LABEL[selected.category]}`,
    );
  };

  return (
    <>
      <PageHeader
        icon={<Hammer size={22} />}
        title="Profissionais recomendados"
        subtitle={subtitle}
        actions={canManage
          ? <Button variant="primary" icon={<Plus size={17} />} onClick={() => setFormOpen(true)}>Indicar profissional</Button>
          : undefined}
        tabs={
          <Tabs
            value={tab}
            onChange={setTab}
            items={[
              { id: 'catalogo', label: 'Catálogo', count: catalog.length },
              { id: 'pedidos', label: unitId ? 'Meus pedidos' : 'Pedidos', count: myRequests.length },
            ]}
          />
        }
      />

      {tab === 'catalogo' ? (
        <>
          <div className="nx-grid-auto nx-prof-stats nx-mb-4">
            <StatCard label="Profissionais no catálogo" value={catalog.length} icon={<Hammer size={17} />} tone="brand" />
            <StatCard label="Indicados pelo condomínio" value={recommendedCount} icon={<BadgeCheck size={17} />} tone="success" />
            <StatCard label="Nota média" value={avgRating.toFixed(1)} icon={<Star size={17} />} tone="cyan" hint="Avaliações de moradores" />
            <StatCard label="Atendem urgência" value={catalog.filter((p) => p.emergency).length} icon={<Zap size={17} />} tone="warning" />
          </div>

          <div className="nx-prof-chips" role="tablist" aria-label="Categorias">
            <button
              type="button"
              className={`nx-prof-chip ${category === '' ? 'is-active' : ''}`}
              onClick={() => setCategory('')}
            >
              Todas <span>{catalog.length}</span>
            </button>
            {CATEGORY_ORDER.filter((c) => counts[c] > 0).map((c) => (
              <button
                key={c}
                type="button"
                className={`nx-prof-chip ${category === c ? 'is-active' : ''}`}
                onClick={() => setCategory(category === c ? '' : c)}
              >
                {CATEGORY_LABEL[c]} <span>{counts[c]}</span>
              </button>
            ))}
          </div>

          <Card padding="none" className="nx-mb-4">
            <FilterBar>
              <SearchInput value={term} onChange={setTerm} placeholder="Buscar por nome, empresa ou especialidade..." />
              <Select
                options={SORT_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                value={sort}
                onChange={(e) => setSort(e.target.value as ProfessionalSort)}
                selectSize="sm"
              />
              <button
                type="button"
                className={`nx-prof-toggle ${onlyRecommended ? 'is-active' : ''}`}
                onClick={() => setOnlyRecommended((v) => !v)}
              >
                <BadgeCheck size={15} /> Só indicados
              </button>
              <button
                type="button"
                className={`nx-prof-toggle ${onlyEmergency ? 'is-active' : ''}`}
                onClick={() => setOnlyEmergency((v) => !v)}
              >
                <Zap size={15} /> Urgência 24h
              </button>
            </FilterBar>
          </Card>

          {list.length === 0 ? (
            <Card>
              <EmptyState
                icon={<Search size={24} />}
                title="Nenhum profissional encontrado"
                description="Ajuste a busca ou limpe os filtros para ver todo o catálogo indicado pelo condomínio."
                action={<Button variant="secondary" onClick={() => { setTerm(''); setCategory(''); setOnlyRecommended(false); setOnlyEmergency(false); }}>Limpar filtros</Button>}
              />
            </Card>
          ) : (
            <div className="nx-prof-grid">
              {list.map((p) => (
                <Card key={p.id} padding="md" interactive className="nx-prof-card" onClick={() => setSelectedId(p.id)}>
                  <div className="nx-row nx-gap-3">
                    <Avatar name={p.name} size="lg" />
                    <div className="nx-grow nx-stack nx-gap-1">
                      <span className="nx-row nx-gap-2 nx-wrap">
                        <strong className="nx-prof-card__name">{p.name}</strong>
                        {p.verified && <BadgeCheck size={15} className="nx-prof-verified" aria-label="Documentação verificada" />}
                      </span>
                      <span className="nx-text-xs nx-text-subtle">
                        {p.company ?? 'Autônomo'} · {CATEGORY_LABEL[p.category]}
                      </span>
                      <span className="nx-row nx-gap-2">
                        <Stars rating={p.rating} />
                        <span className="nx-text-xs nx-text-muted">
                          {p.rating.toFixed(1)} · {p.reviewsCount} avaliações
                        </span>
                      </span>
                    </div>
                  </div>

                  <div className="nx-row nx-gap-2 nx-wrap nx-mt-3">
                    {p.recommendedByCondo && <Badge tone="success" size="sm" icon={<ThumbsUp size={12} />}>Indicado pelo condomínio</Badge>}
                    {p.emergency && <Badge tone="warning" size="sm" icon={<Zap size={12} />}>Urgência 24h</Badge>}
                  </div>

                  <p className="nx-prof-card__specialties">{p.specialties.join(' · ')}</p>

                  <div className="nx-prof-card__foot">
                    <span><Clock3 size={13} /> {p.responseTime}</span>
                    <span><Wrench size={13} /> {p.jobsInCondo} atendimentos aqui</span>
                    {p.priceFrom !== undefined && <span className="nx-prof-card__price">a partir de {currency(p.priceFrom)}</span>}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      ) : (
        <Card padding="none">
          {myRequests.length === 0 ? (
            <EmptyState
              icon={<MessageSquareQuote size={24} />}
              title="Nenhum pedido de orçamento"
              description="Escolha um profissional no catálogo e peça um orçamento — o histórico fica registrado aqui."
              action={<Button variant="primary" onClick={() => setTab('catalogo')}>Ver catálogo</Button>}
            />
          ) : (
            <ul className="nx-prof-requests">
              {myRequests.map((r) => {
                const professional = professionalById(r.professionalId);
                return (
                  <li key={r.id} className="nx-prof-request">
                    <Avatar name={professional?.name ?? 'Profissional'} size="sm" />
                    <div className="nx-grow nx-stack nx-gap-1">
                      <span className="nx-row nx-between nx-gap-2 nx-wrap">
                        <strong>{r.service}</strong>
                        <Badge tone={requestTone(r.status)} size="sm">{REQUEST_STATUS_LABEL[r.status]}</Badge>
                      </span>
                      <span className="nx-text-xs nx-text-subtle">
                        {professional?.name ?? 'Profissional removido'}
                        {professional ? ` · ${CATEGORY_LABEL[professional.category]}` : ''}
                        {!unitId ? ` · ${unitLabel(r.unitId)}` : ''}
                        {' · '}{timeAgo(r.createdAt)}
                      </span>
                      {r.quotedAmount !== undefined && (
                        <span className="nx-text-sm">Orçamento recebido: <strong>{currency(r.quotedAmount)}</strong></span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}

      <Drawer
        open={selected !== null}
        onClose={() => setSelectedId(null)}
        title={selected?.name}
        subtitle={selected ? `${selected.company ?? 'Autônomo'} · ${CATEGORY_LABEL[selected.category]}` : undefined}
        width={520}
        footer={selected && unitId ? (
          <>
            <Button variant="ghost" onClick={() => setReviewOpen(true)}>Avaliar</Button>
            <Button variant="primary" icon={<MessageSquareQuote size={16} />} onClick={() => setQuoteOpen(true)}>
              Pedir orçamento
            </Button>
          </>
        ) : selected && canManage ? (
          <Button variant={selected.recommendedByCondo ? 'secondary' : 'primary'} onClick={toggleRecommend}>
            {selected.recommendedByCondo ? 'Remover indicação' : 'Indicar aos moradores'}
          </Button>
        ) : undefined}
      >
        {selected && (
          <div className="nx-stack nx-gap-5">
            <div className="nx-row nx-gap-3">
              <Avatar name={selected.name} size="xl" ring />
              <div className="nx-stack nx-gap-1">
                <span className="nx-row nx-gap-2">
                  <Stars rating={selected.rating} size={16} />
                  <strong>{selected.rating.toFixed(1)}</strong>
                </span>
                <span className="nx-text-xs nx-text-subtle">{selected.reviewsCount} avaliações de moradores</span>
                <span className="nx-row nx-gap-2 nx-wrap nx-mt-1">
                  {selected.verified && <Badge tone="brand" size="sm" icon={<BadgeCheck size={12} />}>Verificado</Badge>}
                  {selected.recommendedByCondo && <Badge tone="success" size="sm">Indicado pelo condomínio</Badge>}
                  {selected.emergency && <Badge tone="warning" size="sm">Urgência 24h</Badge>}
                </span>
              </div>
            </div>

            <p className="nx-text-muted">{selected.bio}</p>

            <div className="nx-row nx-gap-2 nx-wrap">
              {selected.specialties.map((s) => (
                <Badge key={s} tone="neutral" size="sm">{s}</Badge>
              ))}
            </div>

            <div className="nx-stack nx-gap-2 nx-prof-info">
              <InfoRow label="Contato" value={<span className="nx-row nx-gap-2"><Phone size={14} /> {selected.phone}</span>} />
              {selected.email && <InfoRow label="E-mail" value={selected.email} />}
              <InfoRow label="Área de atendimento" value={<span className="nx-row nx-gap-2"><MapPin size={14} /> {selected.serviceArea}</span>} />
              <InfoRow label="Tempo de resposta" value={selected.responseTime} />
              <InfoRow label="Atendimentos no condomínio" value={selected.jobsInCondo} />
              {selected.priceFrom !== undefined && <InfoRow label="Preço inicial" value={currency(selected.priceFrom)} />}
              <InfoRow label="No catálogo desde" value={formatDate(selected.since)} />
              {selected.recommendedBy && <InfoRow label="Indicado por" value={selected.recommendedBy} />}
            </div>

            <div>
              <p className="nx-uppercase nx-text-subtle nx-mb-4">O que os vizinhos dizem</p>
              {selectedReviews.length === 0 ? (
                <p className="nx-text-sm nx-text-muted">Ainda não há comentários escritos para este profissional.</p>
              ) : (
                <ul className="nx-prof-reviews">
                  {selectedReviews.map((r) => (
                    <li key={r.id}>
                      <span className="nx-row nx-between nx-gap-2">
                        <strong className="nx-text-sm">{r.authorName}</strong>
                        <Stars rating={r.rating} size={12} />
                      </span>
                      <p className="nx-text-sm nx-text-muted">{r.comment}</p>
                      <span className="nx-text-xs nx-text-subtle">{r.service} · {timeAgo(r.at)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </Drawer>

      <Modal
        open={quoteOpen}
        onClose={() => setQuoteOpen(false)}
        title="Pedir orçamento"
        subtitle={selected ? `${selected.name} · ${CATEGORY_LABEL[selected.category]}` : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => setQuoteOpen(false)}>Cancelar</Button>
            <Button variant="primary" onClick={submitQuote}>Enviar pedido</Button>
          </>
        }
      >
        <div className="nx-stack nx-gap-4">
          <Input
            label="Serviço"
            value={service}
            onChange={(e) => setService(e.target.value)}
            autoFocus
            placeholder="Ex.: Trocar o chuveiro elétrico"
          />
          <Textarea
            label="Detalhes"
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Conte o que precisa ser feito, o que já tentou e se há urgência."
          />
          <Input
            label="Data preferida"
            type="date"
            value={preferredDate}
            onChange={(e) => setPreferredDate(e.target.value)}
          />
          <p className="nx-text-xs nx-text-subtle">
            O contato é feito diretamente entre morador e profissional. O condomínio indica,
            mas não intermedia a contratação nem o pagamento.
          </p>
        </div>
      </Modal>

      <Modal
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        title="Avaliar profissional"
        subtitle={selected?.name}
        footer={
          <>
            <Button variant="ghost" onClick={() => setReviewOpen(false)}>Cancelar</Button>
            <Button variant="primary" onClick={submitReview}>Publicar avaliação</Button>
          </>
        }
      >
        <div className="nx-stack nx-gap-4">
          <div className="nx-field">
            <span className="nx-field__label">Sua nota</span>
            <div className="nx-row nx-gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`nx-rate-star ${n <= reviewRating ? 'is-on' : ''}`}
                  onClick={() => setReviewRating(n)}
                  aria-label={`${n} ${n === 1 ? 'estrela' : 'estrelas'}`}
                >
                  <Star size={22} fill={n <= reviewRating ? 'currentColor' : 'none'} />
                </button>
              ))}
            </div>
          </div>
          <Input
            label="Serviço realizado"
            value={reviewService}
            onChange={(e) => setReviewService(e.target.value)}
            placeholder={selected?.specialties[0]}
          />
          <Textarea
            label="Comentário"
            rows={4}
            value={reviewComment}
            onChange={(e) => setReviewComment(e.target.value)}
            placeholder="Como foi o atendimento? Pontualidade, preço combinado, acabamento..."
          />
        </div>
      </Modal>

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title="Indicar profissional"
        subtitle="Entra no catálogo já marcado como indicação da administração"
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setFormOpen(false)}>Cancelar</Button>
            <Button variant="primary" onClick={submitProfessional}>Publicar indicação</Button>
          </>
        }
      >
        <div className="nx-stack nx-gap-4">
          <div className="nx-grid-2">
            <Input label="Nome" value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus />
            <Input label="Empresa" value={newCompany} onChange={(e) => setNewCompany(e.target.value)} placeholder="Opcional" />
          </div>
          <div className="nx-grid-2">
            <Select
              label="Categoria"
              options={CATEGORY_ORDER.map((c) => ({ value: c, label: CATEGORY_LABEL[c] }))}
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value as ProfessionalCategory)}
            />
            <Input label="Preço inicial (R$)" type="number" value={newPrice} onChange={(e) => setNewPrice(e.target.value)} placeholder="Opcional" />
          </div>
          <Input
            label="Especialidades"
            value={newSpecialties}
            onChange={(e) => setNewSpecialties(e.target.value)}
            placeholder="Separe por vírgula"
          />
          <div className="nx-grid-2">
            <Input label="Telefone" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="(11) 9 0000-0000" />
            <Input label="E-mail" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="Opcional" />
          </div>
          <Textarea label="Apresentação" rows={3} value={newBio} onChange={(e) => setNewBio(e.target.value)} />
        </div>
      </Modal>
    </>
  );
}
