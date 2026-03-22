import { useEffect, useMemo, useState } from 'react';
import { Download, Eye, Link2, Loader2, Save, SendHorizontal } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { useProposals, ProposalInput } from '@/hooks/useProposals';
import { generateProposalPDF } from '@/utils/proposalPdfGenerator';

interface ProposalFormState {
  clientName: string;
  clientCompany: string;
  clientEmail: string;
  clientPhone: string;
  projectTitle: string;
  projectDescription: string;
  scopeItems: string[];
  deliveryDeadline: string;
  totalAmount: string;
  monthlyAmount: string;
  entryAmount: string;
  allowPartialPayment: boolean;
  discountAmount: string;
  validUntil: string;
  startDeadline: string;
  notes: string;
  termsAndConditions: string;
  publicLinkEnabled: boolean;
  allowOnlineApproval: boolean;
  allowPayment: boolean;
}

const emptyForm: ProposalFormState = {
  clientName: '',
  clientCompany: '',
  clientEmail: '',
  clientPhone: '',
  projectTitle: '',
  projectDescription: '',
  scopeItems: [''],
  deliveryDeadline: '',
  totalAmount: '',
  monthlyAmount: '',
  entryAmount: '',
  allowPartialPayment: false,
  discountAmount: '',
  validUntil: '',
  startDeadline: '',
  notes: '',
  termsAndConditions: '',
  publicLinkEnabled: false,
  allowOnlineApproval: true,
  allowPayment: false,
};

const todayString = () => new Date().toISOString().split('T')[0];

const toInputDateTime = (value: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  const timezoneOffset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - timezoneOffset).toISOString().slice(0, 16);
};

const formatPhone = (value: string) => {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
};

