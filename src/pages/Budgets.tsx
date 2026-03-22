import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Copy,
  Eye,
  FileSpreadsheet,
  Plus,
  Search,
  SquarePen,
  Trash2,
  CopyPlus,
  Send,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { Proposal, ProposalStatus, useProposals } from '@/hooks/useProposals';

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));

const formatDate = (value: string) => format(new Date(value), 'dd/MM/yyyy', { locale: ptBR });

const statusMap: Record<ProposalStatus, { label: string; className: string }> = {
  draft: { label: 'Rascunho', className: 'bg-muted text-muted-foreground border-border' },
  sent: { label: 'Enviado', className: 'bg-primary/15 text-primary border-primary/30' },
  viewed: { label: 'Visualizado', className: 'bg-accent/20 text-accent-foreground border-accent/40' },
  approved: { label: 'Aprovado', className: 'bg-success/20 text-success border-success/30' },
  rejected: { label: 'Recusado', className: 'bg-destructive/20 text-destructive border-destructive/30' },
  entry_paid: { label: 'Entrada paga', className: 'bg-warning/20 text-warning border-warning/30' },
  paid: { label: 'Pago', className: 'bg-success/30 text-success border-success/40' },
  expired: { label: 'Vencido', className: 'bg-warning/15 text-warning border-warning/40' },
};

const getPublicLink = (slug: string) => `${window.location.origin}/proposta/${slug}`;

const ProposalStatusBadge = ({ status }: { status: ProposalStatus }) => {
  const config = statusMap[status];
  return <Badge className={`border ${config.className}`}>{config.label}</Badge>;
};

const Budgets = () => {
  const navigate = useNavigate();
  const { proposals, loading, metrics, deleteProposal, duplicateProposal } = useProposals();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string>('all');

  const filteredProposals = useMemo(() => {
    return proposals.filter((proposal) => {
      const query = search.toLowerCase();
      const matchesSearch =
        proposal.client_name.toLowerCase().includes(query) ||
        proposal.project_title.toLowerCase().includes(query) ||
        (proposal.client_company || '').toLowerCase().includes(query);

      const matchesStatus = status === 'all' || proposal.status === status;
      return matchesSearch && matchesStatus;
    });
  }, [proposals, search, status]);

  const handleCopyLink = async (proposal: Proposal) => {
    if (!proposal.public_link_enabled) {
      toast.error('Gere a proposta para liberar o link público');
      return;
    }

    await navigator.clipboard.writeText(getPublicLink(proposal.public_slug));
    toast.success('Link copiado com sucesso');
  };

  const handleDelete = async (proposal: Proposal) => {
    if (!window.confirm(`Excluir o orçamento "${proposal.project_title}"?`)) return;

    try {
      await deleteProposal(proposal.id);
      toast.success('Orçamento excluído');
    } catch (error) {
      console.error('Error deleting proposal:', error);
      toast.error('Erro ao excluir orçamento');
    }
  };

  const handleDuplicate = async (proposal: Proposal) => {
    try {
      const duplicated = await duplicateProposal(proposal);
      toast.success('Orçamento duplicado');
      navigate(`/budgets/${duplicated.id}`);
    } catch (error) {
      console.error('Error duplicating proposal:', error);
      toast.error('Erro ao duplicar orçamento');
    }
  };

  return (
    <DashboardLayout
      title="Orçamentos"
      subtitle="Crie, compartilhe e acompanhe propostas comerciais"
      headerAction={
        <Button asChild>
          <Link to="/budgets/new">
            <Plus className="h-4 w-4 mr-2" />
            Novo orçamento
          </Link>
        </Button>
      }
    >
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card className="glass-card">
            <CardContent className="p-5 space-y-2">
              <span className="text-sm text-muted-foreground">Total de orçamentos</span>
              <div className="text-3xl font-heading font-bold">{metrics.total}</div>
            </CardContent>
          </Card>
          <Card className="glass-card">
            <CardContent className="p-5 space-y-2">
              <span className="text-sm text-muted-foreground">Visualizados</span>
              <div className="text-3xl font-heading font-bold">{metrics.viewed}</div>
            </CardContent>
          </Card>
          <Card className="glass-card">
            <CardContent className="p-5 space-y-2">
              <span className="text-sm text-muted-foreground">Aprovados</span>
              <div className="text-3xl font-heading font-bold">{metrics.approved}</div>
            </CardContent>
          </Card>
          <Card className="glass-card">
            <CardContent className="p-5 space-y-2">
              <span className="text-sm text-muted-foreground">Valor em propostas</span>
              <div className="text-2xl font-heading font-bold">{formatCurrency(metrics.totalValue)}</div>
            </CardContent>
          </Card>
        </div>

        <Card className="glass-card">
          <CardContent className="p-4 sm:p-6 space-y-4">
            <div className="flex flex-col md:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar por cliente, empresa ou projeto"
                  className="pl-10"
                />
              </div>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="w-full md:w-[220px]">
                  <SelectValue placeholder="Filtrar por status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os status</SelectItem>
                  {Object.entries(statusMap).map(([value, item]) => (
                    <SelectItem key={value} value={value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Projeto</TableHead>
                    <TableHead>Valor total</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Criação</TableHead>
                    <TableHead>Validade</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                        Carregando orçamentos...
                      </TableCell>
                    </TableRow>
                  ) : filteredProposals.length ? (
                    filteredProposals.map((proposal) => (
                      <TableRow key={proposal.id}>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium text-foreground">{proposal.client_name}</span>
                            {proposal.client_company && (
                              <span className="text-xs text-muted-foreground">{proposal.client_company}</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">{proposal.project_title}</TableCell>
                        <TableCell>{formatCurrency(proposal.total_amount)}</TableCell>
                        <TableCell>
                          <ProposalStatusBadge status={proposal.status} />
                        </TableCell>
                        <TableCell>{formatDate(proposal.created_at)}</TableCell>
                        <TableCell>{formatDate(proposal.valid_until)}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            <Button size="sm" variant="outline" onClick={() => window.open(proposal.public_link_enabled ? getPublicLink(proposal.public_slug) : `/budgets/${proposal.id}`, '_blank')}>
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button size="sm" variant="outline" asChild>
                              <Link to={`/budgets/${proposal.id}`}>
                                <SquarePen className="h-4 w-4" />
                              </Link>
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => handleCopyLink(proposal)}>
                              <Copy className="h-4 w-4" />
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => handleDuplicate(proposal)}>
                              <CopyPlus className="h-4 w-4" />
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => handleDelete(proposal)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={7} className="py-14">
                        <div className="flex flex-col items-center justify-center text-center gap-4">
                          <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                            <FileSpreadsheet className="h-8 w-8 text-primary" />
                          </div>
                          <div>
                            <p className="text-lg font-semibold">Nenhum orçamento encontrado</p>
                            <p className="text-sm text-muted-foreground">Crie sua primeira proposta comercial e compartilhe com o cliente.</p>
                          </div>
                          <Button asChild>
                            <Link to="/budgets/new">
                              <Send className="h-4 w-4 mr-2" />
                              Criar orçamento
                            </Link>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Budgets;