const BudgetForm = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditing = Boolean(id);
  const { getProposalById, createProposal, updateProposal } = useProposals();
  const [form, setForm] = useState<ProposalFormState>({
    ...emptyForm,
    validUntil: `${todayString()}T23:59`,
  });
  const [proposalSlug, setProposalSlug] = useState<string | null>(null);
  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  useEffect(() => {
    if (!id) return;

    const loadProposal = async () => {
      try {
        const proposal = await getProposalById(id);
        setForm({
          clientName: proposal.client_name,
          clientCompany: proposal.client_company || '',
          clientEmail: proposal.client_email || '',
          clientPhone: proposal.client_phone || '',
          projectTitle: proposal.project_title,
          projectDescription: proposal.project_description || '',
          scopeItems: proposal.scope_items?.length ? proposal.scope_items : [''],
          deliveryDeadline: proposal.delivery_deadline || '',
          totalAmount: String(proposal.total_amount || ''),
          monthlyAmount: proposal.monthly_amount ? String(proposal.monthly_amount) : '',
          entryAmount: proposal.entry_amount ? String(proposal.entry_amount) : '',
          allowPartialPayment: proposal.allow_partial_payment,
          discountAmount: String(proposal.discount_amount || ''),
          validUntil: toInputDateTime(proposal.valid_until),
          startDeadline: proposal.start_deadline || '',
          notes: proposal.notes || '',
          termsAndConditions: proposal.terms_and_conditions || '',
          publicLinkEnabled: proposal.public_link_enabled,
          allowOnlineApproval: proposal.allow_online_approval,
          allowPayment: proposal.allow_payment,
        });
        setProposalSlug(proposal.public_slug);
      } catch (error) {
        console.error('Error loading proposal:', error);
        toast.error('Erro ao carregar orçamento');
        navigate('/budgets');
      } finally {
        setLoading(false);
      }
    };

    void loadProposal();
  }, [getProposalById, id, navigate]);

  const publicUrl = useMemo(() => {
    if (!proposalSlug) return null;
    return `${window.location.origin}/proposta/${proposalSlug}`;
  }, [proposalSlug]);

  const updateScopeItem = (index: number, value: string) => {
    setForm((current) => ({
      ...current,
      scopeItems: current.scopeItems.map((item, itemIndex) => (itemIndex === index ? value : item)),
    }));
  };

  const addScopeItem = () => {
    setForm((current) => ({ ...current, scopeItems: [...current.scopeItems, ''] }));
  };

  const removeScopeItem = (index: number) => {
    setForm((current) => ({
      ...current,
      scopeItems: current.scopeItems.length === 1 ? [''] : current.scopeItems.filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  const validateForm = () => {
    if (!form.clientName.trim()) return 'Informe o nome do cliente';
    if (!form.projectTitle.trim()) return 'Informe o título do projeto';
    if (!form.totalAmount || Number(form.totalAmount) <= 0) return 'Informe um valor total válido';
    if (!form.validUntil) return 'Informe a validade da proposta';

    const filledScopeItems = form.scopeItems.map((item) => item.trim()).filter(Boolean);
    if (!filledScopeItems.length) return 'Adicione ao menos um item de escopo';

    if (form.entryAmount && Number(form.entryAmount) > Number(form.totalAmount)) {
      return 'A entrada não pode ser maior que o valor total';
    }

    return null;
  };

  const buildPayload = (status: ProposalInput['status']): ProposalInput => ({
    client_name: form.clientName.trim(),
    client_company: form.clientCompany.trim() || null,
    client_email: form.clientEmail.trim() || null,
    client_phone: form.clientPhone.trim() || null,
    project_title: form.projectTitle.trim(),
    project_description: form.projectDescription.trim() || null,
    scope_items: form.scopeItems.map((item) => item.trim()).filter(Boolean),
    delivery_deadline: form.deliveryDeadline.trim() || null,
    total_amount: Number(form.totalAmount || 0),
    monthly_amount: form.monthlyAmount ? Number(form.monthlyAmount) : null,
    entry_amount: form.entryAmount ? Number(form.entryAmount) : null,
    allow_partial_payment: form.allowPartialPayment,
    discount_amount: Number(form.discountAmount || 0),
    valid_until: new Date(form.validUntil).toISOString(),
    start_deadline: form.startDeadline.trim() || null,
    notes: form.notes.trim() || null,
    terms_and_conditions: form.termsAndConditions.trim() || null,
    status,
    public_link_enabled: status === 'sent' ? true : form.publicLinkEnabled,
    allow_online_approval: form.allowOnlineApproval,
    allow_payment: form.allowPayment,
    sent_at: status === 'sent' ? new Date().toISOString() : null,
  });

  const handleSave = async (status: ProposalInput['status']) => {
    const errorMessage = validateForm();
    if (errorMessage) {
      toast.error(errorMessage);
      return;
    }

    setSaving(true);
    try {
      const payload = buildPayload(status);
      const proposal = id ? await updateProposal(id, payload) : await createProposal(payload);

      setProposalSlug(proposal.public_slug);
      setForm((current) => ({
        ...current,
        publicLinkEnabled: proposal.public_link_enabled,
      }));

      toast.success(status === 'draft' ? 'Rascunho salvo' : 'Proposta gerada com sucesso');

      if (!id) {
        navigate(`/budgets/${proposal.id}`, { replace: true });
      }
    } catch (error) {
      console.error('Error saving proposal:', error);
      toast.error('Erro ao salvar orçamento');
    } finally {
      setSaving(false);
    }
  };

  const handlePreview = () => {
    if (!publicUrl) {
      toast.error('Gere a proposta primeiro para liberar a visualização pública');
      return;
    }

    window.open(publicUrl, '_blank');
  };

  const copyPublicLink = async () => {
    if (!publicUrl) {
      toast.error('Gere a proposta para copiar o link');
      return;
    }

    await navigator.clipboard.writeText(publicUrl);
    toast.success('Link público copiado');
  };

  const handleDownloadPdf = async () => {
    if (!id) {
      toast.error('Salve a proposta antes de baixar o PDF');
      return;
    }

    setDownloadingPdf(true);
    try {
      const proposal = await getProposalById(id);
      await generateProposalPDF(proposal);
    } catch (error) {
      console.error('Error generating proposal PDF:', error);
      toast.error('Erro ao gerar PDF da proposta');
    } finally {
      setDownloadingPdf(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout title="Orçamentos" subtitle="Carregando orçamento...">
        <div className="h-64 flex items-center justify-center text-muted-foreground">Carregando...</div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      title={isEditing ? 'Editar orçamento' : 'Novo orçamento'}
      subtitle="Monte uma proposta comercial com link compartilhável"
      headerAction={
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={copyPublicLink} disabled={!proposalSlug}>
            <Link2 className="h-4 w-4 mr-2" />
            Copiar link
          </Button>
          <Button variant="outline" onClick={handlePreview} disabled={!proposalSlug}>
            <Eye className="h-4 w-4 mr-2" />
            Visualizar proposta
          </Button>
          <Button variant="outline" onClick={handleDownloadPdf} disabled={!id || downloadingPdf}>
            {downloadingPdf ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
            Baixar PDF
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        {publicUrl && (
          <Card className="glass-card border-primary/20">
            <CardContent className="p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
              <div>
                <p className="text-sm text-muted-foreground">Link público da proposta</p>
                <p className="text-sm font-medium text-foreground break-all">{publicUrl}</p>
              </div>
              <Button variant="outline" onClick={copyPublicLink}>Copiar link</Button>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
          <div className="space-y-6">
            <Card className="glass-card">
              <CardHeader>
                <CardTitle>Dados do cliente</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="client-name">Nome</Label>
                  <Input id="client-name" value={form.clientName} onChange={(e) => setForm((current) => ({ ...current, clientName: e.target.value }))} maxLength={120} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="client-company">Empresa</Label>
                  <Input id="client-company" value={form.clientCompany} onChange={(e) => setForm((current) => ({ ...current, clientCompany: e.target.value }))} maxLength={120} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="client-email">Email</Label>
                  <Input id="client-email" type="email" value={form.clientEmail} onChange={(e) => setForm((current) => ({ ...current, clientEmail: e.target.value }))} maxLength={255} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="client-phone">Telefone</Label>
                  <Input id="client-phone" value={form.clientPhone} onChange={(e) => setForm((current) => ({ ...current, clientPhone: formatPhone(e.target.value) }))} maxLength={16} />
                </div>
              </CardContent>
            </Card>

            <Card className="glass-card">
              <CardHeader>
                <CardTitle>Dados do projeto</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="project-title">Título do projeto</Label>
                  <Input id="project-title" value={form.projectTitle} onChange={(e) => setForm((current) => ({ ...current, projectTitle: e.target.value }))} maxLength={160} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="project-description">Descrição geral</Label>
                  <Textarea id="project-description" value={form.projectDescription} onChange={(e) => setForm((current) => ({ ...current, projectDescription: e.target.value }))} rows={5} maxLength={3000} />
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <Label>Escopo</Label>
                    <Button type="button" variant="outline" size="sm" onClick={addScopeItem}>Adicionar item</Button>
                  </div>
                  <div className="space-y-3">
                    {form.scopeItems.map((item, index) => (
                      <div key={index} className="flex gap-2">
                        <Input value={item} onChange={(e) => updateScopeItem(index, e.target.value)} placeholder={`Entrega ${index + 1}`} maxLength={240} />
                        <Button type="button" variant="outline" onClick={() => removeScopeItem(index)} disabled={form.scopeItems.length === 1}>Remover</Button>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="delivery-deadline">Prazo de entrega</Label>
                  <Input id="delivery-deadline" value={form.deliveryDeadline} onChange={(e) => setForm((current) => ({ ...current, deliveryDeadline: e.target.value }))} placeholder="Ex: 30 dias após aprovação" maxLength={120} />
                </div>
              </CardContent>
            </Card>

            <Card className="glass-card">
              <CardHeader>
                <CardTitle>Condições</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="valid-until">Validade da proposta</Label>
                    <Input id="valid-until" type="datetime-local" value={form.validUntil} onChange={(e) => setForm((current) => ({ ...current, validUntil: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="start-deadline">Prazo para início</Label>
                    <Input id="start-deadline" value={form.startDeadline} onChange={(e) => setForm((current) => ({ ...current, startDeadline: e.target.value }))} placeholder="Ex: em até 5 dias úteis" maxLength={120} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notes">Observações</Label>
                  <Textarea id="notes" value={form.notes} onChange={(e) => setForm((current) => ({ ...current, notes: e.target.value }))} rows={4} maxLength={2000} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="terms">Termos e condições</Label>
                  <Textarea id="terms" value={form.termsAndConditions} onChange={(e) => setForm((current) => ({ ...current, termsAndConditions: e.target.value }))} rows={6} maxLength={4000} />
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="glass-card">
              <CardHeader>
                <CardTitle>Valores</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="total-amount">Valor total</Label>
                  <Input id="total-amount" type="number" min="0" step="0.01" value={form.totalAmount} onChange={(e) => setForm((current) => ({ ...current, totalAmount: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="entry-amount">Valor de entrada</Label>
                  <Input id="entry-amount" type="number" min="0" step="0.01" value={form.entryAmount} onChange={(e) => setForm((current) => ({ ...current, entryAmount: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="monthly-amount">Valor da mensalidade</Label>
                  <Input id="monthly-amount" type="number" min="0" step="0.01" value={form.monthlyAmount} onChange={(e) => setForm((current) => ({ ...current, monthlyAmount: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="discount-amount">Desconto</Label>
                  <Input id="discount-amount" type="number" min="0" step="0.01" value={form.discountAmount} onChange={(e) => setForm((current) => ({ ...current, discountAmount: e.target.value }))} />
                </div>
                <div className="flex items-center justify-between rounded-xl border border-border/60 bg-secondary/20 p-4">
                  <div>
                    <p className="font-medium">Permitir pagamento parcial</p>
                    <p className="text-xs text-muted-foreground">Preparado para a futura integração de entrada.</p>
                  </div>
                  <Switch checked={form.allowPartialPayment} onCheckedChange={(checked) => setForm((current) => ({ ...current, allowPartialPayment: checked }))} />
                </div>
                <div className="rounded-xl border border-border/60 bg-secondary/20 p-4 text-sm text-muted-foreground leading-relaxed">
                  A mensalidade fica apenas exposta na proposta. A cobrança recorrente será gerada a partir do mês seguinte em uma próxima integração.
                </div>
              </CardContent>
            </Card>

            <Card className="glass-card">
              <CardHeader>
                <CardTitle>Configurações</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between rounded-xl border border-border/60 bg-secondary/20 p-4">
                  <div>
                    <p className="font-medium">Gerar link público</p>
                    <p className="text-xs text-muted-foreground">Permite compartilhar a proposta em uma página pública.</p>
                  </div>
                  <Switch checked={form.publicLinkEnabled} onCheckedChange={(checked) => setForm((current) => ({ ...current, publicLinkEnabled: checked }))} />
                </div>
                <div className="flex items-center justify-between rounded-xl border border-border/60 bg-secondary/20 p-4">
                  <div>
                    <p className="font-medium">Permitir aprovação online</p>
                    <p className="text-xs text-muted-foreground">Cliente pode aprovar ou recusar no link público.</p>
                  </div>
                  <Switch checked={form.allowOnlineApproval} onCheckedChange={(checked) => setForm((current) => ({ ...current, allowOnlineApproval: checked }))} />
                </div>
                <div className="flex items-center justify-between rounded-xl border border-border/60 bg-secondary/20 p-4">
                  <div>
                    <p className="font-medium">Permitir pagamento</p>
                    <p className="text-xs text-muted-foreground">Deixa a proposta pronta para integrar PIX e cartão no futuro.</p>
                  </div>
                  <Switch checked={form.allowPayment} onCheckedChange={(checked) => setForm((current) => ({ ...current, allowPayment: checked }))} />
                </div>
              </CardContent>
            </Card>

            <Card className="glass-card">
              <CardContent className="p-4 space-y-3">
                <Button className="w-full" variant="outline" onClick={() => handleSave('draft')} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                  Salvar como rascunho
                </Button>
                <Button className="w-full" onClick={() => handleSave('sent')} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <SendHorizontal className="h-4 w-4 mr-2" />}
                  Gerar proposta
                </Button>
                <Button className="w-full" variant="secondary" onClick={handlePreview} disabled={!proposalSlug}>
                  <Eye className="h-4 w-4 mr-2" />
                  Visualizar proposta
                </Button>
                <Button className="w-full" variant="ghost" asChild>
                  <Link to="/budgets/settings">Abrir configurações do módulo</Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default BudgetForm;